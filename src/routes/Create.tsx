// 편지 작성 라우트. T5(US-003) + T6(US-006) 구현.
// RequireAuth는 router.tsx에서 이미 감싸므로 여기서 중복 적용하지 않는다.
// /create/:id → 기존 초안 편집 (id 없으면 신규 초안).

import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useLetterDraft } from '@/features/compose';
import { ParagraphEditor } from '@/features/compose';
import { TemplatePicker, DEFAULT_TEMPLATE_ID } from '@/features/templates';
import styles from './Create.module.css';

export default function Create(): React.ReactElement {
  const { id } = useParams<{ id?: string }>();
  const {
    draft,
    isSaving,
    saveError,
    setTitle,
    addParagraph,
    updateParagraphText,
    deleteParagraph,
    moveParagraph,
    setCue,
    save,
  } = useLetterDraft(id ?? null);

  // 템플릿 선택 상태 — draft.templateId로 저장 연동은 useLetterDraft 확장 시 추가.
  // T6 범위에서는 로컬 상태로 선택·표시하고, templateId를 편지에 보존할 준비를 한다.
  const [templateId, setTemplateId] = useState<string>(DEFAULT_TEMPLATE_ID);

  function handleSave(): void {
    void save();
  }

  function handleTemplateSelect(newId: string): void {
    setTemplateId(newId);
  }

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.heading}>편지 쓰기</h1>
        <div className={styles.headerActions}>
          {/* 초안 저장 상태 표시 */}
          {isSaving && <span className={styles.savingBadge}>저장 중…</span>}
          {draft.letterId && !isSaving && (
            <span className={styles.savedBadge}>초안 저장됨</span>
          )}
          <button
            type="button"
            className={styles.saveBtn}
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>

      {/* 저장 오류 표시 */}
      {saveError && (
        <div className={styles.errorBanner} role="alert">
          저장 실패: {saveError.message}
          {!draft.letterId && (
            <span className={styles.errorHint}>
              {' '}— Supabase 크리덴셜(.env)을 설정하면 저장이 활성화됩니다.
            </span>
          )}
        </div>
      )}

      {/* 템플릿 선택 — T6 US-006 */}
      <section className={styles.templateSection}>
        <TemplatePicker selectedId={templateId} onSelect={handleTemplateSelect} />
      </section>

      {/* 편지 제목 */}
      <div className={styles.titleSection}>
        <label htmlFor="letter-title" className={styles.label}>
          제목
        </label>
        <input
          id="letter-title"
          type="text"
          className={styles.titleInput}
          placeholder="편지 제목을 입력하세요"
          value={draft.title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      {/* 단락 + 음악 큐 에디터 */}
      <section className={styles.paragraphSection}>
        <h2 className={styles.sectionHeading}>단락별 내용 + 음악 큐</h2>
        <p className={styles.sectionDesc}>
          각 단락에 어울리는 음악 큐를 지정하면 수신자가 그 단락을 읽을 때 음악이 차오릅니다.
        </p>
        <ParagraphEditor
          paragraphs={draft.paragraphs}
          onTextChange={updateParagraphText}
          onDelete={deleteParagraph}
          onMove={moveParagraph}
          onCueChange={setCue}
          onAddParagraph={addParagraph}
        />
      </section>
    </main>
  );
}
