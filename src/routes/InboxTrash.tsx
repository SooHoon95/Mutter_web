// 받은 편지 삭제함 (/inbox/trash, 0035). 받은 편지함에서 지운 편지는 30일 보관 뒤 서버가 지운다.
// 행마다 복구(restore_inbox_items) / 완전히 삭제(purge_inbox_items — 받은 편지함에서만 빠진다).
// 보낸 편지 삭제함(Trash)과 같은 카드 모양을 쓰려고 Sent.module.css·Trash.module.css를 함께 쓴다.

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  listDeletedInbox,
  purgeInboxItems,
  restoreInboxItems,
  type DeletedInboxItem,
} from '../data/inbox';
import { UndoToast } from '../components/UndoToast';
import { purgeLabel } from '../lib/trashLabel';
import sent from './Sent.module.css';
import styles from './Trash.module.css';

export default function InboxTrash(): React.ReactElement {
  const [items, setItems] = useState<DeletedInboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<DeletedInboxItem | null>(null);
  const [toast, setToast] = useState<{ key: string; message: string } | null>(null);
  const closeToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    listDeletedInbox()
      .then(setItems)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : '삭제함을 불러오지 못했어요'),
      )
      .finally(() => setLoading(false));
  }, []);

  async function handleRestore(item: DeletedInboxItem): Promise<void> {
    setBusyId(item.letterId);
    setError(null);
    try {
      await restoreInboxItems([item.letterId]);
      setItems((prev) => prev.filter((i) => i.letterId !== item.letterId));
      setToast({ key: `restore-${item.letterId}`, message: '편지를 되살렸어요' });
    } catch (err) {
      setError(err instanceof Error ? err.message : '편지를 되살리지 못했어요');
    } finally {
      setBusyId(null);
    }
  }

  async function handleConfirmPurge(): Promise<void> {
    if (!purgeTarget) return;
    const target = purgeTarget;
    setBusyId(target.letterId);
    setError(null);
    try {
      await purgeInboxItems([target.letterId]);
      setItems((prev) => prev.filter((i) => i.letterId !== target.letterId));
      setPurgeTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '완전히 삭제하지 못했어요');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className={sent.page}>
      <h1 className={sent.heading}>받은 편지 삭제함</h1>
      <p className={styles.notice}>삭제한 편지는 30일 동안 보관된 뒤 받은 편지함에서 완전히 지워져요.</p>

      {error && <p className={sent.errorMsg}>{error}</p>}

      {loading ? (
        <p className={sent.empty}>불러오는 중…</p>
      ) : items.length === 0 ? (
        <p className={sent.empty}>삭제함이 비어 있어요</p>
      ) : (
        <ul className={sent.list}>
          {items.map((item) => (
            <li key={item.letterId} className={sent.card}>
              <div className={sent.cardHeader}>
                <div className={sent.cardMeta}>
                  <p className={sent.cardTitle}>{item.title || '제목 없음'}</p>
                  <p className={sent.cardRecipient}>보낸이: {item.senderNickname ?? '알 수 없음'}</p>
                  <p className={sent.cardDate}>{purgeLabel(item.purgeAt)}</p>
                </div>
                <div className={sent.cardActions}>
                  <button
                    type="button"
                    className={sent.btnEdit}
                    onClick={() => void handleRestore(item)}
                    disabled={busyId === item.letterId}
                  >
                    복구
                  </button>
                  <button
                    type="button"
                    className={sent.btnDeleteCard}
                    onClick={() => setPurgeTarget(item)}
                    disabled={busyId === item.letterId}
                    aria-label={`"${item.title || '편지'}" 완전히 삭제`}
                  >
                    완전히 삭제
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className={styles.back}>
        <Link to="/inbox">받은 편지함으로 돌아가기</Link>
      </p>

      {purgeTarget !== null && (
        <div className={sent.modal} role="dialog" aria-modal="true" aria-labelledby="inbox-purge-modal-title">
          <div className={sent.modalCard}>
            <h2 id="inbox-purge-modal-title" className={sent.modalTitle}>
              완전히 삭제할까요?
            </h2>
            <p className={sent.modalBody}>
              받은 편지함에서만 지워지고, 링크를 다시 열면 다시 담겨요.
            </p>
            <div className={sent.modalActions}>
              <button
                type="button"
                className={sent.btnCancel}
                onClick={() => setPurgeTarget(null)}
                disabled={busyId !== null}
              >
                취소
              </button>
              <button
                type="button"
                className={sent.btnConfirmDelete}
                onClick={() => void handleConfirmPurge()}
                disabled={busyId !== null}
              >
                {busyId !== null ? '삭제 중…' : '완전히 삭제'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast !== null && <UndoToast key={toast.key} message={toast.message} onClose={closeToast} />}
    </main>
  );
}
