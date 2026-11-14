// LetterKeepNotice — 본문·사진이 끝난 자리의 조용한 한 줄(서버 계약 "받은 사람의 간직하기" ①②).
//
//   - 간직한 뒤: "간직한 편지예요".
//   - 영구 편지(access_until 없음): 아무것도 없다.
//   - 남은 날 ≤ warn_days: 닫힘 예고 "이 편지는 {n}일 뒤 닫혀요" + "간직하기"(②).
//   - 그 전: "이 편지는 {M}월 {D}일까지 열려요" + "계속 간직하기"(①).
// 웹에서는 닫힘 예고도 같은 자리(본문 끝)라 ①②를 한 줄로 합친다 — 같은 뜻의 줄이 둘 붙지 않게.
// 보낸 사람 본인(is_mine)에게는 호출부(Viewer)가 이 줄을 통째로 그리지 않는다. 버튼은 로그인한 받은 사람에게만
// (KeepLetterAction이 편지권 조회로 가린다 — 비로그인은 날짜 안내만). 읽는 도중에는 끼어들지 않는다.

import { useEntitlements } from '@/features/tickets';
import { closingNotice, monthDay } from '@/lib/accessLabel';
import { KeepLetterAction } from './KeepLetterAction';
import styles from './LetterView.module.css';

/** warn_days가 오지 않을 때(비로그인·서버 반영 전) 쓰는 계약 기본값. */
const DEFAULT_WARN_DAYS = 2;

const KEEP_CLASSES = {
  trigger: styles.keepButton,
  confirm: styles.keepButton,
  cancel: styles.keepButton,
  text: styles.keepText,
  actions: styles.keepActions,
  error: styles.keepError,
};

interface LetterKeepNoticeProps {
  token: string;
  password: string | null;
  /** 받은 사람에게 닫히는 시각(ISO). 영구면 null. */
  accessUntil: string | null;
  /** 이 화면에서 간직했는지. */
  kept: boolean;
  onKept: () => void;
}

export function LetterKeepNotice({
  token,
  password,
  accessUntil,
  kept,
  onKept,
}: LetterKeepNoticeProps): React.ReactElement | null {
  const { entitlements } = useEntitlements();

  if (kept) {
    return (
      <div className={styles.closingNotice} role="note">
        간직한 편지예요
      </div>
    );
  }
  if (!accessUntil) return null;

  const closing = closingNotice(accessUntil, entitlements?.warnDays ?? DEFAULT_WARN_DAYS);

  return (
    <div className={styles.closingNotice} role="note">
      <span>{closing ?? `이 편지는 ${monthDay(accessUntil)}까지 열려요`}</span>{' '}
      <KeepLetterAction
        token={token}
        password={password}
        label={closing ? '간직하기' : '계속 간직하기'}
        classes={KEEP_CLASSES}
        onKept={onKept}
      />
    </div>
  );
}
