// CounterpartList — 주고받은 상대 목록.
// 각 항목: 닉네임 + 편지 수 + 최근 교류일. 클릭 시 onSelect(counterpartId)로 스레드 열람.

import { useCounterparts } from './useThreads';
import styles from './CounterpartList.module.css';

/** ISO datetime을 한국어 로컬 날짜 문자열로 변환한다. */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

interface CounterpartListProps {
  onSelect: (counterpartId: string) => void;
}

export function CounterpartList({ onSelect }: CounterpartListProps): React.ReactElement {
  const { counterparts, isLoading, error } = useCounterparts();

  if (isLoading) {
    return <p className={styles.empty}>불러오는 중…</p>;
  }

  if (error !== null) {
    return <p className={styles.error}>상대 목록을 불러올 수 없습니다: {error.message}</p>;
  }

  if (counterparts.length === 0) {
    return (
      <p className={styles.empty}>
        아직 편지를 주고받은 상대가 없어요.
        <br />
        편지를 보내거나 받아 저장해보세요.
      </p>
    );
  }

  return (
    <ul className={styles.list}>
      {counterparts.map((cp) => (
        <li key={cp.counterpartId} className={styles.item}>
          <button
            type="button"
            className={styles.button}
            onClick={() => onSelect(cp.counterpartId)}
          >
            <span className={styles.nickname}>{cp.nickname ?? '알 수 없음'}</span>
            <span className={styles.meta}>
              편지 {cp.letterCount}통 · 최근 {formatDate(cp.lastAt)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
