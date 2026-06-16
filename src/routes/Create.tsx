// 편지 작성 라우트. T5(US-003) + T6(US-006) + 보내기(링크 발급) 통합.
// RequireAuth는 router.tsx에서 이미 감싸므로 여기서 중복 적용하지 않는다.
// /create/:id → 기존 초안 편집 (id 없으면 신규 초안).
//
// 흐름: 작성 → "저장" → (저장되면) "보내기" 섹션에서 전달 링크 발급 → URL 복사 → 전달.

import { useParams } from 'react-router-dom';
import { useLetterDraft, ParagraphEditor } from '@/features/compose';
import { TemplatePicker, TemplatePreview, DEFAULT_TEMPLATE_ID } from '@/features/templates';
import { LinkManager } from '@/features/delivery';
import styles from './Create.module.css';

export default function Create(): React.ReactElement {
  const { id } = useParams<{ id?: string }>();
  const {
    draft,
    isSaving,
    saveError,
    setTitle,
    setTemplateId,
    addParagraph,
    updateParagraphText,
    deleteParagraph,
    moveParagraph,
    setCue,
    save,
  } = useLetterDraft(id ?? null, DEFAULT_TEMPLATE_ID);

  function handleSave(): void {
    void save();
  }

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.heading}>편지 쓰기</h1>
        <div className={styles.headerActions}>
          {isSaving && <span className={styles.savingBadge}>저장 중…</span>}
          {draft.letterId && !isSaving && (
            <span className={styles.savedBadge}>저장됨</span>
          )}
          <button
            type="button"
            className={styles.saveBtn}
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? '저장 중…' : draft.letterId ? '저장' : '저장하고 보내기 준비'}
          </button>
        </div>
      </div>

      {/* 저장 오류 표시 */}
      {saveError && (
        <div className={styles.errorBanner} role="alert">
          저장 실패: {saveError.message}
        </div>
      )}

      {/* 템플릿 선택 — T6 US-006 (이제 draft.templateId로 저장됨) */}
      <section className={styles.templateSection}>
        <TemplatePicker selectedId={draft.templateId} onSelect={setTemplateId} />
        <TemplatePreview
          templateId={draft.templateId}
          title={draft.title}
          sampleText={draft.paragraphs[0]?.text}
        />
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

      {/* 보내기 — 전달 링크 발급. 저장 후(letterId 존재)에만 노출. */}
      <section className={styles.sendSection}>
        <h2 className={styles.sectionHeading}>보내기</h2>
        {draft.letterId ? (
          <>
            <p className={styles.sectionDesc}>
              전달 링크를 만들어 수신자에게 보내세요. 암호는 기본으로 켜져 있고, 링크를 연 첫
              기기에 귀속됩니다.
            </p>
            <LinkManager letterId={draft.letterId} />
          </>
        ) : (
          <p className={styles.sendHint}>
            먼저 <strong>“저장하고 보내기 준비”</strong>를 누르면, 여기에서 전달 링크를 만들어
            보낼 수 있어요.
          </p>
        )}
      </section>
    </main>
  );
}
