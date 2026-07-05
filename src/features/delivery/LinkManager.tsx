// LinkManager — 편지별 전달 링크 발급/목록/revoke UI.
// Sent 라우트에서 각 편지마다 렌더링한다.
// capability-links 스킬: 암호 기본 ON, 발급 URL = /l/:token 전체 URL.

import { useState } from 'react';
import { useLinks } from './useLinks';
import { validateSchedule } from './validateSchedule';
import styles from './LinkManager.module.css';

interface LinkManagerProps {
  letterId: string;
}

/** 수신 URL 전체 경로를 반환한다. */
function buildLinkUrl(token: string): string {
  return `${window.location.origin}/l/${token}`;
}

/** Date → datetime-local 입력값(YYYY-MM-DDTHH:mm, 로컬 시각). picker의 min 힌트용. */
function toLocalInputValue(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function LinkManager({ letterId }: LinkManagerProps) {
  const { links, loading, error, issue, revoke } = useLinks(letterId);

  // 발급 폼 상태
  const [passwordEnabled, setPasswordEnabled] = useState(true); // 암호 기본 ON
  const [password, setPassword] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [revealAt, setRevealAt] = useState(''); // 0018 예약 공개(이 시각 이후에만 열림)
  const [copied, setCopied] = useState<string | null>(null);
  // P2: 암호 보호 ON이지만 암호 미입력 시 노출할 검증 오류 메시지
  const [validationError, setValidationError] = useState<string | null>(null);

  // 만료·예약 picker의 min — 과거 시각 선택을 native 단에서 막는다(born-dead 링크 예방).
  const minDateTime = toLocalInputValue(new Date());

  async function handleIssue(e: React.FormEvent) {
    e.preventDefault();
    // P2: 암호 보호 체크 ON이면 반드시 암호를 입력해야 한다.
    // 빈 상태로 발급하면 암호 없는 링크가 발급되어 수신자 무마찰 원칙에 위배된다.
    if (passwordEnabled && !password.trim()) {
      setValidationError('암호 보호를 켰다면 암호를 입력해 주세요.');
      return;
    }
    const expiresIso = expiresAt ? new Date(expiresAt).toISOString() : undefined;
    const revealIso = revealAt ? new Date(revealAt).toISOString() : undefined;
    // born-dead 링크 방지: 과거 만료·모순 스케줄(공개≥만료)을 발급 전에 차단한다.
    const scheduleError = validateSchedule({ expiresAt: expiresIso, revealAt: revealIso });
    if (scheduleError) {
      setValidationError(scheduleError);
      return;
    }
    setValidationError(null);
    await issue({
      password: passwordEnabled && password.trim() ? password.trim() : undefined,
      expiresAt: expiresIso,
      revealAt: revealIso,
    });
    setPassword('');
    setExpiresAt('');
    setRevealAt('');
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

        {/* 만료 일시 (선택) — min으로 과거 선택을 막고, 비우면 만료 없음. */}
        <div className={styles.fieldRow}>
          <label>만료</label>
          <input
            className={styles.input}
            type="datetime-local"
            value={expiresAt}
            min={minDateTime}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
        </div>
        <p className={styles.fieldHint}>비워두면 만료 없이 계속 열 수 있어요.</p>

        {/* 예약 공개 (선택) — 이 시각 이후에만 열린다(0018). 생일·기념일 편지용. */}
        <div className={styles.fieldRow}>
          <label>예약 공개</label>
          <input
            className={styles.input}
            type="datetime-local"
            value={revealAt}
            min={minDateTime}
            onChange={(e) => setRevealAt(e.target.value)}
            aria-describedby="reveal-hint"
          />
        </div>
        <p id="reveal-hint" className={styles.fieldHint}>
          설정하면 그 시각 전엔 수신자가 열 수 없어요(예: 생일에 열리는 편지). 시각은 내 기기 시간 기준이에요.
        </p>

        <button className={styles.issueBtn} type="submit" disabled={loading}>
          {loading ? '발급 중…' : '링크 발급'}
        </button>

        {validationError && <p className={styles.error}>{validationError}</p>}
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
                {/* 0018 예약 공개: 살아있는 링크가 아직 공개 전이면 공개 예정 시각 배지. */}
                {link.revealAt &&
                  !isRevoked &&
                  !isExpired &&
                  new Date(link.revealAt) > new Date() && (
                    <span className={`${styles.badge} ${styles.scheduled}`}>
                      🔒 {new Date(link.revealAt).toLocaleString('ko-KR')} 공개 예정
                    </span>
                  )}
                {isExpired && (
                  <span className={`${styles.badge} ${styles.expired}`}>만료됨</span>
                )}
                {isRevoked && (
                  <span className={`${styles.badge} ${styles.revoked}`}>무효화됨</span>
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
