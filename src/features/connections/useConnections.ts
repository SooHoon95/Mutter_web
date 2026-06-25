// useConnections — 독점 1:1 연결 react-query hooks.
// 연결 목록 조회(getMyConnections) + 초대 생성/수락/해제/직접 발송 뮤테이션을 제공한다.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createInvite,
  acceptInvite,
  disconnect,
  getMyConnections,
  sendToConnection,
} from '@/data/connections';
import type { Connection } from '@/data/connections';

const CONNECTIONS_QUERY_KEY = ['connections'] as const;
// useThreads와 동일한 키 — 직접 발송 후 상대 목록/스레드를 무효화해 stale을 막는다.
const COUNTERPARTS_QUERY_KEY = ['counterparts'] as const;
const THREAD_QUERY_KEY = ['thread'] as const;

interface UseConnectionsReturn {
  connections: Connection[];
  isLoading: boolean;
  error: Error | null;
  createInvite: () => Promise<string>;
  isCreatingInvite: boolean;
  acceptInvite: (token: string) => Promise<void>;
  isAccepting: boolean;
  disconnect: () => Promise<void>;
  isDisconnecting: boolean;
  sendToConnection: (letterId: string, recipientId: string) => Promise<void>;
  isSending: boolean;
}

/** 연결 목록 조회 + 초대/수락/해제/직접 발송 뮤테이션 */
export function useConnections(): UseConnectionsReturn {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<Connection[], Error>({
    queryKey: CONNECTIONS_QUERY_KEY,
    queryFn: getMyConnections,
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: CONNECTIONS_QUERY_KEY });
  };

  const createInviteMutation = useMutation<string, Error, void>({
    mutationFn: createInvite,
    // 초대 생성 성공 → 연결 상태가 바뀔 수 있으므로 목록을 재조회한다.
    onSuccess: invalidate,
  });

  const acceptMutation = useMutation<void, Error, string>({
    mutationFn: acceptInvite,
    // 수락 성공 → 새 연결이 생겼으므로 목록을 다시 불러온다.
    onSuccess: invalidate,
  });

  const disconnectMutation = useMutation<void, Error, void>({
    mutationFn: disconnect,
    // 해제 성공 → 연결 목록을 비운다(invalidate로 재조회).
    onSuccess: invalidate,
  });

  const sendMutation = useMutation<void, Error, { letterId: string; recipientId: string }>({
    mutationFn: ({ letterId, recipientId }) => sendToConnection(letterId, recipientId),
    // 발송 성공 → 상대 목록/스레드가 바뀌므로(새 교류·새 상대) 무효화해 재조회한다.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: COUNTERPARTS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: THREAD_QUERY_KEY });
    },
  });

  return {
    connections: data ?? [],
    isLoading,
    error: error ?? null,
    createInvite: createInviteMutation.mutateAsync,
    isCreatingInvite: createInviteMutation.isPending,
    acceptInvite: acceptMutation.mutateAsync,
    isAccepting: acceptMutation.isPending,
    disconnect: disconnectMutation.mutateAsync,
    isDisconnecting: disconnectMutation.isPending,
    sendToConnection: (letterId, recipientId) =>
      sendMutation.mutateAsync({ letterId, recipientId }),
    isSending: sendMutation.isPending,
  };
}
