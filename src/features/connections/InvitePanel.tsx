// InvitePanel — 독점 1:1 연결 초대/해제 패널.
// 이미 연결돼 있으면: "○○님과 연결됨" + "연결 해제" 버튼.
// 연결 없을 때만: "연결 초대 링크 만들기" → createInvite → /connect/:token 링크 + 복사.

import { useState } from 'react';
import { useConnections } from './useConnections';
import styles from './InvitePanel.module.css';

/** 토큰으로 연결 수락 페이지 전체 URL을 만든다. */
function buildInviteUrl(token: string): string {
  return `${window.location.origin}/connect/${token}`;
}

export function InvitePanel(): React.ReactElement {
  const { connections, createInvite, isCreatingInvite, disconnect, isDisconnecting } =
    useConnections();

  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);

  // 독점 1:1 — 연결은 최대 1명.
  const currentConnection = connections[0] ?? null;
  const isConnected = currentConnection !== null;

  async function handleCreate(): Promise<void> {
    setCreateError(null);
    try {
      const token = await createInvite();
      setInviteUrl(buildInviteUrl(token));
      setCopied(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : '초대 링크 생성에 실패했습니다.');
    }
  }

  async function handleCopy(): Promise<void> {
    if (inviteUrl === null) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleDisconnect(): Promise<void> {
    if (
      !confirm(
        '연결을 해제할까요? 주고받은 편지는 그대로 남아 있어요.',
      )
    )
      return;
    setDisconnectError(null);
    try {
      await disconnect();
    } catch (err) {
      setDisconnectError(err instanceof Error ? err.message : '연결 해제에 실패했습니다.');
    }
  }

  // ── 이미 연결된 상태 ──────────────────────────────────────────────────────
  if (isConnected) {
    const connectedName = currentConnection.nickname ?? '알 수 없음';
    return (
      <div className={styles.panel}>
        <p className={styles.desc}>
          <strong>{connectedName}</strong>님과 연결돼 있어요. 연결은 독점 1:1이라 다른 사람을
          연결하려면 먼저 해제해야 해요.
        </p>
        <button
          type="button"
          className={styles.disconnectBtn}
          onClick={() => void handleDisconnect()}
          disabled={isDisconnecting}
        >
          {isDisconnecting ? '해제 중…' : '연결 해제'}
        </button>
        {disconnectError !== null && <p className={styles.error}>{disconnectError}</p>}
        <p className={styles.hint}>연결을 해제해도 주고받은 편지는 그대로 남아 있어요.</p>
      </div>
    );
  }

  // ── 연결 없음: 초대 링크 생성 ────────────────────────────────────────────
  return (
    <div className={styles.panel}>
      <p className={styles.desc}>
        연결 초대 링크를 만들어 보내면, 상대가 로그인 후 링크를 열어 서로 연결됩니다. 연결은
        독점 1:1이에요 — 연결된 사람에게는 링크 없이 바로 편지를 보낼 수 있어요.
      </p>

      <button
        type="button"
        className={styles.createBtn}
        onClick={() => void handleCreate()}
        disabled={isCreatingInvite}
      >
        {isCreatingInvite ? '만드는 중…' : '연결 초대 링크 만들기'}
      </button>

      {createError !== null && <p className={styles.error}>{createError}</p>}

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
