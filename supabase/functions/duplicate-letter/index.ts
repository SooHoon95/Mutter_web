// supabase/functions/duplicate-letter/index.ts
//
// "같은 내용으로 한 통 더 보내기" — 내 편지를 사진까지 복제한 새 편지를 만든다.
// 설계: Mutter docs/superpowers/specs/2026-11-11-permanent-letter-ticket-design.md (5.3, 9절).
//
// 왜 필요한가: 무료 편지는 처음 열린 날부터 14일 뒤 닫힌다. 닫힌 뒤 처음 온 사람에게는
// 보낸 사람이 사본을 새로 보낸다. 사본은 별개의 편지라 14일도 편지권도 따로다
// (원본이 영구여도 사본은 무료 편지로 시작한다 — 영구 상태는 복사하지 않는다).
//
// 요청: POST { letterId } + Authorization: Bearer <user JWT>
// 응답: 200 { letterId: <새 편지 id> }
//       401 { error: 'unauthorized' } · 404 { error: 'letter_not_found' }(남의 편지 포함)
//       400 { error: 'bad_request' } · 500 { error: 'copy_failed' }
//
// 순서: 원본 읽기(호출자 권한, RLS가 소유자만 통과) → 새 id 생성 → 사진을 새 폴더로 복사 →
//       경로를 바꾼 본문으로 새 편지 insert(호출자 권한). 중간에 실패하면 복사한 사진을 지운다.
//
// 배포: supabase functions deploy duplicate-letter --no-verify-jwt (함수 안에서 직접 인증)

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const NO_SESSION = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
const BUCKET = 'letter-photos';
const MAX_BODY_BYTES = 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// service role — 사진 복사와 audio_disabled 이관에만 쓴다(RLS 우회, 서버 전용).
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: NO_SESSION });

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

/**
 * 본문에서 원본 편지 폴더(`<owner>/<oldId>/<파일명>`) 아래 사진 경로만 새 편지 폴더로 바꾼다.
 * 그 밖의 경로(형태가 틀렸거나 남의 폴더)는 건드리지 않는다 — 어차피 서명 URL이 발급되지 않는다.
 * 반환: 바꾼 본문과 복사할 [원본, 사본] 경로 쌍.
 */
function remapPhotoPaths(
  paragraphs: unknown,
  ownerId: string,
  oldId: string,
  newId: string,
): { paragraphs: unknown; copies: [string, string][] } {
  if (!Array.isArray(paragraphs)) return { paragraphs, copies: [] };
  const oldPrefix = `${ownerId}/${oldId}/`;
  const copies = new Map<string, string>();
  const next = paragraphs.map((item) => {
    if (!item || typeof item !== 'object') return item;
    const photo = (item as { photo?: unknown }).photo;
    if (!photo || typeof photo !== 'object') return item;
    const path = (photo as { path?: unknown }).path;
    if (typeof path !== 'string' || !path.startsWith(oldPrefix)) return item;
    const fileName = path.slice(oldPrefix.length);
    if (fileName.length === 0 || fileName.includes('/') || fileName === '.' || fileName === '..') {
      return item;
    }
    const to = `${ownerId}/${newId}/${fileName}`;
    copies.set(path, to);
    return { ...(item as object), photo: { ...(photo as object), path: to } };
  });
  return { paragraphs: next, copies: [...copies] };
}

async function removeCopies(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await admin.storage.from(BUCKET).remove(paths);
  if (error) console.error(`[duplicate-letter] cleanup failed: ${error.message}`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const authorization = req.headers.get('Authorization') ?? '';
  const jwt = authorization.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!jwt) return json(401, { error: 'unauthorized' });
  const { data: userData, error: userError } = await admin.auth.getUser(jwt);
  if (userError || !userData.user) return json(401, { error: 'unauthorized' });
  const userId = userData.user.id;

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json(400, { error: 'bad_request' });
  let letterId: unknown;
  try {
    letterId = (JSON.parse(raw || '{}') as { letterId?: unknown }).letterId;
  } catch {
    return json(400, { error: 'bad_request' });
  }
  if (typeof letterId !== 'string' || !UUID_RE.test(letterId)) {
    return json(400, { error: 'bad_request' });
  }

  // 호출자 JWT로 만든 클라이언트 → letters RLS가 소유자만 통과시킨다(남의 편지·삭제함 편지는 안 보인다).
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: NO_SESSION,
    global: { headers: { Authorization: authorization } },
  });
  const { data: original, error: readError } = await userClient
    .from('letters')
    .select('id, owner_id, title, paragraphs, template_id, audio_disabled')
    .eq('id', letterId)
    .maybeSingle();
  if (readError) return json(500, { error: 'copy_failed' });
  if (!original || original.owner_id !== userId) return json(404, { error: 'letter_not_found' });

  // 사진 경로 규칙이 `<owner>/<편지 id>/`를 요구하므로 새 id를 먼저 정한다.
  const newId = crypto.randomUUID();
  const { paragraphs, copies } = remapPhotoPaths(original.paragraphs, userId, letterId, newId);

  const copied: string[] = [];
  try {
    for (const [from, to] of copies) {
      const { error } = await admin.storage.from(BUCKET).copy(from, to);
      if (error) throw new Error(`copy ${from}: ${error.message}`);
      copied.push(to);
    }

    const { error: insertError } = await userClient.from('letters').insert({
      id: newId,
      owner_id: userId,
      title: original.title,
      paragraphs,
      template_id: original.template_id,
    });
    if (insertError) throw new Error(`insert: ${insertError.message}`);

    // 신고로 음악이 꺼진 편지(0004)는 사본도 꺼진 채로 만든다 — 사본으로 차단을 우회하지 못하게.
    if (original.audio_disabled === true) {
      const { error: audioError } = await admin
        .from('letters_all')
        .update({ audio_disabled: true })
        .eq('id', newId);
      if (audioError) {
        await admin.from('letters_all').delete().eq('id', newId);
        throw new Error(`audio_disabled: ${audioError.message}`);
      }
    }
  } catch (e) {
    await removeCopies(copied);
    console.error(`[duplicate-letter] ${letterId}: ${(e as Error).message}`);
    return json(500, { error: 'copy_failed' });
  }

  return json(200, { letterId: newId });
});
