// 받은 편지함 라우트 (/inbox). 인증 가드는 라우터에서 처리한다.
// 로그인한 수신자가 저장한 편지 목록을 표시한다.

import { InboxList } from '@/features/inbox';
import styles from './Inbox.module.css';

export default function Inbox(): React.ReactElement {
  return (
    <main className={styles.page}>
      <h1 className={styles.heading}>받은 편지함</h1>
      <InboxList />
    </main>
  );
}
