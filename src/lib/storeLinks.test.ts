import { describe, it, expect } from 'vitest';
import { appStoreUrl, playStoreUrl, storeUrlFor } from './storeLinks';

describe('appStoreUrl', () => {
  it('ct와 mt=8을 붙인다(App Store 캠페인 링크)', () => {
    const url = new URL(appStoreUrl('viewer_reply'));
    expect(url.hostname).toBe('apps.apple.com');
    expect(url.searchParams.get('ct')).toBe('viewer_reply');
    expect(url.searchParams.get('mt')).toBe('8');
  });
});

describe('playStoreUrl', () => {
  it('referrer에 utm 3개를 한 번 인코딩해 싣는다', () => {
    const url = new URL(playStoreUrl('viewer_send'));
    expect(url.hostname).toBe('play.google.com');
    expect(url.searchParams.get('id')).toBe('com.efreedom.mutter');
    expect(url.searchParams.get('referrer')).toBe('utm_source=viewer&utm_medium=cta&utm_campaign=viewer_send');
    // 원문에는 %26으로 인코딩되어 있어야 Play가 하나의 referrer 값으로 읽는다.
    expect(url.toString()).toContain('utm_source%3Dviewer%26utm_medium%3Dcta%26utm_campaign%3Dviewer_send');
  });
});

describe('storeUrlFor', () => {
  it('OS별 스토어, 데스크톱은 null', () => {
    expect(storeUrlFor('ios', 'landing')).toContain('apps.apple.com');
    expect(storeUrlFor('android', 'landing')).toContain('play.google.com');
    expect(storeUrlFor('other', 'landing')).toBeNull();
  });
});
