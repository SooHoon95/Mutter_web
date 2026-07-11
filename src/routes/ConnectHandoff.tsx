// /connect/:token 앱 핸드오프 래퍼 — 여는 맥락 + 링크 출처(?from)별로 앱/웹/스토어 분기.
//
// 초대링크 규칙:
//   앱O → UL/스킴으로 앱이 열려 앱이 처리(로그인O 수락 / 로그인X 로그인·재탭 유도).
//   앱X(웹 랜딩 도달) 폴백만 출처로 분기:
//     - from=app → App Store 안내 (VITE_IOS_APP_STORE_URL 없으면 "설치 준비 중" placeholder)
//     - from=web/누락 → 웹 연결 플로우(로그인+수락)
//
// 맥락 분기:
//   - iOS + 핸드오프ON + 인앱브라우저(카톡) → 스킴 인터스티셜(폴백에서 출처 분기). ← webview 전용.
//   - iOS + 핸드오프ON + Safari + from=app → 스토어 안내(설치 앱은 UL이 이미 가로챘음).
//   - 그 외(데스크톱 / Android / iOS Safari+web / 플래그OFF) → 웹 보호 플로우(오늘과 동일).
//
// ⚠ 토큰은 엄격 단일사용·단일소비다. 인터스티셜/스토어 화면은 acceptInvite를 절대 호출하지 않고,
//   토큰을 앱에 넘기거나 "웹에서 계속"(Connect)에서만 수락한다.

import { useEffect, useState } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { isIOS, isInAppBrowser } from '@/lib/device';
import {
  appConnectUrl,
  openAppScheme,
  APP_STORE_URL,
  HANDOFF_ENABLED,
  inviteFromApp,
} from '@/lib/appLinks';
import Connect from './Connect';
import styles from './ConnectHandoff.module.css';

// 스킴 발화 후 앱 전환 판정 상한(실패 임계). 이 안에 hidden이 없으면 "미발화"로 보고 폴백 확정.
const HANDOFF_TIMEOUT_MS = 1400;

/** 오늘의 웹 보호 플로우(로그인+수락) — from=web·비핸드오프 맥락의 착지점. */
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
  // 라우터 location.search로 출처를 읽는다(window.location 직접 접근은 SPA/테스트에서 부정확).
  const { search } = useLocation();
  const fromApp = inviteFromApp(search);

  if (token !== undefined && HANDOFF_ENABLED && isIOS()) {
    // 카톡 등 인앱브라우저 — UL 불가 → 스킴 인터스티셜(폴백에서 출처 분기).
    if (isInAppBrowser()) {
      return <ConnectInterstitial token={token} fromApp={fromApp} />;
    }
    // Safari + 앱 발급 링크 → 스토어 안내(설치된 앱이면 UL이 이 페이지 전에 가로챘을 것 = 미설치 추정).
    if (fromApp) {
      return <ConnectStorePrompt />;
    }
  }

  // 데스크톱 / Android / iOS Safari(웹 발급) / 플래그OFF → 웹 연결 플로우(지연·팝업 0).
  return <WebConnect />;
}

// ---------------------------------------------------------------------------
// 인터스티셜 — 타임아웃 주도 상태머신(webview 전용)
// ---------------------------------------------------------------------------

type Phase = 'attempting' | 'opened' | 'fallback' | 'web';

function ConnectInterstitial({
  token,
  fromApp,
}: {
  token: string;
  fromApp: boolean;
}): React.ReactElement {
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

  // "웹에서 계속"(웹 발급 링크만 제공) → 웹 연결 플로우로 확정.
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

  // 폴백 / opened — 출처로 분기.
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.heading}>
          {phase === 'opened' ? '앱에서 열렸어요' : '앱을 열지 못했어요'}
        </h1>

        {fromApp ? (
          // 앱 발급 링크 → App Store 안내(웹 폴백 없음 — 앱에서 연결하는 초대).
          <>
            <p className={styles.desc}>이 초대는 Mutter 앱에서 연결해요.</p>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={() => openAppScheme(appConnectUrl(token))}
            >
              앱으로 열기
            </button>
            {APP_STORE_URL !== null ? (
              <a
                className={styles.installLink}
                href={APP_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                App Store에서 앱 설치
              </a>
            ) : (
              <p className={styles.desc}>앱 설치 준비 중이에요. 잠시 후 다시 시도해 주세요.</p>
            )}
          </>
        ) : (
          // 웹 발급 링크 → 웹에서 계속 / 앱으로 열기.
          <>
            <p className={styles.desc}>
              Mutter 앱에서 연결하거나, 이 브라우저에서 계속 진행할 수 있어요.
            </p>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={() => setPhase('web')}
            >
              웹에서 계속
            </button>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => openAppScheme(appConnectUrl(token))}
            >
              앱으로 열기
            </button>
          </>
        )}
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// 스토어 안내 — iOS Safari + 앱 발급 링크 + 앱 미설치 추정 (Safari엔 스킴 자동발화 안 함)
// ---------------------------------------------------------------------------

function ConnectStorePrompt(): React.ReactElement {
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.heading}>Mutter 앱에서 연결해요</h1>
        <p className={styles.desc}>이 초대 링크는 앱에서 열어 연결하는 초대예요.</p>
        {APP_STORE_URL !== null ? (
          <a
            className={styles.installLink}
            href={APP_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            App Store에서 앱 설치
          </a>
        ) : (
          <p className={styles.desc}>앱 설치 준비 중이에요. 잠시 후 다시 시도해 주세요.</p>
        )}
      </div>
    </main>
  );
}
