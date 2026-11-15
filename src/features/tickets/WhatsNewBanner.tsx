// WhatsNewBanner — 편지권이 생긴 것을 알리는 닫을 수 있는 한 줄. 제작자 셸의 내비게이션 아래에 놓인다.
// 사양: Mutter/docs/specs/2026-11-15-whats-new.md "웹"(앱의 넘겨 보는 화면은 웹에 만들지 않는다).
//
//   - 대상: 로그인한 계정 가운데 paid_enabled이고 관리자가 아닌 계정. 권한을 받기 전에는 그리지 않는다(깜빡임 방지).
//   - 닫으면 localStorage `whatsNewTickets = seen` — 그 브라우저에서는 다시 보이지 않는다.
//   - 받는 사람이 편지를 읽는 화면(/l/:token)은 셸을 쓰지 않으므로 보이지 않는다.

import { useState } from 'react';
import { useEntitlements } from './useEntitlements';
import styles from './WhatsNewBanner.module.css';

const STORAGE_KEY = 'whatsNewTickets';
const SEEN = 'seen';

/**
 * localStorage를 못 쓰는 환경(차단·비공개 창)에서 닫은 것을 이 탭이 떠 있는 동안 기억한다 —
 * 셸은 화면마다 새로 그려지므로 컴포넌트 상태만으로는 화면을 옮길 때 다시 나타난다.
 */
let dismissedInMemory = false;

function readSeen(): boolean {
  if (dismissedInMemory) return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === SEEN;
  } catch {
    return false;
  }
}

function writeSeen(): void {
  dismissedInMemory = true;
  try {
    window.localStorage.setItem(STORAGE_KEY, SEEN);
  } catch {
    /* 저장하지 못해도 이 탭에서는 닫힌 채로 둔다 */
  }
}

export function WhatsNewBanner(): React.ReactElement | null {
  const { entitlements } = useEntitlements();
  const [seen, setSeen] = useState(readSeen);

  if (seen || !entitlements || !entitlements.paidEnabled || entitlements.isAdmin) return null;

  return (
    <aside className={styles.banner} aria-label="새 소식">
      <p className={styles.text}>
        편지권이 생겼어요. 새 편지는 보낼 때 영구 편지와 {entitlements.freeDays}일 편지 중에 골라요.
        지금까지 보낸 편지는 그대로예요.
      </p>
      <button
        type="button"
        className={styles.close}
        onClick={() => {
          writeSeen();
          setSeen(true);
        }}
      >
        닫기
      </button>
    </aside>
  );
}
