// /connect/:token 앱 핸드오프 래퍼 — 여는 맥락에 따라 앱/스토어/웹으로 분기.
//
// 초대링크 규칙(2026-07 갱신 — 초대는 앱에서 수락, 앱 없으면 App Store로 유도):
//   iOS + 앱 설치O → UL/스킴이 앱을 열어 앱이 처리(로그인O 수락 / 로그인X 로그인 후 수락).
//   iOS + 앱 미설치 → App Store 설치 안내(초대 수락엔 앱이 필요). "웹에서 계속"은 보조 탈출구로 제공.
//   그 외(데스크톱 / Android / 플래그OFF) → 웹 연결 플로우(로그인+수락).
//
// 맥락 분기:
//   - iOS + 핸드오프ON + 인앱브라우저(카톡) → 스킴 인터스티셜(앱 열기 시도 → 실패 시 스토어/웹).
//   - iOS + 핸드오프ON + Safari → 스토어 안내(설치돼 있었으면 UL이 이 페이지 전에 가로챘을 것 = 미설치 추정).
//   - 그 외 → 웹 보호 플로우.
//
// ⚠ 토큰은 엄격 단일사용·단일소비다. 인터스티셜/스토어 화면은 acceptInvite를 절대 호출하지 않고,
//   토큰을 앱에 넘기거나 "웹에서 계속"(Connect)에서만 수락한다.

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { isIOS, isInAppBrowser } from '@/lib/device';
import { appConnectUrl, openAppScheme, APP_STORE_URL, HANDOFF_ENABLED } from '@/lib/appLinks';
import Connect from './Connect';
import styles from './ConnectHandoff.module.css';

// 스킴 발화 후 앱 전환 판정 상한(실패 임계). 이 안에 hidden이 없으면 "미발화"로 보고 폴백 확정.
const HANDOFF_TIMEOUT_MS = 1400;

/** 웹 보호 플로우(로그인+수락) — 데스크톱/Android/비핸드오프, "웹에서 계속"의 착지점. */
function WebConnect(): React.ReactElement {
  return (
    <AppShell>
      <RequireAuth>
        <Connect />
      </RequireAuth>
    </AppShell>
  );
}

export default function ConnectHandoff(): React.ReactElement {
  const { token } = useParams<{ token: string }>();

  if (token !== undefined && HANDOFF_ENABLED && isIOS()) {
    // 카톡 등 인앱브라우저 — UL 불가 → 스킴 인터스티셜(앱 열기 시도 후 폴백).
    if (isInAppBrowser()) {
      return <ConnectInterstitial token={token} />;
    }
    // iOS Safari 도달 = 설치돼 있었으면 UL이 이미 가로챘을 것 = 앱 미설치 추정 → App Store 안내.
    return <ConnectStorePrompt />;
  }

  // 데스크톱 / Android / 플래그OFF → 웹 연결 플로우(지연·팝업 0).
  return <WebConnect />;
}

// ---------------------------------------------------------------------------
// 인터스티셜 — 타임아웃 주도 상태머신(webview 전용)
// ---------------------------------------------------------------------------

type Phase = 'attempting' | 'opened' | 'fallback' | 'web';

function ConnectInterstitial({ token }: { token: string }): React.ReactElement {
  const [phase, setPhase] = useState<Phase>('attempting');

  useEffect(() => {
    // 마운트 즉시 스킴 발화 → 타이머·가시성 리스너로 결과 판정.
    openAppScheme(appConnectUrl(token));
    const timer = window.setTimeout(() => {
      setPhase((p) => (p === 'attempting' ? 'fallback' : p));
    }, HANDOFF_TIMEOUT_MS);
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') {
        setPhase((p) => (p === 'attempting' ? 'opened' : p));
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [token]);

  // "웹에서 계속" → 웹 연결 플로우로 확정.
  if (phase === 'web') {
    return <WebConnect />;
  }

  if (phase === 'attempting') {
    return (
      <main className={styles.page}>
        <div className={styles.card}>
          <p className={styles.spinner} role="status" aria-live="polite">
            앱으로 여는 중…
          </p>
          <p className={styles.desc}>앱이 열리지 않으면 잠시 후 안내가 나타나요.</p>
        </div>
      </main>
    );
  }

  // 폴백 / opened — 앱 미설치 추정: App Store 설치(주) + 앱으로 열기(재시도) + 웹에서 계속(보조).
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.heading}>
          {phase === 'opened' ? '앱에서 열렸어요' : '앱을 열지 못했어요'}
        </h1>
        <p className={styles.desc}>초대를 수락하려면 Mutter 앱이 필요해요.</p>
        {APP_STORE_URL !== null && (
          <a
            className={styles.installLink}
            href={APP_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            App Store에서 설치
          </a>
        )}
        <button
          type="button"
          className={styles.primaryBtn}
          onClick={() => openAppScheme(appConnectUrl(token))}
        >
          앱으로 열기
        </button>
        <button type="button" className={styles.secondaryBtn} onClick={() => setPhase('web')}>
          웹에서 계속
        </button>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// 스토어 안내 — iOS Safari + 앱 미설치 추정. App Store 설치(주) + 웹에서 계속(보조).
// ---------------------------------------------------------------------------

function ConnectStorePrompt(): React.ReactElement {
  const [showWeb, setShowWeb] = useState(false);
  if (showWeb) {
    return <WebConnect />;
  }
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.heading}>앱을 설치해 연결하세요</h1>
        <p className={styles.desc}>이 초대를 수락하려면 Mutter 앱이 필요해요.</p>
        {APP_STORE_URL !== null ? (
          <a
            className={styles.installLink}
            href={APP_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            App Store에서 설치
          </a>
        ) : (
          <p className={styles.desc}>앱 설치 준비 중이에요. 잠시 후 다시 시도해 주세요.</p>
        )}
        <button type="button" className={styles.secondaryBtn} onClick={() => setShowWeb(true)}>
          웹에서 계속
        </button>
      </div>
    </main>
  );
}
