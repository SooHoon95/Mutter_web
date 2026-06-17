// ConnectionPicker — 내 연결 목록을 라디오 리스트로 보여주고 선택을 onSelect로 알린다.
// 연결이 없으면 초대를 권하는 안내를 표시한다.

import { useConnections } from './useConnections';
import styles from './ConnectionPicker.module.css';

interface ConnectionPickerProps {
  // 현재 선택된 연결 user id. 미선택이면 null.
  selectedId: string | null;
  // 선택 변경 콜백. 선택 해제는 호출 측이 null을 다루도록 user id만 전달한다.
  onSelect: (userId: string | null) => void;
}

export function ConnectionPicker({
  selectedId,
  onSelect,
}: ConnectionPickerProps): React.ReactElement {
  const { connections, isLoading, error } = useConnections();

  if (isLoading) {
    return <p className={styles.empty}>불러오는 중…</p>;
  }

  if (error !== null) {
    return <p className={styles.error}>연결 목록을 불러올 수 없습니다: {error.message}</p>;
  }

  if (connections.length === 0) {
    return (
      <p className={styles.empty}>
        연결된 사람이 없어요 — 먼저 연결하세요.
      </p>
    );
  }

  return (
    <ul className={styles.list}>
      {connections.map((conn) => {
        const checked = selectedId === conn.userId;
        return (
          <li key={conn.userId} className={styles.item}>
            <label className={`${styles.option} ${checked ? styles.optionChecked : ''}`}>
              <input
                type="radio"
                name="connection-picker"
                className={styles.radio}
                checked={checked}
                onChange={() => onSelect(conn.userId)}
              />
              <span className={styles.nickname}>{conn.nickname ?? '알 수 없음'}</span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}
