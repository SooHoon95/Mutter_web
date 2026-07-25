// 실행 환경(디바이스/브라우저) 판별 헬퍼 — 링크 앱 핸드오프 분기에 쓴다.
//
// 순수 UA 기반 판별이라 SSR/테스트에서 navigator가 없어도 안전하게 false로 폴백한다.
// 여는 맥락(데스크톱 / 폰 Safari / 폰 인앱브라우저)에 따라 웹/앱 분기를 결정한다(plan §A1).
//
// 주의: UA 판별은 완벽하지 않다. 여기서는 "앱으로 핸드오프할지" 정도의 저위험 분기에만 쓰고,
// 접근 통제·권한 판단에는 절대 쓰지 않는다(그건 서버 RPC/토큰이 담당).

/** iPhone·iPad·iPod 여부. 앱 설치·핸드오프 CTA 노출 판단용. */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}

/** Android 여부. */
export function isAndroid(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android/.test(navigator.userAgent);
}

/** 모바일(iOS 또는 Android) 여부. */
export function isMobile(): boolean {
  return isIOS() || isAndroid();
}

/** 다운로드 페이지에서 강조할 스토어를 가르는 대상 OS. */
export type MobileOS = 'ios' | 'android' | 'other';

/**
 * 모바일 OS 판별(다운로드 페이지 스토어 강조용). ua 미지정 시 navigator에서 읽는다.
 * iPadOS 13+는 데스크톱 Safari로 위장(UA에 'Macintosh')하므로 터치 지원(maxTouchPoints>1)으로 iOS 보정.
 * 저위험 UI 분기 전용 — 접근 통제엔 쓰지 않는다.
 */
export function getMobileOS(ua?: string): MobileOS {
  const s = ua ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  if (/iPhone|iPad|iPod/.test(s)) return 'ios';
  if (/Android/.test(s)) return 'android';
  const touchPoints =
    typeof navigator !== 'undefined' ? (navigator.maxTouchPoints ?? 0) : 0;
  if (/Macintosh/.test(s) && touchPoints > 1) return 'ios'; // iPadOS 13+ 데스크톱 위장
  return 'other';
}

/**
 * 인앱 브라우저(WKWebView 임베드) 여부 — 카카오톡/인스타그램/페이스북/라인.
 * 이들은 Universal Link를 가로채지 못하는 경우가 많아, 앱 핸드오프에 커스텀 스킴이 필요하다(plan D1).
 * Line은 " Line/7.x" 형태라 슬래시까지 매칭해 online/airline 등 오탐을 피한다.
 */
export function isInAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /KAKAOTALK|Instagram|FBAN|FBAV|Line\//i.test(navigator.userAgent);
}

/**
 * 홈 화면에 추가된 standalone PWA로 실행 중인지.
 * iOS Safari는 navigator.standalone, 그 외는 display-mode 미디어쿼리로 판별한다.
 */
export function isStandalonePWA(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  // iOS Safari 전용 비표준 플래그(타입에 없어 캐스팅).
  const nav = navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;
  if (typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(display-mode: standalone)').matches;
}
