// PasswordGate — 암호 보호 링크 입력 폼 (T8 viewer).
//
// capability-links: 암호는 서버(RPC get_letter_by_token)에서 해시 비교한다. 여기서는
// 평문을 받아 useLetterViewer.submitPassword → openByToken으로 넘길 뿐, 해시를 만들지 않는다.

import { useState, type FormEvent } from 'react';
import styles from './PasswordGate.module.css';

interface PasswordGateProps {
  /** 암호 제출. useLetterViewer.submitPassword를 연결한다. */
  onSubmit: (password: string) => void;
  /** 재시도 진행 중 여부(버튼 비활성화). */
  submitting: boolean;
  /** 직전 시도 실패 메시지(있으면 표시). */
  errorMessage?: string | null;
}

export function PasswordGate({
  onSubmit,
  submitting,
  errorMessage,
}: PasswordGateProps): React.ReactElement {
  const [password, setPassword] = useState('');

  function handleSubmit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const trimmed = password.trim();
    if (!trimmed || submitting) return;
    onSubmit(trimmed);
  }

  return (
    <div className={styles.gate}>
      <form className={styles.form} onSubmit={handleSubmit}>
        <h1 className={styles.heading}>암호가 필요한 편지예요</h1>
        <p className={styles.desc}>발신자에게 받은 암호를 입력하세요.</p>
        <label htmlFor="letter-password" className={styles.label}>
          암호
        </label>
        <input
          id="letter-password"
          className={styles.input}
          type="password"
          autoComplete="off"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={submitting}
          autoFocus
        />
        {errorMessage && (
          <p className={styles.error} role="alert">
            {errorMessage}
          </p>
        )}
        <button
          type="submit"
          className={styles.submitButton}
          disabled={submitting || password.trim().length === 0}
        >
          {submitting ? '확인 중…' : '편지 열기'}
        </button>
      </form>
    </div>
  );
}
