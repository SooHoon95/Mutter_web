// InboxList — 받은 편지함 목록 컴포넌트.
// getMyInbox 결과를 카드 형태로 렌더하고, 각 항목에 "열기" 링크(/l/:token)를 제공한다.
// 헤더의 "편집"으로 여러 통을 골라 지울 수 있다(0035). 지운 편지는 받은 편지 삭제함에 30일 보관되고,
// 하단 토스트의 "되돌리기"나 삭제함(/inbox/trash)에서 되살린다.

import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { deleteInboxItems, restoreInboxItems } from '@/data/inbox';
import { UndoToast } from '@/components/UndoToast';
import { useLetterAccessStates } from '@/features/tickets';
import { useInbox } from './useInbox';
import styles from './InboxList.module.css';

/** ISO datetime을 한국어 로컬 날짜 문자열로 변환한다. */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

interface InboxListProps {
  /** 페이지 제목 — 오른쪽에 삭제함·편집 버튼이 같은 줄에 붙는다. */
  title: string;
}

export function InboxList({ title }: InboxListProps): React.ReactElement {
  const { items, isLoading, error, reload } = useInbox();
  // 0037 상태(영구 / n일 남음 / 닫힘). 닫힌 편지도 목록에 남고, 열면 뷰어가 잠김 화면을 보인다.
  const { labelFor } = useLetterAccessStates(items.map((item) => item.letterId));
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // 서버 응답 전에 바로 목록에서 빼 둘 항목(실패하면 되살린다).
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // 방금 지운 묶음 — 토스트의 "되돌리기" 대상. key가 바뀌면 토스트 타이머가 새로 돈다.
  const [undo, setUndo] = useState<{ key: number; ids: string[] } | null>(null);
  const closeToast = useCallback(() => setUndo(null), []);

  const visible = items.filter((item) => !hidden.has(item.letterId));
  const allSelected = visible.length > 0 && visible.every((item) => selected.has(item.letterId));

  function toggleEditing(): void {
    setEditing((prev) => !prev);
    setSelected(new Set());
  }

  function toggle(letterId: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(letterId)) next.delete(letterId);
      else next.add(letterId);
      return next;
    });
  }

  function toggleAll(): void {
    setSelected(allSelected ? new Set() : new Set(visible.map((item) => item.letterId)));
  }

  async function handleDelete(): Promise<void> {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBusy(true);
    setActionError(null);
    setHidden((prev) => new Set([...prev, ...ids]));
    setEditing(false);
    setSelected(new Set());
    try {
      await deleteInboxItems(ids);
      setUndo({ key: Date.now(), ids });
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '편지를 지우지 못했어요');
    } finally {
      // 성공이면 새 목록에 이미 없고, 실패면 다시 보여야 하므로 어느 쪽이든 숨김을 푼다.
      setHidden((prev) => new Set([...prev].filter((id) => !ids.includes(id))));
      setBusy(false);
    }
  }

  async function handleUndo(ids: string[]): Promise<void> {
    try {
      await restoreInboxItems(ids);
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '편지를 되살리지 못했어요');
    }
  }

  const header = (
    <div className={styles.header}>
      <h1 className={styles.heading}>{title}</h1>
      <div className={styles.headerActions}>
        {/* 선택 중엔 화면을 떠나지 않게 숨긴다(앱은 비활성 — 같은 의도). */}
        {!editing && (
          <Link to="/inbox/trash" className={styles.headerLink}>
            삭제함
          </Link>
        )}
        {(visible.length > 0 || editing) && (
          <button type="button" className={styles.editButton} onClick={toggleEditing}>
            {editing ? '완료' : '편집'}
          </button>
        )}
      </div>
    </div>
  );

  const toast =
    undo !== null ? (
      <UndoToast
        key={undo.key}
        message={undo.ids.length === 1 ? '편지를 삭제함으로 옮겼어요' : `${undo.ids.length}통을 삭제함으로 옮겼어요`}
        actionLabel="되돌리기"
        onAction={() => void handleUndo(undo.ids)}
        onClose={closeToast}
      />
    ) : null;

  if (isLoading) {
    return (
      <>
        {header}
        <p className={styles.empty}>불러오는 중…</p>
      </>
    );
  }

  if (error !== null) {
    return (
      <>
        {header}
        <p className={styles.error}>목록을 불러올 수 없습니다: {error.message}</p>
      </>
    );
  }

  return (
    <>
      {header}
      {actionError && <p className={styles.error}>{actionError}</p>}

      {visible.length === 0 ? (
        <p className={styles.empty}>
          아직 저장된 편지가 없어요.
          <br />
          편지를 열어 "받은 편지함에 저장" 버튼을 눌러보세요.
        </p>
      ) : (
        <ul className={styles.list}>
          {visible.map((item) => {
            const isSelected = selected.has(item.letterId);
            const access = labelFor(item.letterId);
            const meta = (
              <div className={styles.meta}>
                <p className={styles.title}>{item.title}</p>
                <p className={styles.sender}>보낸이: {item.senderNickname ?? '알 수 없음'}</p>
                <p className={styles.savedAt}>
                  {formatDate(item.savedAt)} 저장
                  {access && <span className={styles.access}> · {access}</span>}
                </p>
              </div>
            );
            return (
              <li key={item.letterId} className={`${styles.item} ${isSelected ? styles.itemSelected : ''}`}>
                {editing ? (
                  // 편집 모드: 카드 전체가 선택 토글이다(열지 않는다).
                  <button
                    type="button"
                    className={styles.selectRow}
                    onClick={() => toggle(item.letterId)}
                    aria-pressed={isSelected}
                    aria-label={`"${item.title || '편지'}" ${isSelected ? '선택 해제' : '선택'}`}
                  >
                    <span className={`${styles.check} ${isSelected ? styles.checkOn : ''}`} aria-hidden="true">
                      {isSelected ? '✓' : ''}
                    </span>
                    {meta}
                  </button>
                ) : (
                  <>
                    {meta}
                    <div className={styles.actions}>
                      {/* 0019 답장: 보낸이를 알면 그 사람에게 바로 답장 쓰기로 이동. 탈퇴한 사람에게는 보낼 수 없어 숨긴다. */}
                      {item.senderId !== null && !item.senderGone && (
                        <Link to={`/create?to=${item.senderId}`} className={styles.replyLink}>
                          답장
                        </Link>
                      )}
                      <Link to={`/l/${item.token}`} className={styles.openLink}>
                        열기
                      </Link>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {editing && visible.length > 0 && (
        <div className={styles.editBar}>
          <button type="button" className={styles.editBarSecondary} onClick={toggleAll}>
            {allSelected ? '선택 해제' : '전체 선택'}
          </button>
          <button
            type="button"
            className={styles.editBarDelete}
            onClick={() => void handleDelete()}
            disabled={selected.size === 0 || busy}
          >
            삭제 ({selected.size})
          </button>
        </div>
      )}

      {toast}
    </>
  );
}
