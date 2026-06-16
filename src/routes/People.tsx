// 주고받은 사람 라우트 (/people). 인증 가드는 라우터에서 처리한다.
// 상대 목록을 보여주고, 상대를 선택하면 같은 페이지에서 스레드를 렌더한다(별도 라우트 불필요).

import { useState } from 'react';
import { CounterpartList, ThreadView } from '@/features/threads';
import styles from './People.module.css';

export default function People(): React.ReactElement {
  // 선택된 상대 — null이면 목록, 값이 있으면 해당 상대 스레드.
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <main className={styles.page}>
      {selected === null ? (
        <>
          <h1 className={styles.heading}>주고받은 사람</h1>
          <CounterpartList onSelect={setSelected} />
        </>
      ) : (
        <>
          <button type="button" className={styles.back} onClick={() => setSelected(null)}>
            ← 목록으로
          </button>
          <ThreadView counterpartId={selected} />
        </>
      )}
    </main>
  );
}
