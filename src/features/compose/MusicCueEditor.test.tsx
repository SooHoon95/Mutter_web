// MusicCueEditor — 클립보드로 가져온 곡도 붙여넣기와 같은 단일 검증 경로로 큐가 된다.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MusicCueEditor } from './MusicCueEditor';
import { validateScUrl } from '@/lib/scOembed';

vi.mock('@/lib/scOembed', () => ({ validateScUrl: vi.fn() }));

describe('MusicCueEditor', () => {
  it('클립보드 공유 문구의 SC URL을 기존 검증 경로로 큐에 넣는다', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { readText: vi.fn(async () => 'Listen on #SoundCloud https://on.soundcloud.com/abc') },
      configurable: true,
    });
    vi.mocked(validateScUrl).mockResolvedValue({
      ok: true,
      canonicalUrl: 'https://api.soundcloud.com/tracks/1',
      title: 'X',
      author: 'A',
    } as Awaited<ReturnType<typeof validateScUrl>>);
    const onChange = vi.fn();
    render(<MusicCueEditor cue={undefined} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'SoundCloud URL 붙여넣기' }));
    fireEvent.click(screen.getByRole('button', { name: '복사한 곡 넣기' }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(validateScUrl).toHaveBeenCalledWith('https://on.soundcloud.com/abc');
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: 'soundcloud',
        ref: 'https://api.soundcloud.com/tracks/1',
        sourceUrl: 'https://on.soundcloud.com/abc',
      }),
    );
  });
});
