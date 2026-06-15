import { createBrowserRouter } from 'react-router-dom';
import { lazy, Suspense, type ReactNode } from 'react';

// 라우트별 코드 스플릿 — 콜드 번들을 가볍게 유지(<3s/4G 예산, US-001).
const Landing = lazy(() => import('@/routes/Landing'));
const Login = lazy(() => import('@/routes/Login'));
const Create = lazy(() => import('@/routes/Create'));
const Sent = lazy(() => import('@/routes/Sent'));
const Viewer = lazy(() => import('@/routes/Viewer'));
const Takedown = lazy(() => import('@/routes/Takedown'));
const NotFound = lazy(() => import('@/routes/NotFound'));

function withSuspense(node: ReactNode): ReactNode {
  return <Suspense fallback={<div className="route-fallback">불러오는 중…</div>}>{node}</Suspense>;
}

export const router = createBrowserRouter([
  { path: '/', element: withSuspense(<Landing />) },
  { path: '/login', element: withSuspense(<Login />) },
  // 제작 경로 — 인증 가드는 T2(US-002)에서 추가한다.
  { path: '/create', element: withSuspense(<Create />) },
  { path: '/create/:id', element: withSuspense(<Create />) },
  { path: '/sent', element: withSuspense(<Sent />) },
  // 수신 경로 — 무인증. 토큰/암호/claim-bind로만 통제(T7/T8).
  { path: '/l/:token', element: withSuspense(<Viewer />) },
  { path: '/legal/takedown', element: withSuspense(<Takedown />) },
  { path: '*', element: withSuspense(<NotFound />) },
]);
