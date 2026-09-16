/**
 * LetterEndCta — 3단 CTA 순서·캠페인 토큰·OS 분기(모바일 스토어 / 데스크톱 QR)·로그인 상태.
 * css:false 환경이라 DOM 순서·href·텍스트로만 검증한다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/lib/device', () => ({ getMobileOS: vi.fn() }));
vi.mock('@/app/AuthProvider', () => ({ useAuth: vi.fn() }));

import { LetterEndCta } from './LetterEndCta';
import { getMobileOS } from '@/lib/device';
import { useAuth } from '@/app/AuthProvider';

const mockOS = vi.mocked(getMobileOS);
const mockAuth = vi.mocked(useAuth);

function renderCta() {
  return render(
    <MemoryRouter>
      <LetterEndCta />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockReturnValue({ user: null } as unknown as ReturnType<typeof useAuth>);
});

describe('LetterEndCta', () => {
  it('iOS: 답장 → 받은편지함 → 나도 보내기 순서, 각각 캠페인 토큰', () => {
    mockOS.mockReturnValue('ios');
    renderCta();
    const reply = screen.getByRole('link', { name: '노래 한 곡으로 답장하기' });
    expect(reply.getAttribute('href')).toContain('ct=viewer_reply');
    const save = screen.getByRole('button', { name: /이 편지, 받은편지함에 두기/ });
    const send = screen.getByRole('link', { name: /나도 누군가에게 노래 한 곡 보내기/ });
    expect(send.getAttribute('href')).toContain('ct=viewer_send');
    // DOM 순서
    expect(reply.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(save.compareDocumentPosition(send) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('Android: Play referrer에 utm_campaign을 싣는다', () => {
    mockOS.mockReturnValue('android');
    renderCta();
    const reply = screen.getByRole('link', { name: '노래 한 곡으로 답장하기' });
    expect(reply.getAttribute('href')).toContain('play.google.com');
    expect(reply.getAttribute('href')).toContain('utm_campaign%3Dviewer_reply');
  });

  it('데스크톱: 스토어 대신 QR + "휴대폰에서 이어 하기"', () => {
    mockOS.mockReturnValue('other');
    renderCta();
    expect(screen.queryByRole('link', { name: '노래 한 곡으로 답장하기' })).toBeNull();
    expect(screen.getByText('휴대폰에서 이어 하기')).toBeTruthy();
  });

  it('로그인 수신자: 저장 CTA 대신 "저장됐어요"(서버 자동 저장)', () => {
    mockOS.mockReturnValue('ios');
    mockAuth.mockReturnValue({ user: { id: 'u1' } } as unknown as ReturnType<typeof useAuth>);
    renderCta();
    expect(screen.getByText('받은편지함에 저장됐어요')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /받은편지함에 두기/ })).toBeNull();
  });

  it('워드마크 한 줄이 있다', () => {
    mockOS.mockReturnValue('ios');
    renderCta();
    expect(screen.getByText('뮤터 · 음악 편지')).toBeTruthy();
  });
});
