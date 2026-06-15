/**
 * src/features/auth/RequireAuth.tsx
 *
 * 제작 라우트(/create, /sent 등)를 인증으로 보호하는 가드 컴포넌트.
 *
 * - 세션 확인 중(loading=true): 스피너 표시(레이아웃 시프트 방지).
 * - 세션 없음: /login으로 Navigate(현재 경로를 state.from에 보존).
 * - 세션 있음: children 렌더.
 *
 * 중요: 수신 라우트(/l/:token)는 이 컴포넌트로 감싸지 않는다.
 * 수신자는 인코그니토/무계정 환경에서 편지를 열 수 있어야 한다.
 */
import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '@/app/AuthProvider';

interface RequireAuthProps {
  children: ReactNode;
}

export function RequireAuth({ children }: RequireAuthProps): ReactNode {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    // 세션 복원 완료 전 — 스피너로 대기(깜빡임 없는 UX)
    return (
      <div className="auth-spinner" role="status" aria-label="인증 확인 중">
        <span className="auth-spinner__dot" />
      </div>
    );
  }

  if (!session) {
    // 로그인 후 원래 경로로 돌아올 수 있도록 from을 state에 보존
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
