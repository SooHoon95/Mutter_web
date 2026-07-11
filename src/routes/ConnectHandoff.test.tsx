/**
 * ConnectHandoff 분기 + 인터스티셜 상태머신 테스트.
 *
 * 초대링크 규칙(앱 미설치 폴백만 출처로 분기):
 *  - from=app → App Store 안내(웹 폴백 없음). URL 없으면 "설치 준비 중" placeholder.
 *  - from=web/누락 → 웹 보호 플로우(Connect).
 * 맥락 분기:
 *  - 데스크톱 / iOS Safari(웹발급) / 플래그OFF → 웹 Connect, 스킴 미발화.
 *  - iOS Safari + from=app → 스토어 안내(스킴 미발화 — 팝업 회피).
 *  - iOS + 인앱브라우저 + 플래그ON → 스킴 인터스티셜(폴백에서 출처 분기).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { ReactNode } from 'react';

const state = vi.hoisted(() => ({ handoffEnabled: true, appStoreUrl: null as string | null }));

vi.mock('@/lib/device', () => ({
  isIOS: vi.fn(),
  isInAppBrowser: vi.fn(),
}));

vi.mock('@/lib/appLinks', () => ({
  appConnectUrl: (t: string) => `mutter://connect/${t}`,
  openAppScheme: vi.fn(),
  // 실제 로직과 동일한 순수 판별 — 라우트 search를 그대로 받는다.
  inviteFromApp: (s?: string) => new URLSearchParams(s ?? '').get('from') === 'app',
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
  state.appStoreUrl = null;
});

describe('ConnectHandoff 맥락 분기', () => {
  it('데스크톱(비 iOS)은 웹 Connect 미러 + 스킴 미발화', () => {
    mockIsIOS.mockReturnValue(false);
    mockIsInApp.mockReturnValue(false);
    renderAt('tok123', '?from=web');
    expect(screen.getByText('Connect 웹 플로우')).toBeInTheDocument();
    expect(mockOpenScheme).not.toHaveBeenCalled();
  });

  it('iOS Safari + 웹 발급(from=web)은 웹 Connect 미러 + 스킴 미발화', () => {
    mockIsIOS.mockReturnValue(true);
    mockIsInApp.mockReturnValue(false);
    renderAt('tok123', '?from=web');
    expect(screen.getByText('Connect 웹 플로우')).toBeInTheDocument();
    expect(mockOpenScheme).not.toHaveBeenCalled();
  });

  it('iOS Safari + 앱 발급(from=app)은 스토어 안내(스킴 미발화)', () => {
    mockIsIOS.mockReturnValue(true);
    mockIsInApp.mockReturnValue(false);
    renderAt('tok123', '?from=app');
    expect(screen.getByText('Mutter 앱에서 연결해요')).toBeInTheDocument();
    expect(screen.queryByText('Connect 웹 플로우')).not.toBeInTheDocument();
    expect(mockOpenScheme).not.toHaveBeenCalled();
  });

  it('플래그 OFF면 iOS+인앱브라우저여도 웹 Connect 미러(dark-ship)', () => {
    state.handoffEnabled = false;
    mockIsIOS.mockReturnValue(true);
    mockIsInApp.mockReturnValue(true);
    renderAt('tok123', '?from=app');
    expect(screen.getByText('Connect 웹 플로우')).toBeInTheDocument();
    expect(mockOpenScheme).not.toHaveBeenCalled();
  });

  it('iOS + 인앱브라우저 + 플래그ON → 스킴 발화 + 인터스티셜', () => {
    mockIsIOS.mockReturnValue(true);
    mockIsInApp.mockReturnValue(true);
    renderAt('tokXYZ', '?from=web');
    expect(mockOpenScheme).toHaveBeenCalledWith('mutter://connect/tokXYZ');
    expect(screen.getByText('앱으로 여는 중…')).toBeInTheDocument();
  });
});

describe('ConnectHandoff 인터스티셜 폴백 — 출처 분기', () => {
  it('웹 발급(from=web): 타임아웃 후 "웹에서 계속" → Connect', () => {
    vi.useFakeTimers();
    mockIsIOS.mockReturnValue(true);
    mockIsInApp.mockReturnValue(true);
    renderAt('tok123', '?from=web');

    expect(screen.getByText('앱으로 여는 중…')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.getByText('앱을 열지 못했어요')).toBeInTheDocument();
    fireEvent.click(screen.getByText('웹에서 계속'));
    expect(screen.getByText('Connect 웹 플로우')).toBeInTheDocument();
  });

  it('앱 발급(from=app): 타임아웃 후 스토어 안내 — "웹에서 계속" 없음', () => {
    vi.useFakeTimers();
    state.appStoreUrl = 'https://apps.apple.com/app/id0000000000';
    mockIsIOS.mockReturnValue(true);
    mockIsInApp.mockReturnValue(true);
    renderAt('tok123', '?from=app');

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    // App Store 링크 노출 + 웹 폴백 버튼 없음.
    const install = screen.getByText('App Store에서 앱 설치');
    expect(install.getAttribute('href')).toBe('https://apps.apple.com/app/id0000000000');
    expect(screen.queryByText('웹에서 계속')).not.toBeInTheDocument();
  });

  it('앱 발급 + 스토어 URL 미설정 → "설치 준비 중" placeholder', () => {
    vi.useFakeTimers();
    state.appStoreUrl = null;
    mockIsIOS.mockReturnValue(true);
    mockIsInApp.mockReturnValue(true);
    renderAt('tok123', '?from=app');

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.getByText(/앱 설치 준비 중/)).toBeInTheDocument();
    expect(screen.queryByText('웹에서 계속')).not.toBeInTheDocument();
  });
});
