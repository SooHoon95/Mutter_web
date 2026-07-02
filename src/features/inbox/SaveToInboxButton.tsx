// SaveToInboxButton — 수신자가 로그인 상태일 때 자동 저장 확인 메시지를 표시한다.
// 서버(migration 0022)가 인증된 비소유자가 get_letter_by_token으로 편지를 열 때
// 자동으로 받은 편지함에 저장하므로, 수동 저장 버튼 대신 저장 완료 안내만 보여준다.
// 비로그인 시 null 반환 — 수신 무마찰 원칙을 지키기 위해 아무것도 표시하지 않는다.

import { useAuth } from '@/app/AuthProvider';
import styles from './SaveToInboxButton.module.css';

interface SaveToInboxButtonProps {
  // token prop은 하위 호환을 위해 유지하지만 이 컴포넌트에서는 사용하지 않는다.
  token: string;
}

export function SaveToInboxButton({ token: _token }: SaveToInboxButtonProps): React.ReactElement | null {
  const { user } = useAuth();

  // 비로그인 수신자는 이 안내를 보지 않는다(수신 무마찰 유지).
  if (!user) return null;

  return (
    <div className={styles.wrapper}>
      {/* 서버가 열람 시 자동 저장하므로 저장 완료 상태를 정적으로 표시한다. */}
      <span className={styles.saved}>✓ 받은 편지함에 저장됐어요</span>
    </div>
  );
}
