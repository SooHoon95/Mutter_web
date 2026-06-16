// ConnectionList — 나와 연결된 사람 목록. 항목 클릭 시 onSelect(userId)로 스레드를 연다.
// People 라우트 상단의 "연결된 사람" 섹션에서 사용한다.

import { useConnections } from './useConnections';
import styles from './ConnectionList.module.css';

interface ConnectionListProps {
  onSelect: (userId: string) => void;
}

export function ConnectionList({ onSelect }: ConnectionListProps): React.ReactElement {
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
        아직 연결된 사람이 없어요 — 연결 초대를 보내보세요.
      </p>
    );
  }

  return (
    <ul className={styles.list}>
      {connections.map((conn) => (
        <li key={conn.userId} className={styles.item}>
          <button
            type="button"
            className={styles.button}
            onClick={() => onSelect(conn.userId)}
          >
            {conn.nickname ?? '알 수 없음'}
          </button>
        </li>
      ))}
    </ul>
  );
}
