// InvitePanel — 연결 초대 링크 생성 패널(N:N).
// "연결 초대 링크 만들기" → createInvite → /connect/:token 링크 + 복사/공유/취소.
// 연결된 사람 목록·해제는 ConnectionList가 담당한다(N:N이라 초대는 항상 가능).

import { useState } from 'react';
import { revokeInvite } from '@/data/connections';
import { useConnections } from './useConnections';
import styles from './InvitePanel.module.css';

/** 토큰으로 연결 수락 페이지 전체 URL을 만든다. `from=web`로 출처를 명시 —
 *  앱 미설치 폴백이 App Store가 아니라 웹으로 가도록(웹 발급 링크 규칙). */
function buildInviteUrl(token: string): string {
  return `${window.location.origin}/connect/${token}?from=web`;
}

export function InvitePanel(): React.ReactElement {
  const { createInvite, isCreatingInvite } = useConnections();

  // inviteToken: 생성된 토큰 원본 — 취소(revokeInvite) 시 필요.
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  // copied: 복사 완료 피드백 / copyError: 클립보드 접근 실패
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  // revoking: 취소 진행 중 / revokeError: 취소 실패
  const [isRevoking, setIsRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  async function handleCreate(): Promise<void> {
    setCreateError(null);
    setInviteToken(null);
    setInviteUrl(null);
    setCopied(false);
    setCopyError(null);
    setRevokeError(null);
    try {
      const token = await createInvite();
      setInviteToken(token);
      setInviteUrl(buildInviteUrl(token));
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : '초대 링크 생성에 실패했습니다.');
    }
  }

  async function handleRevoke(): Promise<void> {
    if (inviteToken === null) return;
    setRevokeError(null);
    setIsRevoking(true);
    try {
      await revokeInvite(inviteToken);
      // 취소 성공 → 링크 상태를 지워 UI에서 링크가 사라지게 한다.
      setInviteToken(null);
      setInviteUrl(null);
      setCopied(false);
      setCopyError(null);
    } catch (err) {
      setRevokeError(err instanceof Error ? err.message : '초대 취소에 실패했습니다.');
    } finally {
      setIsRevoking(false);
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

  return (
    <div className={styles.panel}>
      <p className={styles.desc}>
        초대 링크를 만들어 상대에게 보내면, 상대가 링크를 열고 수락할 때 둘이 연결돼요.
        연결되면 링크 없이 바로 편지를 주고받을 수 있어요.
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
            {/* 초대 취소 — 링크를 무효화하고 UI에서 제거한다 */}
            <button
              type="button"
              className={styles.revokeBtn}
              onClick={() => void handleRevoke()}
              disabled={isRevoking}
            >
              {isRevoking ? '취소 중…' : '초대 취소'}
            </button>
          </div>

          {copyError !== null && <p className={styles.error}>{copyError}</p>}
          {revokeError !== null && <p className={styles.error}>{revokeError}</p>}

          <p className={styles.hint}>
            이 링크를 받은 사람이 열고 수락하면 둘이 연결돼요.
          </p>
        </div>
      )}
    </div>
  );
}
