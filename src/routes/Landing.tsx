import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import styles from './Landing.module.css';

/**
 * Landing — 마케팅 커버. 라이트·클린 SaaS 스타일(Postone 참고).
 * 새 모델(단일트랙): 테마를 고르고 편지를 쓰면, 음악 한 곡과 함께 전해진다.
 * 2단 히어로(텍스트 + 제품 목업) → 포인트 스트립 → 기능 3카드 → 최종 CTA.
 *
 * 로고 탭으로 로그인 상태에서도 열리므로 보조 CTA를 세션에 맞춘다:
 * 비로그인 → "로그인"(/login), 로그인 → "메인 메뉴로"(/, 대시보드).
 */
export default function Landing() {
  const { session } = useAuth();
  useScrollReveal();

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
              {session ? (
                <Link className={styles.secondary} to="/">
                  메인 메뉴로
                </Link>
              ) : (
                <Link className={styles.secondary} to="/login">
                  로그인
                </Link>
              )}
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
              <p className={styles.mockLine}>오늘, 문득 네 생각이 났어.</p>
              <p className={styles.mockLine}>고맙다는 말을 제대로 못 한 것 같아서.</p>
              <p className={styles.mockLine}>이 노래를 들으면, 그날이 떠올라.</p>
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
      <div className={`${styles.strip} ${styles.revealOnScroll}`} data-reveal>
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
          <div className={`${styles.featureCard} ${styles.revealOnScroll}`} data-reveal>
            <div className={styles.featureIcon}>🎨</div>
            <b className={styles.featureTitle}>테마로 분위기를 입혀요</b>
            <span className={styles.featureDesc}>
              편지지 테마를 고르면 글씨체·색·질감이 한 번에 바뀝니다. 고르는 그대로 미리 보면서
              편지를 완성하세요.
            </span>
          </div>
          <div className={`${styles.featureCard} ${styles.revealOnScroll}`} data-reveal>
            <div className={styles.featureIcon}>🎵</div>
            <b className={styles.featureTitle}>음악 한 곡을 더해요</b>
            <span className={styles.featureDesc}>
              편지에 어울리는 음악 한 곡을 고르면, 받는 사람이 편지를 여는 순간 처음부터 함께
              흐릅니다.
            </span>
          </div>
          <div className={`${styles.featureCard} ${styles.revealOnScroll}`} data-reveal>
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
      <section className={`${styles.finalCta} ${styles.revealOnScroll}`} data-reveal>
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

/** 스크롤 진입 시 요소를 부드럽게 리빌. reduced-motion이면 관찰하지 않고 CSS가 즉시 표시. */
function useScrollReveal(): void {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const io = new IntersectionObserver(
      (entries, obs) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add(styles.isVisible);
            obs.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -8% 0px' },
    );
    document.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
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
