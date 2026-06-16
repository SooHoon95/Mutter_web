// 홈 라우트 — 인증 상태에 따라 분기.
//   - 비로그인: 마케팅 랜딩(Landing)
//   - 로그인: 개인 대시보드(인사 + 새 편지 쓰기 + 보낸/받은/마이페이지 바로가기)

import { Link } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import { useProfile } from '@/features/profile';
import Landing from './Landing';
import styles from './Home.module.css';

export default function Home(): React.ReactElement {
  const { session, loading } = useAuth();

  if (loading) {
    return <div className="route-fallback">불러오는 중…</div>;
  }
  if (!session) {
    return <Landing />;
  }
  return <Dashboard email={session.user.email ?? ''} />;
}

function Dashboard({ email }: { email: string }): React.ReactElement {
  const { profile } = useProfile();
  const name = profile?.nickname?.trim() || email.split('@')[0] || '나';

  return (
    <main className={styles.page}>
      <h1 className={styles.greeting}>{name}님, 안녕하세요</h1>
      <p className={styles.sub}>읽는 순간을 연출하는 편지를 만들어 보세요.</p>

      <Link className={styles.writeCta} to="/create">
        ✍️ 새 편지 쓰기
      </Link>

      <nav className={styles.cards} aria-label="바로가기">
        <Link className={styles.card} to="/sent">
          <span className={styles.cardTitle}>보낸 편지</span>
          <span className={styles.cardDesc}>발급한 링크 관리·열람 현황</span>
        </Link>
        <Link className={styles.card} to="/inbox">
          <span className={styles.cardTitle}>받은 편지함</span>
          <span className={styles.cardDesc}>보관한 편지 다시 보기</span>
        </Link>
        <Link className={styles.card} to="/me">
          <span className={styles.cardTitle}>마이페이지</span>
          <span className={styles.cardDesc}>프로필·계정 설정</span>
        </Link>
      </nav>
    </main>
  );
}
