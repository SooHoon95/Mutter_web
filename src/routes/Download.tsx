import { Link } from 'react-router-dom';
import { getMobileOS } from '@/lib/device';
import { IOS_DOWNLOAD_URL, ANDROID_DOWNLOAD_URL } from '@/lib/appLinks';
import { QrCode } from '@/components/QrCode';
import styles from './Download.module.css';

/**
 * Download — 앱 설치 전용 랜딩(/download). QR·SNS·명함 유입을 스토어로 전환한다.
 *
 * 기기 감지(getMobileOS)로 맞는 스토어를 주 CTA로 강조한다:
 *  - iPhone → App Store 크게 / Google Play 보조
 *  - Android → Google Play 크게 / App Store 보조
 *  - 데스크톱 → 둘 다 동등 + 폰으로 넘기는 QR
 * 스토어 URL은 항상 유효(appLinks의 카노니컬 폴백)하므로 버튼 두 개는 늘 활성이다.
 */
export default function Download(): React.ReactElement {
  const os = getMobileOS();
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const qrValue = `${origin}/download`;

  // 감지 결과에 따라 버튼 순서와 강조를 정한다. 데스크톱은 둘 다 primary(동등).
  const ios = { os: 'ios' as const, href: IOS_DOWNLOAD_URL };
  const android = { os: 'android' as const, href: ANDROID_DOWNLOAD_URL };
  const ordered = os === 'android' ? [android, ios] : [ios, android];

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.brand}>
          <img className={styles.logo} src="/mutter-logo.svg" alt="" aria-hidden="true" />
          <span className={styles.brandName}>Mutter</span>
        </div>

        <span className={styles.badge}>✦ 편지를, 앱에서 더 깊게</span>
        <h1 className={styles.title}>
          Mutter 앱을
          <br />
          <span className={styles.titleAccent}>지금 받아보세요</span>
        </h1>
        <p className={styles.lead}>
          편지 도착 알림, 더 부드러운 음악 재생, 홈 화면에서 바로 열기. 아래에서 기기에 맞는 스토어로
          내려받으세요.
        </p>

        <div className={styles.stores}>
          {ordered.map((s, i) => (
            <StoreButton
              key={s.os}
              os={s.os}
              href={s.href}
              // 폰: 첫 버튼(감지된 OS)만 강조. 데스크톱: 둘 다 강조.
              primary={os === 'other' || i === 0}
            />
          ))}
        </div>

        {os === 'other' && (
          <div className={styles.qr}>
            <div className={styles.qrCard}>
              <QrCode value={qrValue} size={148} />
            </div>
            <p className={styles.qrCaption}>
              폰 카메라로 스캔해
              <br />
              바로 설치하세요
            </p>
          </div>
        )}
      </section>

      {/* ── 왜 앱? ─────────────────────────────────────────────── */}
      <section className={styles.why} aria-label="앱으로 받으면 좋은 점">
        <div className={styles.whyItem}>
          <span className={styles.whyIcon}>🔔</span>
          <b>편지 도착 알림</b>
          <span>새 편지가 오면 바로 알려드려요.</span>
        </div>
        <div className={styles.whyItem}>
          <span className={styles.whyIcon}>🎵</span>
          <b>더 부드러운 재생</b>
          <span>음악이 끊김 없이 편지와 함께 흘러요.</span>
        </div>
        <div className={styles.whyItem}>
          <span className={styles.whyIcon}>🏠</span>
          <b>홈 화면에서 바로</b>
          <span>탭 한 번으로 편지함을 열어요.</span>
        </div>
      </section>

      {/* 정직한 보조 탈출구 — 수신 링크는 앱 없이도 열린다. */}
      <Link className={styles.escape} to="/">
        앱 없이 웹으로 계속 →
      </Link>
    </main>
  );
}

interface StoreButtonProps {
  os: 'ios' | 'android';
  href: string;
  primary: boolean;
}

/** 단일 스토어 버튼 — 모노크롬 글리프 + 2줄 라벨. 공식 배지 PNG로 후일 교체 가능. */
function StoreButton({ os, href, primary }: StoreButtonProps): React.ReactElement {
  const isIOS = os === 'ios';
  return (
    <a
      className={`${styles.store} ${primary ? styles.storePrimary : styles.storeSecondary}`}
      href={href}
    >
      <span className={styles.storeIcon} aria-hidden="true">
        {isIOS ? <AppleGlyph /> : <PlayGlyph />}
      </span>
      <span className={styles.storeText}>
        <small>{isIOS ? 'App Store에서' : 'Google Play에서'}</small>
        <b>다운로드</b>
      </span>
    </a>
  );
}

function AppleGlyph(): React.ReactElement {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.865 0 2.222-1.01 3.902-1.01.613 0 2.886.06 4.374 2.19-.13.09-2.383 1.37-2.383 4.19 0 3.26 2.854 4.42 2.955 4.45z" />
    </svg>
  );
}

function PlayGlyph(): React.ReactElement {
  // 재생 삼각형(모노크롬) — Apple 글리프와 톤을 맞춘다.
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M4 2.5c0-.86.94-1.4 1.68-.95l14 8.5a1.1 1.1 0 0 1 0 1.9l-14 8.5A1.1 1.1 0 0 1 4 19.5v-17z" />
    </svg>
  );
}
