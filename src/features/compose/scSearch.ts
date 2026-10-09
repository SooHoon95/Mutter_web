// SoundCloud "찾아서 복사해 오기" 흐름의 순수 헬퍼.
// 웹은 m.soundcloud.com이 X-Frame-Options: DENY라 앱처럼 인앱 브라우저로 곡을 고를 수 없다.
// 그래서 새 탭으로 검색을 열고, 사용자가 공유→링크 복사한 텍스트에서 URL만 뽑아 기존 검증 경로로 넘긴다.

const SC_SEARCH_BASE = 'https://soundcloud.com/search';

/** 검색어가 있으면 트랙 검색 결과로, 없으면 검색 홈으로 가는 URL을 만든다. */
export function buildScSearchUrl(query: string): string {
  const q = query.trim();
  return q ? `${SC_SEARCH_BASE}/sounds?q=${encodeURIComponent(q)}` : SC_SEARCH_BASE;
}

// 공유 텍스트("Listen to X on #SoundCloud https://on.soundcloud.com/abc")에서 SC URL만 찾는다.
// 서브도메인(www·m·on)까지 허용하고, 공백·따옴표·괄호에서 끊는다.
// soundcloud.com.evil.com 같은 접미 위장 호스트는 부정 전방탐색으로 거른다.
const SC_URL_PATTERN = /https?:\/\/(?:[a-z0-9-]+\.)*soundcloud\.com(?![a-z0-9-]|\.[a-z0-9])(?:\/[^\s"'<>()]*)?/i;

/** 텍스트에서 첫 SoundCloud URL을 뽑는다. 없으면 null. */
export function extractScUrl(text: string): string | null {
  const match = SC_URL_PATTERN.exec(text);
  if (!match) return null;
  // 문장 끝 구두점이 URL에 붙어 오는 경우(… /abc.)를 떼어 낸다.
  return match[0].replace(/[.,!?;:]+$/, '');
}
