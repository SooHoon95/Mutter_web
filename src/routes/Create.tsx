// 편지 작성 라우트. T5(US-003) + T6(US-006) + 보내기(링크 발급) 통합.
// RequireAuth는 router.tsx에서 이미 감싸므로 여기서 중복 적용하지 않는다.
// /create/:id → 기존 초안 편집 (id 없으면 신규 초안).
//
// 컴포즈 모델은 "테마 즉시적용 WYSIWYG": 템플릿을 고르면 그 자리에서 편지지에 반영되고,
// 사용자는 테마(폰트·색·종이결)가 입혀진 편지지 위에서 제목·본문을 바로 타이핑한다.
// 음악은 편지당 1곡. 단락 추가/이동/삭제 UI는 없다(저장 시 빈 줄 기준으로 자동 분리).
//
// 흐름: 작성 → "저장" → (저장되면) "보내기" 섹션에서 전달 링크 발급 → URL 복사 → 전달.

import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useLetterDraft, MusicCueEditor } from '@/features/compose';
import { TemplatePicker, TemplateThemed, DEFAULT_TEMPLATE_ID } from '@/features/templates';
import { LinkManager } from '@/features/delivery';
import { SendToConnection, useConnections } from '@/features/connections';
import styles from './Create.module.css';

// 보내기 방식 — 'link'는 연결 안 된 사람용 전달 링크, 'connection'은 연결된 사람 직접 발송.
type SendMode = 'link' | 'connection';

export default function Create(): React.ReactElement {
  const { id } = useParams<{ id?: string }>();
  // 0019 답장 플로우: /create?to=<userId>로 진입하면 "연결된 사람에게 보내기"를 기본 탭으로,
  // 그 상대를 SendToConnection에서 자동 선택한다(연결된 경우).
  const [searchParams] = useSearchParams();
  const replyTo = searchParams.get('to');
  const [sendMode, setSendMode] = useState<SendMode>(replyTo ? 'connection' : 'link');

  // 답장 상대가 연결 목록에 있는지 확인 — 없으면 전달 링크 모드로 전환한다.
  const { connections, isLoading: isConnectionsLoading } = useConnections();
  const isReplyToConnected = replyTo !== null && connections.some((c) => c.userId === replyTo);

  // 연결 목록 로딩 완료 후, 답장 상대가 연결 안 돼 있으면 링크 모드로 자동 전환.
  useEffect(() => {
    if (replyTo && !isConnectionsLoading && !isReplyToConnected) {
      setSendMode('link');
    }
  }, [replyTo, isConnectionsLoading, isReplyToConnected]);

  const titleInputRef = useRef<HTMLInputElement>(null);
  const {
    draft,
    isLoading,
    isSaving,
    saveError,
    setTitle,
    setBody,
    setTemplateId,
    setCue,
    save,
  } = useLetterDraft(id ?? null, DEFAULT_TEMPLATE_ID);

  function handleSave(): void {
    void save().then((result) => {
      // 빈 제목으로 차단되면 제목 입력으로 포커스를 옮긴다.
      if (!result.ok && result.reason === 'empty-title') {
        titleInputRef.current?.focus();
      }
    });
  }

  // 기존 편지를 불러오는 중에는 빈 폼 대신 안내를 표시한다.
  // (로딩 중 저장이 빈 초안으로 기존 편지를 덮어쓰는 것도 hook에서 함께 막는다.)
  if (isLoading) {
    return (
      <main className={styles.page}>
        <div className={styles.header}>
          <h1 className={styles.heading}>편지 쓰기</h1>
        </div>
        <p className={styles.loadingHint} role="status" aria-live="polite">
          편지를 불러오는 중…
        </p>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.heading}>편지 쓰기</h1>
      </div>

      {/* 0019 답장 모드 안내 — /create?to=<id>로 들어왔을 때만. */}
      {replyTo && (
        <p className={styles.replyChip} role="note">
          {isReplyToConnected
            ? <>↩︎ 답장을 쓰고 있어요. 저장한 뒤 <strong>’연결된 사람에게 보내기’</strong>에서 상대가 자동으로 선택돼요.</>
            : <>↩︎ 답장을 쓰고 있어요. 상대와 연결되지 않아 <strong>전달 링크</strong>로 보내세요.</>
          }
        </p>
      )}

      {/* 저장 오류 표시 */}
      {saveError && (
        <div className={styles.errorBanner} role="alert">
          저장 실패: {saveError.message}
        </div>
      )}

      {/* 템플릿 선택 — 선택 즉시 아래 편지지에 반영(WYSIWYG) */}
      <section className={styles.templateSection}>
        <TemplatePicker selectedId={draft.templateId} onSelect={setTemplateId} />
      </section>

      {/* 편지지 — 테마가 입혀진 상태로 제목·본문을 바로 타이핑한다. */}
      <TemplateThemed templateId={draft.templateId} className={styles.paper}>
        <input
          ref={titleInputRef}
          type="text"
          className={styles.paperTitle}
          placeholder="편지 제목"
          aria-label="편지 제목"
          value={draft.title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <hr className={styles.paperDivider} />
        <textarea
          className={styles.paperBody}
          placeholder="여기에 편지를 써 내려가세요. 빈 줄로 문단을 나누면 받는 사람에게도 그대로 보여요."
          aria-label="편지 본문"
          value={draft.body}
          onChange={(e) => setBody(e.target.value)}
          rows={10}
        />
      </TemplateThemed>

      {/* 음악 — 편지당 1곡 */}
      <section className={styles.musicSection}>
        <h2 className={styles.sectionHeading}>편지 음악</h2>
        <p className={styles.sectionDesc}>
          편지에 어울리는 음악 한 곡을 고르세요. 수신자가 편지를 읽는 동안 흐릅니다.
        </p>
        <MusicCueEditor cue={draft.cue} onChange={setCue} />
      </section>

      {/* 저장 — 작성 영역 맨 아래. 저장해야 아래 "보내기"에서 링크를 만들 수 있다. */}
      <section className={styles.saveSection}>
        <div className={styles.saveStatus}>
          {isSaving && <span className={styles.savingBadge}>저장 중…</span>}
          {draft.letterId && !isSaving && <span className={styles.savedBadge}>저장됨</span>}
        </div>
        <button
          type="button"
          className={styles.saveBtnLarge}
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? '저장 중…' : draft.letterId ? '저장하기' : '저장하고 보내기 준비'}
        </button>
      </section>

      {/* 보내기 — 전달 링크 발급. 저장 후(letterId 존재)에만 노출. */}
      <section className={styles.sendSection}>
        <h2 className={styles.sectionHeading}>보내기</h2>
        {draft.letterId ? (
          <>
            {/* 보내기 방식 탭 — 연결 안 된 사람(링크) vs 연결된 사람(직접 발송) */}
            <div className={styles.sendTabs} role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={sendMode === 'link'}
                className={`${styles.sendTab} ${sendMode === 'link' ? styles.sendTabActive : ''}`}
                onClick={() => setSendMode('link')}
              >
                전달 링크
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={sendMode === 'connection'}
                className={`${styles.sendTab} ${sendMode === 'connection' ? styles.sendTabActive : ''}`}
                onClick={() => setSendMode('connection')}
              >
                연결된 사람에게 보내기
              </button>
            </div>

            {sendMode === 'link' ? (
              <>
                <p className={styles.sectionDesc}>
                  전달 링크를 만들어 수신자에게 보내세요. 암호는 기본으로 켜져 있어요. 받는 사람은
                  어느 기기·폰·PC에서든 열 수 있어요.
                </p>
                <LinkManager letterId={draft.letterId} />
              </>
            ) : (
              <>
                <p className={styles.sectionDesc}>
                  연결된 사람을 골라 링크 없이 바로 받은 편지함으로 보낼 수 있어요.
                </p>
                <SendToConnection letterId={draft.letterId} preselectId={replyTo} />
              </>
            )}
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
