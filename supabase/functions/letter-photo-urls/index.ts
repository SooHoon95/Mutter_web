// supabase/functions/letter-photo-urls/index.ts
//
// 편지 사진(비공개 버킷 letter-photos)의 1시간짜리 서명 URL을 발급한다.
// 설계: Mutter docs/superpowers/specs/2026-10-07-letter-photos-design.md §4.
//
// 요청(POST, verify_jwt=false로 배포 — 함수 안에서 직접 인증):
//   수신자 모드 { token, password } (+ 로그인 시 Authorization) → get_letter_photo_access(본문과 같은 게이트)
//   소유자 모드 { letterId } + Authorization: Bearer <JWT>  → letters RLS(소유자만)
// 응답: 200 { urls: { [path]: signedUrl }, expiresIn: 3600 } / 403 { error }
//
// 로직(요청 해석·경로 필터·응답 모양)은 handler.ts(순수, 단위 테스트 대상)에 있고,
// 여기서는 세 종류의 Supabase 클라이언트를 배선만 한다.
//
// 배포: supabase functions deploy letter-photo-urls --no-verify-jwt
//   (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY 는 런타임 자동 주입)

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { createHandler } from './handler.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const NO_SESSION = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };

// 수신자 모드의 익명 호출용 anon 클라이언트(role=anon, auth.uid() = null).
const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: NO_SESSION });

/**
 * Authorization이 실제 로그인 사용자의 JWT인지(페이로드 role === 'authenticated').
 * supabase-js는 로그아웃 상태에서도 anon 키를 Authorization에 싣기 때문에 헤더 유무만으로는 못 가른다.
 * 여기서는 서명을 검증하지 않는다 — 분기만 정하고, 위조된 토큰은 PostgREST가 거부한다.
 */
function isUserJwt(authorization: string | null): authorization is string {
  const match = authorization?.match(/^Bearer\s+([^.\s]+)\.([^.\s]+)\.[^.\s]+$/i);
  if (!match) return false;
  try {
    const payload = JSON.parse(atob(match[2].replace(/-/g, '+').replace(/_/g, '/')));
    return payload?.role === 'authenticated';
  } catch {
    return false;
  }
}

// service role — owner_id 조회와 서명 URL 발급에만 쓴다(RLS 우회, 서버 전용).
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: NO_SESSION });

Deno.serve(
  createHandler({
    async openByToken(token, password, authorization) {
      // get_letter_photo_access(0037)는 본문 게이트(로그인 요구·14일 잠김 포함)와 같은 검사를 하되
      // 열람 기록·받은함 저장을 하지 않는다 → 로그인 사용자의 JWT로 불러도 부수효과가 없다.
      const client = isUserJwt(authorization)
        ? createClient(SUPABASE_URL, ANON_KEY, {
            auth: NO_SESSION,
            global: { headers: { Authorization: authorization } },
          })
        : anon;
      const { data, error } = await client.rpc('get_letter_photo_access', {
        p_token: token,
        p_password: password,
      });
      return { data: (data as { id: string; paragraphs: unknown } | null) ?? null, error };
    },

    async selectOwnLetter(authorization, letterId) {
      // 호출자 JWT로 만든 클라이언트 → letters_owner_rw RLS가 소유자만 통과시킨다.
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        auth: NO_SESSION,
        global: { headers: { Authorization: authorization } },
      });
      const { data, error } = await userClient
        .from('letters')
        .select('id, paragraphs')
        .eq('id', letterId)
        .maybeSingle();
      return { data: (data as { id: string; paragraphs: unknown } | null) ?? null, error };
    },

    async fetchOwnerId(letterId) {
      // letters_all: 보낸 사람이 지운 편지도 이미 받은 사람은 연다(0041) — 게이트는 앞에서 지났다.
      const { data, error } = await admin
        .from('letters_all')
        .select('owner_id')
        .eq('id', letterId)
        .maybeSingle();
      if (error) throw new Error(`owner lookup failed: ${error.message}`);
      return (data?.owner_id as string | undefined) ?? null;
    },

    async createSignedUrls(paths, expiresIn) {
      const { data, error } = await admin.storage
        .from('letter-photos')
        .createSignedUrls(paths, expiresIn);
      if (error) throw new Error(`sign failed: ${error.message}`);
      // 객체가 없는 path 등은 항목별 error로 오고 signedUrl이 비어 있다 → 응답에서 뺀다
      // (클라이언트는 해당 사진 자리에 플레이스홀더를 둔다).
      const urls: Record<string, string> = {};
      for (const item of data ?? []) {
        if (item.path && item.signedUrl && !item.error) urls[item.path] = item.signedUrl;
      }
      return urls;
    },
  }),
);
