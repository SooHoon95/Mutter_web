import { createBrowserRouter } from 'react-router-dom';
import { lazy, Suspense, type ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';
import { RequireAuth } from '@/features/auth/RequireAuth';

// 라우트별 코드 스플릿 — 콜드 번들을 가볍게 유지(<3s/4G 예산, US-001).
const Home = lazy(() => import('@/routes/Home')); // 인증 상태에 따라 랜딩/대시보드
const Login = lazy(() => import('@/routes/Login'));
const Create = lazy(() => import('@/routes/Create'));
const Sent = lazy(() => import('@/routes/Sent'));
const MyPage = lazy(() => import('@/routes/MyPage'));
const Inbox = lazy(() => import('@/routes/Inbox'));
const People = lazy(() => import('@/routes/People')); // 주고받은 편지(상대별 스레드)
const Connect = lazy(() => import('@/routes/Connect')); // 연결 초대 수락
const Viewer = lazy(() => import('@/routes/Viewer'));
const Takedown = lazy(() => import('@/routes/Takedown'));
const NotFound = lazy(() => import('@/routes/NotFound'));

function withSuspense(node: ReactNode): ReactNode {
  return <Suspense fallback={<div className="route-fallback">불러오는 중…</div>}>{node}</Suspense>;
}

/**
 * 제작자 셸로 감싼 라우트 — AppShell(헤더 + 컨테이너) 포함.
 * 수신 라우트(/l/:token)와 takedown은 이 셸을 쓰지 않는다.
 * 수신자가 인코그니토에서 열어도 제작 전용 UI가 전혀 노출되지 않는다.
 */
function withCreatorShell(node: ReactNode): ReactNode {
  return withSuspense(<AppShell>{node}</AppShell>);
}

/**
 * 제작자 셸 + 인증 가드.
 * /create, /sent 등 세션이 필요한 라우트에만 적용한다.
 * 수신 라우트(/l/:token)와 /login, /, /legal/takedown은 절대 이 함수로 감싸지 않는다.
 */
function withProtectedCreatorShell(node: ReactNode): ReactNode {
  return withSuspense(
    <AppShell>
      <RequireAuth>{node}</RequireAuth>
    </AppShell>,
  );
}

export const router = createBrowserRouter([
  // ── 제작 경로 (AppShell 포함) ──────────────────────────────────────────────
  // 인증 불필요: Home(로그인 시 대시보드/비로그인 시 랜딩), Login은 가드 없음
  { path: '/', element: withCreatorShell(<Home />) },
  { path: '/login', element: withCreatorShell(<Login />) },
  // 인증 필수: 제작·발송·계정 라우트
  { path: '/create', element: withProtectedCreatorShell(<Create />) },
  { path: '/create/:id', element: withProtectedCreatorShell(<Create />) },
  { path: '/sent', element: withProtectedCreatorShell(<Sent />) },
  { path: '/inbox', element: withProtectedCreatorShell(<Inbox />) },
  { path: '/people', element: withProtectedCreatorShell(<People />) },
  { path: '/connect/:token', element: withProtectedCreatorShell(<Connect />) },
  { path: '/me', element: withProtectedCreatorShell(<MyPage />) },
  // ── 수신 경로 (셸 없음 — 무인증, 인코그니토 OK) ────────────────────────────
  // 토큰/암호/claim-bind로만 통제(T7/T8). RequireAuth 적용 절대 금지.
  { path: '/l/:token', element: withSuspense(<Viewer />) },
  // ── 공개 법적 채널 (셸 없음) ─────────────────────────────────────────────
  { path: '/legal/takedown', element: withSuspense(<Takedown />) },
  { path: '*', element: withSuspense(<NotFound />) },
]);
