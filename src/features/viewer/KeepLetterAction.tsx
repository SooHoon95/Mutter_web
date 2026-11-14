// KeepLetterAction — 받은 사람이 자기 편지권으로 편지를 간직한다(keep_received_letter). 서버 계약
// "받은 사람의 간직하기"의 ① 편지 끝 ② 닫힘 예고 ③ 잠김 화면이 함께 쓴다 — 자리마다 버튼 문구·스타일만 다르다.
//
// 웹 규칙: tickets > 0 || is_admin → 버튼. 아니고 paid_enabled → "편지권은 뮤터 앱에서 살 수 있어요".
// 둘 다 아니면(비로그인·편지권 UI를 숨기는 계정·서버 반영 전) 아무것도 그리지 않는다.
// 확인(팝업 없음, 서버 계약 "편지권이 있을 때의 확인"):
//   - ①② 글자 버튼은 같은 자리가 안내 문장 + [취소] / [간직하기]로 바뀐다(작은 글자 버튼 한 번에 편지권이 쓰이지 않게).
//   - ③ "편지권으로 간직하기"(immediate)는 문구가 편지권을 말하므로 바로 진행하고, 같은 안내 문장을 버튼 아래에 미리 보인다.
// 성공하면 편지권·상태 조회를 갱신하고 onKept를 부른다.

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { keepReceivedLetter } from '@/data/tickets';
import { LetterGoneError, NoTicketError } from '@/data/access';
import {
  useEntitlements,
  ENTITLEMENTS_QUERY_KEY,
  LETTER_ACCESS_QUERY_KEY,
} from '@/features/tickets';

const KEEP_NOTE = '편지권 1장을 사용해요. 보낸 분이 편지를 지워도 내 편지함에는 남아요.';

export interface KeepLetterActionClasses {
  /** 처음 보이는 버튼. */
  trigger: string;
  /** 확인 단계의 "간직하기". */
  confirm: string;
  /** 확인 단계의 "취소". */
  cancel: string;
  /** 확인 문구·앱 안내. */
  text: string;
  /** 확인 단계의 버튼 줄. */
  actions: string;
  error: string;
}

interface KeepLetterActionProps {
  token: string;
  /** 링크 암호(없으면 null) — 같은 게이트를 다시 지난다. */
  password: string | null;
  /** 자리별 버튼 문구 — "계속 간직하기" / "간직하기" / "편지권으로 간직하기". */
  label: string;
  /** 버튼 문구가 편지권을 말하는 자리(③) — 확인 단계 없이 바로 진행하고 안내 문장을 버튼 아래에 둔다. */
  immediate?: boolean;
  classes: KeepLetterActionClasses;
  onKept: () => void;
}

export function KeepLetterAction({
  token,
  password,
  label,
  immediate = false,
  classes,
  onKept,
}: KeepLetterActionProps): React.ReactElement | null {
  const { entitlements } = useEntitlements();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noTicket, setNoTicket] = useState(false);

  const canKeep = !!entitlements && (entitlements.tickets > 0 || entitlements.isAdmin);
  const showBuyHint = !!entitlements && !canKeep && entitlements.paidEnabled;

  async function handleKeep(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await keepReceivedLetter(token, password);
      void queryClient.invalidateQueries({ queryKey: ENTITLEMENTS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: LETTER_ACCESS_QUERY_KEY });
      setConfirming(false);
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

  if (noTicket) {
    return <span className={classes.error}>편지권이 없어요. 편지권은 뮤터 앱에서 살 수 있어요</span>;
  }
  if (!canKeep) {
    return showBuyHint ? <span className={classes.text}>편지권은 뮤터 앱에서 살 수 있어요</span> : null;
  }

  if (immediate) {
    return (
      <>
        <button
          type="button"
          className={classes.trigger}
          onClick={() => void handleKeep()}
          disabled={busy}
          aria-busy={busy}
        >
          {busy ? '간직하는 중…' : label}
        </button>
        <p className={classes.text}>{KEEP_NOTE}</p>
        {error && <span className={classes.error}>{error}</span>}
      </>
    );
  }

  if (confirming) {
    return (
      <div>
        <p className={classes.text}>{KEEP_NOTE}</p>
        <div className={classes.actions}>
          <button
            type="button"
            className={classes.cancel}
            onClick={() => setConfirming(false)}
            disabled={busy}
          >
            취소
          </button>
          <button
            type="button"
            className={classes.confirm}
            onClick={() => void handleKeep()}
            disabled={busy}
          >
            {busy ? '간직하는 중…' : '간직하기'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <button type="button" className={classes.trigger} onClick={() => setConfirming(true)}>
        {label}
      </button>
      {error && <span className={classes.error}>{error}</span>}
    </>
  );
}
