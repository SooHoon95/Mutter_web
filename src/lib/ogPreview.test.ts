import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildPreviewHtml,
  envelopeImagePath,
  isCrawlerUserAgent,
  CRAWLER_UA_PATTERN,
  OG_LETTER_TITLE,
  OG_IMAGE_VERSION,
} from './ogPreview';

describe('envelopeImagePath', () => {
  it('테마별 봉투 이미지를 고른다', () => {
    expect(envelopeImagePath('night-sky', false)).toBe(`/og/envelope-night-sky.png?v=${OG_IMAGE_VERSION}`);
  });
  it('봉인이면 테마와 무관하게 봉인 이미지', () => {
    expect(envelopeImagePath('night-sky', true)).toBe(`/og/envelope-sealed.png?v=${OG_IMAGE_VERSION}`);
  });
  it('알 수 없는 테마·null은 봉인 이미지(정보 노출 0)', () => {
    expect(envelopeImagePath('../../etc', false)).toContain('envelope-sealed');
    expect(envelopeImagePath(null, false)).toContain('envelope-sealed');
  });
});

describe('buildPreviewHtml', () => {
  const html = buildPreviewHtml({
    origin: 'https://example.com',
    token: 'ab"c<>',
    templateId: 'spring-day',
    sealed: false,
  });
  it('OG 태그·절대 URL·noindex를 담는다', () => {
    expect(html).toContain(`<meta property="og:title" content="${OG_LETTER_TITLE}">`);
    expect(html).toContain('property="og:image" content="https://example.com/og/envelope-spring-day.png?v=');
    expect(html).toContain('<meta name="robots" content="noindex,nofollow">');
    expect(html).toContain('summary_large_image');
  });
  it('토큰을 이스케이프·인코딩한다(HTML 주입 없음)', () => {
    expect(html).not.toContain('ab"c<>');
    expect(html).toContain('/l/ab%22c%3C%3E');
  });
  it('편지 제목·본문·예약 시각은 어떤 입력에도 실리지 않는다(입력 자체에 없음)', () => {
    expect(Object.keys({ origin: 1, token: 1, templateId: 1, sealed: 1 })).toHaveLength(4);
  });
});

describe('isCrawlerUserAgent', () => {
  it('카카오톡·페이스북·슬랙 크롤러를 판별한다', () => {
    expect(isCrawlerUserAgent('facebookexternalhit/1.1;kakaotalk-scrap/1.0;')).toBe(true);
    expect(isCrawlerUserAgent('Slackbot-LinkExpanding 1.0')).toBe(true);
  });
  it('일반 브라우저·iMessage(WebKit)는 크롤러가 아니다', () => {
    expect(
      isCrawlerUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
      ),
    ).toBe(false);
  });
  it('vercel.json의 rewrite 조건과 정규식이 같다', () => {
    const vercel = JSON.parse(readFileSync(path.resolve(process.cwd(), 'vercel.json'), 'utf8')) as {
      rewrites: Array<{ destination: string; has?: Array<{ key: string; value: string }> }>;
    };
    const rule = vercel.rewrites.find((r) => r.destination.startsWith('/api/letter-preview'));
    expect(rule?.has?.[0]?.key).toBe('user-agent');
    expect(rule?.has?.[0]?.value).toBe(CRAWLER_UA_PATTERN);
  });
});
