// SoundCloud oEmbed 검증 유틸. music-sync 스킬 참조.
// 자격증명 불필요 — SC oEmbed 엔드포인트는 공개 접근 가능.
// fetch를 주입 가능하게 설계해 단위 테스트에서 네트워크 없이 동작한다.

/** 검증 성공 결과 */
export interface ScValidationOk {
  ok: true;
  title: string;
  author: string;
  canonicalUrl: string;
}

/** 검증 실패 결과와 거부 사유 */
export interface ScValidationFail {
  ok: false;
  reason: 'non-200' | 'embed-disabled' | 'private' | 'geo' | 'invalid-url' | 'network';
}

export type ScValidation = ScValidationOk | ScValidationFail;

/** SC oEmbed API가 반환하는 JSON 구조(일부) */
interface ScOembedResponse {
  title: string;
  author_name: string;
  html: string;
  // provider_name 등 나머지 필드는 사용하지 않음
}

const SC_OEMBED_ENDPOINT = 'https://soundcloud.com/oembed';

/**
 * URL이 SoundCloud 트랙 URL인지 사전 검증한다.
 * 스킬 규정: soundcloud.com 호스트만 허용.
 */
function isValidScUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'soundcloud.com' || parsed.hostname === 'www.soundcloud.com';
  } catch {
    return false;
  }
}

/**
 * oEmbed 응답 HTML에 embed-disabled 신호가 있는지 확인한다.
 * SC는 임베드 비활성 시 빈 html 또는 특정 메시지를 반환하는 경우가 있다.
 */
function isEmbedDisabled(data: ScOembedResponse): boolean {
  // html이 비어 있거나 iframe src가 없으면 embed 불가
  return !data.html || data.html.trim() === '';
}

/**
 * SoundCloud URL을 oEmbed 엔드포인트로 검증한다.
 *
 * @param url - 발신자가 붙여넣은 SC 트랙 URL
 * @param fetchFn - 테스트 주입용 fetch 구현. 기본값은 전역 fetch.
 * @returns ScValidation — 성공 시 ok:true + 메타, 실패 시 ok:false + 거부 사유
 *
 * 거부 사유:
 * - invalid-url: soundcloud.com 호스트가 아닌 URL
 * - network: fetch 자체 실패(오프라인, DNS 불가)
 * - private: 401 / 403 — 비공개 트랙
 * - non-200: 404 등 — 존재하지 않거나 삭제된 트랙
 * - embed-disabled: 200이지만 embed html이 비어 있음
 * - geo: 지역 제한 (SC는 geo 제한 시 403 또는 특정 메시지 반환; 현재 403→private로 분류)
 */
export async function validateScUrl(
  url: string,
  fetchFn: typeof fetch = fetch,
): Promise<ScValidation> {
  // 1. URL 형식 사전 검증 (네트워크 왕복 불필요)
  if (!isValidScUrl(url)) {
    return { ok: false, reason: 'invalid-url' };
  }

  // 2. oEmbed 엔드포인트 호출
  const oembedUrl = `${SC_OEMBED_ENDPOINT}?format=json&url=${encodeURIComponent(url)}`;

  let response: Response;
  try {
    response = await fetchFn(oembedUrl);
  } catch {
    // 네트워크 오류(오프라인, DNS 불가 등)
    return { ok: false, reason: 'network' };
  }

  // 3. HTTP 상태 코드별 분류
  if (response.status === 401 || response.status === 403) {
    // 비공개 트랙 또는 지역 제한
    return { ok: false, reason: 'private' };
  }

  if (response.status !== 200) {
    // 404 (트랙 없음/삭제), 그 외 오류
    return { ok: false, reason: 'non-200' };
  }

  // 4. 200 응답 — JSON 파싱 후 embed html 확인
  let data: ScOembedResponse;
  try {
    data = (await response.json()) as ScOembedResponse;
  } catch {
    return { ok: false, reason: 'non-200' };
  }

  if (isEmbedDisabled(data)) {
    return { ok: false, reason: 'embed-disabled' };
  }

  return {
    ok: true,
    title: data.title ?? '',
    author: data.author_name ?? '',
    canonicalUrl: url,
  };
}
