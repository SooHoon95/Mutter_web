// 보낸 편지 목록 + 전달 링크 관리 (T7 US-007).
// 각 편지마다 LinkManager를 표시해 링크 발급·revoke·복사를 지원한다.
// 편지별 삭제 버튼 — 삭제함으로 옮기고(0035, 30일 보관) 하단 토스트로 바로 되돌릴 수 있다.

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { listMyLetters, deleteLetter, restoreLetter } from '../data/letters';
import { getMySentWithRecipients } from '../data/threads';
import type { SentWithRecipient } from '../data/threads';
import { getMyLetterOpens } from '../data/opens';
import type { LetterOpenSummary } from '../data/opens';
import type { Letter } from '../data/types';
import { LinkManager, SendChoiceGate, SentLetterDetail } from '../features/delivery';
import { useLetterAccessStates } from '../features/tickets';
import { UndoToast } from '../components/UndoToast';
import styles from './Sent.module.css';

/**
 * letter_id별 수신자 닉네임 목록을 묶는다.
 * 한 편지에 수신자가 여러 명일 수 있고(여러 행), recipient가 null인 행(아직 저장 전)은
 * 수신자로 치지 않는다. 닉네임 미설정 수신자는 '알 수 없음'으로 표시한다.
 */
function groupRecipients(rows: SentWithRecipient[]): Map<string, string[]> {
  const byLetter = new Map<string, string[]>();
  for (const row of rows) {
    if (row.recipientId === null) continue;
    const names = byLetter.get(row.letterId) ?? [];
    names.push(row.recipientNickname ?? '알 수 없음');
    byLetter.set(row.letterId, names);
  }
  return byLetter;
}

export default function Sent(): React.ReactElement {
  const [letters, setLetters] = useState<Letter[]>([]);
  const [recipients, setRecipients] = useState<Map<string, string[]>>(new Map());
  // 읽음 확인(0017): letterId → 열람 요약(횟수/최근 시각).
  const [opens, setOpens] = useState<Map<string, LetterOpenSummary>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  // 삭제 모달 상태
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // 방금 삭제함으로 옮긴 편지 — 토스트의 "되돌리기" 대상. 새로 지우면 key(id)가 바뀌어 타이머가 새로 돈다.
  const [undoTarget, setUndoTarget] = useState<string | null>(null);
  const closeToast = useCallback(() => setUndoTarget(null), []);
  // 0037 상태(영구 / n일 남음 / 닫힘) — 서버 반영 전·실패면 비어 표시만 빠진다.
  const { states: accessStates, labelFor } = useLetterAccessStates(letters.map((l) => l.id));

  const loadData = useCallback(() => {
    setLoading(true);
    // 읽음 확인(0017)은 부가 정보다. 실패해도(미배포·일시 오류) 편지 목록은 보여야 하므로
    // getMyLetterOpens만 non-fatal로 감싼다(빈 배열 폴백 → "열어봤어요" 배지만 생략).
    Promise.all([
      listMyLetters(),
      getMySentWithRecipients(),
      getMyLetterOpens().catch(() => [] as LetterOpenSummary[]),
    ])
      .then(([myLetters, sentRows, openRows]) => {
        setLetters(myLetters);
        setRecipients(groupRecipients(sentRows));
        setOpens(new Map(openRows.map((o) => [o.letterId, o])));
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : '편지 목록 로드 실패'),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function openDeleteModal(id: string): void {
    setDeleteTargetId(id);
    setDeleteError(null);
  }

  function closeDeleteModal(): void {
    if (isDeleting) return;
    setDeleteTargetId(null);
    setDeleteError(null);
  }

  async function handleConfirmDelete(): Promise<void> {
    if (!deleteTargetId) return;
    setDeleteError(null);
    setIsDeleting(true);
    try {
      await deleteLetter(deleteTargetId);
      setUndoTarget(deleteTargetId);
      // 모달 닫고 확장 패널이 열려 있던 편지라면 초기화
      setDeleteTargetId(null);
      setExpanded((prev) => (prev === deleteTargetId ? null : prev));
      // 목록 새로고침
      loadData();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : '편지 삭제 실패');
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleUndo(id: string): Promise<void> {
    try {
      await restoreLetter(id);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '편지를 되살리지 못했어요');
    }
  }

  if (loading) {
    return (
      <main className={styles.page}>
        <h1 className={styles.heading}>보낸 편지</h1>
        <p className={styles.empty}>불러오는 중…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className={styles.page}>
        <h1 className={styles.heading}>보낸 편지</h1>
        <p className={styles.errorMsg}>{error}</p>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.headingRow}>
        <h1 className={styles.heading}>보낸 편지</h1>
        <Link to="/trash" className={styles.trashLink}>
          삭제함
        </Link>
      </div>

      {letters.length === 0 ? (
        <p className={styles.empty}>작성한 편지가 없습니다.</p>
      ) : (
        <ul className={styles.list}>
          {letters.map((letter) => (
            <li key={letter.id} className={styles.card}>
              {/* 편지 헤더 */}
              <div className={styles.cardHeader}>
                <div className={styles.cardMeta}>
                  <p className={styles.cardTitle}>{letter.title || '(제목 없음)'}</p>
                  <p className={styles.cardDate}>
                    {new Date(letter.updatedAt).toLocaleString('ko-KR')}
                    {(() => {
                      const label = labelFor(letter.id);
                      return label ? <span className={styles.cardAccess}> · {label}</span> : null;
                    })()}
                  </p>
                  <p className={styles.cardRecipient}>
                    {(() => {
                      const names = recipients.get(letter.id);
                      return names && names.length > 0
                        ? `받은이: ${names.join(', ')}`
                        : '아직 받은 사람 없음';
                    })()}
                  </p>
                  {/* 읽음 확인(0017): 누군가 이 편지를 열었으면 "열어봤어요" 표시. */}
                  {(() => {
                    const o = opens.get(letter.id);
                    if (!o || o.openCount <= 0) return null;
                    return (
                      <p className={styles.cardOpened}>
                        <span aria-hidden="true">👀</span> 열어봤어요 · {o.openCount}번 · 최근{' '}
                        {new Date(o.lastOpenedAt).toLocaleString('ko-KR')}
                      </p>
                    );
                  })()}
                </div>

                <div className={styles.cardActions}>
                  {/* 0019/#4 이어쓰기 — 저장한 편지를 다시 편집(보관함 역할). */}
                  <Link to={`/create/${letter.id}`} className={styles.btnEdit}>
                    이어쓰기
                  </Link>
                  <button
                    type="button"
                    className={styles.btnLink}
                    onClick={() =>
                      setExpanded((prev) => (prev === letter.id ? null : letter.id))
                    }
                  >
                    {expanded === letter.id ? '링크 닫기' : '링크 관리'}
                  </button>
                  <button
                    type="button"
                    className={styles.btnDeleteCard}
                    onClick={() => openDeleteModal(letter.id)}
                    aria-label={`"${letter.title || '편지'}" 삭제`}
                  >
                    삭제
                  </button>
                </div>
              </div>

              {/* 링크 관리 패널 */}
              {expanded === letter.id && (
                <div className={styles.linkPanel}>
                  {/* 보내기 전 선택 — 아직 링크가 없는 14일 편지면 링크 발급 전에 영구/14일을 묻는다. */}
                  <SendChoiceGate
                    letterId={letter.id}
                    before={(unsent) => (
                      <SentLetterDetail
                        letterId={letter.id}
                        access={accessStates.get(letter.id)}
                        hidePermanent={unsent}
                      />
                    )}
                  >
                    <LinkManager letterId={letter.id} />
                  </SendChoiceGate>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* 편지 삭제 확인 모달 */}
      {deleteTargetId !== null && (
        <div
          className={styles.modal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-letter-modal-title"
        >
          <div className={styles.modalCard}>
            <h2 id="delete-letter-modal-title" className={styles.modalTitle}>
              편지를 삭제함으로 옮길까요?
            </h2>
            {/* 0041 삭제는 계정 단위 — 받은 편지함에 가진 사람은 계속 연다. 링크로만 읽던 사람에게는 닫힌다. */}
            <p className={styles.modalBody}>
              이미 받은 분의 편지함에는 남아요. 아직 받지 않은 분은 링크로 열 수 없게 돼요. 삭제함에서
              30일 안에 되살릴 수 있어요.
            </p>
            {deleteError && <p className={styles.errorMsg}>{deleteError}</p>}
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.btnCancel}
                onClick={closeDeleteModal}
                disabled={isDeleting}
              >
                취소
              </button>
              <button
                type="button"
                className={styles.btnConfirmDelete}
                onClick={() => void handleConfirmDelete()}
                disabled={isDeleting}
              >
                {isDeleting ? '옮기는 중…' : '삭제'}
              </button>
            </div>
          </div>
        </div>
      )}

      {undoTarget !== null && (
        <UndoToast
          key={undoTarget}
          message="편지를 삭제함으로 옮겼어요"
          actionLabel="되돌리기"
          onAction={() => void handleUndo(undoTarget)}
          onClose={closeToast}
        />
      )}
    </main>
  );
}
