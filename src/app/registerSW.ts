/**
 * src/app/registerSW.ts
 *
 * 서비스워커 등록 — vite-plugin-pwa의 virtual 모듈.
 * registerType: 'autoUpdate' + 아래 controllerchange 리로드로
 * **새 배포가 감지되면 사용자가 수동 새로고침 없이 자동으로 최신 버전을 받는다.**
 * (PWA 캐시가 옛 버전을 계속 보여주던 문제 해결)
 */
import { registerSW } from 'virtual:pwa-register';

// 페이지 로드 시점에 이미 SW가 제어 중이었는지 기록.
// 첫 설치(직전 컨트롤러 없음)에는 리로드하지 않고, "갱신"일 때만 리로드한다.
const hadController =
  typeof navigator !== 'undefined' && !!navigator.serviceWorker?.controller;

const updateSW = registerSW({
  immediate: true,
  onRegisteredSW(swUrl: string, registration: ServiceWorkerRegistration | undefined) {
    if (import.meta.env.DEV) {
      console.debug('[SW] registered:', swUrl);
    }
    // 앱을 오래 열어둔 사용자도 갱신을 받도록 1시간마다 업데이트 확인.
    if (registration) {
      setInterval(() => void registration.update(), 60 * 60 * 1000);
    }
  },
  onNeedRefresh() {
    // autoUpdate 모드에서도 새 버전을 즉시 적용한다.
    void updateSW(true);
  },
  onRegisterError(error: unknown) {
    console.error('[SW] registration failed:', error);
  },
});

// 새 SW가 제어권을 잡으면(= 갱신 적용) 페이지를 한 번 새로고침해 최신 코드를 반영한다.
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return; // 첫 설치엔 리로드하지 않음
    reloaded = true;
    window.location.reload();
  });
}
