// ConnectionList — N:N 연결된 사람 목록 + 각 사람별 연결 해제 버튼.
// People 라우트 상단의 "연결된 사람" 섹션에서 사용한다.
// 연결 해제 후에도 그 사람과 주고받은 편지 스레드는 그대로 보존된다(편지·받은함은 연결과 독립).

import { useState } from 'react';
import { useConnections } from './useConnections';
import styles from './ConnectionList.module.css';

interface ConnectionListProps {
  // 연결된 사람 클릭 시 스레드 열기
  onSelect: (userId: string) => void;
}

export function ConnectionList({ onSelect }: ConnectionListProps): React.ReactElement {
  const { connections, isLoading, error, disconnect, isDisconnecting } = useConnections();
  const [disconnectError, setDisconnectError] = useState<string | null>(null);

  if (isLoading) {
    return <p className={styles.empty}>불러오는 중…</p>;
  }

  if (error !== null) {
    return <p className={styles.error}>연결 목록을 불러올 수 없습니다: {error.message}</p>;
  }

  if (connections.length === 0) {
    return (
      <p className={styles.empty}>아직 연결된 사람이 없어요 — 연결 초대를 보내보세요.</p>
    );
  }

  async function handleDisconnect(userId: string): Promise<void> {
    if (!confirm('연결을 해제할까요? 주고받은 편지는 그대로 남아 있어요.')) return;
    setDisconnectError(null);
    try {
      await disconnect(userId);
    } catch (err) {
      setDisconnectError(err instanceof Error ? err.message : '연결 해제에 실패했습니다.');
    }
  }

  return (
    <div>
      {connections.map((conn) => (
        <div key={conn.userId} className={styles.connectionCard}>
          <button
            type="button"
            className={styles.nameBtn}
            onClick={() => onSelect(conn.userId)}
          >
            {conn.nickname ?? '알 수 없음'}
          </button>
          <button
            type="button"
            className={styles.disconnectBtn}
            onClick={() => void handleDisconnect(conn.userId)}
            disabled={isDisconnecting}
          >
            {isDisconnecting ? '해제 중…' : '연결 해제'}
          </button>
        </div>
      ))}
      {disconnectError !== null && <p className={styles.error}>{disconnectError}</p>}
      <p className={styles.hint}>연결을 해제해도 주고받은 편지는 그대로 남아 있어요.</p>
    </div>
  );
}
