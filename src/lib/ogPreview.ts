// 링크 미리보기(OG) 순수 헬퍼 — Edge Function(api/letter-preview.ts)과 테스트가 공유한다.
//
// 원칙(capability-links): 카드에는 편지 제목·본문·예약 시각·암호 유무를 절대 싣지 않는다.
// 봉인 카드는 "잠금·예약·무효 토큰"이 전부 같은 이미지라 카드만으로 구분할 수 없다.
// React·Supabase·DOM 비의존(lib 규칙) — Edge 런타임에서도 그대로 동작한다.

/** 편지지 테마 id — features/templates/templates.ts와 동일 목록(봉투 이미지 파일명에 쓰인다). */
export const TEMPLATE_IDS = [
  'classic-serif',
  'modern-minimal',
  'warm-craft',
  'night-sky',
  'spring-day',
  'vintage-typewriter',
  'pure-space',
] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

export const OG_SITE_NAME = '뮤터';
/** 발신 닉네임 노출 정책 미결 → 항상 중립 제목(Customer Language). */
export const OG_LETTER_TITLE = '음악 편지가 도착했어요';
export const OG_DESCRIPTION = '받는 사람이 여는 순간, 그 음악이 함께 흐릅니다. 설치 없이 열려요.';
/** 사이트 기본(랜딩·기타 경로) 카드 제목 — 스토어 앱 이름과 동일. */
export const OG_DEFAULT_TITLE = '뮤터 - 음악 편지, 노래 선물';

/** 봉투 이미지 파일 버전 — 이미지를 다시 만들면 올린다(카카오 캐시 무효화). */
export const OG_IMAGE_VERSION = 1;

/**
 * 크롤러 UA 판별 정규식 원문. vercel.json의 rewrite `has.value`와 반드시 같아야 한다
 * (ogPreview.test.ts가 두 값을 비교한다). iMessage는 서버 크롤러가 없어 여기 없다 —
 * 기기가 일반 WebKit UA로 <head>를 읽으므로 index.html의 기본 OG를 본다.
 */
export const CRAWLER_UA_PATTERN =
  '.*(kakaotalk-scrap|facebookexternalhit|Twitterbot|Slackbot|Discordbot|LinkedInBot|WhatsApp|TelegramBot).*';

export function isCrawlerUserAgent(ua: string): boolean {
  return new RegExp(CRAWLER_UA_PATTERN).test(ua);
}

/** 봉투 이미지 경로. 봉인이거나 알 수 없는 테마면 봉인 이미지(정보 노출 0). */
export function envelopeImagePath(templateId: string | null, sealed: boolean): string {
  const id = !sealed && (TEMPLATE_IDS as readonly string[]).includes(templateId ?? '') ? templateId : 'sealed';
  return `/og/envelope-${id}.png?v=${OG_IMAGE_VERSION}`;
}

export interface PreviewInput {
  /** 요청 origin(https://도메인). og:url·og:image 절대 URL에 쓴다. */
  origin: string;
  token: string;
  templateId: string | null;
  sealed: boolean;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 크롤러에게 돌려줄 최소 HTML. 사람이 열면 SPA로 보내는 리다이렉트를 함께 둔다
 * (rewrite가 UA로 갈리므로 실제로는 크롤러만 이 문서를 본다).
 */
export function buildPreviewHtml(input: PreviewInput): string {
  const url = `${input.origin}/l/${encodeURIComponent(input.token)}`;
  const image = `${input.origin}${envelopeImagePath(input.templateId, input.sealed)}`;
  const title = escapeHtml(OG_LETTER_TITLE);
  const description = escapeHtml(OG_DESCRIPTION);
  return [
    '<!doctype html>',
    '<html lang="ko"><head>',
    '<meta charset="utf-8">',
    `<title>${title}</title>`,
    '<meta name="robots" content="noindex,nofollow">',
    `<meta name="description" content="${description}">`,
    '<meta property="og:type" content="website">',
    `<meta property="og:site_name" content="${escapeHtml(OG_SITE_NAME)}">`,
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${description}">`,
    `<meta property="og:url" content="${escapeHtml(url)}">`,
    `<meta property="og:image" content="${escapeHtml(image)}">`,
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${title}">`,
    `<meta name="twitter:description" content="${description}">`,
    `<meta name="twitter:image" content="${escapeHtml(image)}">`,
    `<meta http-equiv="refresh" content="0;url=${escapeHtml(url)}">`,
    '</head><body>',
    `<p><a href="${escapeHtml(url)}">${title}</a></p>`,
    '</body></html>',
  ].join('\n');
}
