// SendChoiceGate — 보내기 전 선택(서버 계약 "보내기 전 선택(보낸 사람)"). 발송 UI(링크 발급·연결 상대에게
// 보내기)를 감싸, 아직 보낸 적 없는 14일 편지면 "어떻게 보낼까요?"를 먼저 묻는다.
//
// 카드가 보이는 조건(모두 참):
//   1. 편지 state == open   2. paid_enabled   3. 발급된 링크가 없음(연결 발송도 링크를 만든다)
//   4. 이 화면(마운트)에서 아직 고르지 않았다 — 나갔다 오면 다시 묻는다.
// 편지권·상태·링크 조회가 끝나기 전에는 카드도 발송 UI도 그리지 않는다(카드↔폼 깜빡임 방지).
//
// 카드는 라디오로 고르기만 하고, 맨 아래 버튼이 진행한다(iOS SendChoiceCard와 같은 모양).
// 편지권은 실제로 보낼 때만 쓴다(하드 규칙): 영구 편지를 골라도 여기서는 선택만 기억하고(메모리),
// 발송 UI가 useSendChoice로 받아 issue_link / send_to_connection에 p_permanent로 싣는다 —
// 고르고 나서 링크를 만들지 않으면 편지권도 편지 상태도 그대로다.
// 웹은 구매가 없다 — 잔액이 0이면 영구 선택지를 막고 앱 안내만 하며, 선택은 {n}일 편지에 고정된다.

import { useCallback, useId, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listLinks } from '@/data/links';
import {
  useEntitlements,
  useLetterAccessStates,
  SendChoiceContext,
  ENTITLEMENTS_QUERY_KEY,
  LETTER_ACCESS_QUERY_KEY,
  type SendChoice,
} from '@/features/tickets';
import styles from './LinkManager.module.css';

interface SendChoiceGateProps {
  letterId: string;
  /**
   * 카드 위에 늘 그릴 것. 인자는 이 편지가 아직 보내지 않은(링크가 없는) 편지인지(판단 전 포함) — 보낸 편지 상세가
   * "영구 편지로 만들기" 버튼을 이미 보낸 편지에만 보이게 하는 데 쓴다(보내기 전에 편지권이 쓰이지 않게).
   */
  before?: (unsent: boolean) => React.ReactNode;
  /** 발송 UI — 고르기 전에는 숨긴다. */
  children: React.ReactNode;
}

type Choice = 'permanent' | 'free';

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

  /** 카드의 라디오. */
  const [choice, setChoice] = useState<Choice>('permanent');
  /** 버튼으로 확정한 선택 — 화면에 머무는 동안만 기억한다. null이면 아직 고르는 중. */
  const [sendAs, setSendAs] = useState<Choice | null>(null);
  /** 이 화면에서 링크를 만들었거나 보냈다. */
  const [sent, setSent] = useState(false);
  const [sentPermanent, setSentPermanent] = useState(false);
  const [noTicket, setNoTicket] = useState(false);
  const headingId = useId();
  const groupName = useId();

  // 영구를 골랐고 아직 보내지 않았다 — 다음 발급·발송에 편지권 1장이 쓰인다.
  const permanentPending = sendAs === 'permanent' && !sent;

  const onSent = useCallback(
    (permanent: boolean) => {
      setSent(true);
      if (!permanent) return;
      setSentPermanent(true);
      void queryClient.invalidateQueries({ queryKey: ENTITLEMENTS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: LETTER_ACCESS_QUERY_KEY });
    },
    [queryClient],
  );
  // 그 사이 편지권이 없어졌다 — 카드로 돌아가 영구를 막고 {n}일 편지만 고를 수 있게 한다.
  const onNoTicket = useCallback(() => {
    setNoTicket(true);
    setSendAs(null);
    void queryClient.invalidateQueries({ queryKey: ENTITLEMENTS_QUERY_KEY });
  }, [queryClient]);
  const sendChoice = useMemo<SendChoice>(
    () => ({ permanent: permanentPending, onSent, onNoTicket }),
    [permanentPending, onSent, onNoTicket],
  );

  const pending = !entitlementsLoaded || !statesLoaded || hasLinks === undefined;
  const unsent = pending || (hasLinks === false && !sent);
  const choosing =
    !pending &&
    sendAs === null &&
    !sent &&
    states.get(letterId)?.state === 'open' &&
    entitlements?.paidEnabled === true &&
    hasLinks === false;

  if (pending) return <>{before?.(true)}</>;

  if (!choosing) {
    return (
      <SendChoiceContext.Provider value={sendChoice}>
        {before?.(unsent)}
        {sentPermanent && (
          <div className={styles.linkMeta}>
            <span className={`${styles.badge} ${styles.scheduled}`}>영구</span>
          </div>
        )}
        {permanentPending && (
          <div className={styles.permanentNotice}>
            <div className={styles.permanentNoticeText}>
              <p className={styles.permanentNoticeTitle}>영구 편지로 보내요</p>
              <p className={styles.hint}>링크를 만들거나 보낼 때 편지권 1장이 사용돼요</p>
            </div>
            <button
              type="button"
              className={styles.textBtn}
              onClick={() => {
                setSendAs(null);
                setChoice('permanent');
              }}
            >
              다시 고르기
            </button>
          </div>
        )}
        {children}
      </SendChoiceContext.Provider>
    );
  }

  const tickets = entitlements?.tickets ?? 0;
  const freeDays = entitlements?.freeDays;
  const canPermanent = tickets > 0 && !noTicket;
  // 영구를 못 고르면(잔액 0·방금 "편지권 없음" 응답) 선택은 {n}일 편지뿐이다.
  const selected: Choice = canPermanent ? choice : 'free';

  return (
    <>
      {before?.(true)}
      <div className={styles.issueForm}>
        <h3 id={headingId}>어떻게 보낼까요?</h3>

        <div className={styles.choiceGroup} role="radiogroup" aria-labelledby={headingId}>
          <label
            className={[
              styles.choice,
              selected === 'permanent' ? styles.choiceSelected : '',
              canPermanent ? '' : styles.choiceDisabled,
            ].join(' ')}
          >
            <input
              type="radio"
              name={groupName}
              className={styles.choiceInput}
              checked={selected === 'permanent'}
              onChange={() => setChoice('permanent')}
              disabled={!canPermanent}
            />
            <span className={styles.choiceDot} aria-hidden="true" />
            <span className={styles.choiceBody}>
              <span className={styles.choiceTitle}>영구 편지</span>
              <span className={styles.choiceDesc}>받는 분이 기간 제한 없이 간직해요</span>
              <span className={styles.choiceMeta}>보유 편지권 {tickets}장</span>
            </span>
            <span className={styles.choicePrice}>편지권 1장</span>
          </label>
          {!canPermanent && (
            <p className={styles.fieldHint}>
              {noTicket && '편지권이 없어요. '}편지권은 뮤터 앱에서 살 수 있어요
            </p>
          )}

          <label
            className={`${styles.choice} ${selected === 'free' ? styles.choiceSelected : ''}`}
          >
            <input
              type="radio"
              name={groupName}
              className={styles.choiceInput}
              checked={selected === 'free'}
              onChange={() => setChoice('free')}
            />
            <span className={styles.choiceDot} aria-hidden="true" />
            <span className={styles.choiceBody}>
              <span className={styles.choiceTitle}>{freeDays}일 편지</span>
              <span className={styles.choiceDesc}>
                받는 분이 처음 연 날부터 {freeDays}일 동안 열려요
              </span>
            </span>
            <span className={styles.choicePrice}>무료</span>
          </label>
        </div>

        {selected === 'permanent' && (
          <p className={styles.hint}>링크를 만들거나 보낼 때 편지권 1장이 사용돼요</p>
        )}
        <button
          type="button"
          className={`${styles.issueBtn} ${styles.choiceSubmit}`}
          onClick={() => setSendAs(selected)}
        >
          {selected === 'permanent' ? '영구 편지로 보내기' : `${freeDays}일 편지로 보내기`}
        </button>
      </div>
    </>
  );
}
