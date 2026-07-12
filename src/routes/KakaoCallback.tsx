// /auth/kakao/callback — 카카오 인가코드 콜백 + 신규 유저 닉네임-우선 가입.
//
// 흐름:
//   1) 카카오가 code로 리다이렉트 → state 검증(CSRF) → Edge 1단계(kakaoCodeLogin).
//   2) 기존 회원: 세션 세팅 후 홈으로(Home 게이트가 닉네임 유무 처리).
//   3) 신규: 계정 생성 없이 idToken만 받음 → 닉네임 입력 → Edge 2단계(kakaoSignup)에서 생성.
// SetNickname.module.css를 재사용해 동일한 클린 페이지 UI를 쓴다.

import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { kakaoCodeLogin, kakaoSignup } from '@/data/auth';
import styles from './SetNickname.module.css';

type Phase = 'loading' | 'nickname' | 'error';

export default function KakaoCallback(): React.ReactElement {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const ran = useRef(false);

  const [phase, setPhase] = useState<Phase>('loading');
  const [idToken, setIdToken] = useState<string | null>(null);
  const [nickname, setNickname] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // code는 1회용 — StrictMode 이중 실행/재렌더로 두 번 교환하지 않도록 가드.
    if (ran.current) return;
    ran.current = true;

    const code = params.get('code');
    const state = params.get('state');
    const saved = sessionStorage.getItem('kakao_oauth_state');
    sessionStorage.removeItem('kakao_oauth_state');

    if (!code || !state || state !== saved) {
      setPhase('error');
      setError('카카오 로그인이 취소됐거나 잘못된 요청이에요.');
      return;
    }

    void (async () => {
      try {
        const result = await kakaoCodeLogin(code);
        if (result.isNew && result.idToken) {
          setIdToken(result.idToken);
          setPhase('nickname');
        } else {
          // 기존 회원 — 세션 세팅됨. Home이 닉네임 유무를 게이트한다.
          navigate('/', { replace: true });
        }
      } catch (e) {
        setPhase('error');
        // Edge가 반환한 실제 실패 코드를 노출해 원인 진단을 가능케 한다
        // (INVALID_TOKEN=키/시크릿 불일치 · EMAIL_UNAVAILABLE=이메일 동의항목 · SERVER_MISCONFIGURED 등).
        const code = e instanceof Error ? e.message : '';
        setError(`카카오 로그인에 실패했어요. 다시 시도해 주세요. (${code || '알 수 없음'})`);
      }
    })();
  }, [params, navigate]);

  async function handleSubmit(): Promise<void> {
    const finalName = nickname.trim();
    if (!finalName || !idToken) return;
    setBusy(true);
    setError(null);
    try {
      await kakaoSignup(idToken, finalName);
      navigate('/welcome', { replace: true });
    } catch {
      setError('가입에 실패했어요. 잠시 후 다시 시도해 주세요.');
      setBusy(false);
    }
  }

  if (phase === 'loading') {
    return (
      <main className={styles.page}>
        <div className={styles.card}>
          <p className={styles.subtitle}>카카오 로그인 처리 중…</p>
        </div>
      </main>
    );
  }

  if (phase === 'error') {
    return (
      <main className={styles.page}>
        <div className={styles.card}>
          <p className={styles.error}>{error}</p>
          <button
            type="button"
            className={styles.button}
            onClick={() => navigate('/login', { replace: true })}
          >
            로그인으로 돌아가기
          </button>
        </div>
      </main>
    );
  }

  // phase === 'nickname' — 신규: 닉네임을 받은 뒤에야 계정을 만든다(닉네임-우선).
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>이름을 정해주세요</h1>
        <p className={styles.subtitle}>
          편지·연결에서 상대에게 보일 이름이에요.
          <br />
          시작하기를 눌러야 가입이 완료돼요.
        </p>
        <input
          className={styles.input}
          type="text"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="표시할 이름"
          aria-label="표시할 이름"
          maxLength={50}
          autoFocus
        />
        {error && <p className={styles.error}>{error}</p>}
        <button
          type="button"
          className={styles.button}
          onClick={() => void handleSubmit()}
          disabled={!nickname.trim() || busy}
        >
          {busy ? '가입 중…' : '시작하기'}
        </button>
      </div>
    </main>
  );
}
