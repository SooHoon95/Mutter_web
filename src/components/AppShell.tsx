/**
 * src/components/AppShell.tsx
 *
 * 제작자 전용 앱 셸 레이아웃.
 * Landing, Login, Create, Sent 등 인증이 필요한(또는 제작 흐름의) 라우트만 사용한다.
 *
 * 수신 라우트(/l/:token)와 takedown 라우트는 이 셸을 사용하지 않는다.
 * 수신자가 인코그니토에서 편지를 열 때 제작 전용 헤더/네비가 렌더되면 안 된다.
 *
 * 디자인(템플릿·타이포)은 T6(US-006)에서 구체화한다.
 * 여기서는 라우트 분기와 컨테이너 구조만 확립한다.
 */
import type { ReactNode } from 'react';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps): ReactNode {
  return (
    <div className="app-shell">
      {/* 제작 전용 헤더 — T6에서 브랜드/네비 구체화 */}
      <header className="app-shell__header">
        <a className="app-shell__logo" href="/">
          편지
        </a>
      </header>
      <div className="app-shell__content">{children}</div>
    </div>
  );
}
