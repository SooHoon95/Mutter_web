import { createBrowserRouter } from 'react-router-dom';
import { lazy, Suspense, type ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';

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

/**
 * 제작자 셸로 감싼 라우트 — AppShell(헤더 + 컨테이너) 포함.
 * 수신 라우트(/l/:token)와 takedown은 이 셸을 쓰지 않는다.
 * 수신자가 인코그니토에서 열어도 제작 전용 UI가 전혀 노출되지 않는다.
 */
function withCreatorShell(node: ReactNode): ReactNode {
  return withSuspense(<AppShell>{node}</AppShell>);
}

export const router = createBrowserRouter([
  // ── 제작 경로 (AppShell 포함) ──────────────────────────────────────────────
  { path: '/', element: withCreatorShell(<Landing />) },
  { path: '/login', element: withCreatorShell(<Login />) },
  // 인증 가드는 T2(US-002)에서 추가한다.
  { path: '/create', element: withCreatorShell(<Create />) },
  { path: '/create/:id', element: withCreatorShell(<Create />) },
  { path: '/sent', element: withCreatorShell(<Sent />) },
  // ── 수신 경로 (셸 없음 — 무인증, 인코그니토 OK) ────────────────────────────
  // 토큰/암호/claim-bind로만 통제(T7/T8). 제작 전용 헤더·인증 코드 경로에 의존 없음.
  { path: '/l/:token', element: withSuspense(<Viewer />) },
  // ── 공개 법적 채널 (셸 없음) ─────────────────────────────────────────────
  { path: '/legal/takedown', element: withSuspense(<Takedown />) },
  { path: '*', element: withSuspense(<NotFound />) },
]);
