import { Link } from 'react-router-dom';
import styles from './Landing.module.css';

/**
 * Landing — 비로그인 마케팅. 라이트·클린 SaaS 스타일(Postone 참고).
 * 새 모델(단일트랙): 테마를 고르고 편지를 쓰면, 음악 한 곡과 함께 전해진다.
 * 2단 히어로(텍스트 + 제품 목업) → 포인트 스트립 → 기능 3카드 → 최종 CTA.
 */
export default function Landing() {
  return (
    <main className={styles.page}>
      {/* ── 히어로 ───────────────────────────────────────────── */}
      <section className={styles.hero}>
        <div className={styles.heroGrid}>
          <div className={styles.heroText}>
            <span className={styles.badge}>✦ 테마와 음악으로 전하는 편지</span>

            <h1 className={styles.title}>
              테마를 고르고 편지를 쓰면,
              <br />
              <span className={styles.titleAccent}>음악 한 곡과 함께 전해집니다.</span>
            </h1>

            <p className={styles.lead}>
              마음에 드는 편지지 테마를 고르고, 어울리는 음악 한 곡을 더하세요. 받는 사람은 설치 없이
              링크 하나로 열어, 음악과 함께 편지를 읽습니다.
            </p>

            <div className={styles.actions}>
              <Link className={styles.primary} to="/create">
                편지 쓰기
                <ArrowIcon />
              </Link>
              <Link className={styles.secondary} to="/login">
                로그인
              </Link>
            </div>

            <div className={styles.miniRow}>
              <span>🎨 테마 편지지</span>
              <span className={styles.miniDot} />
              <span>🎵 음악 한 곡</span>
              <span className={styles.miniDot} />
              <span>🔗 무설치 링크</span>
            </div>
          </div>

          {/* 제품 목업 — 테마 편지 + 음악 한 곡 플레이어 */}
          <div className={styles.mock} aria-hidden="true">
            <div className={styles.mockTop}>
              <span className={styles.mockPill}>테마 · 클래식 세리프</span>
              <div className={`${styles.mockBar} ${styles.w95}`} />
              <div className={`${styles.mockBar} ${styles.w85}`} />
              <div className={`${styles.mockBar} ${styles.w70}`} />
            </div>

            <div className={styles.mockDivider}>음악 한 곡과 함께</div>

            <div className={styles.mockPlayer}>
              <span className={styles.mockPlay}>▶</span>
              <span className={styles.mockEq}>
                <span /><span /><span /><span />
              </span>
              <span className={styles.mockTrack}>편지에 어울리는 음악</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── 포인트 스트립 ────────────────────────────────────── */}
      <div className={styles.strip}>
        <div className={styles.stripInner}>
          <span className={styles.stripLabel}>설치 없이, 링크 하나로 닿습니다</span>
          <span className={styles.stripChip}>
            <span>🎨</span> 테마 편지지
          </span>
          <span className={styles.stripChip}>
            <span>🎵</span> 음악 한 곡
          </span>
          <span className={styles.stripChip}>
            <span>🔒</span> 암호·만료·무효화
          </span>
        </div>
      </div>

      {/* ── 기능 3카드 ───────────────────────────────────────── */}
      <section className={styles.features} aria-label="주요 기능">
        <span className={styles.featuresEyebrow}>WHY LETTER</span>
        <h2 className={styles.featuresHead}>쓰기는 쉽게, 마음은 깊게</h2>
        <p className={styles.featuresSub}>
          기능을 자랑하기보다, 마음이 더 잘 닿도록 만드는 데 집중했습니다.
        </p>

        <div className={styles.featureGrid}>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>🎨</div>
            <b className={styles.featureTitle}>테마로 분위기를 입혀요</b>
            <span className={styles.featureDesc}>
              편지지 테마를 고르면 글씨체·색·질감이 한 번에 바뀝니다. 고르는 그대로 미리 보면서
              편지를 완성하세요.
            </span>
          </div>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>🎵</div>
            <b className={styles.featureTitle}>음악 한 곡을 더해요</b>
            <span className={styles.featureDesc}>
              편지에 어울리는 음악 한 곡을 고르면, 받는 사람이 편지를 여는 순간 처음부터 함께
              흐릅니다.
            </span>
          </div>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>🔗</div>
            <b className={styles.featureTitle}>설치 없이 링크 하나</b>
            <span className={styles.featureDesc}>
              받는 사람은 앱 설치도, 가입도 없이 탭 한 번으로 엽니다. 추측 불가 링크·암호가 기본으로
              켜져 둘만의 편지로 남습니다.
            </span>
          </div>
        </div>
      </section>

      {/* ── 최종 CTA ─────────────────────────────────────────── */}
      <section className={styles.finalCta}>
        <h2 className={styles.finalTitle}>지금, 첫 편지를 써보세요</h2>
        <p className={styles.finalSub}>테마를 고르고 음악을 더하면, 몇 분이면 충분합니다.</p>
        <Link className={styles.primary} to="/create">
          첫 편지 쓰기
          <ArrowIcon />
        </Link>
      </section>
    </main>
  );
}

function ArrowIcon(): React.ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 12h14M13 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
