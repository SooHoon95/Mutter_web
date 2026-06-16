// 연결 초대 수락 라우트 (/connect/:token).
// 로그인 필수 — 라우터가 가드하므로 여기서는 토큰으로 초대 정보를 조회해 수락 흐름만 다룬다.
//
// 흐름: getInvite로 "○○님이 연결을 요청했어요" 표시 → "수락" → acceptInvite →
//       성공 시 "이제 연결됐어요" + /people 이동 버튼.
// 예외: is_self면 본인 초대 거부 안내, already_connected면 이미 연결됨 안내.

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

        {invite !== undefined && !accepted && (
          <>
            {invite.isSelf ? (
              <>
                <h1 className={styles.heading}>본인 초대는 수락할 수 없어요</h1>
                <p className={styles.desc}>
                  이 링크는 내가 만든 초대예요. 연결하려는 상대에게 링크를 보내주세요.
                </p>
              </>
            ) : invite.alreadyConnected ? (
              <>
                <h1 className={styles.heading}>이미 연결된 사이예요</h1>
                <p className={styles.desc}>
                  {inviterName}님과는 이미 연결되어 있어요. 바로 편지를 보낼 수 있어요.
                </p>
                <button
                  type="button"
                  className={styles.primaryBtn}
                  onClick={() => navigate('/people')}
                >
                  주고받은 사람으로 가기
                </button>
              </>
            ) : (
              <>
                <h1 className={styles.heading}>{inviterName}님이 연결을 요청했어요</h1>
                <p className={styles.desc}>
                  수락하면 서로 연결되어, 링크 없이 바로 편지를 주고받을 수 있어요.
                </p>
                <button
                  type="button"
                  className={styles.primaryBtn}
                  onClick={() => void handleAccept()}
                  disabled={isAccepting}
                >
                  {isAccepting ? '수락 중…' : '수락'}
                </button>
                {acceptError !== null && <p className={styles.error}>{acceptError}</p>}
              </>
            )}
          </>
        )}

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
