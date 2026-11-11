// useEntitlements — 편지권 잔액·노출 규칙(get_my_entitlements) react-query hook.
//
// 서버 반영 전(RPC 없음)이나 일시 오류면 조용히 null — 편지권 UI가 하나도 안 보이는 오늘의 화면 그대로.
// 노출 규칙(서버 계약 "화면 노출 규칙"):
//   - paid_enabled=false 이고 is_admin=false → 편지권 UI 전부 숨김.
//   - is_admin=true → 구매·잔액 UI 숨김. 편지권 사용은 차감 없이 된다.

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/app/AuthProvider';
import { getMyEntitlements, type Entitlements } from '@/data/tickets';

export const ENTITLEMENTS_QUERY_KEY = ['entitlements'] as const;

export interface UseEntitlementsResult {
  /** 비로그인·서버 반영 전·조회 실패면 null. */
  entitlements: Entitlements | null;
  /** 편지권을 지금 쓸 수 있는지(관리자는 잔액과 무관하게 차감 없음). */
  canUseTicket: boolean;
  /** 잔액이 없어 "편지권은 뮤터 앱에서 살 수 있어요"를 보일지. */
  showBuyHint: boolean;
  /** 프로필 등에 잔액을 보일지. */
  showBalance: boolean;
}

export function useEntitlements(): UseEntitlementsResult {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const { data } = useQuery<Entitlements | null>({
    queryKey: [...ENTITLEMENTS_QUERY_KEY, userId],
    // 실패를 에러 상태로 두지 않는다 — 에러 UI·재시도 루프 없이 null로 내려 기존 화면을 유지.
    queryFn: () => getMyEntitlements().catch(() => null),
    enabled: userId !== null,
    retry: false,
    staleTime: 60_000,
  });

  const e = userId !== null ? (data ?? null) : null;
  const paid = !!e && e.paidEnabled && !e.isAdmin;
  return {
    entitlements: e,
    canUseTicket: !!e && (e.isAdmin || (e.paidEnabled && e.tickets > 0)),
    showBuyHint: paid && e.tickets <= 0,
    showBalance: paid,
  };
}
