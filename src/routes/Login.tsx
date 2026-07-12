/**
 * src/routes/Login.tsx
 *
 * 로그인/회원가입 (이메일+비밀번호, 코드 인증) + 소셜 OAuth. Postone과 동일 모델:
 *  - 회원가입: 이메일+비밀번호 → 6자리 코드 메일 → 코드 입력 → 가입 완료+로그인.
 *  - 로그인: 이메일+비밀번호.
 *  - 폴백: 비밀번호 없는(구) 계정 → "이메일 코드로 로그인"(sendMagicLink → 코드 입력).
 *
 * 코드는 "Magic Link" 이메일 템플릿의 {{ .Token }} 으로 전달된다(requestEmailCode/sendMagicLink 동일).
 */
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  signInWithPassword,
  requestEmailCode,
  verifyEmailOtp,
  setUserPassword,
  sendMagicLink,
  signInWithProvider,
  startKakaoLogin,
} from '@/data/auth';
import { useAuth } from '@/app/AuthProvider';
import styles from './Login.module.css';

interface LocationState {
  from?: { pathname: string };
}

type Mode = 'login' | 'signup';

/** Supabase 인증 에러 메시지를 사용자 친화 한국어로 정규화. */
function authErrorMessage(err: unknown, mode: Mode): string {
  const raw = err instanceof Error ? err.message : String(err);
  const m = raw.toLowerCase();
  if (m.includes('invalid login credentials')) return '이메일 또는 비밀번호가 올바르지 않습니다.';
  if (m.includes('email not confirmed')) return '이메일 인증을 먼저 완료해 주세요.';
  if (m.includes('already registered') || m.includes('already been registered'))
    return '이미 가입된 이메일이에요. 로그인해 주세요.';
  if (m.includes('password should be') || m.includes('at least 6'))
    return '비밀번호는 6자 이상이어야 해요.';
  if (m.includes('rate limit') || m.includes('too many') || m.includes('exceeded'))
    return '요청이 많아요. 잠시 후 다시 시도해 주세요.';
  return mode === 'signup'
    ? '회원가입에 실패했습니다. 잠시 후 다시 시도해 주세요.'
    : '로그인에 실패했습니다.';
}

/** 소셜 OAuth 에러를 사용자 친화 한국어로 정규화. */
function socialErrorMessage(err: unknown, provider: 'google' | 'kakao' | 'apple'): string {
  const raw = err instanceof Error ? err.message : String(err);
  const m = raw.toLowerCase();
  const label = provider === 'google' ? 'Google' : provider === 'kakao' ? 'Kakao' : 'Apple';
  // 제공자 미설정(Supabase Providers에서 아직 enable 안 됨) — 설정 완료 전 흔한 케이스.
  if (
    m.includes('provider is not enabled') ||
    m.includes('unsupported provider') ||
    m.includes('not enabled') ||
    m.includes('validation_failed')
  ) {
    return `${label} 로그인이 아직 준비 중이에요. 잠시 후 다시 시도하거나 이메일로 로그인해 주세요.`;
  }
  return `${label} 로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.`;
}

export default function Login(): React.ReactNode {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState | null;

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [awaitingCode, setAwaitingCode] = useState(false); // 가입 후 코드 입력 단계
  const [code, setCode] = useState('');
  const [socialLoading, setSocialLoading] = useState<'google' | 'kakao' | 'apple' | null>(null);
  // 자동 리다이렉트 가드(race-safe). 세션 생성이 navigate('/set-nickname')보다 먼저 전파돼도
  // ref는 동기적으로 즉시 반영되므로 effect가 '/'로 가로채 이동하는 것을 막는다.
  const justSignedUpRef = useRef(false);

  async function handleSocialLogin(provider: 'google' | 'kakao' | 'apple'): Promise<void> {
    setError(null);
    setSocialLoading(provider);
    try {
      await signInWithProvider(provider);
    } catch (err) {
      setError(socialErrorMessage(err, provider));
      setSocialLoading(null);
    }
  }

  // 카카오는 닉네임-우선 커스텀 인가코드 흐름(startKakaoLogin)이라 signInWithProvider를 쓰지 않는다.
  // 이 함수는 카카오 인가 페이지로 즉시 리다이렉트하지만, 키 미설정(VITE_KAKAO_REST_KEY) 등으로
  // throw되면 리다이렉트 전이라 화면 변화가 전혀 없다 → 반드시 에러를 노출해 "무반응"을 없앤다.
  function handleKakaoLogin(): void {
    setError(null);
    setSocialLoading('kakao');
    try {
      startKakaoLogin();
    } catch (err) {
      setError(socialErrorMessage(err, 'kakao'));
      setSocialLoading(null);
    }
  }

  // 이미 로그인된 상태면 원래 경로 또는 '/'으로 이동.
  // 단, 방금 가입을 마친 경우(signedUp)에는 자동 이동을 막고 "가입 완료" 화면을 띄운다
  // (사용자가 "시작하기"를 누르면 그때 이동).
  useEffect(() => {
    if (!loading && session && !justSignedUpRef.current) {
      navigate(state?.from?.pathname ?? '/', { replace: true });
    }
  }, [session, loading, navigate, state]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === 'signup') {
        // signInWithOtp로 6자리 코드 발송(Magic Link 템플릿 .Token). 비번은 코드 인증 후 설정.
        await requestEmailCode(email.trim());
        setAwaitingCode(true);
        setNotice(`${email.trim()}로 6자리 인증 코드를 보냈어요.`);
      } else {
        await signInWithPassword(email.trim(), password);
      }
    } catch (err) {
      setError(authErrorMessage(err, mode));
    } finally {
      setBusy(false);
    }
  }

  // 코드 검증 — 성공 시 세션 생성. 이어서 비밀번호를 설정해 이후 비번 로그인 가능하게 한다.
  async function handleVerifyCode(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await verifyEmailOtp(email.trim(), code.trim());
      // 세션이 생성되면 useEffect가 '/'로 자동 이동하므로, 그 전에 가드를 켜서
      // 대신 이름 설정 페이지(/set-nickname)로 보낸다. ref는 즉시(동기) 반영 → race-safe.
      justSignedUpRef.current = true;
      // 코드 인증으로 로그인됨 → 비밀번호 설정(실패해도 로그인 자체는 유지).
      if (password.length >= 6) {
        try {
          await setUserPassword(password);
        } catch {
          // 비번 설정 실패는 치명적이지 않음 — 세션은 이미 생성됐다. 사용자에게 비차단 안내.
          setNotice('로그인은 됐지만 비밀번호 설정에 실패했어요. 마이페이지에서 다시 설정해 주세요.');
        }
      }
      // 이름 설정 페이지로 진입. 로그인 전 가려던 경로(연결 초대·편지 링크 등)는 state.from에
      // 실어 보내, 온보딩 후 SetNickname이 그 경로로 복귀시키게 한다(무계정 수신자 흐름 이음).
      navigate('/set-nickname', { state: { from: state?.from ?? null }, replace: true });
    } catch {
      setError('코드가 올바르지 않거나 만료되었습니다. 다시 확인해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  async function handleResend(): Promise<void> {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await requestEmailCode(email.trim());
      setNotice('인증 코드를 다시 보냈어요.');
    } catch (err) {
      setError(authErrorMessage(err, 'signup'));
    } finally {
      setBusy(false);
    }
  }

  // 폴백: 비밀번호 없는(구) 계정 — 이메일 코드로 로그인.
  // sendMagicLink도 동일한 코드 메일을 발송하므로, 코드 입력 화면으로 이어진다.
  async function handleMagicLink(): Promise<void> {
    setError(null);
    setNotice(null);
    if (!email.trim()) {
      setError('이메일을 먼저 입력해 주세요.');
      return;
    }
    setBusy(true);
    try {
      await sendMagicLink(email.trim());
      setAwaitingCode(true);
      setNotice(`${email.trim()}로 6자리 인증 코드를 보냈어요.`);
    } catch (err) {
      setError(authErrorMessage(err, 'login'));
    } finally {
      setBusy(false);
    }
  }

  // 가입 후 코드 입력 단계.
  if (awaitingCode) {
    return (
      <main className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.title}>인증 코드 입력</h1>
          <p className={styles.subtitle}>
            <strong>{email}</strong>로 보낸 6자리 코드를 입력해 인증하면 로그인돼요.
          </p>

          <form className={styles.form} onSubmit={(e) => void handleVerifyCode(e)}>
            <label className={styles.label} htmlFor="otp">
              인증 코드
            </label>
            <input
              id="otp"
              className={styles.input}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              disabled={busy}
              autoFocus
            />
            {error && <p className={styles.error}>{error}</p>}
            {notice && <p className={styles.notice}>{notice}</p>}
            <button
              className={styles.button}
              type="submit"
              disabled={busy || code.trim().length < 6}
            >
              {busy ? '확인 중…' : '인증하고 시작하기'}
            </button>
          </form>

          <div className={styles.switchRow}>
            코드가 안 왔나요?{' '}
            <button type="button" className={styles.linkBtn} onClick={() => void handleResend()} disabled={busy}>
              다시 보내기
            </button>
          </div>
          <button
            type="button"
            className={styles.linkBtnMuted}
            onClick={() => {
              setAwaitingCode(false);
              setCode('');
              setError(null);
              setNotice(null);
            }}
          >
            ← 이메일 다시 입력
          </button>
        </div>
      </main>
    );
  }

  const isSignup = mode === 'signup';

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>{isSignup ? '회원가입' : '로그인'}</h1>
        <p className={styles.subtitle}>
          {isSignup
            ? '가입 시 6자리 코드를 한 번 받고, 이후엔 비밀번호로 로그인해요.'
            : '이메일과 비밀번호로 로그인하세요.'}
        </p>

        <div className={styles.socialButtons}>
          <button
            className={styles.socialButtonApple}
            type="button"
            disabled={socialLoading !== null}
            aria-label="Apple로 계속하기"
            onClick={() => void handleSocialLogin('apple')}
          >
            <AppleIcon />
            <span>{socialLoading === 'apple' ? '연결 중…' : 'Apple로 계속하기'}</span>
          </button>
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
            onClick={() => handleKakaoLogin()}
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
            disabled={busy}
          />

          <label className={styles.label} htmlFor="password">
            비밀번호
          </label>
          <input
            id="password"
            className={styles.input}
            type="password"
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isSignup ? '6자 이상' : '비밀번호'}
            disabled={busy}
          />

          {error && <p className={styles.error}>{error}</p>}
          {notice && <p className={styles.notice}>{notice}</p>}

          <button
            className={styles.button}
            type="submit"
            disabled={busy || email.trim() === '' || password.length < 6}
          >
            {busy ? '처리 중…' : isSignup ? '가입하기' : '로그인'}
          </button>
        </form>

        <div className={styles.switchRow}>
          {isSignup ? (
            <>
              이미 계정이 있으신가요?{' '}
              <button
                type="button"
                className={styles.linkBtn}
                onClick={() => {
                  setMode('login');
                  setError(null);
                  setNotice(null);
                }}
              >
                로그인
              </button>
            </>
          ) : (
            <>
              계정이 없으신가요?{' '}
              <button
                type="button"
                className={styles.linkBtn}
                onClick={() => {
                  setMode('signup');
                  setError(null);
                  setNotice(null);
                }}
              >
                회원가입
              </button>
            </>
          )}
        </div>

        {!isSignup && (
          <button
            type="button"
            className={styles.linkBtnMuted}
            onClick={() => void handleMagicLink()}
            disabled={busy}
          >
            이메일 코드로 로그인
          </button>
        )}
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

/** Apple 공식 심볼 (검정 버튼 위 흰 로고 — 브랜드 가이드라인). */
function AppleIcon(): React.ReactElement {
  return (
    <svg width="15" height="18" viewBox="0 0 384 512" aria-hidden="true" focusable="false">
      <path
        fill="#ffffff"
        d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"
      />
    </svg>
  );
}
