/**
 * src/features/auth/RequireAuth.test.tsx
 *
 * RequireAuth 컴포넌트 테스트.
 * - 로딩 중: 스피너 렌더
 * - 세션 없음: /login으로 리다이렉트
 * - 세션 있음: children 렌더
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RequireAuth } from './RequireAuth';

// useAuth 모킹
vi.mock('@/app/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '@/app/AuthProvider';
const mockUseAuth = vi.mocked(useAuth);

beforeEach(() => {
  vi.clearAllMocks();
});

function renderWithRouter(
  initialPath: string,
  element: React.ReactNode,
) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/create" element={element} />
        <Route path="/login" element={<div>로그인 페이지</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RequireAuth', () => {
  it('loading=true 일 때 스피너를 렌더한다', () => {
    mockUseAuth.mockReturnValue({ session: null, user: null, loading: true });

    renderWithRouter(
      '/create',
      <RequireAuth>
        <div>보호된 콘텐츠</div>
      </RequireAuth>,
    );

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('보호된 콘텐츠')).not.toBeInTheDocument();
  });

  it('loading=false, session=null 이면 /login 으로 리다이렉트한다', () => {
    mockUseAuth.mockReturnValue({ session: null, user: null, loading: false });

    renderWithRouter(
      '/create',
      <RequireAuth>
        <div>보호된 콘텐츠</div>
      </RequireAuth>,
    );

    expect(screen.getByText('로그인 페이지')).toBeInTheDocument();
    expect(screen.queryByText('보호된 콘텐츠')).not.toBeInTheDocument();
  });

  it('세션이 있으면 children을 렌더한다', () => {
    const fakeUser = { id: 'uid-123' };
    const fakeSession = { user: fakeUser, access_token: 'tok' };
    mockUseAuth.mockReturnValue({
      session: fakeSession,
      user: fakeUser,
      loading: false,
    } as unknown as ReturnType<typeof useAuth>);

    renderWithRouter(
      '/create',
      <RequireAuth>
        <div>보호된 콘텐츠</div>
      </RequireAuth>,
    );

    expect(screen.getByText('보호된 콘텐츠')).toBeInTheDocument();
    expect(screen.queryByText('로그인 페이지')).not.toBeInTheDocument();
  });
});
