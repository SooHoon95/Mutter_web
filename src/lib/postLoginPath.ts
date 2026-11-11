// 로그인 뒤 돌아갈 편지 경로 — 봉투 화면(/l/:token)에서 "편지 열기"를 누른 뒤 같은 편지로 복귀.
//
// 이메일 로그인은 router state(from)로 돌아오지만, 구글 OAuth·카카오는 페이지를 떠났다가
// '/'·'/welcome'으로 돌아오므로 state가 사라진다. 같은 탭 sessionStorage에 잠시 적어 두고
// 로그인 뒤 첫 착지(Home·SetNickname·KakaoCallback·Login)에서 한 번 꺼내 쓴다.

const KEY = 'post_login_path';
const TTL_MS = 30 * 60 * 1000; // 로그인을 포기한 뒤 한참 지나 엉뚱하게 끌려가지 않게.

/** 편지 경로(/l/...)만 받는다. */
export function rememberPostLoginPath(path: string): void {
  if (!path.startsWith('/l/')) return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ path, at: Date.now() }));
  } catch {
    /* 저장 불가(사파리 개인정보 보호 등) — 이메일 로그인의 state 복귀만 남는다 */
  }
}

/** 적어 둔 경로를 꺼내고 지운다. 없거나 오래됐으면 null. */
export function takePostLoginPath(): string | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    const { path, at } = JSON.parse(raw) as { path?: unknown; at?: unknown };
    if (typeof path !== 'string' || !path.startsWith('/l/')) return null;
    if (typeof at !== 'number' || Date.now() - at > TTL_MS) return null;
    return path;
  } catch {
    return null;
  }
}
