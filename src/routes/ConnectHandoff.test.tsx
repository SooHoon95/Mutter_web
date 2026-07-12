/**
 * ConnectHandoff 분기 테스트 (2026-07 갱신 — iOS에서 앱 없으면 App Store로 통일).
 *
 * 규칙:
 *  - 데스크톱 / Android / 플래그OFF → 웹 Connect.
 *  - iOS + Safari + 핸드오프ON → App Store 안내(from 무관, "웹에서 계속" 보조).
 *  - iOS + 인앱브라우저 + 핸드오프ON → 스킴 인터스티셜 → 폴백 시 App Store + 웹에서 계속.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { ReactNode } from 'react';

const STORE_URL = 'https://apps.apple.com/app/id6790086549';
const state = vi.hoisted(() => ({
  handoffEnabled: true,
  appStoreUrl: 'https://apps.apple.com/app/id6790086549' as string | null,
}));

vi.mock('@/lib/device', () => ({
  isIOS: vi.fn(),
  isInAppBrowser: vi.fn(),
}));

vi.mock('@/lib/appLinks', () => ({
  appConnectUrl: (t: string) => `mutter://connect/${t}`,
  openAppScheme: vi.fn(),
  get APP_STORE_URL() {
    return state.appStoreUrl;
  },
  get HANDOFF_ENABLED() {
    return state.handoffEnabled;
  },
}));

vi.mock('@/routes/Connect', () => ({ default: () => <div>Connect 웹 플로우</div> }));
vi.mock('@/components/AppShell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/features/auth/RequireAuth', () => ({
  RequireAuth: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import ConnectHandoff from './ConnectHandoff';
import { isIOS, isInAppBrowser } from '@/lib/device';
import { openAppScheme } from '@/lib/appLinks';

const mockIsIOS = vi.mocked(isIOS);
const mockIsInApp = vi.mocked(isInAppBrowser);
const mockOpenScheme = vi.mocked(openAppScheme);

function renderAt(token = 'tok123', search = '') {
  return render(
    <MemoryRouter initialEntries={[`/connect/${token}${search}`]}>
      <Routes>
        <Route path="/connect/:token" element={<ConnectHandoff />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  state.handoffEnabled = true;
  state.appStoreUrl = STORE_URL;
});

describe('ConnectHandoff 맥락 분기', () => {
  it('데스크톱(비 iOS)은 웹 Connect + 스킴 미발화', () => {
    mockIsIOS.mockReturnValue(false);
    mockIsInApp.mockReturnValue(false);
    renderAt();
    expect(screen.getByText('Connect 웹 플로우')).toBeInTheDocument();
    expect(mockOpenScheme).not.toHaveBeenCalled();
  });

  it('iOS Safari + 핸드오프ON → App Store 안내(from 무관, 스킴 미발화)', () => {
    mockIsIOS.mockReturnValue(true);
    mockIsInApp.mockReturnValue(false);
    renderAt('tok123', '?from=web');
    expect(screen.getByText('App Store에서 설치').getAttribute('href')).toBe(STORE_URL);
    expect(screen.queryByText('Connect 웹 플로우')).not.toBeInTheDocument();
    expect(mockOpenScheme).not.toHaveBeenCalled();
  });

  it('iOS Safari 스토어 안내 → "웹에서 계속"이면 웹 Connect', () => {
    mockIsIOS.mockReturnValue(true);
    mockIsInApp.mockReturnValue(false);
    renderAt();
    fireEvent.click(screen.getByText('웹에서 계속'));
    expect(screen.getByText('Connect 웹 플로우')).toBeInTheDocument();
  });

  it('APP_STORE_URL 미설정 → 스토어 안내에 "설치 준비 중"(링크 없음)', () => {
    state.appStoreUrl = null;
    mockIsIOS.mockReturnValue(true);
    mockIsInApp.mockReturnValue(false);
    renderAt();
    expect(screen.getByText(/앱 설치 준비 중/)).toBeInTheDocument();
    expect(screen.queryByText('App Store에서 설치')).not.toBeInTheDocument();
  });

  it('플래그 OFF면 iOS Safari여도 웹 Connect(dark-ship)', () => {
    state.handoffEnabled = false;
    mockIsIOS.mockReturnValue(true);
    mockIsInApp.mockReturnValue(false);
    renderAt();
    expect(screen.getByText('Connect 웹 플로우')).toBeInTheDocument();
  });

  it('iOS + 인앱브라우저 + 플래그ON → 스킴 발화 + "앱으로 여는 중…"', () => {
    mockIsIOS.mockReturnValue(true);
    mockIsInApp.mockReturnValue(true);
    renderAt('tokXYZ');
    expect(mockOpenScheme).toHaveBeenCalledWith('mutter://connect/tokXYZ');
    expect(screen.getByText('앱으로 여는 중…')).toBeInTheDocument();
  });
});

describe('ConnectHandoff 인터스티셜 폴백', () => {
  it('타임아웃 후 App Store 설치 + "웹에서 계속" 둘 다 노출', () => {
    vi.useFakeTimers();
    mockIsIOS.mockReturnValue(true);
    mockIsInApp.mockReturnValue(true);
    renderAt();
    expect(screen.getByText('앱으로 여는 중…')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.getByText('앱을 열지 못했어요')).toBeInTheDocument();
    expect(screen.getByText('App Store에서 설치').getAttribute('href')).toBe(STORE_URL);
    expect(screen.getByText('웹에서 계속')).toBeInTheDocument();
  });

  it('폴백 "웹에서 계속" → 웹 Connect', () => {
    vi.useFakeTimers();
    mockIsIOS.mockReturnValue(true);
    mockIsInApp.mockReturnValue(true);
    renderAt();
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    fireEvent.click(screen.getByText('웹에서 계속'));
    expect(screen.getByText('Connect 웹 플로우')).toBeInTheDocument();
  });
});
