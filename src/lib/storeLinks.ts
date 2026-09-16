// 스토어 링크 빌더 — 캠페인 토큰을 App Store(`ct`)·Play(`referrer`)에 싣는다.
// 기본 URL은 appLinks의 카노니컬 폴백(env 우선)을 그대로 쓴다.

import { IOS_DOWNLOAD_URL, ANDROID_DOWNLOAD_URL } from './appLinks';
import { CAMPAIGNS, type Campaign } from './campaign';
import type { MobileOS } from './device';

/**
 * App Store Connect 캠페인 `pt`(provider id). 앱 분석 > 캠페인 링크 생성 화면에 표시되는 값.
 * 미설정이면 `ct`만 붙는다 — 소스 집계는 되고 캠페인별 세부 리포트만 빠진다.
 */
const PROVIDER_ID: string =
  (import.meta.env.VITE_ASC_PROVIDER_ID as string | undefined)?.trim() ?? '';

/** App Store URL + `?pt=<provider>&ct=<campaign>&mt=8`(Apple 문서 표기 순서). */
export function appStoreUrl(campaign: Campaign): string {
  const url = new URL(IOS_DOWNLOAD_URL);
  if (PROVIDER_ID) url.searchParams.set('pt', PROVIDER_ID);
  url.searchParams.set('ct', campaign);
  url.searchParams.set('mt', '8');
  return url.toString();
}

/** Play URL + `&referrer=utm_source%3D..%26utm_medium%3D..%26utm_campaign%3D..`(값 전체를 한 번 인코딩). */
export function playStoreUrl(campaign: Campaign): string {
  const { source, medium } = CAMPAIGNS[campaign];
  const referrer = `utm_source=${source}&utm_medium=${medium}&utm_campaign=${campaign}`;
  const url = new URL(ANDROID_DOWNLOAD_URL);
  url.searchParams.set('referrer', referrer);
  return url.toString();
}

/** 감지된 OS의 스토어 URL. 데스크톱(`other`)은 null — 호출부가 QR 등으로 분기한다. */
export function storeUrlFor(os: MobileOS, campaign: Campaign): string | null {
  if (os === 'ios') return appStoreUrl(campaign);
  if (os === 'android') return playStoreUrl(campaign);
  return null;
}
