import { Link, useLocation } from 'react-router-dom';
import { getMobileOS } from '@/lib/device';
import { campaignFromUtm } from '@/lib/campaign';
import { QrCode } from '@/components/QrCode';
import { StoreButtons } from '@/components/StoreButtons';
import styles from './Download.module.css';

/**
 * Download — 앱 설치 전용 랜딩(/download). QR·SNS·명함 유입을 스토어로 전환한다.
 *
 * 기기 감지(getMobileOS)로 맞는 스토어를 주 CTA로 강조한다:
 *  - iPhone → App Store 크게 / Google Play 보조
 *  - Android → Google Play 크게 / App Store 보조
 *  - 데스크톱 → 둘 다 동등 + 폰으로 넘기는 QR
 * 스토어 URL은 항상 유효(appLinks의 카노니컬 폴백)하므로 버튼 두 개는 늘 활성이다.
 * 유입 채널(utm_source)은 캠페인 토큰(ct/referrer)으로 스토어 링크에 실어 채널별 설치를 비교한다.
 */
export default function Download(): React.ReactElement {
  const os = getMobileOS();
  const location = useLocation();
  const campaign = campaignFromUtm(location.search);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const qrValue = `${origin}/download`;

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

        {/* 폰: 감지된 OS 버튼이 먼저·강조. 데스크톱: 둘 다 강조. */}
        <StoreButtons campaign={campaign} os={os} className={styles.storesSlot} />

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
