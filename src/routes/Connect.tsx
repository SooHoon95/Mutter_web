// 연결 초대 수락 라우트 (/connect/:token). 독점 1:1 연결.
// 로그인 필수 — 라우터가 가드하므로 여기서는 토큰으로 초대 정보를 조회해 수락 흐름만 다룬다.
//
// 흐름: getInvite로 초대 정보 조회 →
//   - is_self: 본인 초대 — 수락 불가
//   - already_connected: 이미 이 분과 연결됨 — /people 이동
//   - viewerHasConnection: 내가 다른 연결 보유 — 해제 후 재시도 안내
//   - inviterHasConnection: 상대가 다른 연결 보유 — 수락 불가
//   - 정상: "수락" → acceptInvite → "이제 연결됐어요" + /people 이동

import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getInvite } from '@/data/connections';
import type { ConnectInvite } from '@/data/connections';
import { useConnections } from '@/features/connections';
import styles from './Connect.module.css';

export default function Connect(): React.ReactElement {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { acceptInvite, isAccepting } = useConnections();

  const [accepted, setAccepted] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  const {
    data: invite,
    isLoading,
    error,
  } = useQuery<ConnectInvite, Error>({
    queryKey: ['connect-invite', token],
    queryFn: () => getInvite(token as string),
    enabled: token !== undefined,
  });

  async function handleAccept(): Promise<void> {
    if (token === undefined) return;
    setAcceptError(null);
    try {
      await acceptInvite(token);
      setAccepted(true);
    } catch (err) {
      // acceptInvite는 이미 에러 코드를 사용자 메시지로 정규화해 던진다.
      setAcceptError(err instanceof Error ? err.message : '수락 중 오류가 발생했습니다.');
    }
  }

  const inviterName = invite?.inviterNickname ?? '상대';

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        {isLoading && <p className={styles.status}>초대를 확인하는 중…</p>}

        {error !== null && !isLoading && (
          <p className={styles.error}>초대를 불러올 수 없습니다: {error.message}</p>
        )}

        {invite !== undefined && !accepted && renderInviteState(invite, inviterName, {
          isAccepting,
          acceptError,
          onAccept: () => void handleAccept(),
          onGoPeople: () => navigate('/people'),
        })}

        {accepted && (
          <>
            <h1 className={styles.heading}>이제 연결됐어요</h1>
            <p className={styles.desc}>
              {inviterName}님과 연결됐어요. 이제 링크 없이 바로 편지를 보낼 수 있어요.
            </p>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={() => navigate('/people')}
            >
              주고받은 사람으로 가기
            </button>
          </>
        )}
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// 초대 상태별 렌더 헬퍼 — 독점 1:1 제약 조건 처리
// ---------------------------------------------------------------------------

interface InviteActionProps {
  isAccepting: boolean;
  acceptError: string | null;
  onAccept: () => void;
  onGoPeople: () => void;
}

function renderInviteState(
  invite: ConnectInvite,
  inviterName: string,
  actions: InviteActionProps,
): React.ReactElement {
  const { isAccepting, acceptError, onAccept, onGoPeople } = actions;

  // 1. 본인 초대
  if (invite.isSelf) {
    return (
      <>
        <h1 className={styles.heading}>본인 초대는 수락할 수 없어요</h1>
        <p className={styles.desc}>
          이 링크는 내가 만든 초대예요. 연결하려는 상대에게 링크를 보내주세요.
        </p>
      </>
    );
  }

  // 2. 이미 이 사람과 연결됨
  if (invite.alreadyConnected) {
    return (
      <>
        <h1 className={styles.heading}>이미 연결된 사이예요</h1>
        <p className={styles.desc}>
          {inviterName}님과는 이미 연결되어 있어요. 바로 편지를 보낼 수 있어요.
        </p>
        <button type="button" className={styles.primaryBtn} onClick={onGoPeople}>
          주고받은 사람으로 가기
        </button>
      </>
    );
  }

  // 3. 내가 이미 다른 사람과 연결됨 (독점 1:1)
  if (invite.viewerHasConnection) {
    return (
      <>
        <h1 className={styles.heading}>먼저 현재 연결을 해제해야 해요</h1>
        <p className={styles.desc}>
          연결은 독점 1:1이에요. {inviterName}님과 연결하려면 먼저 현재 연결을 해제한 뒤 이
          링크를 다시 열어주세요.
        </p>
        <button type="button" className={styles.primaryBtn} onClick={onGoPeople}>
          주고받은 사람으로 가기
        </button>
      </>
    );
  }

  // 4. 상대가 이미 다른 사람과 연결됨 (독점 1:1)
  if (invite.inviterHasConnection) {
    return (
      <>
        <h1 className={styles.heading}>상대가 이미 연결돼 있어요</h1>
        <p className={styles.desc}>
          {inviterName}님은 이미 다른 사람과 연결돼 있어서 지금은 수락할 수 없어요. 상대에게
          먼저 연결을 해제해 달라고 요청해보세요.
        </p>
      </>
    );
  }

  // 5. 정상 — 수락 가능
  return (
    <>
      <h1 className={styles.heading}>{inviterName}님이 연결을 요청했어요</h1>
      <p className={styles.desc}>
        수락하면 서로 연결되어, 링크 없이 바로 편지를 주고받을 수 있어요. 연결은 독점 1:1이에요.
      </p>
      <button
        type="button"
        className={styles.primaryBtn}
        onClick={onAccept}
        disabled={isAccepting}
      >
        {isAccepting ? '수락 중…' : '수락'}
      </button>
      {acceptError !== null && <p className={styles.error}>{acceptError}</p>}
    </>
  );
}
