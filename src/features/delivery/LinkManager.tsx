// LinkManager — 편지별 전달 링크 발급/목록/revoke UI.
// Sent 라우트에서 각 편지마다 렌더링한다.
// capability-links 스킬: 암호 기본 ON, 발급 URL = /l/:token 전체 URL.

import { useState } from 'react';
import { useLinks } from './useLinks';
import styles from './LinkManager.module.css';

interface LinkManagerProps {
  letterId: string;
}

/** 수신 URL 전체 경로를 반환한다. */
function buildLinkUrl(token: string): string {
  return `${window.location.origin}/l/${token}`;
}

export function LinkManager({ letterId }: LinkManagerProps) {
  const { links, loading, error, issue, revoke } = useLinks(letterId);

  // 발급 폼 상태
  const [passwordEnabled, setPasswordEnabled] = useState(true); // 암호 기본 ON
  const [password, setPassword] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  async function handleIssue(e: React.FormEvent) {
    e.preventDefault();
    await issue({
      password: passwordEnabled && password.trim() ? password.trim() : undefined,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
    });
    setPassword('');
    setExpiresAt('');
  }

  async function handleCopy(token: string) {
    const url = buildLinkUrl(token);
    await navigator.clipboard.writeText(url);
    setCopied(token);
    setTimeout(() => setCopied(null), 2000);
  }

  async function handleRevoke(token: string) {
    if (!confirm('이 링크를 즉시 무효화할까요? 수신자가 더 이상 열 수 없습니다.')) return;
    await revoke(token);
  }

  return (
    <div className={styles.container}>
      {/* 발급 폼 */}
      <form className={styles.issueForm} onSubmit={(e) => void handleIssue(e)}>
        <h3>새 전달 링크 발급</h3>

        {/* 암호 토글 — 기본 ON */}
        <div className={styles.fieldRow}>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={passwordEnabled}
              onChange={(e) => setPasswordEnabled(e.target.checked)}
            />
            암호 보호
          </label>
        </div>

        {passwordEnabled && (
          <div className={styles.fieldRow}>
            <label>암호</label>
            <input
              className={styles.input}
              type="password"
              placeholder="수신자에게 별도로 전달할 암호"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
        )}

        {/* 만료 일시 (선택) */}
        <div className={styles.fieldRow}>
          <label>만료</label>
          <input
            className={styles.input}
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
        </div>

        <button className={styles.issueBtn} type="submit" disabled={loading}>
          {loading ? '발급 중…' : '링크 발급'}
        </button>

        {error && <p className={styles.error}>{error}</p>}
      </form>

      {/* 링크 목록 */}
      <div className={styles.linkList}>
        {links.length === 0 && !loading && (
          <p className={styles.emptyState}>아직 발급된 링크가 없습니다.</p>
        )}

        {links.map((link) => {
          const isRevoked = !!link.revokedAt;
          const isExpired =
            !!link.expiresAt && new Date(link.expiresAt) < new Date();
          const url = buildLinkUrl(link.token);

          return (
            <div
              key={link.token}
              className={`${styles.linkItem}${isRevoked ? ` ${styles.revoked}` : ''}`}
            >
              <span className={styles.linkUrl}>{url}</span>

              <div className={styles.linkMeta}>
                {link.hasPassword && (
                  <span className={`${styles.badge} ${styles.lock}`}>암호</span>
                )}
                {link.expiresAt && (
                  <span className={styles.badge}>
                    만료: {new Date(link.expiresAt).toLocaleString('ko-KR')}
                  </span>
                )}
                {isExpired && (
                  <span className={`${styles.badge} ${styles.expired}`}>만료됨</span>
                )}
                {isRevoked && (
                  <span className={`${styles.badge} ${styles.revoked}`}>무효화됨</span>
                )}
                {link.claimedDeviceId && !isRevoked && (
                  <span className={styles.badge}>열람됨 (기기 귀속)</span>
                )}
              </div>

              <div className={styles.actions}>
                <button
                  className={styles.copyBtn}
                  onClick={() => void handleCopy(link.token)}
                  disabled={isRevoked || isExpired}
                >
                  {copied === link.token ? '복사됨!' : 'URL 복사'}
                </button>
                {!isRevoked && (
                  <button
                    className={styles.revokeBtn}
                    onClick={() => void handleRevoke(link.token)}
                    disabled={loading}
                  >
                    무효화
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
