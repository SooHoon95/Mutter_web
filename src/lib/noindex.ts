// 수신 라우트 (/l/:token) 에서 <meta name="robots" content="noindex,nofollow">를 동적 주입한다.
// Netlify X-Robots-Tag 헤더(netlify.toml)가 이미 /l/* 에 설정돼 있으나,
// SPA 특성상 클라이언트 라우팅으로 진입하는 경우 헤더가 전달되지 않을 수 있으므
// 로 클라이언트 메타 태그로 보강한다.
// capability-links 스킬 참조: noindex / 비공개 항목.

const META_NAME = 'robots';
const META_CONTENT = 'noindex,nofollow';

/**
 * <head>에 robots noindex 메타 태그를 삽입한다.
 * 이미 존재하면 content만 갱신한다.
 * T8 Viewer 컴포넌트의 useEffect에서 호출한다.
 */
export function injectNoIndex(): void {
  let meta = document.head.querySelector<HTMLMetaElement>(`meta[name="${META_NAME}"]`);
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = META_NAME;
    document.head.appendChild(meta);
  }
  meta.content = META_CONTENT;
}

/**
 * noindex 메타 태그를 제거한다.
 * 수신 라우트에서 벗어날 때(cleanup) 호출해 다른 페이지에 noindex가 남지 않게 한다.
 */
export function removeNoIndex(): void {
  const meta = document.head.querySelector<HTMLMetaElement>(`meta[name="${META_NAME}"]`);
  if (meta) meta.remove();
}

/**
 * React useEffect에서 바로 사용할 수 있는 헬퍼.
 * useEffect(() => useNoIndex(), []) 형태로 수신 라우트 최상단에서 호출한다.
 *
 * @returns cleanup 함수 (noindex 메타 제거)
 */
export function useNoIndex(): () => void {
  injectNoIndex();
  return removeNoIndex;
}
