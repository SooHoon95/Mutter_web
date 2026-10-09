// ScSearchPanel — SC 검색 새 탭 열기, 검색 복귀 시 강조, 클립보드 URL 추출·실패 시 안내+포커스.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ScSearchPanel } from './ScSearchPanel';

function setup() {
  const props = {
    isValidating: false,
    urlInputRef: createRef<HTMLInputElement>(),
    onClipboardStart: vi.fn(),
    onClipboardUrl: vi.fn(async () => {}),
  };
  render(
    <ScSearchPanel {...props}>
      <input aria-label="붙여넣기 칸" ref={props.urlInputRef} />
    </ScSearchPanel>,
  );
  return props;
}

function mockClipboard(readText: (() => Promise<string>) | undefined) {
  Object.defineProperty(navigator, 'clipboard', {
    value: readText ? { readText: vi.fn(readText) } : undefined,
    configurable: true,
  });
}

describe('ScSearchPanel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('SoundCloud에서 찾기는 검색어를 담아 새 탭으로 연다', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    setup();
    fireEvent.change(screen.getByLabelText('SoundCloud에서 곡 찾기'), { target: { value: '밤편지' } });
    fireEvent.click(screen.getByRole('button', { name: 'SoundCloud에서 찾기' }));
    expect(open).toHaveBeenCalledWith(
      'https://soundcloud.com/search/sounds?q=%EB%B0%A4%ED%8E%B8%EC%A7%80',
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('검색을 연 뒤 화면으로 돌아오면 복사한 곡 넣기를 강조한다', () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    setup();
    const pasteBtn = screen.getByRole('button', { name: '복사한 곡 넣기' });
    const base = pasteBtn.className;
    fireEvent.click(screen.getByRole('button', { name: 'SoundCloud에서 찾기' }));
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(pasteBtn.className).not.toBe(base);
  });

  it('공유 문구에서 SC URL만 뽑아 부모 검증 경로로 넘긴다', async () => {
    mockClipboard(async () => 'Listen to X on #SoundCloud https://on.soundcloud.com/abc');
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: '복사한 곡 넣기' }));
    await waitFor(() =>
      expect(props.onClipboardUrl).toHaveBeenCalledWith('https://on.soundcloud.com/abc'),
    );
    expect(props.onClipboardStart).toHaveBeenCalled();
  });

  it('클립보드 권한이 거부되면 안내하고 붙여넣기 칸으로 포커스를 옮긴다', async () => {
    mockClipboard(async () => {
      throw new DOMException('denied', 'NotAllowedError');
    });
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: '복사한 곡 넣기' }));
    expect(await screen.findByRole('status')).toHaveTextContent('복사한 링크를 읽지 못했어요');
    expect(screen.getByLabelText('붙여넣기 칸')).toHaveFocus();
    expect(props.onClipboardUrl).not.toHaveBeenCalled();
  });

  it('클립보드 API가 없거나 SC 링크가 없으면 각각 안내한다', async () => {
    mockClipboard(undefined);
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: '복사한 곡 넣기' }));
    expect(await screen.findByRole('status')).toHaveTextContent('복사한 링크를 읽지 못했어요');

    mockClipboard(async () => '그냥 메모');
    fireEvent.click(screen.getByRole('button', { name: '복사한 곡 넣기' }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('SoundCloud 링크가 없어요'),
    );
    expect(screen.getByLabelText('붙여넣기 칸')).toHaveFocus();
    expect(props.onClipboardUrl).not.toHaveBeenCalled();
  });
});
