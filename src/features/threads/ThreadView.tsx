// ThreadView — 특정 상대와 주고받은 편지를 시간순으로 표시한다.
// 각 항목: 방향 배지(보냄/받음) + 제목 + 날짜 + 열기 링크.
//   - direction='received' → /l/:token (내 inbox 토큰으로 수신 웹뷰 열람)
//   - direction='sent'     → /preview/:letterId (소유자 읽기 전용 미리보기 — 편집기로 보내지 않는다)

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

/**
 * 항목의 방향에 맞는 열기 링크 대상.
 *   - sent: 소유자 읽기 전용 미리보기(/preview/:id). 편집기(/create/:id)로 보내지 않는다.
 *   - received: 내 inbox 토큰으로 수신 웹뷰(/l/:token). 토큰이 없으면 열 수 없다(null).
 */
function openTarget(letter: ThreadLetter): string | null {
  if (letter.direction === 'sent') {
    return `/preview/${letter.letterId}`;
  }
  return letter.token !== null ? `/l/${letter.token}` : null;
}

interface ThreadViewProps {
  counterpartId: string;
}

export function ThreadView({ counterpartId }: ThreadViewProps): React.ReactElement {
  const { letters, isLoading, error } = useThread(counterpartId);

  let content: React.ReactElement;
  if (isLoading) {
    content = <p className={styles.empty}>불러오는 중…</p>;
  } else if (error !== null) {
    content = <p className={styles.error}>편지를 불러올 수 없습니다: {error.message}</p>;
  } else if (letters.length === 0) {
    content = <p className={styles.empty}>아직 이 상대와 주고받은 편지가 없어요.</p>;
  } else {
    content = (
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

  return (
    <div className={styles.wrap}>
      {/* 0019 답장 플로우: 이 상대에게 바로 편지 쓰기(연결돼 있으면 보내기에서 자동 선택). */}
      <Link to={`/create?to=${counterpartId}`} className={styles.replyAction}>
        ✍️ 이 사람에게 답장 쓰기
      </Link>
      {content}
    </div>
  );
}
