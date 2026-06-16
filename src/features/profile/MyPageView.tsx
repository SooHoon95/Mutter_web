// 마이페이지 뷰. 닉네임 편집·로그아웃·계정 삭제를 제공한다.
// 이메일은 세션에서 읽고, 프로필(닉네임)은 useProfile hook으로 관리한다.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import { signOut } from '@/data/auth';
import { deleteMyAccount } from '@/data/profiles';
import { useProfile } from './useProfile';
import styles from './MyPageView.module.css';

export function MyPageView(): React.ReactElement {
  const { session } = useAuth();
  const { profile, isLoading, error, updateNickname, isUpdating } = useProfile();
  const navigate = useNavigate();

  const [nicknameInput, setNicknameInput] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);

  // 계정 삭제 확인 모달 표시 여부
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // 닉네임 저장
  async function handleSaveNickname(): Promise<void> {
    setSaveError(null);
    try {
      await updateNickname(nicknameInput.trim());
      setNicknameInput('');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '저장 실패');
    }
  }

  // 로그아웃 → 로그인 페이지로
  async function handleSignOut(): Promise<void> {
    try {
      await signOut();
      navigate('/login');
    } catch (err) {
      // signOut 실패는 드문 케이스 — 사용자가 인지할 수 있도록 콘솔에 기록
      console.error('[MyPageView] 로그아웃 실패:', err);
    }
  }

  // 계정 삭제 확정 — RPC → signOut → 홈으로
  async function handleConfirmDelete(): Promise<void> {
    setDeleteError(null);
    setIsDeleting(true);
    try {
      await deleteMyAccount();
      await signOut();
      navigate('/');
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : '계정 삭제 실패');
      setIsDeleting(false);
    }
  }

  const email = session?.user.email ?? '';
  const currentNickname = profile?.nickname ?? '';
  const displayNickname = currentNickname || '(닉네임 없음)';

  return (
    <main className={styles.container}>
      <h1>마이페이지</h1>

      {/* 이메일 */}
      <section className={styles.section}>
        <span className={styles.label}>이메일</span>
        <span className={styles.value}>{email}</span>
      </section>

      <hr className={styles.divider} />

      {/* 닉네임 편집 */}
      <section className={styles.section}>
        <span className={styles.label}>닉네임</span>
        {isLoading ? (
          <span className={styles.value}>불러오는 중…</span>
        ) : error ? (
          <span className={styles.errorMsg}>{error.message}</span>
        ) : (
          <span className={styles.value}>{displayNickname}</span>
        )}

        {/* 닉네임 입력 + 저장 버튼 */}
        <div className={styles.nicknameRow}>
          <input
            className={styles.input}
            type="text"
            value={nicknameInput}
            onChange={(e) => setNicknameInput(e.target.value)}
            placeholder="새 닉네임 입력"
            maxLength={50}
            aria-label="새 닉네임"
          />
          <button
            type="button"
            className={styles.btnSave}
            onClick={() => void handleSaveNickname()}
            disabled={isUpdating || nicknameInput.trim().length === 0}
          >
            {isUpdating ? '저장 중…' : '저장'}
          </button>
        </div>
        {saveError && <p className={styles.errorMsg}>{saveError}</p>}
      </section>

      <hr className={styles.divider} />

      {/* 로그아웃 */}
      <section className={styles.section}>
        <button
          type="button"
          className={styles.btnLogout}
          onClick={() => void handleSignOut()}
        >
          로그아웃
        </button>
      </section>

      <hr className={styles.divider} />

      {/* 계정 삭제 */}
      <section className={styles.section}>
        <button
          type="button"
          className={styles.btnDelete}
          onClick={() => setShowDeleteModal(true)}
        >
          계정 삭제
        </button>
      </section>

      {/* 계정 삭제 확인 모달 */}
      {showDeleteModal && (
        <div
          className={styles.modal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
        >
          <div className={styles.modalCard}>
            <h2 id="delete-modal-title" className={styles.modalTitle}>
              계정을 삭제할까요?
            </h2>
            <p className={styles.modalBody}>
              계정과 작성한 모든 편지·링크가 영구 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
            </p>
            {deleteError && <p className={styles.errorMsg}>{deleteError}</p>}
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.btnCancel}
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteError(null);
                }}
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
                {isDeleting ? '삭제 중…' : '삭제 확인'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
