// 삭제함 (/trash, 0035). 지운 편지는 30일 보관 뒤 서버가 사진까지 완전히 지운다.
// 행마다 복구(restore_letter) / 완전히 삭제(purge_letter → 사진 폴더 정리).
// 보낸 편지 화면과 같은 카드 모양을 쓰려고 Sent.module.css를 함께 쓴다.

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  listDeletedLetters,
  purgeLetter,
  restoreLetter,
  type DeletedLetter,
} from '../data/letters';
import { UndoToast } from '../components/UndoToast';
import { purgeLabel } from '../lib/trashLabel';
import sent from './Sent.module.css';
import styles from './Trash.module.css';

export default function Trash(): React.ReactElement {
  const [items, setItems] = useState<DeletedLetter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<DeletedLetter | null>(null);
  const [toast, setToast] = useState<{ key: string; message: string } | null>(null);
  const closeToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    listDeletedLetters()
      .then(setItems)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : '삭제함을 불러오지 못했어요'),
      )
      .finally(() => setLoading(false));
  }, []);

  async function handleRestore(item: DeletedLetter): Promise<void> {
    setBusyId(item.id);
    setError(null);
    try {
      await restoreLetter(item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      setToast({ key: `restore-${item.id}`, message: '편지를 되살렸어요' });
    } catch (err) {
      setError(err instanceof Error ? err.message : '편지를 되살리지 못했어요');
    } finally {
      setBusyId(null);
    }
  }

  async function handleConfirmPurge(): Promise<void> {
    if (!purgeTarget) return;
    const target = purgeTarget;
    setBusyId(target.id);
    setError(null);
    try {
      await purgeLetter(target.id);
      setItems((prev) => prev.filter((i) => i.id !== target.id));
      setPurgeTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '완전히 삭제하지 못했어요');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className={sent.page}>
      <h1 className={sent.heading}>보낸 편지 삭제함</h1>
      <p className={styles.notice}>삭제한 편지는 30일 동안 보관된 뒤 완전히 지워져요.</p>

      {error && <p className={sent.errorMsg}>{error}</p>}

      {loading ? (
        <p className={sent.empty}>불러오는 중…</p>
      ) : items.length === 0 ? (
        <p className={sent.empty}>삭제함이 비어 있어요</p>
      ) : (
        <ul className={sent.list}>
          {items.map((item) => (
            <li key={item.id} className={sent.card}>
              <div className={sent.cardHeader}>
                <div className={sent.cardMeta}>
                  <p className={sent.cardTitle}>{item.title || '제목 없음'}</p>
                  <p className={sent.cardDate}>{purgeLabel(item.purgeAt)}</p>
                </div>
                <div className={sent.cardActions}>
                  <button
                    type="button"
                    className={sent.btnEdit}
                    onClick={() => void handleRestore(item)}
                    disabled={busyId === item.id}
                  >
                    복구
                  </button>
                  <button
                    type="button"
                    className={sent.btnDeleteCard}
                    onClick={() => setPurgeTarget(item)}
                    disabled={busyId === item.id}
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
        <Link to="/sent">보낸 편지로 돌아가기</Link>
      </p>

      {purgeTarget !== null && (
        <div className={sent.modal} role="dialog" aria-modal="true" aria-labelledby="purge-modal-title">
          <div className={sent.modalCard}>
            <h2 id="purge-modal-title" className={sent.modalTitle}>
              완전히 삭제할까요?
            </h2>
            <p className={sent.modalBody}>되돌릴 수 없어요. 사진도 함께 지워져요.</p>
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
