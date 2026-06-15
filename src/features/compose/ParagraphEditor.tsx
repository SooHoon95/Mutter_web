// 단락 추가/편집/삭제/재정렬 컴포넌트.
// key는 안정적 단락 id 사용 — 인덱스 key 금지(재정렬 시 DOM 재생성 방지).

import type { Paragraph, MusicCue } from '@/data/types';
import { MusicCueEditor } from './MusicCueEditor';
import styles from './ParagraphEditor.module.css';

interface ParagraphEditorProps {
  paragraphs: Paragraph[];
  onTextChange: (id: string, text: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, direction: 'up' | 'down') => void;
  onCueChange: (paragraphId: string, cue: MusicCue | undefined) => void;
  onAddParagraph: () => void;
}

export function ParagraphEditor({
  paragraphs,
  onTextChange,
  onDelete,
  onMove,
  onCueChange,
  onAddParagraph,
}: ParagraphEditorProps): React.ReactElement {
  return (
    <div className={styles.container}>
      <ol className={styles.list}>
        {paragraphs.map((para, idx) => (
          <li key={para.id} className={styles.item}>
            {/* 단락 헤더: 순서 + 이동/삭제 버튼 */}
            <div className={styles.header}>
              <span className={styles.order} aria-label={`단락 ${idx + 1}`}>
                {idx + 1}
              </span>
              <div className={styles.controls}>
                <button
                  type="button"
                  className={styles.controlBtn}
                  onClick={() => onMove(para.id, 'up')}
                  disabled={idx === 0}
                  aria-label="위로 이동"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className={styles.controlBtn}
                  onClick={() => onMove(para.id, 'down')}
                  disabled={idx === paragraphs.length - 1}
                  aria-label="아래로 이동"
                >
                  ↓
                </button>
                <button
                  type="button"
                  className={styles.deleteBtn}
                  onClick={() => onDelete(para.id)}
                  disabled={paragraphs.length <= 1}
                  aria-label="단락 삭제"
                >
                  삭제
                </button>
              </div>
            </div>

            {/* 단락 텍스트 편집 영역 */}
            <textarea
              className={styles.textarea}
              value={para.text}
              onChange={(e) => onTextChange(para.id, e.target.value)}
              placeholder="이 단락의 내용을 입력하세요…"
              rows={4}
              aria-label={`단락 ${idx + 1} 내용`}
            />

            {/* 단락별 음악 큐 에디터 */}
            <div className={styles.cueSection}>
              <p className={styles.cueTitle}>이 단락의 음악 큐</p>
              <MusicCueEditor
                paragraphId={para.id}
                cue={para.cue}
                onCueChange={onCueChange}
              />
            </div>
          </li>
        ))}
      </ol>

      <button type="button" className={styles.addBtn} onClick={onAddParagraph}>
        + 단락 추가
      </button>
    </div>
  );
}
