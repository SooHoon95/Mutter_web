/**
 * src/app/registerSW.ts
 *
 * 서비스워커 등록 — vite-plugin-pwa의 virtual 모듈을 사용한다.
 * registerType: 'autoUpdate' 이므로 새 SW가 배포되면 자동으로 갱신된다.
 *
 * 이 파일은 main.tsx에서 side-effect import로 로드한다.
 * 빌드 시에는 실제 SW 등록 코드로, dev 시에는 no-op으로 동작한다.
 */
import { registerSW } from 'virtual:pwa-register';

// 자동 업데이트 모드: 사용자 확인 없이 SW를 갱신한다.
// 갱신 중 오류가 발생하면 콘솔에만 기록한다(사용자 UX 방해 금지).
registerSW({
  onRegisteredSW(swUrl: string, registration: ServiceWorkerRegistration | undefined) {
    // SW 등록 성공 — 주기적 업데이트 체크는 autoUpdate가 처리한다.
    if (import.meta.env.DEV) {
      console.debug('[SW] registered:', swUrl, registration);
    }
  },
  onRegisterError(error: unknown) {
    console.error('[SW] registration failed:', error);
  },
});
