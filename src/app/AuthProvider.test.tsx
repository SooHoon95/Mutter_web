/**
 * src/app/AuthProvider.test.tsx
 *
 * AuthProvider와 useAuth hook 통합 테스트.
 * onAuthChange를 모킹해 세션 상태 변화 흐름을 검증한다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthProvider';

// data/auth 모킹
vi.mock('@/data/auth', () => ({
  onAuthChange: vi.fn(),
}));

import { onAuthChange } from '@/data/auth';
const mockOnAuthChange = vi.mocked(onAuthChange);

// useAuth를 렌더링하기 위한 테스트용 소비 컴포넌트
function AuthConsumer() {
  const { session, user, loading } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="session">{session ? 'has-session' : 'no-session'}</span>
      <span data-testid="user">{user ? user.id : 'no-user'}</span>
    </div>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AuthProvider', () => {
  it('초기 로딩 상태는 true이다', () => {
    // onAuthChange가 즉시 콜백을 호출하지 않도록 설정
    mockOnAuthChange.mockReturnValue(() => {});

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    );

    expect(screen.getByTestId('loading').textContent).toBe('true');
    expect(screen.getByTestId('session').textContent).toBe('no-session');
  });

  it('onAuthChange 콜백 호출 후 loading=false, session 업데이트된다', () => {
    let capturedCallback: Parameters<typeof onAuthChange>[0] | null = null;

    mockOnAuthChange.mockImplementation((cb) => {
      capturedCallback = cb;
      return () => {};
    });

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    );

    // 콜백 호출 전: 아직 loading=true
    expect(screen.getByTestId('loading').textContent).toBe('true');

    // INITIAL_SESSION 이벤트 시뮬레이션 — 세션 없음
    act(() => {
      capturedCallback!('INITIAL_SESSION' as never, null);
    });

    expect(screen.getByTestId('loading').textContent).toBe('false');
    expect(screen.getByTestId('session').textContent).toBe('no-session');
  });

  it('세션이 있으면 user가 채워진다', () => {
    let capturedCallback: Parameters<typeof onAuthChange>[0] | null = null;

    mockOnAuthChange.mockImplementation((cb) => {
      capturedCallback = cb;
      return () => {};
    });

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    );

    const fakeSession = {
      user: { id: 'uid-abc' },
      access_token: 'tok',
    } as never;

    act(() => {
      capturedCallback!('SIGNED_IN' as never, fakeSession);
    });

    expect(screen.getByTestId('session').textContent).toBe('has-session');
    expect(screen.getByTestId('user').textContent).toBe('uid-abc');
    expect(screen.getByTestId('loading').textContent).toBe('false');
  });

  it('언마운트 시 unsubscribe(cleanup)가 호출된다', () => {
    const unsubscribeMock = vi.fn();
    mockOnAuthChange.mockReturnValue(unsubscribeMock);

    const { unmount } = render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    );

    unmount();

    expect(unsubscribeMock).toHaveBeenCalledOnce();
  });
});

describe('useAuth', () => {
  it('AuthProvider 외부에서 호출하면 오류를 발생시킨다', () => {
    function Orphan() {
      useAuth();
      return null;
    }

    // React는 렌더 중 throw를 error boundary로 잡는다.
    // console.error를 억제해 테스트 출력을 깔끔하게 유지한다.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Orphan />)).toThrow('useAuth must be used within <AuthProvider>');
    spy.mockRestore();
  });
});
