// LetterBlockEditor 렌더 테스트 — 블록 순서대로 텍스트 칸·사진 카드, 5장 제한 시 버튼 비활성.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LetterBlockEditor } from './LetterBlockEditor';
import type { ComposeBlock } from './letterBlocks';

function setup(blocks: ComposeBlock[], remainingPhotos: number) {
  const props = {
    blocks,
    photoUrls: { 'o/l/a.jpg': 'https://signed/a' },
    remainingPhotos,
    isAddingPhotos: false,
    photoError: null,
    onChangeText: vi.fn(),
    onFocusText: vi.fn(),
    onAddPhotos: vi.fn(),
    onRemovePhoto: vi.fn(),
  };
  render(<LetterBlockEditor {...props} />);
  return props;
}

describe('LetterBlockEditor', () => {
  it('저장된 사진은 서명 URL로, 대기 사진은 로컬 미리보기로 보이고 빼기를 알린다', () => {
    const props = setup(
      [
        { kind: 'text', id: 't1', text: '앞' },
        { kind: 'photo', id: 'p1', path: 'o/l/a.jpg', width: 3, height: 4 },
        { kind: 'photo', id: 'p2', width: 3, height: 4, previewUrl: 'blob:local' },
        { kind: 'text', id: 't2', text: '' },
      ],
      3,
    );
    const imgs = screen.getAllByRole('img');
    expect(imgs.map((i) => i.getAttribute('src'))).toEqual(['https://signed/a', 'blob:local']);
    fireEvent.click(screen.getByRole('button', { name: '편지 사진 2 빼기' }));
    expect(props.onRemovePhoto).toHaveBeenCalledWith('p2');
    fireEvent.focus(screen.getByLabelText('편지 본문 이어쓰기'));
    expect(props.onFocusText).toHaveBeenCalledWith('t2');
    expect(screen.getByText('사진 2/5')).toBeInTheDocument();
  });

  it('5장을 다 넣으면 사진 넣기 버튼을 끄고 안내한다', () => {
    setup([{ kind: 'text', id: 't1', text: '' }], 0);
    expect(screen.getByRole('button', { name: '사진 넣기' })).toBeDisabled();
    expect(screen.getByText('사진 5장을 모두 넣었어요')).toBeInTheDocument();
  });

  it('파일을 고르면 onAddPhotos로 넘긴다', () => {
    const props = setup([{ kind: 'text', id: 't1', text: '' }], 5);
    const input = screen.getByTestId('photo-input');
    const f = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [f] } });
    expect(props.onAddPhotos).toHaveBeenCalledWith([f]);
  });
});
