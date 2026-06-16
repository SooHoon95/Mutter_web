// ThreadView — 특정 상대와 주고받은 편지를 시간순으로 표시한다.
// 각 항목: 방향 배지(보냄/받음) + 제목 + 날짜 + 열기 링크.
//   - direction='received' → /l/:token (내 inbox 토큰으로 수신 웹뷰 열람)
//   - direction='sent'     → /create/:letterId (내가 소유 — 편집/열람)

import { Link } from 'react-router-dom';
import { useThread } from './useThreads';
import type { ThreadLetter } from '@/data/threads';
import styles from './ThreadView.module.css';

/** ISO datetime을 한국어 로컬 날짜 문자열로 변환한다. */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** 항목의 방향에 맞는 열기 링크 대상. received면 토큰이 필요하다(없으면 null). */
function openTarget(letter: ThreadLetter): string | null {
  if (letter.direction === 'sent') {
    return `/create/${letter.letterId}`;
  }
  return letter.token !== null ? `/l/${letter.token}` : null;
}

interface ThreadViewProps {
  counterpartId: string;
}

export function ThreadView({ counterpartId }: ThreadViewProps): React.ReactElement {
  const { letters, isLoading, error } = useThread(counterpartId);

  if (isLoading) {
    return <p className={styles.empty}>불러오는 중…</p>;
  }

  if (error !== null) {
    return <p className={styles.error}>편지를 불러올 수 없습니다: {error.message}</p>;
  }

  if (letters.length === 0) {
    return <p className={styles.empty}>아직 이 상대와 주고받은 편지가 없어요.</p>;
  }

  return (
    <ul className={styles.list}>
      {letters.map((letter) => {
        const target = openTarget(letter);
        const isSent = letter.direction === 'sent';
        return (
          <li key={letter.letterId} className={styles.item}>
            <div className={styles.meta}>
              <span
                className={`${styles.badge} ${isSent ? styles.badgeSent : styles.badgeReceived}`}
              >
                {isSent ? '보냄' : '받음'}
              </span>
              <span className={styles.title}>{letter.title}</span>
              <span className={styles.date}>{formatDate(letter.at)}</span>
            </div>
            {target !== null && (
              <Link to={target} className={styles.openLink}>
                열기
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
