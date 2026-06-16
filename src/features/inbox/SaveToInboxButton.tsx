// SaveToInboxButton — 수신자가 로그인 상태일 때 편지를 받은 편지함에 저장하는 버튼.
// 비로그인 시 null 반환 — 수신 무마찰 원칙을 지키기 위해 아무것도 표시하지 않는다.

import { useState } from 'react';
import { useAuth } from '@/app/AuthProvider';
import { saveToInbox } from '@/data/inbox';
import styles from './SaveToInboxButton.module.css';

interface SaveToInboxButtonProps {
  token: string;
}

export function SaveToInboxButton({ token }: SaveToInboxButtonProps): React.ReactElement | null {
  const { user } = useAuth();
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 비로그인 수신자는 이 버튼을 보지 않는다(수신 무마찰 유지).
  if (!user) return null;

  async function handleSave(): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      await saveToInbox(token);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.wrapper}>
      {saved ? (
        <span className={styles.saved}>✓ 보관함에 저장됨</span>
      ) : (
        <>
          <button
            type="button"
            className={styles.button}
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? '저장 중…' : '받은 편지함에 저장'}
          </button>
          {error !== null && (
            <span style={{ marginLeft: '0.5rem', fontSize: '0.8rem', color: '#b94040' }}>
              {error}
            </span>
          )}
        </>
      )}
    </div>
  );
}
