// LetterEnvelope — 로그인해야 열리는 편지의 봉투(0037). 본문 없이 겉면(제목·보낸 사람)만.
// "편지 열기" → 로그인 → 같은 /l/:token으로 복귀(postLoginPath + router state).
// 봉투가 sealed(암호·예약 공개 등)거나 서버 반영 전이면 겉면 없이 안내만 보인다.

import type { LetterCover } from '@/data/access';
import styles from './LetterGate.module.css';

interface LetterEnvelopeProps {
  cover: LetterCover | null;
  onOpen: () => void;
}

export function LetterEnvelope({ cover, onOpen }: LetterEnvelopeProps): React.ReactElement {
  const face = cover && !cover.sealed ? cover : null;
  return (
    <div className={styles.screen}>
      <div className={styles.card}>
        <p className={styles.icon} aria-hidden="true">
          ✉️
        </p>
        {face?.title && <p className={styles.letterTitle}>{face.title}</p>}
        {face?.senderNickname && <p className={styles.sender}>보낸이: {face.senderNickname}</p>}
        <p className={styles.hint}>로그인하면 편지가 열려요</p>
        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={onOpen}>
            편지 열기
          </button>
        </div>
      </div>
    </div>
  );
}
