// useInbox — 받은 편지함 react-query hook.
// 조회(getMyInbox)와 저장(saveToInbox) 뮤테이션을 제공한다.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getMyInbox, saveToInbox } from '@/data/inbox';
import type { InboxItem } from '@/data/inbox';

const INBOX_QUERY_KEY = ['inbox'] as const;

/** 받은 편지함 목록 조회 + saveToInbox 뮤테이션 */
export function useInbox(): {
  items: InboxItem[];
  isLoading: boolean;
  error: Error | null;
  save: (token: string) => Promise<void>;
  isSaving: boolean;
} {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<InboxItem[], Error>({
    queryKey: INBOX_QUERY_KEY,
    queryFn: getMyInbox,
    // 로그인 상태에서만 호출하므로 별도 enabled 가드 없음.
    // SaveToInboxButton이 useAuth() 로그인 확인 후 렌더하므로 이 hook은 인증 후에만 마운트된다.
  });

  const mutation = useMutation<void, Error, string>({
    mutationFn: saveToInbox,
    onSuccess: () => {
      // 저장 성공 후 목록을 다시 불러온다(낙관적 업데이트 대신 단순 invalidate).
      void queryClient.invalidateQueries({ queryKey: INBOX_QUERY_KEY });
    },
  });

  return {
    items: data ?? [],
    isLoading,
    error: error ?? null,
    save: mutation.mutateAsync,
    isSaving: mutation.isPending,
  };
}
