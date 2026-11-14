// SendChoiceGate — 보내기 전 선택(서버 계약 "보내기 전 선택(보낸 사람)"). 발송 UI(링크 발급·연결 상대에게
// 보내기)를 감싸, 아직 보낸 적 없는 14일 편지면 "어떻게 보낼까요?"를 먼저 묻는다.
//
// 카드가 보이는 조건(모두 참):
//   1. 편지 state == open   2. paid_enabled   3. 발급된 링크가 없음(연결 발송도 링크를 만든다)
//   4. 이 화면(마운트)에서 14일을 고르지 않았다 — 나갔다 오면 다시 묻는다.
// 편지권·상태·링크 조회가 끝나기 전에는 카드도 발송 UI도 그리지 않는다(카드↔폼 깜빡임 방지).
// 웹은 구매가 없다 — 잔액이 0이면 영구 선택지를 막고 앱 안내만 한다.

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listLinks } from '@/data/links';
import { LetterGoneError, NoTicketError } from '@/data/access';
import { makeLetterPermanent } from '@/data/tickets';
import {
  useEntitlements,
  useLetterAccessStates,
  ENTITLEMENTS_QUERY_KEY,
  LETTER_ACCESS_QUERY_KEY,
} from '@/features/tickets';
import styles from './LinkManager.module.css';

interface SendChoiceGateProps {
  letterId: string;
  /**
   * 카드 위에 늘 그릴 것. 인자는 카드가 보이거나 아직 판단 전인지 — 보낸 편지 상세가 같은 편지의
   * "영구 편지로 만들기" 버튼을 카드와 함께 보이지 않게 숨기는 데 쓴다.
   */
  before?: (choosing: boolean) => React.ReactNode;
  /** 발송 UI — 고르기 전에는 숨긴다. */
  children: React.ReactNode;
}

export function SendChoiceGate({ letterId, before, children }: SendChoiceGateProps): React.ReactElement {
  const queryClient = useQueryClient();
  const { entitlements, loaded: entitlementsLoaded } = useEntitlements();
  const { states, loaded: statesLoaded } = useLetterAccessStates([letterId]);
  const { data: hasLinks } = useQuery({
    queryKey: ['letterHasLinks', letterId],
    // 조회 실패면 "있음"으로 둔다 — 카드 없이 오늘의 발송 화면 그대로.
    queryFn: () =>
      listLinks(letterId).then(
        (links) => links.length > 0,
        () => true,
      ),
    retry: false,
    staleTime: 0,
  });

  const [choseFree, setChoseFree] = useState(false);
  const [madePermanent, setMadePermanent] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noTicket, setNoTicket] = useState(false);

  const pending = !entitlementsLoaded || !statesLoaded || hasLinks === undefined;
  const choosing =
    !pending &&
    !choseFree &&
    !madePermanent &&
    states.get(letterId)?.state === 'open' &&
    entitlements?.paidEnabled === true &&
    hasLinks === false;

  async function handlePermanent(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await makeLetterPermanent(letterId);
      setMadePermanent(true);
      void queryClient.invalidateQueries({ queryKey: ENTITLEMENTS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: LETTER_ACCESS_QUERY_KEY });
    } catch (err) {
      setConfirming(false);
      if (err instanceof NoTicketError) setNoTicket(true);
      else if (err instanceof LetterGoneError) setError(err.message);
      else setError('편지권을 쓰지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  if (pending) return <>{before?.(true)}</>;

  if (!choosing) {
    return (
      <>
        {before?.(false)}
        {madePermanent && (
          <div className={styles.linkMeta}>
            <span className={`${styles.badge} ${styles.scheduled}`}>영구</span>
          </div>
        )}
        {children}
      </>
    );
  }

  const tickets = entitlements?.tickets ?? 0;
  const freeDays = entitlements?.freeDays;
  const canPermanent = tickets > 0 && !noTicket;

  return (
    <>
      {before?.(true)}
      <div className={styles.issueForm}>
        <h3>어떻게 보낼까요?</h3>

        <button
          type="button"
          className={`${styles.choice} ${styles.choicePrimary}`}
          onClick={() => setConfirming(true)}
          disabled={!canPermanent || busy || confirming}
        >
          <span className={styles.choiceTitle}>영구 편지로 보내기</span>
          <span className={styles.choiceDesc}>받는 분이 기간 제한 없이 간직해요</span>
          <span className={styles.choiceMeta}>
            편지권 1장 · 보유 편지권 {tickets}장
          </span>
        </button>
        {!canPermanent && (
          <p className={styles.fieldHint}>
            {noTicket && '편지권이 없어요. '}편지권은 뮤터 앱에서 살 수 있어요
          </p>
        )}
        {confirming && (
          <div className={styles.choiceConfirm}>
            <p className={styles.hint}>편지권 1장을 사용해요</p>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.copyBtn}
                onClick={() => setConfirming(false)}
                disabled={busy}
              >
                취소
              </button>
              <button
                type="button"
                className={styles.issueBtn}
                onClick={() => void handlePermanent()}
                disabled={busy}
              >
                {busy ? '만드는 중…' : '영구 편지로 보내기'}
              </button>
            </div>
          </div>
        )}

        <button
          type="button"
          className={styles.choice}
          onClick={() => setChoseFree(true)}
          disabled={busy}
        >
          <span className={styles.choiceTitle}>{freeDays}일 편지로 보내기</span>
          <span className={styles.choiceDesc}>받는 분이 처음 연 날부터 {freeDays}일 동안 열려요</span>
          <span className={styles.choiceMeta}>무료</span>
        </button>

        {error && <p className={styles.error}>{error}</p>}
      </div>
    </>
  );
}
