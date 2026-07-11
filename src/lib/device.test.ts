import { describe, it, expect, afterEach } from 'vitest';
import { isIOS, isAndroid, isMobile, isInAppBrowser, isStandalonePWA } from './device';

// jsdom navigator.userAgent를 케이스별로 덮어쓴다(configurable). 각 테스트 후 원복.
const ORIGINAL_UA = navigator.userAgent;

function setUA(ua: string): void {
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
}

afterEach(() => {
  Object.defineProperty(navigator, 'userAgent', { value: ORIGINAL_UA, configurable: true });
});

// 대표 UA 샘플
const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  kakaoIOS:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.5.0',
  instagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 300.0.0',
  fbIOS:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 [FBAN/FBIOS;FBAV/450.0.0]',
  lineIOS:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Line/13.0.0',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36',
  desktopChrome:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
} as const;

describe('isIOS', () => {
  it('iPhone Safari를 iOS로 판별한다', () => {
    setUA(UA.iphoneSafari);
    expect(isIOS()).toBe(true);
  });

  it('iOS 인앱브라우저(카톡)도 iOS로 판별한다', () => {
    setUA(UA.kakaoIOS);
    expect(isIOS()).toBe(true);
  });

  it('Android/데스크톱은 iOS가 아니다', () => {
    setUA(UA.androidChrome);
    expect(isIOS()).toBe(false);
    setUA(UA.desktopChrome);
    expect(isIOS()).toBe(false);
  });
});

describe('isAndroid / isMobile', () => {
  it('Android Chrome을 Android·모바일로 판별한다', () => {
    setUA(UA.androidChrome);
    expect(isAndroid()).toBe(true);
    expect(isMobile()).toBe(true);
  });

  it('데스크톱은 모바일이 아니다', () => {
    setUA(UA.desktopChrome);
    expect(isAndroid()).toBe(false);
    expect(isMobile()).toBe(false);
  });

  it('iOS도 모바일이다', () => {
    setUA(UA.iphoneSafari);
    expect(isMobile()).toBe(true);
  });
});

describe('isInAppBrowser', () => {
  it('카카오톡/인스타그램/페이스북/라인 인앱브라우저를 판별한다', () => {
    for (const ua of [UA.kakaoIOS, UA.instagram, UA.fbIOS, UA.lineIOS]) {
      setUA(ua);
      expect(isInAppBrowser()).toBe(true);
    }
  });

  it('일반 iOS Safari·데스크톱은 인앱브라우저가 아니다', () => {
    setUA(UA.iphoneSafari);
    expect(isInAppBrowser()).toBe(false);
    setUA(UA.desktopChrome);
    expect(isInAppBrowser()).toBe(false);
  });
});

describe('isStandalonePWA', () => {
  it('navigator.standalone=true면 PWA로 판별한다', () => {
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
    expect(isStandalonePWA()).toBe(true);
    Reflect.deleteProperty(navigator as object, 'standalone');
  });

  it('standalone 플래그와 matchMedia가 없으면 false로 폴백한다', () => {
    // jsdom 기본: navigator.standalone 없음 + window.matchMedia 미구현 → false.
    expect(isStandalonePWA()).toBe(false);
  });
});
