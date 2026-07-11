// 편지 뷰어(/l/:token) 상단 비차단 "앱에서 열기" 배너 — 링크 앱 핸드오프(plan §A5).
//
// 원칙 P1(무설치 웹 유지): 편지는 항상 웹으로 즉시 열리고, 이 배너는 강제하지 않는 부가 CTA다.
// iOS 인앱브라우저(카톡 등)에서만 노출한다 — Safari 직접 탭은 Universal Link가 앱을 직접 열기 때문.
// 탭 시 진행 중인 웹 오디오를 먼저 멈춘 뒤(onBeforeOpen) 스킴을 발화해 앱-웹 이중 재생을 막는다.

import { isIOS, isInAppBrowser } from '@/lib/device';
import { appLetterUrl, openAppScheme } from '@/lib/appLinks';
import styles from './AppOpenBanner.module.css';

interface AppOpenBannerProps {
  /** 편지 토큰. mutter://l/<token> 딥링크를 만든다. */
  token: string;
  /** 스킴 발화 직전 호출 — 웹 오디오 일시정지 등 정리에 쓴다. */
  onBeforeOpen?: () => void;
}

/** iOS 인앱브라우저에서만 렌더되는 상단 앱-열기 배너. 그 외 환경에선 null. */
export function AppOpenBanner({ token, onBeforeOpen }: AppOpenBannerProps): React.ReactElement | null {
  if (!isIOS() || !isInAppBrowser()) return null;

  function handleOpen(): void {
    // 백그라운드 재생 글리치 방지 — 앱으로 넘어가기 전에 웹 오디오를 멈춘다.
    onBeforeOpen?.();
    openAppScheme(appLetterUrl(token));
  }

  return (
    <div className={styles.banner} role="region" aria-label="앱에서 열기">
      <span className={styles.text}>Mutter 앱에서 더 편하게 볼 수 있어요</span>
      <button type="button" className={styles.btn} onClick={handleOpen}>
        앱에서 열기
      </button>
    </div>
  );
}
