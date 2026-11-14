// LockedLetter — 무료 기간이 끝난 편지(0037 LETTER_LOCKED). 본문 대신 잠김 안내.
//
// 서버 계약 "받은 사람의 간직하기" ③: 로그인한 받은 사람에게 "편지권으로 간직하기"(KeepLetterAction).
// 문구가 편지권을 말하므로 확인 단계 없이 바로 진행하고, 안내 문장을 버튼 아래에 미리 보인다.
// 간직하면 같은 편지를 다시 열어 본문이 보인다.

import type { LetterCover } from '@/data/access';
import { monthDay } from '@/lib/accessLabel';
import { KeepLetterAction } from './KeepLetterAction';
import styles from './LetterGate.module.css';

interface LockedLetterProps {
  token: string;
  /** 링크 암호(없으면 null) — keep_received_letter가 같은 게이트를 다시 지난다. */
  password: string | null;
  cover: LetterCover | null;
  /** 삭제 예정 시각(ISO) — 이때까지 다시 열 수 있다. */
  deleteAt: string | null;
  /** 간직한 뒤 편지를 다시 연다. */
  onKept: () => void;
}

const KEEP_CLASSES = {
  trigger: styles.primary,
  confirm: styles.primary,
  cancel: styles.secondary,
  text: styles.hint,
  actions: styles.actions,
  error: styles.error,
};

export function LockedLetter({
  token,
  password,
  cover,
  deleteAt,
  onKept,
}: LockedLetterProps): React.ReactElement {
  const face = cover && !cover.sealed ? cover : null;

  return (
    <div className={styles.screen}>
      <div className={styles.card} role="status">
        <p className={styles.icon} aria-hidden="true">
          🔒
        </p>
        {face?.title && <p className={styles.letterTitle}>{face.title}</p>}
        {face?.senderNickname && <p className={styles.sender}>보낸이: {face.senderNickname}</p>}
        <p className={styles.heading}>보관 기간이 지난 편지예요</p>
        {deleteAt && <p className={styles.body}>{monthDay(deleteAt)}까지 다시 열 수 있어요.</p>}

        <KeepLetterAction
          token={token}
          password={password}
          label="편지권으로 간직하기"
          immediate
          classes={KEEP_CLASSES}
          onKept={onKept}
        />
      </div>
    </div>
  );
}
