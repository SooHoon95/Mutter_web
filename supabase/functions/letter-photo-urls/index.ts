// supabase/functions/letter-photo-urls/index.ts
//
// 편지 사진(비공개 버킷 letter-photos)의 1시간짜리 서명 URL을 발급한다.
// 설계: Mutter docs/superpowers/specs/2026-10-07-letter-photos-design.md §4.
//
// 요청(POST, verify_jwt=false로 배포 — 함수 안에서 직접 인증):
//   수신자 모드 { token, password }                         → get_letter_by_token 게이트 재사용
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

// 수신자 모드 전용 anon 클라이언트 — 요청의 Authorization 헤더를 절대 싣지 않는다.
// 왜: get_letter_by_token(0022 ⑦)은 auth.uid()가 있고 소유자가 아니면 그 사용자의 받은함에
// upsert한다. 로그인한 수신자의 JWT를 넘기면 "사진 URL 받기"가 받은함 저장을 다시 일으킨다.
// 모듈 스코프에서 anon 키로만 한 번 만들고 global.headers를 주지 않으므로, PostgREST에는
// anon 키(role=anon, auth.uid() = null)만 전달된다 → 부수효과 블록이 실행될 수 없다.
const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: NO_SESSION });

// service role — owner_id 조회와 서명 URL 발급에만 쓴다(RLS 우회, 서버 전용).
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: NO_SESSION });

Deno.serve(
  createHandler({
    async openByToken(token, password) {
      const { data, error } = await anon.rpc('get_letter_by_token', {
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
      const { data, error } = await admin
        .from('letters')
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
