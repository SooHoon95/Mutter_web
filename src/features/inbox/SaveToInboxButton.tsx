// SaveToInboxButton — 수신자에게 받은 편지함 저장 상태/유도를 보여준다.
// - 로그인 상태: 서버(migration 0022)가 인증된 비소유자의 열람 시 자동 저장하므로 "저장됨"만 표시.
// - 비로그인: "가입하고 받은 편지함에 저장" CTA → /login(from=현재 편지 링크).
//   로그인+온보딩 후 이 링크로 복귀하면 열람 자동 저장되어 받은함에 들어간다(무계정→가입 이음).
//   열람 자체는 막지 않으므로 수신 무마찰 원칙은 유지된다.

import { useAuth } from '@/app/AuthProvider';
import { useLocation, useNavigate } from 'react-router-dom';
import styles from './SaveToInboxButton.module.css';

interface SaveToInboxButtonProps {
  // token prop은 하위 호환을 위해 유지하지만 이 컴포넌트에서는 사용하지 않는다.
  token: string;
}

export function SaveToInboxButton({ token: _token }: SaveToInboxButtonProps): React.ReactElement {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  if (!user) {
    return (
      <div className={styles.wrapper}>
        <button
          type="button"
          className={styles.button}
          onClick={() => navigate('/login', { state: { from: location } })}
        >
          가입하고 받은 편지함에 저장
        </button>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      {/* 서버가 열람 시 자동 저장하므로 저장 완료 상태를 정적으로 표시한다. */}
      <span className={styles.saved}>✓ 받은 편지함에 저장됐어요</span>
    </div>
  );
}
