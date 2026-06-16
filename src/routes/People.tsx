// 주고받은 사람 라우트 (/people). 인증 가드는 라우터에서 처리한다.
// 상단: 연결된 사람(getMyConnections) + 연결 초대(InvitePanel) 토글.
// 하단: 주고받은 상대 목록(CounterpartList). 상대/연결된 사람을 선택하면 스레드(getThread)를 렌더한다.

import { useState } from 'react';
import { CounterpartList, ThreadView } from '@/features/threads';
import { ConnectionList, InvitePanel } from '@/features/connections';
import styles from './People.module.css';

export default function People(): React.ReactElement {
  // 선택된 상대 — null이면 목록, 값이 있으면 해당 상대 스레드.
  // 연결된 사람의 userId와 주고받은 상대의 counterpartId는 동일 user id 공간이라 그대로 쓴다.
  const [selected, setSelected] = useState<string | null>(null);
  // 연결 초대 패널 노출 토글.
  const [showInvite, setShowInvite] = useState(false);

  if (selected !== null) {
    return (
      <main className={styles.page}>
        <button type="button" className={styles.back} onClick={() => setSelected(null)}>
          ← 목록으로
        </button>
        <ThreadView counterpartId={selected} />
      </main>
    );
  }

  return (
    <main className={styles.page}>
      {/* 연결된 사람 + 연결 초대 */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionHeading}>연결된 사람</h2>
          <button
            type="button"
            className={styles.inviteToggle}
            onClick={() => setShowInvite((v) => !v)}
          >
            {showInvite ? '닫기' : '연결 초대'}
          </button>
        </div>

        {showInvite && <InvitePanel />}

        <ConnectionList onSelect={setSelected} />
      </section>

      {/* 주고받은 상대 */}
      <section className={styles.section}>
        <h1 className={styles.heading}>주고받은 사람</h1>
        <CounterpartList onSelect={setSelected} />
      </section>
    </main>
  );
}
