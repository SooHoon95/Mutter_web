import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from '@/app/App';
import { AuthProvider } from '@/app/AuthProvider';
import '@/styles/global.css';
// 서비스워커 등록 — PWA A2HS(홈 화면 추가) 및 오프라인 앱 셸 캐시
import '@/app/registerSW';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('root element not found');

// AuthProvider는 QueryClientProvider 안에 둔다 — 향후 인증 관련 react-query 훅이
// useAuth()와 같은 트리에서 동작하도록 의존 방향을 일관되게 유지한다.
createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
