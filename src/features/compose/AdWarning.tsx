// SoundCloud 무료 트랙 사용 시 send-time 광고 경고 컴포넌트.
// license-compliance 스킬: SC 무료 트랙은 광고가 끼어들 수 있음을 명확히 경고하고 CC0 권유.

import styles from './AdWarning.module.css';

interface AdWarningProps {
  /** CC0 선택 버튼 클릭 핸들러 — MusicCueEditor에서 CC0 모드로 전환 */
  onSwitchToCc0: () => void;
}

export function AdWarning({ onSwitchToCc0 }: AdWarningProps): React.ReactElement {
  return (
    <div className={styles.warning} role="alert" aria-live="polite">
      <span className={styles.icon} aria-hidden="true">⚠</span>
      <div className={styles.body}>
        <p className={styles.message}>
          SoundCloud 무료 트랙은 재생 중 광고가 포함될 수 있어요.
          {' '}
          수신자의 감동적인 순간에 광고가 끊길 수 있습니다.
        </p>
        <button type="button" className={styles.switchBtn} onClick={onSwitchToCc0}>
          광고 없는 CC0 트랙으로 변경
        </button>
      </div>
    </div>
  );
}
