/**
 * src/components/AppShell.tsx
 *
 * 제작자 전용 앱 셸 레이아웃 + 인증 인지 네비게이션.
 * Home(랜딩/대시보드), Login, Create, Sent, Inbox, MyPage 등 제작 흐름 라우트가 사용한다.
 *
 * 수신 라우트(/l/:token)와 takedown 라우트는 이 셸을 쓰지 않는다(수신자에게 제작 UI 비노출).
 */
import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import { signOut } from '@/data/auth';
import { Footer } from './Footer';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps): ReactNode {
  const { session, loading } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut(): Promise<void> {
    try {
      await signOut();
    } catch (err) {
      // 로그아웃 실패는 드묾 — 세션이 이미 끊겼을 수 있으니 로그인으로 보낸다.
      console.error('[AppShell] 로그아웃 실패:', err);
    }
    navigate('/login');
  }

  return (
    <div className="app-shell">
      <header className="app-shell__header">
        {/* 로고 → 랜딩(마케팅 커버). 로그인 상태여도 동일 — 메인 메뉴는 아래 "메인" 링크로. */}
        <NavLink className="app-shell__logo" to="/landing">
          편지
        </NavLink>
        <nav className="app-shell__nav" aria-label="주요 메뉴">
          {!loading && session && (
            <>
              {/* 메인 메뉴(대시보드) 복귀 진입점 — end로 '/'에서만 활성 표시. */}
              <NavLink to="/" end className="app-shell__navlink">
                메인
              </NavLink>
              <NavLink to="/inbox" className="app-shell__navlink">
                받은 편지함
              </NavLink>
              <NavLink to="/sent" className="app-shell__navlink">
                보낸 편지
              </NavLink>
              <NavLink to="/people" className="app-shell__navlink">
                주고받은
              </NavLink>
              <NavLink to="/me" className="app-shell__navlink">
                마이페이지
              </NavLink>
              <button
                type="button"
                className="app-shell__logout"
                onClick={() => void handleSignOut()}
              >
                로그아웃
              </button>
            </>
          )}
          {!loading && !session && (
            <NavLink to="/login" className="app-shell__navlink">
              로그인
            </NavLink>
          )}
        </nav>
      </header>
      <div className="app-shell__content">{children}</div>
      <Footer />
    </div>
  );
}
