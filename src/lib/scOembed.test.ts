// scOembed 단위 테스트. fetch mock 주입으로 네트워크 없이 검증.
import { describe, it, expect } from 'vitest';
import { validateScUrl } from './scOembed';

// ---------------------------------------------------------------------------
// 헬퍼: fetch mock 팩토리
// ---------------------------------------------------------------------------

function makeFetch(status: number, body: unknown): typeof fetch {
  return async (_url: RequestInfo | URL) => {
    return {
      status,
      ok: status >= 200 && status < 300,
      json: async () => body,
    } as Response;
  };
}

function makeNetworkErrorFetch(): typeof fetch {
  return async (_url: RequestInfo | URL) => {
    throw new TypeError('Failed to fetch');
  };
}

const VALID_SC_URL = 'https://soundcloud.com/artist/track-name';

const VALID_OEMBED_BODY = {
  title: '테스트 트랙',
  author_name: '아티스트',
  html: '<iframe src="https://w.soundcloud.com/player/?url=..." />',
};

// ---------------------------------------------------------------------------
// 유효 URL + 정상 응답 → ok:true
// ---------------------------------------------------------------------------

describe('validateScUrl — 성공 케이스', () => {
  it('200 응답 + 정상 html → ok:true, 메타 반환', async () => {
    const result = await validateScUrl(VALID_SC_URL, makeFetch(200, VALID_OEMBED_BODY));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.title).toBe('테스트 트랙');
      expect(result.author).toBe('아티스트');
      expect(result.canonicalUrl).toBe(VALID_SC_URL);
    }
  });

  it('www.soundcloud.com 호스트도 유효하다', async () => {
    const url = 'https://www.soundcloud.com/artist/track';
    const result = await validateScUrl(url, makeFetch(200, VALID_OEMBED_BODY));
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 거부 케이스
// ---------------------------------------------------------------------------

describe('validateScUrl — 거부 케이스', () => {
  it('비-soundcloud URL → invalid-url', async () => {
    const result = await validateScUrl('https://youtube.com/watch?v=123', makeFetch(200, {}));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid-url');
  });

  it('완전히 잘못된 URL → invalid-url', async () => {
    const result = await validateScUrl('not-a-url', makeFetch(200, {}));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid-url');
  });

  it('404 응답 → non-200 (트랙 없음/삭제)', async () => {
    const result = await validateScUrl(VALID_SC_URL, makeFetch(404, null));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('non-200');
  });

  it('500 응답 → non-200', async () => {
    const result = await validateScUrl(VALID_SC_URL, makeFetch(500, null));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('non-200');
  });

  it('401 응답 → private (비공개 트랙)', async () => {
    const result = await validateScUrl(VALID_SC_URL, makeFetch(401, null));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('private');
  });

  it('403 응답 → private (지역 제한 포함)', async () => {
    const result = await validateScUrl(VALID_SC_URL, makeFetch(403, null));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('private');
  });

  it('200이지만 html이 비어 있음 → embed-disabled', async () => {
    const emptyHtmlBody = { title: '트랙', author_name: '작가', html: '' };
    const result = await validateScUrl(VALID_SC_URL, makeFetch(200, emptyHtmlBody));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('embed-disabled');
  });

  it('200이지만 html 필드 자체 없음 → embed-disabled', async () => {
    const noHtmlBody = { title: '트랙', author_name: '작가' };
    const result = await validateScUrl(VALID_SC_URL, makeFetch(200, noHtmlBody));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('embed-disabled');
  });

  it('네트워크 오류(fetch throw) → network', async () => {
    const result = await validateScUrl(VALID_SC_URL, makeNetworkErrorFetch());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('network');
  });
});
