// 하단 토스트 — 메시지 + 선택적 동작 버튼("되돌리기" 등). 일정 시간 뒤 스스로 닫힌다.
// 같은 자리에 새 토스트가 오면(key가 바뀌면) 타이머가 새로 시작된다 — 호출부가 key를 바꿔 준다.

import { useEffect } from 'react';
import styles from './UndoToast.module.css';

interface UndoToastProps {
  message: string;
  /** 동작 버튼 문구. 없으면 메시지만 보인다. */
  actionLabel?: string;
  onAction?: () => void;
  /** 시간이 지나거나 동작 버튼을 누른 뒤 호출된다. */
  onClose: () => void;
  durationMs?: number;
}

export function UndoToast({
  message,
  actionLabel,
  onAction,
  onClose,
  durationMs = 5000,
}: UndoToastProps): React.ReactElement {
  useEffect(() => {
    const timer = window.setTimeout(onClose, durationMs);
    return () => window.clearTimeout(timer);
  }, [onClose, durationMs]);

  return (
    <div className={styles.toast} role="status" aria-live="polite">
      <span className={styles.message}>{message}</span>
      {actionLabel && onAction && (
        <button
          type="button"
          className={styles.action}
          onClick={() => {
            onAction();
            onClose();
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
