// 프로필 서버 상태를 react-query로 관리하는 hook.
// getMyProfile 조회 + updateNickname 뮤테이션을 캡슐화한다.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getMyProfile, upsertNickname } from '@/data/profiles';
import type { Profile } from '@/data/profiles';
import { useAuth } from '@/app/AuthProvider';

/** react-query 캐시 키 — profiles 도메인 전역 단일 키(사용자 id로 스코프) */
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
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const { data: profile, isLoading, error } = useQuery<Profile | null, Error>({
    queryKey: [...PROFILE_QUERY_KEY, userId],
    queryFn: () => getMyProfile(userId as string),
    // 비로그인 상태(랜딩 등 Home에서 호출)에서는 쿼리하지 않는다.
    enabled: userId !== null,
  });

  const mutation = useMutation<Profile, Error, string>({
    mutationFn: (nickname: string) => upsertNickname(userId as string, nickname),
    onSuccess: () => {
      // 뮤테이션 성공 후 캐시 무효화 → 최신 프로필 재조회(프리픽스 매칭)
      void queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY });
    },
  });

  // 닉네임은 자동으로 시드하지 않는다. 가입 완료 화면(/welcome)에서 사용자가 직접 입력하거나
  // 마이페이지에서 변경해 명시적으로 DB(profiles.nickname)에 저장한다(사용자 통제).

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
