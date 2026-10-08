// 본문 블록 편집기 — 텍스트 칸(textarea)과 사진 카드(이미지 + 빼기)를 순서대로 그린다.
// 편지지(TemplateThemed) 안에 놓여 테마 폰트·색을 그대로 입는다. 상태는 useLetterDraft가 가진다.
// "사진 넣기"는 숨긴 file input을 연다(여러 장, 편지당 최대 5장 — 다 차면 버튼을 끄고 안내).

import { useRef, useState, useEffect } from 'react';
import { MAX_PHOTOS } from './letterBlocks';
import type { ComposeBlock, PhotoBlock } from './letterBlocks';
import type { PhotoUrlMap } from '@/data/letterPhotos';
import styles from './LetterBlockEditor.module.css';

export interface LetterBlockEditorProps {
  blocks: ComposeBlock[];
  photoUrls: PhotoUrlMap;
  remainingPhotos: number;
  isAddingPhotos: boolean;
  photoError: string | null;
  onChangeText: (blockId: string, text: string) => void;
  onFocusText: (blockId: string) => void;
  onAddPhotos: (files: File[]) => void;
  onRemovePhoto: (blockId: string) => void;
}

const FIRST_PLACEHOLDER =
  '여기에 편지를 써 내려가세요. 빈 줄로 문단을 나누면 받는 사람에게도 그대로 보여요.';
const NEXT_PLACEHOLDER = '이어서 써 내려가세요.';

function PhotoCard({
  block,
  src,
  index,
  onRemove,
}: {
  block: PhotoBlock;
  src: string | undefined;
  index: number;
  onRemove: () => void;
}): React.ReactElement {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  const showImage = !!src && !broken;

  return (
    <figure className={styles.photoCard}>
      <div
        className={styles.photoFrame}
        // 이미지가 오기 전에도 비율대로 자리를 잡아 아래 텍스트 칸이 튀지 않게 한다.
        style={{ aspectRatio: `${block.width || 4} / ${block.height || 3}` }}
      >
        {showImage ? (
          <img
            className={styles.photoImg}
            src={src}
            alt={`편지 사진 ${index}`}
            onError={() => setBroken(true)}
          />
        ) : (
          <span className={styles.photoNote}>
            {broken ? '사진을 불러오지 못했어요' : '사진 불러오는 중…'}
          </span>
        )}
      </div>
      <button
        type="button"
        className={styles.removeBtn}
        onClick={onRemove}
        aria-label={`편지 사진 ${index} 빼기`}
      >
        빼기
      </button>
    </figure>
  );
}

export function LetterBlockEditor({
  blocks,
  photoUrls,
  remainingPhotos,
  isAddingPhotos,
  photoError,
  onChangeText,
  onFocusText,
  onAddPhotos,
  onRemovePhoto,
}: LetterBlockEditorProps): React.ReactElement {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const firstTextId = blocks.find((b) => b.kind === 'text')?.id;
  const hasPhotos = remainingPhotos < MAX_PHOTOS;
  let photoIndex = 0;

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>): void {
    const files = Array.from(e.target.files ?? []);
    // 같은 파일을 다시 골라도 change가 오도록 비운다.
    e.target.value = '';
    if (files.length > 0) onAddPhotos(files);
  }

  return (
    <div className={styles.editor}>
      {blocks.map((block) => {
        if (block.kind === 'photo') {
          photoIndex += 1;
          return (
            <PhotoCard
              key={block.id}
              block={block}
              src={block.previewUrl ?? (block.path ? photoUrls[block.path] : undefined)}
              index={photoIndex}
              onRemove={() => onRemovePhoto(block.id)}
            />
          );
        }
        const isFirst = block.id === firstTextId;
        return (
          <textarea
            key={block.id}
            className={`${styles.textBlock} ${isFirst && !hasPhotos ? styles.textBlockMain : ''}`}
            placeholder={isFirst ? FIRST_PLACEHOLDER : NEXT_PLACEHOLDER}
            aria-label={isFirst ? '편지 본문' : '편지 본문 이어쓰기'}
            value={block.text}
            onChange={(e) => onChangeText(block.id, e.target.value)}
            onFocus={() => onFocusText(block.id)}
            rows={isFirst && !hasPhotos ? 10 : 3}
          />
        );
      })}

      <div className={styles.photoBar}>
        <button
          type="button"
          className={styles.addPhotoBtn}
          onClick={() => fileInputRef.current?.click()}
          disabled={remainingPhotos === 0 || isAddingPhotos}
        >
          {isAddingPhotos ? '사진 준비 중…' : '사진 넣기'}
        </button>
        <span className={styles.photoCount} aria-live="polite">
          {remainingPhotos === 0
            ? `사진 ${MAX_PHOTOS}장을 모두 넣었어요`
            : `사진 ${MAX_PHOTOS - remainingPhotos}/${MAX_PHOTOS}`}
        </span>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={handleFiles}
          data-testid="photo-input"
        />
      </div>
      {photoError && (
        <p className={styles.photoError} role="alert">
          {photoError}
        </p>
      )}
    </div>
  );
}
