/**
 * Paginated 사진 단락(0034) 렌더 테스트.
 *
 * 핵심 AC:
 *  - 사진 단락은 텍스트 자리에 사진 한 장(비율 유지·lazy·alt)으로 그려진다.
 *  - URL을 받기 전엔 같은 비율의 로딩 플레이스홀더, 실패면 차분한 실패 플레이스홀더.
 *  - 사진이 있어도 텍스트 단락은 그대로 렌더된다(본문 무손실).
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Paginated } from './Paginated';
import { toPaginatedParagraphs } from './toPaginated';
import type { Paragraph } from '@/data/types';

const PATH = 'owner/letter/a.jpg';
const paragraphs: Paragraph[] = [
  { id: 't1', order: 0, text: '첫 글' },
  { id: 'ph', order: 1, text: '', photo: { path: PATH, width: 1536, height: 2048 } },
  { id: 't2', order: 2, text: '끝 글' },
];

function photoFrame(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>('[data-paragraph-id="ph"] [data-photo-state]');
  if (!el) throw new Error('photo frame not found');
  return el;
}

describe('toPaginatedParagraphs', () => {
  it('URL 맵에서 path로 src를 찾고, 맵에 없으면 failed, 아직 null이면 로딩', () => {
    expect(toPaginatedParagraphs(paragraphs, { [PATH]: 'https://s/a' })[1].photo).toEqual({
      width: 1536,
      height: 2048,
      src: 'https://s/a',
      failed: false,
    });
    expect(toPaginatedParagraphs(paragraphs, {})[1].photo?.failed).toBe(true);
    expect(toPaginatedParagraphs(paragraphs, null)[1].photo).toMatchObject({ failed: false });
    expect(toPaginatedParagraphs(paragraphs, null, true)[1].photo?.failed).toBe(true);
    // 텍스트 단락은 photo 없이 그대로.
    expect(toPaginatedParagraphs(paragraphs, null)[0]).toEqual({ id: 't1', text: '첫 글' });
  });
});

describe('Paginated — 사진 단락', () => {
  it('URL이 있으면 비율 유지·lazy·alt를 갖춘 img를 텍스트 단락 사이에 그린다', () => {
    const { container } = render(
      <Paginated paragraphs={toPaginatedParagraphs(paragraphs, { [PATH]: 'https://s/a' })} />,
    );
    const img = screen.getByAltText('편지에 담긴 사진') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('https://s/a');
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.getAttribute('width')).toBe('1536');
    expect(img.getAttribute('height')).toBe('2048');
    expect(photoFrame(container).style.aspectRatio).toBe('1536 / 2048');
    // 순서: 첫 글 → 사진 → 끝 글
    const ids = [...container.querySelectorAll('[data-paragraph-id]')].map((el) =>
      el.getAttribute('data-paragraph-id'),
    );
    expect(ids).toEqual(['t1', 'ph', 't2']);
    expect(screen.getByText('첫 글')).toBeInTheDocument();
    expect(screen.getByText('끝 글')).toBeInTheDocument();
  });

  it('URL을 받기 전엔 같은 비율의 로딩 플레이스홀더(img 없음)', () => {
    const { container } = render(<Paginated paragraphs={toPaginatedParagraphs(paragraphs, null)} />);
    expect(screen.queryByAltText('편지에 담긴 사진')).toBeNull();
    expect(photoFrame(container).dataset.photoState).toBe('loading');
    expect(photoFrame(container).style.aspectRatio).toBe('1536 / 2048');
  });

  it('URL 요청이 실패하면 실패 플레이스홀더, 본문은 그대로', () => {
    const { container } = render(
      <Paginated paragraphs={toPaginatedParagraphs(paragraphs, null, true)} />,
    );
    expect(photoFrame(container).dataset.photoState).toBe('failed');
    expect(screen.getByText('사진을 불러오지 못했어요')).toBeInTheDocument();
    expect(screen.getByText('첫 글')).toBeInTheDocument();
  });

  it('이미지 로드가 깨지면(만료 URL 등) 실패 플레이스홀더로 바뀐다', () => {
    const { container } = render(
      <Paginated paragraphs={toPaginatedParagraphs(paragraphs, { [PATH]: 'https://s/a' })} />,
    );
    fireEvent.error(screen.getByAltText('편지에 담긴 사진'));
    expect(photoFrame(container).dataset.photoState).toBe('failed');
  });

  it('reveal 모드에서 사진도 한 줄처럼 드러날 대상(data-reveal-line)이 된다', () => {
    const { container } = render(
      <Paginated
        paragraphs={toPaginatedParagraphs(paragraphs, { [PATH]: 'https://s/a' })}
        revealOnScroll
      />,
    );
    expect(container.querySelector('[data-paragraph-id="ph"] figure[data-reveal-line]')).not.toBeNull();
  });
});
