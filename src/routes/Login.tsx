/**
 * src/routes/Login.tsx
 *
 * 매직링크 로그인 페이지.
 *
 * 흐름:
 * 1. 이메일 입력 → "링크 보내기" 클릭
 * 2. sendMagicLink() 호출 → Supabase가 이메일 발송
 * 3. 발송 성공 → "메일함 확인" 상태로 전환(재발송 없이 안내만)
 * 4. 사용자가 메일의 링크 클릭 → Supabase가 세션 생성 → onAuthStateChange 발화
 *    → AuthProvider가 session 업데이트 → RequireAuth가 원래 경로(/create 등)로 복귀
 *
 * 이미 로그인된 경우: useEffect에서 state.from 또는 '/'으로 리다이렉트.
 */
import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { sendMagicLink, signInWithProvider } from '@/data/auth';
import { useAuth } from '@/app/AuthProvider';
import styles from './Login.module.css';

interface LocationState {
  from?: { pathname: string };
}

export default function Login(): React.ReactNode {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState | null;

  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [socialLoading, setSocialLoading] = useState<'google' | 'kakao' | null>(null);

  async function handleSocialLogin(provider: 'google' | 'kakao'): Promise<void> {
    setError(null);
    setSocialLoading(provider);
    try {
      await signInWithProvider(provider);
      // 리다이렉트가 발생하므로 이후 코드는 실행되지 않는다
    } catch (err) {
      const message = err instanceof Error ? err.message : '소셜 로그인에 실패했습니다.';
      setError(message);
      setSocialLoading(null);
    }
  }

  // 이미 로그인된 상태라면 원래 경로 또는 '/'으로 이동
  useEffect(() => {
    if (!loading && session) {
      const destination = state?.from?.pathname ?? '/';
      navigate(destination, { replace: true });
    }
  }, [session, loading, navigate, state]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);
    setSending(true);
    try {
      await sendMagicLink(email.trim());
      setSent(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.';
      setError(message);
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <main className={styles.page}>
        <div className={styles.card}>
          <div className={styles.successBox}>
            <p className={styles.successTitle}>메일함을 확인해주세요</p>
            <p className={styles.successDesc}>
              <strong>{email}</strong>으로 로그인 링크를 보냈습니다.
              <br />
              링크를 클릭하면 자동으로 로그인됩니다.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>편지 쓰기</h1>
        <p className={styles.subtitle}>이메일로 로그인 링크를 보내드립니다.</p>

        <div className={styles.socialButtons}>
          <button
            className={styles.socialButtonGoogle}
            type="button"
            disabled={socialLoading !== null}
            aria-label="Google로 계속하기"
            onClick={() => void handleSocialLogin('google')}
          >
            {socialLoading === 'google' ? '연결 중…' : 'Google로 계속하기'}
          </button>
          <button
            className={styles.socialButtonKakao}
            type="button"
            disabled={socialLoading !== null}
            aria-label="Kakao로 계속하기"
            onClick={() => void handleSocialLogin('kakao')}
          >
            {socialLoading === 'kakao' ? '연결 중…' : 'Kakao로 계속하기'}
          </button>
        </div>

        <div className={styles.divider} aria-hidden="true">
          <span className={styles.dividerText}>또는</span>
        </div>

        <form className={styles.form} onSubmit={(e) => void handleSubmit(e)}>
          <label className={styles.label} htmlFor="email">
            이메일
          </label>
          <input
            id="email"
            className={styles.input}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            disabled={sending}
          />
          {error && <p className={styles.error}>{error}</p>}
          <button className={styles.button} type="submit" disabled={sending || email.trim() === ''}>
            {sending ? '보내는 중…' : '로그인 링크 받기'}
          </button>
        </form>
      </div>
    </main>
  );
}
