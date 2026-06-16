// useThreads — 주고받은 편지 연결 react-query hooks.
// 상대 목록(useCounterparts)과 특정 상대와의 스레드(useThread)를 제공한다.

import { useQuery } from '@tanstack/react-query';
import { getCounterparts, getThread } from '@/data/threads';
import type { Counterpart, ThreadLetter } from '@/data/threads';

const COUNTERPARTS_QUERY_KEY = ['counterparts'] as const;
const THREAD_QUERY_KEY = ['thread'] as const;

/** 주고받은 상대 목록 조회 */
export function useCounterparts(): {
  counterparts: Counterpart[];
  isLoading: boolean;
  error: Error | null;
} {
  const { data, isLoading, error } = useQuery<Counterpart[], Error>({
    queryKey: COUNTERPARTS_QUERY_KEY,
    queryFn: getCounterparts,
  });

  return {
    counterparts: data ?? [],
    isLoading,
    error: error ?? null,
  };
}

/**
 * 특정 상대와 주고받은 편지 스레드 조회.
 * counterpartId가 null이면 비활성(목록 화면 등 선택 전 상태).
 */
export function useThread(counterpartId: string | null): {
  letters: ThreadLetter[];
  isLoading: boolean;
  error: Error | null;
} {
  const { data, isLoading, error } = useQuery<ThreadLetter[], Error>({
    queryKey: [...THREAD_QUERY_KEY, counterpartId],
    queryFn: () => getThread(counterpartId as string),
    enabled: counterpartId !== null,
  });

  return {
    letters: data ?? [],
    isLoading,
    error: error ?? null,
  };
}
