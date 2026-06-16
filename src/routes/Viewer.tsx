// 수신자 무설치 웹뷰 라우트 (/l/:token) — T8 US-008.
//
// 인증에 의존하지 않는다(인코그니토 OK — pwa-architecture: 수신 라우트는 인증 코드 경로 비의존).
// 접근 통제는 토큰/암호/claim-and-bind(서버 RPC)로만 한다(capability-links).
// noindex 메타를 주입해 토큰 URL이 인덱싱되지 않게 한다.
//
// 상태 흐름(useLetterViewer):
//   loading      → 로딩 표시
//   needPassword → PasswordGate (암호 재시도)
//   error        → 정규화된 사용자 메시지
//   ready        → LetterView (AudioUnlockGate → 스크롤 동기 본문)

import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { injectNoIndex, removeNoIndex } from '@/lib/noindex';
import { useLetterViewer, LetterView, PasswordGate } from '@/features/viewer';
import styles from './Viewer.module.css';

export default function Viewer(): React.ReactElement {
  const { token } = useParams<{ token: string }>();

  // noindex 메타 주입(수신 라우트 전용 — capability-links). cleanup으로 이탈 시 제거.
  // injectNoIndex/removeNoIndex는 useNoIndex가 묶어주는 동일 동작의 순수 함수다
  // (useNoIndex는 hook이 아니라 use- 명명 헬퍼라 effect 콜백 안에서 직접 쓰면 lint가 오탐).
  useEffect(() => {
    injectNoIndex();
    return removeNoIndex;
  }, []);

  const { status, letter, errorMessage, submitting, submitPassword } =
    useLetterViewer(token);

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

  return <LetterView letter={letter} token={token} />;
}
