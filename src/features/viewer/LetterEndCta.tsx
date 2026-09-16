// LetterEndCta — 편지 마지막 장. 서명 아래 한 뼘 여백 뒤에 놓여 끝까지 읽은 사람에게만 보인다.
//
// 3단(순서·문구는 마케팅 카운슬 결론 — Mutter 저장소 marketing/plans/2026-09-16-week1-loop-spec.md §2):
//   1 답장(액센트 버튼)  2 받은편지함(텍스트 버튼)  3 나도 보내기(작은 링크) + 워드마크.
// 읽는 화면(본문·음악)에는 CTA·배너·스티키 바를 두지 않는다. 탭 닫힘 감지 팝업도 없다.
// 스토어 링크는 접점별 캠페인 토큰(viewer_reply/save/send)을 싣고, 데스크톱은 QR로 폰에 넘긴다.

import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import { getMobileOS } from '@/lib/device';
import { storeUrlFor } from '@/lib/storeLinks';
import { track } from '@/lib/analytics';
import { QrCode } from '@/components/QrCode';
import styles from './LetterEndCta.module.css';

/** 3순위 부제 — 시즌 주간에는 env 하나로 교체한다(예: 추석 문구). 기본은 한 줄 소개 C. */
const SEND_SUBTITLE: string =
  (import.meta.env.VITE_VIEWER_SEND_SUBTITLE as string | undefined)?.trim() ||
  '편지에 노래 한 곡을 담아 링크로 보내요. 받는 사람은 앱을 깔지 않아도 열 수 있어요.';

/** 미리보기(token 없음)에는 렌더하지 않는 것은 호출부(LetterView) 책임이다. */
export function LetterEndCta(): React.ReactElement {
  const os = getMobileOS();
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const rootRef = useRef<HTMLElement | null>(null);

  // 끝까지 읽음 — CTA 영역이 처음 뷰포트에 들어온 순간 1회.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          track('letter_end_reached');
          observer.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const replyHref = storeUrlFor(os, 'viewer_reply');
  const saveHref = storeUrlFor(os, 'viewer_save');
  const sendHref = storeUrlFor(os, 'viewer_send');
  const qrValue =
    typeof window !== 'undefined'
      ? `${window.location.origin}/download?utm_source=viewer&utm_medium=qr`
      : '/download';

  return (
    <section ref={rootRef} className={styles.root} aria-label="편지를 읽은 뒤">
      {/* 1순위 — 수신자를 발신자로 바꾸는 유일한 행동. 앱 설치 후 답장(딥링크 preselect는 후속 L6). */}
      {replyHref ? (
        <a
          className={styles.primary}
          href={replyHref}
          onClick={() => {
            track('cta_reply_click');
            track('store_redirect', { os, ct: 'viewer_reply' });
          }}
        >
          노래 한 곡으로 답장하기
        </a>
      ) : (
        <div className={styles.desktop}>
          <p className={styles.primaryStatic}>노래 한 곡으로 답장하기</p>
          <div className={styles.qrCard}>
            <QrCode value={qrValue} size={132} />
          </div>
          <p className={styles.qrCaption}>휴대폰에서 이어 하기</p>
        </div>
      )}

      {/* 2순위 — 손실 회피이지만 사실(링크 끄기는 실제 기능). 로그인 수신자는 서버가 열람 시 자동 저장(0022). */}
      {user ? (
        <p className={styles.saved}>받은편지함에 저장됐어요</p>
      ) : (
        <button
          type="button"
          className={styles.secondary}
          onClick={() => {
            track('cta_save_click');
            if (saveHref) {
              track('store_redirect', { os, ct: 'viewer_save' });
              window.location.assign(saveHref);
              return;
            }
            // 데스크톱 — 웹 계정으로 저장(오늘의 흐름 유지). 로그인 후 이 링크로 복귀하면 자동 저장된다.
            navigate('/login', { state: { from: location } });
          }}
        >
          <span className={styles.secondaryTitle}>이 편지, 받은편지함에 두기</span>
          <span className={styles.secondarySub}>
            보낸 사람이 링크를 끄면 다시 열 수 없어요. 받은편지함에 두면 언제든 다시 들을 수 있어요.
          </span>
        </button>
      )}

      {/* 3순위 — 전통적 "나도 보내기". 부제는 시즌 슬롯(VITE_VIEWER_SEND_SUBTITLE). */}
      <a
        className={styles.tertiary}
        href={sendHref ?? '/download?utm_source=viewer&utm_medium=send'}
        onClick={() => {
          track('cta_send_click');
          if (sendHref) track('store_redirect', { os, ct: 'viewer_send' });
        }}
      >
        <span className={styles.tertiaryTitle}>나도 누군가에게 노래 한 곡 보내기</span>
        <span className={styles.tertiarySub}>{SEND_SUBTITLE}</span>
      </a>

      {/* 구별 자산 — 워드마크 한 줄. */}
      <a className={styles.brand} href="/?utm_source=viewer&utm_medium=footer" aria-label="뮤터 홈">
        <img className={styles.brandMark} src="/mutter-logo.svg" alt="" aria-hidden="true" />
        <span className={styles.brandText}>뮤터 · 음악 편지</span>
      </a>
    </section>
  );
}
