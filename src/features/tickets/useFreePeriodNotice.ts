// useFreePeriodNotice — 발송 화면(링크 발급·연결 상대에게 보내기)의 무료 기간·삭제 안내 한 줄(서버 계약 "삭제 안내").
//
// 기간 규칙이 붙은 편지(state=open)를 {n}일 편지로 보낼 때만 문장을 돌려준다. 영구 편지로 보내기로 골랐거나
// 권한을 받지 못했으면(서버 반영 전·조회 실패) null — 일수는 서버 값(free_days·grace_days)만 쓴다.

import { freePeriodNotice } from '@/lib/accessLabel';
import { useSendChoice } from './sendChoice';
import { useEntitlements } from './useEntitlements';
import { useLetterAccessStates } from './useLetterAccessStates';

export function useFreePeriodNotice(letterId: string): string | null {
  const { entitlements } = useEntitlements();
  const { states } = useLetterAccessStates([letterId]);
  const { permanent } = useSendChoice();

  if (permanent || !entitlements || states.get(letterId)?.state !== 'open') return null;
  return freePeriodNotice(entitlements.freeDays, entitlements.graceDays);
}
