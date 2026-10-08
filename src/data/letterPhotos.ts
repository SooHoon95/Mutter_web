// 편지 사진 서명 URL 조회 — Edge Function `letter-photo-urls` 호출(설계 §4·§5).
//
// 버킷 letter-photos는 비공개라 사진은 1시간짜리 서명 URL로만 볼 수 있다.
// 뷰어는 본문을 받은 직후 같은 모드로 이 함수를 한 번 부른다.
//   - 수신자: { token, password } — 서버가 get_letter_by_token 게이트(회수·만료·암호)를 재사용.
//     로그인 상태여도 서버는 사용자 JWT를 RPC에 넘기지 않는다(받은함 부수효과 차단).
//   - 소유자: { letterId } — supabase-js가 세션 JWT를 Authorization으로 자동 첨부, 서버는 RLS로 확인.
// 이미지 캐시 키는 path다(URL은 호출마다 달라진다).

import { getSupabase } from './supabase';

export type LetterPhotoUrlRequest =
  | { token: string; password: string | null }
  | { letterId: string };

/** path → 서명 URL. 서명에 실패한 path는 빠져 있다(그 자리는 플레이스홀더). */
export type PhotoUrlMap = Record<string, string>;

/**
 * 서명 URL을 받아온다. 실패하면 throw — 호출부(뷰어)는 잡아서 본문만 보여준다.
 */
export async function fetchLetterPhotoUrls(req: LetterPhotoUrlRequest): Promise<PhotoUrlMap> {
  const { data, error } = await getSupabase().functions.invoke('letter-photo-urls', {
    body: req,
  });
  if (error) throw error;

  const urls = (data as { urls?: unknown } | null)?.urls;
  if (!urls || typeof urls !== 'object') return {};
  // 응답을 그대로 믿지 않고 문자열 값만 통과시킨다.
  const out: PhotoUrlMap = {};
  for (const [path, url] of Object.entries(urls as Record<string, unknown>)) {
    if (typeof url === 'string') out[path] = url;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Storage 업로드·삭제 (설계 §3·§5). 버킷 RLS: 첫 폴더 = auth.uid()만 insert·select·delete, update 없음.
// ---------------------------------------------------------------------------

export const LETTER_PHOTOS_BUCKET = 'letter-photos';

/** `<ownerId>/<letterId>/<uuid>.jpg` — 첫 폴더가 소유자(RLS), 둘째가 편지 id(서명 함수의 경로 필터). */
export function newLetterPhotoPath(ownerId: string, letterId: string): string {
  return `${ownerId}/${letterId}/${crypto.randomUUID()}.jpg`;
}

/**
 * 축소된 JPEG를 올린다. update 정책이 없어 덮어쓰기는 불가 — 항상 새 uuid 경로에 upsert:false로 넣는다.
 */
export async function uploadLetterPhoto(path: string, jpeg: Blob): Promise<void> {
  const { error } = await getSupabase()
    .storage.from(LETTER_PHOTOS_BUCKET)
    .upload(path, jpeg, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
}

/** 경로 목록을 지운다. 호출부는 best effort로 쓴다(실패해도 저장·삭제 흐름은 성공). */
export async function removeLetterPhotos(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await getSupabase().storage.from(LETTER_PHOTOS_BUCKET).remove(paths);
  if (error) throw error;
}

/** 편지 하나의 사진 폴더(`<ownerId>/<letterId>/`)를 통째로 지운다 — 편지 삭제 뒤 정리용. */
export async function removeLetterPhotoFolder(ownerId: string, letterId: string): Promise<void> {
  const prefix = `${ownerId}/${letterId}`;
  const bucket = getSupabase().storage.from(LETTER_PHOTOS_BUCKET);
  // 편지당 최대 5장이지만 이전 저장 실패로 남은 객체가 있을 수 있어 넉넉히 받는다.
  const { data, error } = await bucket.list(prefix, { limit: 100 });
  if (error) throw error;
  const paths = (data ?? []).map((obj) => `${prefix}/${obj.name}`);
  await removeLetterPhotos(paths);
}
