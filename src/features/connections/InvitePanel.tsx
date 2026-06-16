// InvitePanel — "연결 초대 링크 만들기" 버튼 → createInvite → /connect/:token 링크 표시 + 복사.
// 연결 초대를 받은 사람이 로그인 후 그 링크를 열면 서로 연결된다(Connect 라우트).

import { useState } from 'react';
import { useConnections } from './useConnections';
import styles from './InvitePanel.module.css';

/** 토큰으로 연결 수락 페이지 전체 URL을 만든다. */
function buildInviteUrl(token: string): string {
  return `${window.location.origin}/connect/${token}`;
}

export function InvitePanel(): React.ReactElement {
  const { createInvite, isCreatingInvite } = useConnections();
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleCreate(): Promise<void> {
    setError(null);
    try {
      const token = await createInvite();
      setInviteUrl(buildInviteUrl(token));
      setCopied(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '초대 링크 생성에 실패했습니다.');
    }
  }

  async function handleCopy(): Promise<void> {
    if (inviteUrl === null) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={styles.panel}>
      <p className={styles.desc}>
        연결 초대 링크를 만들어 보내면, 상대가 로그인 후 링크를 열어 서로 연결됩니다. 연결된
        사람에게는 링크 없이 바로 편지를 보낼 수 있어요.
      </p>

      <button
        type="button"
        className={styles.createBtn}
        onClick={() => void handleCreate()}
        disabled={isCreatingInvite}
      >
        {isCreatingInvite ? '만드는 중…' : '연결 초대 링크 만들기'}
      </button>

      {error !== null && <p className={styles.error}>{error}</p>}

      {inviteUrl !== null && (
        <div className={styles.result}>
          <span className={styles.url}>{inviteUrl}</span>
          <button type="button" className={styles.copyBtn} onClick={() => void handleCopy()}>
            {copied ? '복사됨!' : '링크 복사'}
          </button>
        </div>
      )}
    </div>
  );
}
