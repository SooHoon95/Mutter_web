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
            <GoogleIcon />
            <span>{socialLoading === 'google' ? '연결 중…' : 'Google로 계속하기'}</span>
          </button>
          <button
            className={styles.socialButtonKakao}
            type="button"
            disabled={socialLoading !== null}
            aria-label="Kakao로 계속하기"
            onClick={() => void handleSocialLogin('kakao')}
          >
            <KakaoIcon />
            <span>{socialLoading === 'kakao' ? '연결 중…' : 'Kakao로 계속하기'}</span>
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

/** Google 공식 4색 'G' 로고 (브랜드 가이드라인 — 버튼에 로고 필수). */
function GoogleIcon(): React.ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.347 2.827.957 4.042l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}

/** Kakao 공식 말풍선 심볼 (노란 버튼 위 검정 심볼 — 브랜드 가이드라인). */
function KakaoIcon(): React.ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <path
        fill="#000000"
        d="M9 1.6C4.58 1.6 1 4.36 1 7.77c0 2.2 1.46 4.13 3.68 5.23-.16.58-.59 2.12-.67 2.45-.1.41.15.4.32.29.13-.08 2.06-1.4 2.9-1.96.55.08 1.11.12 1.77.12 4.42 0 8-2.76 8-6.16C18 4.36 13.42 1.6 9 1.6z"
      />
    </svg>
  );
}
