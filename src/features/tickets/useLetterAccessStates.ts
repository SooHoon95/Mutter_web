// useLetterAccessStates — 목록(보낸 편지·받은 편지함)에 합칠 편지 접근 상태(get_letter_access_states).
//
// 목록 RPC 반환 형태는 그대로 두고 이 조회를 따로 합친다(서버 계약). 서버 반영 전·오류면 빈 Map —
// 상태 표시만 빠지고 목록은 오늘 그대로.
// "영구"는 편지권 UI가 보이는 계정(유료 전환·테스터·관리자)에만 붙인다. 유료 전환 전에는 모든 편지가
// 영구라 붙이면 소음이다. "{n}일 남음"·"닫힘"은 영구가 아닌 편지에만 오므로 따로 숨기지 않는다.

import { useQuery } from '@tanstack/react-query';
import { getLetterAccessStates, type LetterAccess } from '@/data/access';
import { accessLabel } from '@/lib/accessLabel';
import { useEntitlements } from './useEntitlements';

export const LETTER_ACCESS_QUERY_KEY = ['letterAccess'] as const;

const EMPTY: Map<string, LetterAccess> = new Map();

export interface UseLetterAccessStatesResult {
  states: Map<string, LetterAccess>;
  /** 목록 상태 문구 — `영구` / `{n}일 남음` / `닫힘`, 보일 게 없으면 null. */
  labelFor: (letterId: string) => string | null;
  /** 조회가 끝났는지(실패 포함). */
  loaded: boolean;
}

export function useLetterAccessStates(letterIds: string[]): UseLetterAccessStatesResult {
  const { entitlements } = useEntitlements();
  const ids = [...letterIds].sort();

  const { data } = useQuery<Map<string, LetterAccess>>({
    queryKey: [...LETTER_ACCESS_QUERY_KEY, ids],
    queryFn: () => getLetterAccessStates(ids).catch(() => EMPTY),
    enabled: ids.length > 0,
    retry: false,
    staleTime: 30_000,
  });

  const states = data ?? EMPTY;
  const showPermanent = !!entitlements && (entitlements.paidEnabled || entitlements.isAdmin);

  return {
    states,
    loaded: ids.length === 0 || data !== undefined,
    labelFor: (letterId) => {
      const access = states.get(letterId);
      if (!access) return null;
      if (access.state === 'permanent' && !showPermanent) return null;
      return accessLabel(access);
    },
  };
}
