// 스토어 버튼(App Store / Google Play) — Download·Landing·뷰어 CTA가 공유한다.
// 캠페인 토큰(ct/referrer)을 항상 싣는다: 어느 접점에서 설치가 났는지 스토어 콘솔에서 읽기 위해서다.

import { appStoreUrl, playStoreUrl } from '@/lib/storeLinks';
import type { Campaign } from '@/lib/campaign';
import type { MobileOS } from '@/lib/device';
import { track } from '@/lib/analytics';
import styles from './StoreButtons.module.css';

interface StoreButtonsProps {
  campaign: Campaign;
  /** 감지된 OS. 그 OS의 버튼을 먼저·강조로 놓는다. `other`는 둘 다 강조(데스크톱). */
  os: MobileOS;
  className?: string;
}

export function StoreButtons({ campaign, os, className }: StoreButtonsProps): React.ReactElement {
  const ios = { os: 'ios' as const, href: appStoreUrl(campaign) };
  const android = { os: 'android' as const, href: playStoreUrl(campaign) };
  const ordered = os === 'android' ? [android, ios] : [ios, android];
  return (
    <div className={`${styles.stores}${className ? ` ${className}` : ''}`}>
      {ordered.map((s, i) => (
        <StoreButton
          key={s.os}
          os={s.os}
          href={s.href}
          campaign={campaign}
          primary={os === 'other' || i === 0}
        />
      ))}
    </div>
  );
}

interface StoreButtonProps {
  os: 'ios' | 'android';
  href: string;
  campaign: Campaign;
  primary: boolean;
}

/** 단일 스토어 버튼 — 모노크롬 글리프 + 2줄 라벨. 공식 배지 PNG로 후일 교체 가능. */
export function StoreButton({ os, href, campaign, primary }: StoreButtonProps): React.ReactElement {
  const isIOS = os === 'ios';
  return (
    <a
      className={`${styles.store} ${primary ? styles.storePrimary : styles.storeSecondary}`}
      href={href}
      onClick={() => track('store_redirect', { os, ct: campaign })}
    >
      <span className={styles.storeIcon} aria-hidden="true">
        {isIOS ? <AppleGlyph /> : <PlayGlyph />}
      </span>
      <span className={styles.storeText}>
        <small>{isIOS ? 'App Store에서' : 'Google Play에서'}</small>
        <b>다운로드</b>
      </span>
    </a>
  );
}

function AppleGlyph(): React.ReactElement {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.865 0 2.222-1.01 3.902-1.01.613 0 2.886.06 4.374 2.19-.13.09-2.383 1.37-2.383 4.19 0 3.26 2.854 4.42 2.955 4.45z" />
    </svg>
  );
}

function PlayGlyph(): React.ReactElement {
  // 재생 삼각형(모노크롬) — Apple 글리프와 톤을 맞춘다.
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M4 2.5c0-.86.94-1.4 1.68-.95l14 8.5a1.1 1.1 0 0 1 0 1.9l-14 8.5A1.1 1.1 0 0 1 4 19.5v-17z" />
    </svg>
  );
}
