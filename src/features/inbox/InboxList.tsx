// InboxList — 받은 편지함 목록 컴포넌트.
// getMyInbox 결과를 카드 형태로 렌더하고, 각 항목에 "열기" 링크(/l/:token)를 제공한다.

import { Link } from 'react-router-dom';
import { useInbox } from './useInbox';
import styles from './InboxList.module.css';

/** ISO datetime을 한국어 로컬 날짜 문자열로 변환한다. */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function InboxList(): React.ReactElement {
  const { items, isLoading, error } = useInbox();

  if (isLoading) {
    return <p className={styles.empty}>불러오는 중…</p>;
  }

  if (error !== null) {
    return <p className={styles.error}>목록을 불러올 수 없습니다: {error.message}</p>;
  }

  if (items.length === 0) {
    return (
      <p className={styles.empty}>
        아직 저장된 편지가 없어요.
        <br />
        편지를 열어 "받은 편지함에 저장" 버튼을 눌러보세요.
      </p>
    );
  }

  return (
    <ul className={styles.list}>
      {items.map((item) => (
        <li key={item.letterId} className={styles.item}>
          <div className={styles.meta}>
            <p className={styles.title}>{item.title}</p>
            <p className={styles.sender}>보낸이: {item.senderNickname ?? '알 수 없음'}</p>
            <p className={styles.savedAt}>{formatDate(item.savedAt)} 저장</p>
          </div>
          <Link to={`/l/${item.token}`} className={styles.openLink}>
            열기
          </Link>
        </li>
      ))}
    </ul>
  );
}
