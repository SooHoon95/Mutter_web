// 프로필 서버 상태를 react-query로 관리하는 hook.
// getMyProfile 조회 + updateNickname 뮤테이션을 캡슐화한다.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getMyProfile, updateNickname } from '@/data/profiles';
import type { Profile } from '@/data/profiles';

/** react-query 캐시 키 — profiles 도메인 전역 단일 키 */
const PROFILE_QUERY_KEY = ['profile', 'me'] as const;

export interface UseProfileReturn {
  profile: Profile | null | undefined;
  isLoading: boolean;
  error: Error | null;
  updateNickname: (nickname: string) => Promise<void>;
  isUpdating: boolean;
}

/**
 * 현재 사용자 프로필을 조회하고 닉네임 변경 뮤테이션을 제공한다.
 * 뮤테이션 성공 시 캐시를 무효화해 UI를 즉시 최신 상태로 갱신한다.
 */
export function useProfile(): UseProfileReturn {
  const queryClient = useQueryClient();

  const { data: profile, isLoading, error } = useQuery<Profile | null, Error>({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: getMyProfile,
  });

  const mutation = useMutation<Profile, Error, string>({
    mutationFn: updateNickname,
    onSuccess: () => {
      // 뮤테이션 성공 후 캐시 무효화 → 최신 프로필 재조회
      void queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY });
    },
  });

  async function handleUpdateNickname(nickname: string): Promise<void> {
    await mutation.mutateAsync(nickname);
  }

  return {
    profile: profile ?? null,
    isLoading,
    error: error ?? null,
    updateNickname: handleUpdateNickname,
    isUpdating: mutation.isPending,
  };
}
