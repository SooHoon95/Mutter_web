/**
 * src/components/AppShell.tsx
 *
 * 제작자 전용 앱 셸 레이아웃 + 인증 인지 네비게이션.
 * Home(랜딩/대시보드), Login, Create, Sent, Inbox, MyPage 등 제작 흐름 라우트가 사용한다.
 *
 * 수신 라우트(/l/:token)와 takedown 라우트는 이 셸을 쓰지 않는다(수신자에게 제작 UI 비노출).
 */
import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import { Footer } from './Footer';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps): ReactNode {
  const { session, loading } = useAuth();

  return (
    <div className="app-shell">
      <header className="app-shell__header">
        <NavLink className="app-shell__logo" to="/">
          편지
        </NavLink>
        <nav className="app-shell__nav" aria-label="주요 메뉴">
          {!loading && session && (
            <>
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
