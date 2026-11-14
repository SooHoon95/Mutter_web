// 수신자 무설치 웹뷰 라우트 (/l/:token) — T8 US-008.
//
// 인증에 의존하지 않는다(인코그니토 OK — pwa-architecture: 수신 라우트는 인증 코드 경로 비의존).
// 접근 통제는 토큰/암호/claim-and-bind(서버 RPC)로만 한다(capability-links).
// noindex 메타를 주입해 토큰 URL이 인덱싱되지 않게 한다.
//
// 상태 흐름(useLetterViewer):
//   loading      → 로딩 표시
//   needPassword → PasswordGate (암호 재시도)
//   login        → LetterEnvelope (0037: 로그인해야 열리는 편지 — 로그인 뒤 같은 링크로 복귀)
//   locked       → LockedLetter (0037: 무료 기간 끝 — 편지권으로 간직하기/앱 안내)
//   (ready 본문 끝에는 LetterKeepNotice — 기간 안내·닫힘 예고와 간직하기)
//   gone         → "더 이상 열 수 없는 편지예요"
//   error        → 정규화된 사용자 메시지
//   ready        → LetterView (AudioUnlockGate → 스크롤 동기 본문)

import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { injectNoIndex, removeNoIndex } from '@/lib/noindex';
import { openAppScheme, appLetterUrl, HANDOFF_ENABLED } from '@/lib/appLinks';
import { isIOS, isInAppBrowser } from '@/lib/device';
import { rememberPostLoginPath } from '@/lib/postLoginPath';
import {
  useLetterViewer,
  LetterView,
  PasswordGate,
  LetterEnvelope,
  LockedLetter,
  LetterKeepNotice,
} from '@/features/viewer';
import styles from './Viewer.module.css';

export default function Viewer(): React.ReactElement {
  const { token } = useParams<{ token: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  // noindex 메타 주입(수신 라우트 전용 — capability-links). cleanup으로 이탈 시 제거.
  // injectNoIndex/removeNoIndex는 useNoIndex가 묶어주는 동일 동작의 순수 함수다
  // (useNoIndex는 hook이 아니라 use- 명명 헬퍼라 effect 콜백 안에서 직접 쓰면 lint가 오탐).
  useEffect(() => {
    injectNoIndex();
    return removeNoIndex;
  }, []);

  // 카카오톡 등 인앱브라우저(Universal Link 불가)에서 편지 링크를 열면, 설치된 앱으로 넘긴다.
  // 미설치면 스킴이 무시되고 아래 웹 뷰어를 그대로 읽는다 — 인터스티셜 없이 수신 무마찰 유지.
  // (Safari 등 일반 브라우저는 Universal Link가 앱 열기를 처리하므로 여기서 발화하지 않는다.)
  useEffect(() => {
    if (token && HANDOFF_ENABLED && isIOS() && isInAppBrowser()) {
      openAppScheme(appLetterUrl(token));
    }
  }, [token]);

  const {
    status,
    letter,
    errorMessage,
    revealAt,
    submitting,
    submitPassword,
    photoUrls,
    photoUrlsFailed,
    accessUntil,
    cover,
    deleteAt,
    password,
    reload,
  } = useLetterViewer(token);
  // 이 화면에서 편지권으로 간직했는지 — 본문 끝 안내가 "간직한 편지예요"로 바뀐다(잠김에서 간직해 다시 연 뒤에도).
  const [kept, setKept] = useState(false);

  if (status === 'notYet') {
    // 0018 예약 공개: reveal_at 이전 — 본문/암호 없이 "이 시각에 열려요"만 안내.
    const revealText = revealAt
      ? new Date(revealAt).toLocaleString('ko-KR', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : null;
    return (
      <div className={styles.center}>
        <div className={styles.sealedCard} role="status" aria-live="polite">
          <p className={styles.sealedIcon} aria-hidden="true">
            🔒
          </p>
          <p className={styles.sealedTitle}>아직 열 수 없는 편지예요</p>
          {revealText && (
            <p className={styles.sealedWhen}>
              <strong>{revealText}</strong>에 열려요
            </p>
          )}
          <p className={styles.sealedHint}>그때 다시 이 링크로 찾아와 주세요.</p>
        </div>
      </div>
    );
  }

  if (status === 'loading') {
    return (
      <div className={styles.center} role="status" aria-live="polite">
        <p>편지를 불러오는 중…</p>
      </div>
    );
  }

  if (status === 'needPassword') {
    return (
      <PasswordGate
        onSubmit={submitPassword}
        submitting={submitting}
        errorMessage={errorMessage}
      />
    );
  }

  if (status === 'login') {
    return (
      <LetterEnvelope
        cover={cover}
        onOpen={() => {
          // 이메일 로그인은 state.from으로, 소셜(OAuth·카카오)은 sessionStorage로 같은 편지에 돌아온다.
          rememberPostLoginPath(location.pathname);
          navigate('/login', { state: { from: location } });
        }}
      />
    );
  }

  if (status === 'locked' && token) {
    return (
      <LockedLetter
        token={token}
        password={password}
        cover={cover}
        deleteAt={deleteAt}
        onKept={() => {
          setKept(true);
          reload();
        }}
      />
    );
  }

  if (status === 'gone') {
    return (
      <div className={styles.center}>
        <div className={styles.errorCard} role="alert">
          <p className={styles.errorTitle}>더 이상 열 수 없는 편지예요</p>
        </div>
      </div>
    );
  }

  if (status === 'error' || !letter) {
    return (
      <div className={styles.center}>
        <div className={styles.errorCard} role="alert">
          <p className={styles.errorTitle}>편지를 열 수 없어요</p>
          <p className={styles.errorMessage}>
            {errorMessage ?? '편지를 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <LetterView
      letter={letter}
      token={token}
      photoUrls={photoUrls}
      photoUrlsFailed={photoUrlsFailed}
      endNotice={
        token && (
          <LetterKeepNotice
            letterId={letter.id}
            token={token}
            password={password}
            accessUntil={accessUntil}
            kept={kept}
            onKept={() => setKept(true)}
          />
        )
      }
    />
  );
}
