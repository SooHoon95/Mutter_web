// supabase/functions/letter-photo-urls/handler.ts
//
// letter-photo-urls의 순수 로직(요청 해석·권한 분기·경로 필터·응답 모양).
// Supabase 클라이언트는 deps로 주입받는다 → Deno/Supabase 없이 vitest로 단위 검증할 수 있다.
// 실제 클라이언트 배선은 index.ts가 한다. 이 파일은 Deno 전역(Deno.env 등)을 쓰지 않는다.
//
// 계약(설계 §4 — iOS·Android·웹이 같이 쓰므로 바꾸지 않는다):
//   요청  수신자 모드 { token: string, password: string | null }
//         소유자 모드 { letterId: string } + Authorization: Bearer <user JWT>
//   응답  200 { urls: { [path]: signedUrl }, expiresIn: 3600 }
//         403 { error }  — RPC 거부(TOKEN_NOT_FOUND·LINK_REVOKED·LINK_EXPIRED·WRONG_PASSWORD 등)
//                          또는 소유자 모드에서 편지가 안 보일 때(RLS)

/** 서명 URL 유효 시간(초). 클라이언트는 path를 캐시 키로 쓰고 URL은 매번 새로 받는다. */
export const SIGNED_URL_TTL_SECONDS = 3600;

/** RPC·쿼리 에러 모양(supabase-js PostgrestError의 최소 공통분모). */
export interface DepError {
  message: string;
}

export interface LetterPhotoUrlDeps {
  /**
   * 수신자 모드: get_letter_by_token(token, password).
   * 반드시 사용자 JWT 없는 anon 클라이언트로 호출해야 한다(받은함 저장 부수효과 차단 — index.ts 참조).
   */
  openByToken(
    token: string,
    password: string | null,
  ): Promise<{ data: { id: string; paragraphs: unknown } | null; error: DepError | null }>;
  /** 소유자 모드: 호출자 JWT로 letters를 id로 select(RLS가 소유자만 보장). */
  selectOwnLetter(
    authorization: string,
    letterId: string,
  ): Promise<{ data: { id: string; paragraphs: unknown } | null; error: DepError | null }>;
  /** service role로 letters.owner_id 조회. 없으면 null. */
  fetchOwnerId(letterId: string): Promise<string | null>;
  /** service role로 서명 URL 일괄 발급. 반환은 path → signedUrl(실패한 path는 빠진다). */
  createSignedUrls(paths: string[], expiresIn: number): Promise<Record<string, string>>;
}

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  // supabase-js는 x-client-info(및 x-supabase-api-version)를 항상 보낸다. 허용 목록에 없으면
  // 브라우저 프리플라이트가 실패해 "Failed to send a request to the Edge Function"이 난다(kakao-login과 동일).
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// 요청 본문 상한 — 토큰·암호·uuid만 오므로 넉넉히 잡아도 작다.
const MAX_BODY_BYTES = 4 * 1024;

// ---------------------------------------------------------------------------
// 순수 헬퍼 (경로 추출·필터)
// ---------------------------------------------------------------------------

/** paragraphs jsonb에서 photo.path 문자열만 순서대로(중복 제거) 뽑는다. 형태가 틀린 항목은 무시. */
export function extractPhotoPaths(paragraphs: unknown): string[] {
  if (!Array.isArray(paragraphs)) return [];
  const seen = new Set<string>();
  for (const item of paragraphs) {
    if (!item || typeof item !== 'object') continue;
    const photo = (item as { photo?: unknown }).photo;
    if (!photo || typeof photo !== 'object') continue;
    const path = (photo as { path?: unknown }).path;
    if (typeof path === 'string' && path.length > 0) seen.add(path);
  }
  return [...seen];
}

/**
 * `<ownerId>/<letterId>/<파일명>` 형태인 경로만 남긴다.
 * 발신자가 jsonb에 남의 경로(다른 사람 폴더·다른 편지)를 넣어 서명을 받아 가는 것을 막는다.
 * 접두사 비교만으로는 `owner/letter/../../x`가 통과하므로 파일명은 슬래시·`.`·`..` 없는 한 조각만 허용한다.
 */
export function filterOwnedPaths(paths: string[], ownerId: string, letterId: string): string[] {
  const prefix = `${ownerId}/${letterId}/`;
  return paths.filter((path) => {
    if (!path.startsWith(prefix)) return false;
    const fileName = path.slice(prefix.length);
    return fileName.length > 0 && !fileName.includes('/') && fileName !== '.' && fileName !== '..';
  });
}

// ---------------------------------------------------------------------------
// 요청 처리
// ---------------------------------------------------------------------------

type ParsedRequest =
  | { mode: 'recipient'; token: string; password: string | null }
  | { mode: 'owner'; letterId: string };

function parseBody(raw: unknown): ParsedRequest | null {
  if (!raw || typeof raw !== 'object') return null;
  const body = raw as { token?: unknown; password?: unknown; letterId?: unknown };
  if (typeof body.token === 'string' && body.token.length > 0) {
    const password = typeof body.password === 'string' ? body.password : null;
    return { mode: 'recipient', token: body.token, password };
  }
  if (typeof body.letterId === 'string' && body.letterId.length > 0) {
    return { mode: 'owner', letterId: body.letterId };
  }
  return null;
}

export function createHandler(deps: LetterPhotoUrlDeps): (req: Request) => Promise<Response> {
  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });

  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
    if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

    try {
      const raw = await req.text();
      if (raw.length > MAX_BODY_BYTES) return json({ error: 'PAYLOAD_TOO_LARGE' }, 413);
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(raw || '{}');
      } catch {
        return json({ error: 'BAD_REQUEST' }, 400);
      }
      const parsed = parseBody(parsedJson);
      if (!parsed) return json({ error: 'BAD_REQUEST' }, 400);

      // 1~2) 접근 권한 확인 + 편지 id·paragraphs 확보.
      let letter: { id: string; paragraphs: unknown };
      if (parsed.mode === 'recipient') {
        // 토큰·회수·만료·예약 공개·암호 검사는 RPC가 그대로 한다(검증 로직 복제 금지).
        const { data, error } = await deps.openByToken(parsed.token, parsed.password);
        if (error) return json({ error: error.message }, 403);
        if (!data) return json({ error: 'LETTER_NOT_FOUND' }, 403);
        letter = data;
      } else {
        const authorization = req.headers.get('Authorization') ?? '';
        if (!/^Bearer\s+\S+/i.test(authorization)) return json({ error: 'AUTH_REQUIRED' }, 401);
        const { data, error } = await deps.selectOwnLetter(authorization, parsed.letterId);
        if (error) return json({ error: error.message }, 403);
        // RLS로 안 보이면(타계정·없음) data가 null.
        if (!data) return json({ error: 'LETTER_NOT_FOUND' }, 403);
        letter = data;
      }

      // 3) 편지 주인 폴더 아래 경로만 서명 대상으로 남긴다.
      const ownerId = await deps.fetchOwnerId(letter.id);
      if (!ownerId) return json({ error: 'LETTER_NOT_FOUND' }, 403);
      const paths = filterOwnedPaths(extractPhotoPaths(letter.paragraphs), ownerId, letter.id);

      // 4~5) 서명 URL 발급. 사진이 없으면 저장소를 부르지 않는다.
      const urls =
        paths.length > 0 ? await deps.createSignedUrls(paths, SIGNED_URL_TTL_SECONDS) : {};
      return json({ urls, expiresIn: SIGNED_URL_TTL_SECONDS });
    } catch (e) {
      // 내부 예외 메시지(키·경로 등)는 응답에 싣지 않는다.
      console.error(JSON.stringify({ evt: 'letter_photo_urls', ok: false, err: String(e) }));
      return json({ error: 'INTERNAL' }, 500);
    }
  };
}
