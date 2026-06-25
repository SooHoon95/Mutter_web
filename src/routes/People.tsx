// 주고받은 사람 라우트 (/people). 인증 가드는 라우터에서 처리한다.
// 상단: 연결된 사람(getMyConnections) + 연결 초대(InvitePanel).
//   - 연결 없을 때: 빈 상태 안내 + InvitePanel CTA 바로 노출(숨김 없음).
//   - 연결 있을 때: ConnectionList + '연결 초대' 토글(교체 전 필요 시).
// 하단: 주고받은 상대 목록(CounterpartList). 상대/연결된 사람을 선택하면 스레드(getThread)를 렌더한다.

import { useState } from 'react';
import { CounterpartList, ThreadView } from '@/features/threads';
import { ConnectionList, InvitePanel } from '@/features/connections';
import { useConnections } from '@/features/connections';
import styles from './People.module.css';

export default function People(): React.ReactElement {
  // 선택된 상대 — null이면 목록, 값이 있으면 해당 상대 스레드.
  // 연결된 사람의 userId와 주고받은 상대의 counterpartId는 동일 user id 공간이라 그대로 쓴다.
  const [selected, setSelected] = useState<string | null>(null);
  // 이미 연결됐을 때만 '연결 초대' 토글을 노출한다(교체 목적 — 기존 연결 해제 유도).
  const [showInvite, setShowInvite] = useState(false);

  // 연결 상태를 읽어 "연결 없음" 빈 상태 vs "연결 있음" 구분.
  // useConnections는 InvitePanel / ConnectionList 내부에서도 쓰이므로 캐시를 공유한다.
  const { connections, isLoading } = useConnections();
  const isConnected = !isLoading && connections.length > 0;

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
      {/* 페이지 단일 h1 — WCAG 1.3.1, 시각적으로는 숨김 */}
      <h1 className={styles.pageTitle}>주고받은 사람</h1>

      {/* 연결된 사람 섹션 ────────────────────────────────────────────── */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionHeading}>연결된 사람</h2>
            {/* 연결이 뭔지 한 줄 설명 */}
            <p className={styles.sectionDesc}>
              연결하면 링크 없이 바로 편지를 주고받을 수 있어요. 독점 1:1.
            </p>
          </div>
          {/* 이미 연결된 경우에만 토글 노출 — 연결 없을 때는 InvitePanel을 바로 보여준다 */}
          {isConnected && (
            <button
              type="button"
              className={styles.inviteToggle}
              onClick={() => setShowInvite((v) => !v)}
            >
              {showInvite ? '닫기' : '연결 초대'}
            </button>
          )}
        </div>

        {/* 연결 없음: InvitePanel을 빈 상태 CTA로 바로 노출 */}
        {!isConnected && !isLoading && (
          <div className={styles.emptyState}>
            <p className={styles.emptyHint}>아직 연결된 사람이 없어요.</p>
            <InvitePanel />
          </div>
        )}

        {/* 연결 있음: ConnectionList + 선택적으로 InvitePanel 토글 */}
        {isConnected && (
          <>
            {showInvite && <InvitePanel />}
            <ConnectionList onSelect={setSelected} />
          </>
        )}
      </section>

      {/* 주고받은 상대 */}
      <section className={styles.section}>
        <h2 className={styles.heading}>주고받은 사람</h2>
        <CounterpartList onSelect={setSelected} />
      </section>
    </main>
  );
}
