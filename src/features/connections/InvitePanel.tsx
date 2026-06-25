// InvitePanel — 독점 1:1 연결 초대/해제 패널.
// 이미 연결돼 있으면: "○○님과 연결됨" + "연결 해제" 버튼.
// 연결 없을 때만: "연결 초대 링크 만들기" → createInvite → /connect/:token 링크 + 복사/공유.

import { useState } from 'react';
import { useConnections } from './useConnections';
import styles from './InvitePanel.module.css';

/** 토큰으로 연결 수락 페이지 전체 URL을 만든다. */
function buildInviteUrl(token: string): string {
  return `${window.location.origin}/connect/${token}`;
}

export function InvitePanel(): React.ReactElement {
  const { connections, isLoading, createInvite, isCreatingInvite, disconnect, isDisconnecting } =
    useConnections();

  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  // copied: 복사 완료 피드백 / copyError: 클립보드 접근 실패
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);

  // 독점 1:1 — 연결은 최대 1명.
  const currentConnection = connections[0] ?? null;
  const isConnected = currentConnection !== null;

  // 연결 상태 로딩 중에는 초대 생성 UI를 띄우지 않는다.
  // (쿼리 해소 전엔 connections가 빈 배열이라, 이미 연결된 사용자에게도 초대 UI가
  //  잠깐 노출되는 문제를 막는다 — 독점 1:1 배타성 보호.)
  if (isLoading) {
    return (
      <div className={styles.panel}>
        <p className={styles.desc}>연결 상태를 불러오는 중…</p>
      </div>
    );
  }

  async function handleCreate(): Promise<void> {
    setCreateError(null);
    setInviteUrl(null);
    setCopied(false);
    setCopyError(null);
    try {
      const token = await createInvite();
      setInviteUrl(buildInviteUrl(token));
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : '초대 링크 생성에 실패했습니다.');
    }
  }

  async function handleCopy(): Promise<void> {
    if (inviteUrl === null) return;
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 클립보드 API 차단(보안 컨텍스트 외, 권한 거부 등) — 수동 복사 안내.
      setCopyError('클립보드 접근이 차단됐어요. 링크를 직접 선택해 복사해 주세요.');
    }
  }

  async function handleShare(): Promise<void> {
    if (inviteUrl === null) return;
    try {
      await navigator.share({
        title: '편지 연결 초대',
        text: '이 링크를 열면 우리가 연결돼요. 연결되면 링크 없이 바로 편지를 주고받을 수 있어요.',
        url: inviteUrl,
      });
    } catch {
      // 공유 취소(AbortError)나 미지원 — 조용히 무시한다.
    }
  }

  // navigator.share 지원 여부 — https 컨텍스트 + 모바일에서만 true인 경우가 많다.
  const canShare = typeof navigator.share === 'function';

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
        초대 링크를 만들어 상대에게 보내면, 상대가 링크를 열고 수락할 때 둘이 연결돼요.
        연결은 독점 1:1이에요 — 연결되면 링크 없이 바로 편지를 주고받을 수 있어요.
      </p>

      <button
        type="button"
        className={styles.createBtn}
        onClick={() => void handleCreate()}
        disabled={isCreatingInvite}
      >
        {isCreatingInvite ? '만드는 중…' : '초대 링크 만들기'}
      </button>

      {createError !== null && <p className={styles.error}>{createError}</p>}

      {inviteUrl !== null && (
        <div className={styles.result}>
          {/* 링크 텍스트 — 선택해 직접 복사 가능 */}
          <span className={styles.url} role="textbox" aria-readonly="true">
            {inviteUrl}
          </span>

          <div className={styles.actions}>
            <button type="button" className={styles.copyBtn} onClick={() => void handleCopy()}>
              {copied ? '복사됨!' : '링크 복사'}
            </button>
            {/* navigator.share 지원 환경(모바일 등)에서만 공유 버튼 노출 */}
            {canShare && (
              <button
                type="button"
                className={styles.shareBtn}
                onClick={() => void handleShare()}
              >
                공유하기
              </button>
            )}
          </div>

          {copyError !== null && <p className={styles.error}>{copyError}</p>}

          <p className={styles.hint}>
            이 링크를 받은 사람이 열고 수락하면 둘이 연결돼요. 1:1 전용.
          </p>
        </div>
      )}
    </div>
  );
}
