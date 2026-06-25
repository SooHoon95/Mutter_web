/**
 * src/routes/Home.test.tsx
 *
 * Home 진입 게이트 테스트 — 닉네임 유무에 따른 분기를 증명한다.
 * - 세션 O + 닉네임 없음  → /set-nickname 으로 리다이렉트(이름 먼저 받기)
 * - 세션 O + 닉네임 있음  → 대시보드("…님의 편지함") 렌더
 * - 세션 X               → 랜딩
 *
 * 이 게이트가 죽으면 가입자가 이름을 못 정한 채 바로 홈으로 새는 회귀가 난다(실제 발생했던 버그).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Home from './Home';

vi.mock('@/app/AuthProvider', () => ({ useAuth: vi.fn() }));
vi.mock('@/features/profile', () => ({ useProfile: vi.fn() }));
// useQuery(보낸 편지 수)는 네트워크 없이 빈 배열로 고정.
vi.mock('@tanstack/react-query', () => ({ useQuery: vi.fn(() => ({ data: [], isLoading: false })) }));
vi.mock('./Landing', () => ({ default: () => <div>랜딩 페이지</div> }));

import { useAuth } from '@/app/AuthProvider';
import { useProfile } from '@/features/profile';

const mockUseAuth = vi.mocked(useAuth);
const mockUseProfile = vi.mocked(useProfile);

const fakeUser = { id: 'uid-1' } as unknown;
const fakeSession = { user: fakeUser, access_token: 't' } as unknown;

function setProfile(nickname: string | null) {
  mockUseProfile.mockReturnValue({
    profile: nickname === null ? null : { id: 'uid-1', nickname, createdAt: '', updatedAt: '' },
    isLoading: false,
    error: null,
    updateNickname: vi.fn(),
    isUpdating: false,
  } as unknown as ReturnType<typeof useProfile>);
}

function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/set-nickname" element={<div>이름 설정 페이지</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear(); // 로그인 직후 플래그 초기화
});

describe('Home 진입 게이트', () => {
  it('로그인 직후(SIGNED_IN 플래그)면 닉네임이 있어도 /set-nickname 을 띄운다', () => {
    mockUseAuth.mockReturnValue({ session: fakeSession, user: fakeUser, loading: false } as ReturnType<typeof useAuth>);
    setProfile('수현'); // 이미 닉네임이 있어도
    sessionStorage.setItem('letterapp:postLogin', '1'); // 방금 로그인했으면

    renderHome();

    expect(screen.getByText('이름 설정 페이지')).toBeInTheDocument();
    expect(screen.queryByText('수현님의 편지함')).not.toBeInTheDocument();
  });

  it('세션 O + 닉네임 없음 → /set-nickname 으로 보낸다', () => {
    mockUseAuth.mockReturnValue({ session: fakeSession, user: fakeUser, loading: false } as ReturnType<typeof useAuth>);
    setProfile(null);

    renderHome();

    expect(screen.getByText('이름 설정 페이지')).toBeInTheDocument();
    expect(screen.queryByText(/편지함/)).not.toBeInTheDocument();
  });

  it('세션 O + 빈 문자열 닉네임도 → /set-nickname 으로 보낸다', () => {
    mockUseAuth.mockReturnValue({ session: fakeSession, user: fakeUser, loading: false } as ReturnType<typeof useAuth>);
    setProfile('   '); // 공백뿐 → 미설정으로 간주

    renderHome();

    expect(screen.getByText('이름 설정 페이지')).toBeInTheDocument();
  });

  it('세션 O + 닉네임 있음 → 대시보드를 렌더한다(리다이렉트 안 함)', () => {
    mockUseAuth.mockReturnValue({ session: fakeSession, user: fakeUser, loading: false } as ReturnType<typeof useAuth>);
    setProfile('수현');

    renderHome();

    expect(screen.getByText('수현님의 편지함')).toBeInTheDocument();
    expect(screen.queryByText('이름 설정 페이지')).not.toBeInTheDocument();
  });

  it('세션 X → 랜딩을 렌더한다', () => {
    mockUseAuth.mockReturnValue({ session: null, user: null, loading: false } as ReturnType<typeof useAuth>);
    setProfile(null);

    renderHome();

    expect(screen.getByText('랜딩 페이지')).toBeInTheDocument();
  });
});
