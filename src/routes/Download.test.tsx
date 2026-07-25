/**
 * Download 라우트 테스트 — 기기 감지별 스토어 강조/순서 + 데스크톱 QR.
 * css:false 환경이라 CSS 모듈 클래스는 검증에 쓰지 않고 DOM 순서·href·aria-label로 확인한다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/lib/device', () => ({
  getMobileOS: vi.fn(),
}));

import Download from './Download';
import { getMobileOS } from '@/lib/device';
import { IOS_DOWNLOAD_URL, ANDROID_DOWNLOAD_URL } from '@/lib/appLinks';

const mockGetOS = vi.mocked(getMobileOS);

function renderPage() {
  return render(
    <MemoryRouter>
      <Download />
    </MemoryRouter>,
  );
}

/** 스토어 링크만 DOM 순서대로 추출(탈출구 '/' 링크는 제외). */
function storeLinks(): HTMLAnchorElement[] {
  return screen
    .getAllByRole('link')
    .filter((el): el is HTMLAnchorElement => {
      const href = el.getAttribute('href') ?? '';
      return href.includes('apps.apple.com') || href.includes('play.google.com');
    });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Download 스토어 버튼', () => {
  it('두 스토어 버튼이 항상 노출되고 href가 카노니컬 URL과 일치한다', () => {
    mockGetOS.mockReturnValue('other');
    renderPage();
    expect(screen.getByText('App Store에서').closest('a')).toHaveAttribute('href', IOS_DOWNLOAD_URL);
    expect(screen.getByText('Google Play에서').closest('a')).toHaveAttribute(
      'href',
      ANDROID_DOWNLOAD_URL,
    );
  });

  it('iPhone에서는 App Store 버튼이 먼저(주 CTA) 오고 QR은 숨는다', () => {
    mockGetOS.mockReturnValue('ios');
    renderPage();
    const links = storeLinks();
    expect(links[0]).toHaveAttribute('href', IOS_DOWNLOAD_URL);
    expect(links[1]).toHaveAttribute('href', ANDROID_DOWNLOAD_URL);
    expect(screen.queryByLabelText('앱 다운로드 QR 코드')).not.toBeInTheDocument();
  });

  it('Android에서는 Google Play 버튼이 먼저 오고 QR은 숨는다', () => {
    mockGetOS.mockReturnValue('android');
    renderPage();
    const links = storeLinks();
    expect(links[0]).toHaveAttribute('href', ANDROID_DOWNLOAD_URL);
    expect(links[1]).toHaveAttribute('href', IOS_DOWNLOAD_URL);
    expect(screen.queryByLabelText('앱 다운로드 QR 코드')).not.toBeInTheDocument();
  });
});

describe('Download 데스크톱 QR', () => {
  it('데스크톱에서는 두 버튼 + QR 코드(SVG)를 함께 보여준다', () => {
    mockGetOS.mockReturnValue('other');
    renderPage();
    expect(storeLinks()).toHaveLength(2);
    const qr = screen.getByLabelText('앱 다운로드 QR 코드');
    expect(qr.tagName.toLowerCase()).toBe('svg');
  });
});

describe('Download 보조 탈출구', () => {
  it('"앱 없이 웹으로 계속" 링크가 /로 간다', () => {
    mockGetOS.mockReturnValue('other');
    renderPage();
    expect(screen.getByText(/웹으로 계속/).closest('a')).toHaveAttribute('href', '/');
  });
});
