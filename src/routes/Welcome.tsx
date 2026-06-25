// 회원가입 완료 축하 페이지 (/welcome).
// 이름 설정(/set-nickname)에서 "시작하기"로 닉네임을 저장한 직후 이 화면으로 온다. 축하만 담는
// 셸 없는 클린 페이지. "편지함으로" 버튼으로 메인('/')에 진입한다.
//
// 가입 직후 흐름: (소셜/이메일 가입) → /set-nickname(이름) → /welcome(이 화면) → 메인('/').

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import styles from './Welcome.module.css';

export default function Welcome(): React.ReactElement | null {
  const { session, loading } = useAuth();
  const navigate = useNavigate();

  // 비로그인 접근은 로그인으로 돌린다(이 페이지는 가입 직후 전용).
  useEffect(() => {
    if (!loading && !session) navigate('/login', { replace: true });
  }, [loading, session, navigate]);

  if (loading || !session) return null;

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <p className={styles.icon} aria-hidden="true">
          🎉
        </p>
        <h1 className={styles.title}>회원가입 완료!</h1>
        <p className={styles.subtitle}>
          환영해요.
          <br />
          이제 마음을 담은 편지를 띄울 수 있어요.
        </p>
        <button
          type="button"
          className={styles.button}
          onClick={() => navigate('/', { replace: true })}
          autoFocus
        >
          편지함으로
        </button>
      </div>
    </main>
  );
}
