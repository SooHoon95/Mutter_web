import { defineConfig, devices } from '@playwright/test';

// E2E 빌드용 더미 VITE_ env. 실제 Supabase 크리덴셜이 없어도
// 클라이언트 초기화 에러 없이 빌드+프리뷰가 동작한다.
// 실제 네트워크 요청은 page.route()로 전부 스텁(e2e/helpers/mocks.ts).
const E2E_ENV = {
  VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ?? 'https://stub.supabase.co',
  VITE_SUPABASE_ANON_KEY:
    process.env.VITE_SUPABASE_ANON_KEY ?? 'stub-anon-key-for-e2e-only',
};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [
    // android-chrome — chromium 기반. CI에서 기본 실행 (webkit 설치 불필요).
    // Pixel 7 viewport로 에뮬레이션해 모바일 흐름을 검증한다.
    {
      name: 'android-chrome',
      use: { ...devices['Pixel 7'] },
    },
    // ios-safari — webkit 기반. `npx playwright install webkit` 후 활성화.
    // 로컬 / Netlify CI 에서 webkit 지원 환경에서 추가 실행한다.
    {
      name: 'ios-safari',
      use: { ...devices['iPhone 13'] },
    },
  ],
  webServer: {
    // 더미 VITE_ env를 주입해 빌드+preview 실행.
    // 실제 Supabase 없이도 getSupabase() 초기화 에러를 막는다.
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: E2E_ENV,
  },
});
