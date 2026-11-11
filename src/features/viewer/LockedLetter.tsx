// LockedLetter — 무료 기간이 끝난 편지(0037 LETTER_LOCKED). 본문 대신 잠김 안내.
//
// 로그인한 받은 사람이 편지권을 쓸 수 있으면 "편지권으로 간직하기"(확인 단계에 환급 안내),
// 잔액이 없으면 "편지권은 뮤터 앱에서 살 수 있어요". 웹에는 구매가 없다.
// 편지권 조회가 실패하거나(서버 반영 전) 편지권 UI를 숨기는 계정이면 안내 문구만 남는다.

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { keepReceivedLetter } from '@/data/tickets';
import { LetterGoneError, NoTicketError, type LetterCover } from '@/data/access';
import { useEntitlements, ENTITLEMENTS_QUERY_KEY } from '@/features/tickets';
import { monthDay } from '@/lib/accessLabel';
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

export function LockedLetter({
  token,
  password,
  cover,
  deleteAt,
  onKept,
}: LockedLetterProps): React.ReactElement {
  const { canUseTicket, showBuyHint } = useEntitlements();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noTicket, setNoTicket] = useState(false);

  const face = cover && !cover.sealed ? cover : null;

  async function handleKeep(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await keepReceivedLetter(token, password);
      void queryClient.invalidateQueries({ queryKey: ENTITLEMENTS_QUERY_KEY });
      onKept();
    } catch (err) {
      setConfirming(false);
      if (err instanceof NoTicketError) setNoTicket(true);
      else if (err instanceof LetterGoneError) setError(err.message);
      else setError('편지권을 쓰지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  }

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

        {noTicket ? (
          <>
            <p className={styles.error}>편지권이 없어요</p>
            <p className={styles.hint}>편지권은 뮤터 앱에서 살 수 있어요</p>
          </>
        ) : canUseTicket ? (
          confirming ? (
            <>
              <p className={styles.hint}>보낸 사람이 편지를 지우면 함께 사라지고 편지권은 돌려드려요.</p>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => setConfirming(false)}
                  disabled={busy}
                >
                  취소
                </button>
                <button
                  type="button"
                  className={styles.primary}
                  onClick={() => void handleKeep()}
                  disabled={busy}
                >
                  {busy ? '간직하는 중…' : '간직하기'}
                </button>
              </div>
            </>
          ) : (
            <div className={styles.actions}>
              <button type="button" className={styles.primary} onClick={() => setConfirming(true)}>
                편지권으로 간직하기
              </button>
            </div>
          )
        ) : (
          showBuyHint && <p className={styles.hint}>편지권은 뮤터 앱에서 살 수 있어요</p>
        )}
        {error && <p className={styles.error}>{error}</p>}
      </div>
    </div>
  );
}
