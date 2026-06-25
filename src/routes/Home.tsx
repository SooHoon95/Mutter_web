// 홈 라우트 — 인증 상태에 따라 분기.
//   - 비로그인: 마케팅 랜딩(Landing)
//   - 로그인: 개인 대시보드(편지함 비주얼 + 새 편지 쓰기 + 바로가기 카드)

import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { User } from '@supabase/supabase-js';
import { useAuth } from '@/app/AuthProvider';
import { useProfile } from '@/features/profile';
import { resolveDisplayName } from '@/lib/userName';
import { listMyLetters } from '@/data/letters';
import Landing from './Landing';
import styles from './Home.module.css';

export default function Home(): React.ReactElement | null {
  const { session, loading } = useAuth();
  const { profile, isLoading: profileLoading } = useProfile();
  const navigate = useNavigate();

  // 로그인이 막 일어났으면(SIGNED_IN 플래그) 닉네임 유무와 무관하게 "무조건" 이름 화면을 띄운다.
  // (값이 있으면 /set-nickname이 그 값을 인풋에 채워서, 없으면 빈칸으로 띄운다.)
  // 앱 재오픈(복원 세션, INITIAL_SESSION)에는 플래그가 없어 정상적으로 대시보드로 간다.
  const justLoggedIn = !!session && !loading && readPostLoginFlag();
  // 플래그가 없어도, 표시 이름이 아직 없으면 이름부터 받게 한다(폴백 가드).
  const needsName = !!session && !profileLoading && !profile?.nickname?.trim();
  const goSetName = justLoggedIn || needsName;
  useEffect(() => {
    if (!session) return;
    if (goSetName) {
      if (justLoggedIn) clearPostLoginFlag(); // 한 번만 — 무한 리다이렉트 방지
      navigate('/set-nickname', { replace: true });
    }
  }, [session, goSetName, justLoggedIn, navigate]);

  if (loading) {
    return <div className="route-fallback">불러오는 중…</div>;
  }
  if (!session) {
    return <Landing />;
  }
  if (profileLoading) {
    // 닉네임 보유 여부를 판단하기 전 — 대시보드/리다이렉트 깜빡임 방지.
    return <div className="route-fallback">불러오는 중…</div>;
  }
  if (goSetName) {
    return null; // /set-nickname으로 이동 중 — 이름 먼저(대시보드 깜빡임 방지)
  }
  return <Dashboard user={session.user} />;
}

// ---------------------------------------------------------------------------
// 로그인 직후 플래그 — AuthProvider가 SIGNED_IN 시 세팅, Home이 1회 소비.
// sessionStorage 불가 환경에서도 앱이 죽지 않도록 try/catch로 감싼다.
// ---------------------------------------------------------------------------
const POST_LOGIN_FLAG = 'letterapp:postLogin';

function readPostLoginFlag(): boolean {
  try {
    return sessionStorage.getItem(POST_LOGIN_FLAG) === '1';
  } catch {
    return false;
  }
}

function clearPostLoginFlag(): void {
  try {
    sessionStorage.removeItem(POST_LOGIN_FLAG);
  } catch {
    /* noop */
  }
}

// ---------------------------------------------------------------------------
// 쌓인 편지 비주얼 컴포넌트
// ---------------------------------------------------------------------------

// 최대 표시 레이어 수 — 이 이상은 "+N" 배지로 처리
const MAX_LAYERS = 5;

interface LetterStackProps {
  count: number;
  isLoading: boolean;
}

/**
 * 보낸 편지 수에 비례해 편지지가 겹쳐 쌓인 CSS 일러스트를 렌더한다.
 *
 * count=0  → 빈 우체통 SVG + 안내 문구
 * count 1–5 → count개 레이어
 * count 6+  → 5개 레이어 + "+N" 오버플로 배지
 *
 * prefers-reduced-motion: 애니메이션 비활성화
 * aria: role="img" + aria-label로 스크린리더에 의미 전달
 */
function LetterStack({ count, isLoading }: LetterStackProps): React.ReactElement {
  // 로딩 중에는 스켈레톤 상태로 1개 레이어 표시
  const effectiveCount = isLoading ? 1 : count;
  const visibleLayers = Math.min(effectiveCount, MAX_LAYERS);
  const overflow = effectiveCount > MAX_LAYERS ? effectiveCount - MAX_LAYERS : 0;

  const ariaLabel = isLoading
    ? '편지 수를 불러오는 중'
    : count === 0
      ? '아직 보낸 편지가 없습니다'
      : `지금까지 ${count}통의 편지를 보냈습니다`;

  return (
    <div
      className={`${styles.stackScene} ${isLoading ? styles.stackLoading : ''}`}
      role="img"
      aria-label={ariaLabel}
    >
      {/* 0통: 빈 우체통 SVG */}
      {!isLoading && count === 0 && (
        <EmptyPostbox />
      )}

      {/* 1통 이상: 편지지 레이어 */}
      {(isLoading || count > 0) && (
        <div className={styles.stackLayers}>
          {Array.from({ length: visibleLayers }).map((_, i) => (
            <div
              key={i}
              className={styles.stackLayer}
              // data-index로 CSS에서 개별 회전/위치 적용 (0=맨 아래)
              data-index={i}
              aria-hidden="true"
            >
              {/* 맨 위 레이어에만 골드 실링 왁스 장식 */}
              {i === visibleLayers - 1 && !isLoading && (
                <span className={styles.sealDot} aria-hidden="true" />
              )}
            </div>
          ))}

          {/* 오버플로 배지: "+N 통 더" */}
          {overflow > 0 && (
            <span className={styles.overflowBadge} aria-hidden="true">
              +{overflow}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** 아직 편지가 없을 때 표시하는 인라인 SVG 우체통 */
function EmptyPostbox(): React.ReactElement {
  return (
    // 순수 CSS/SVG 일러스트 — 외부 이미지 없음
    <svg
      className={styles.emptyPostbox}
      viewBox="0 0 80 72"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* 우체통 몸통 */}
      <rect x="8" y="28" width="64" height="36" rx="6" fill="var(--warm-100)" stroke="var(--gold)" strokeWidth="1.5" />
      {/* 편지 투입구 */}
      <rect x="20" y="42" width="40" height="6" rx="3" fill="var(--warm-200)" />
      {/* 반원 돔 지붕 */}
      <path d="M8 34 Q8 16 40 16 Q72 16 72 34" fill="var(--warm-150)" stroke="var(--gold)" strokeWidth="1.5" />
      {/* 받침 기둥 */}
      <rect x="34" y="64" width="12" height="8" rx="2" fill="var(--warm-200)" />
      {/* 투입구 화살표 (가이드 라인) */}
      <path d="M38 46 L42 46 M40 44 L40 48" stroke="var(--ink-faint)" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// 대시보드
// ---------------------------------------------------------------------------

function Dashboard({ user }: { user: User }): React.ReactElement {
  const { profile } = useProfile();
  // 표시 이름 — 닉네임 > 소셜 실명 > 이메일 아이디 순.
  const name = resolveDisplayName(profile?.nickname, user);

  // 보낸 편지 목록 — count만 필요하므로 select 최소화는 listMyLetters API가 결정
  const { data: letters, isLoading: lettersLoading } = useQuery({
    queryKey: ['letters', 'mine'],
    queryFn: listMyLetters,
    // staleTime: 편지함은 자주 바뀌지 않으므로 30초 캐시
    staleTime: 30_000,
  });

  const letterCount = letters?.length ?? 0;

  // 보낸 편지 수에 따른 감성 문구
  const sentSummary = lettersLoading
    ? '편지함을 열어보는 중…'
    : letterCount === 0
      ? '아직 보낸 편지가 없어요. 첫 편지를 띄워볼까요?'
      : letterCount === 1
        ? '첫 번째 편지를 띄웠어요.'
        : `지금까지 ${letterCount}통을 띄웠어요.`;

  return (
    <main className={styles.page}>
      {/* ── 편지함 헤더 ── */}
      <header className={styles.header}>
        <h1 className={styles.greeting}>{name}님의 편지함</h1>
        <p className={styles.sub}>{sentSummary}</p>
      </header>

      {/* ── 쌓인 편지 비주얼 + CTA ── */}
      <section className={styles.postboxSection} aria-label="편지 현황">
        <LetterStack count={letterCount} isLoading={lettersLoading} />

        <Link className={styles.writeCta} to="/create">
          {/* 펜 아이콘은 SVG로 (외부 이미지 없음) */}
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M14.85 2.15a2.12 2.12 0 0 1 3 3L6.5 16.5 2 18l1.5-4.5L14.85 2.15z"
              stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
          새 편지 쓰기
        </Link>
      </section>

      {/* ── 바로가기 카드 ── */}
      <nav className={styles.cards} aria-label="편지함 바로가기">
        <Link className={styles.card} to="/sent">
          <span className={styles.cardTitle}>보낸 편지 · 보관함</span>
          <span className={styles.cardDesc}>이어쓰기 · 링크 관리 · 열람 현황</span>
        </Link>
        <Link className={styles.card} to="/inbox">
          <span className={styles.cardTitle}>받은 편지함</span>
          <span className={styles.cardDesc}>보관한 편지 다시 읽기</span>
        </Link>
        <Link className={`${styles.card} ${styles.cardPeople}`} to="/people">
          <span className={styles.cardTitle}>주고받은 편지</span>
          <span className={styles.cardDesc}>
            상대별로 함께한 편지를 모아봐요 — 사람과 연결되는 공간
          </span>
        </Link>
        <Link className={styles.card} to="/me">
          <span className={styles.cardTitle}>마이페이지</span>
          <span className={styles.cardDesc}>프로필 · 계정 설정</span>
        </Link>
      </nav>
    </main>
  );
}
