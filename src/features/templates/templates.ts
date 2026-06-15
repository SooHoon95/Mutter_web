// 편지 템플릿 데이터 정의. 제작·수신 양쪽에서 참조하는 순수 데이터 레이어.
// 각 템플릿은 시각 테마(CSS 변수 값)를 정의하며, TemplateThemed 래퍼가 이를 적용한다.

export interface TemplateTheme {
  // 배경 / 전경
  bg: string;
  fg: string;
  muted: string;
  accent: string;
  // 타이포그래피
  fontFamily: string;
  headingFontFamily: string;
  fontSize: string;         // 본문 기본 폰트 크기
  lineHeight: string;       // 본문 줄 간격
  headingSize: string;      // 제목 폰트 크기
  // 레이아웃
  borderRadius: string;     // 카드/컨테이너 모서리
  borderColor: string;      // 장식 테두리
  // 장식
  paperTexture: string;     // CSS background 단축속성 (none 또는 그라디언트)
}

export interface Template {
  id: string;
  name: string;
  description: string;
  theme: TemplateTheme;
}

// ---------------------------------------------------------------------------
// 템플릿 정의 (5~7개, 감성 다양성)
// ---------------------------------------------------------------------------

const TEMPLATES: readonly Template[] = [
  // ── 1. 클래식 세리프 ──────────────────────────────────────────────────────
  {
    id: 'classic-serif',
    name: '클래식 세리프',
    description: '시대를 초월한 우아함. 손으로 쓴 편지의 감촉.',
    theme: {
      bg: '#faf8f3',
      fg: '#2c2416',
      muted: '#8a7a5e',
      accent: '#8b6914',
      fontFamily: "'Georgia', 'Times New Roman', 'Nanum Myeongjo', serif",
      headingFontFamily: "'Georgia', 'Times New Roman', 'Nanum Myeongjo', serif",
      fontSize: '1.0625rem',
      lineHeight: '1.85',
      headingSize: '1.375rem',
      borderRadius: '4px',
      borderColor: 'rgba(139, 105, 20, 0.2)',
      paperTexture:
        'linear-gradient(135deg, rgba(139,105,20,0.04) 0%, transparent 60%)',
    },
  },

  // ── 2. 모던 미니멀 ────────────────────────────────────────────────────────
  {
    id: 'modern-minimal',
    name: '모던 미니멀',
    description: '여백이 말한다. 텍스트에만 집중.',
    theme: {
      bg: '#ffffff',
      fg: '#111111',
      muted: '#767676',
      accent: '#0066cc',
      fontFamily: "'Pretendard', 'Apple SD Gothic Neo', system-ui, sans-serif",
      headingFontFamily: "'Pretendard', 'Apple SD Gothic Neo', system-ui, sans-serif",
      fontSize: '1rem',
      lineHeight: '1.75',
      headingSize: '1.25rem',
      borderRadius: '2px',
      borderColor: 'rgba(0, 0, 0, 0.08)',
      paperTexture: 'none',
    },
  },

  // ── 3. 따뜻한 크래프트 ───────────────────────────────────────────────────
  {
    id: 'warm-craft',
    name: '따뜻한 크래프트',
    description: '커피향 나는 브라운 톤. 오래된 카페의 감성.',
    theme: {
      bg: '#f5ede0',
      fg: '#3b2a1a',
      muted: '#917360',
      accent: '#c0550a',
      fontFamily: "'Georgia', 'Nanum Myeongjo', serif",
      headingFontFamily: "'Georgia', 'Nanum Myeongjo', serif",
      fontSize: '1rem',
      lineHeight: '1.8',
      headingSize: '1.3125rem',
      borderRadius: '6px',
      borderColor: 'rgba(192, 85, 10, 0.18)',
      paperTexture:
        'linear-gradient(160deg, rgba(192,85,10,0.06) 0%, transparent 50%)',
    },
  },

  // ── 4. 밤하늘 ─────────────────────────────────────────────────────────────
  // 다크 테마 — 야간에 읽는 감성 편지.
  {
    id: 'night-sky',
    name: '밤하늘',
    description: '깊은 남색 배경에 별빛 같은 문장들.',
    theme: {
      bg: '#0d1b2a',
      fg: '#e8dfc8',
      muted: '#7a8fa6',
      accent: '#c8a24a',
      fontFamily: "'Georgia', 'Nanum Myeongjo', serif",
      headingFontFamily: "'Georgia', 'Nanum Myeongjo', serif",
      fontSize: '1.0625rem',
      lineHeight: '1.9',
      headingSize: '1.375rem',
      borderRadius: '8px',
      borderColor: 'rgba(200, 162, 74, 0.2)',
      paperTexture:
        'radial-gradient(ellipse at 80% 20%, rgba(200,162,74,0.07) 0%, transparent 60%)',
    },
  },

  // ── 5. 봄날 ───────────────────────────────────────────────────────────────
  {
    id: 'spring-day',
    name: '봄날',
    description: '연분홍 벚꽃처럼 가볍고 설레는 마음.',
    theme: {
      bg: '#fff7f8',
      fg: '#2d1a1f',
      muted: '#9b7681',
      accent: '#d4587a',
      fontFamily: "'Pretendard', 'Apple SD Gothic Neo', system-ui, sans-serif",
      headingFontFamily: "'Pretendard', 'Apple SD Gothic Neo', system-ui, sans-serif",
      fontSize: '1rem',
      lineHeight: '1.8',
      headingSize: '1.3125rem',
      borderRadius: '12px',
      borderColor: 'rgba(212, 88, 122, 0.15)',
      paperTexture:
        'radial-gradient(circle at 10% 90%, rgba(212,88,122,0.06) 0%, transparent 55%)',
    },
  },

  // ── 6. 빈티지 타자기 ─────────────────────────────────────────────────────
  {
    id: 'vintage-typewriter',
    name: '빈티지 타자기',
    description: '타자기 서체로 찍힌 진심. 아날로그의 온기.',
    theme: {
      bg: '#f8f4ec',
      fg: '#1c1c1c',
      muted: '#7a7060',
      accent: '#444033',
      fontFamily: "'Courier New', 'Courier', 'Lucida Console', monospace",
      headingFontFamily: "'Courier New', 'Courier', monospace",
      fontSize: '0.9375rem',
      lineHeight: '1.9',
      headingSize: '1.25rem',
      borderRadius: '0px',
      borderColor: 'rgba(28, 28, 28, 0.15)',
      paperTexture:
        'repeating-linear-gradient(0deg, transparent, transparent 27px, rgba(28,28,28,0.04) 27px, rgba(28,28,28,0.04) 28px)',
    },
  },

  // ── 7. 순수 여백 ─────────────────────────────────────────────────────────
  {
    id: 'pure-space',
    name: '순수 여백',
    description: '극도의 미니멀. 말 한마디가 전부인 편지.',
    theme: {
      bg: '#f9f9f9',
      fg: '#222222',
      muted: '#888888',
      accent: '#222222',
      fontFamily: "'Pretendard', 'Apple SD Gothic Neo', system-ui, sans-serif",
      headingFontFamily: "'Pretendard', 'Apple SD Gothic Neo', system-ui, sans-serif",
      fontSize: '1.125rem',
      lineHeight: '2',
      headingSize: '1.5rem',
      borderRadius: '0px',
      borderColor: 'rgba(34, 34, 34, 0.06)',
      paperTexture: 'none',
    },
  },
] as const;

// ---------------------------------------------------------------------------
// 헬퍼
// ---------------------------------------------------------------------------

export const DEFAULT_TEMPLATE_ID = 'classic-serif';

/**
 * id로 템플릿을 조회한다. 없으면 기본 템플릿을 반환한다.
 * 수신자 렌더 시 알 수 없는 id가 들어와도 항상 안전한 값을 반환한다.
 */
export function getTemplate(id: string): Template {
  return TEMPLATES.find((t) => t.id === id) ?? getDefaultTemplate();
}

/** 기본 템플릿을 반환한다. */
export function getDefaultTemplate(): Template {
  // TEMPLATES 배열에 DEFAULT_TEMPLATE_ID가 반드시 존재한다(아래 타입 불변식 참조).
  const found = TEMPLATES.find((t) => t.id === DEFAULT_TEMPLATE_ID);
  if (!found) {
    // 방어 코드: 빌드 타임에 잡히지 않는 케이스를 런타임에 단언 없이 처리.
    throw new Error(`DEFAULT_TEMPLATE_ID "${DEFAULT_TEMPLATE_ID}" not found in TEMPLATES`);
  }
  return found;
}

/** 전체 템플릿 목록. UI 피커가 이 배열을 이터레이션한다. */
export function getAllTemplates(): readonly Template[] {
  return TEMPLATES;
}
