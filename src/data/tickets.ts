// 편지권 데이터 레이어 (0038). supabase-data 스킬 참조.
// 서버 계약: Mutter/docs/specs/permanent-letter-contract.md
//
// 웹은 구매가 없다(verify-purchase는 앱 전용). 잔액이 있으면 쓰고, 없으면 앱 안내만 한다.
// 일수(free_days·grace_days)는 반드시 get_my_entitlements 값을 쓴다 — 코드에 14·30을 두지 않는다.

import { getSupabase } from './supabase';
import { toAccessError } from './access';

// ---------------------------------------------------------------------------
// 권한 · 잔액
// ---------------------------------------------------------------------------

export interface Entitlements {
  isAdmin: boolean;
  tickets: number;
  /** 유료 전환이 켜졌는지(테스터는 전환 전에도 true). */
  paidEnabled: boolean;
  freeDays: number;
  graceDays: number;
  /** 닫힘 예고를 며칠 전부터 보일지(0041). 키가 없으면 2. */
  warnDays: number;
}

interface EntitlementsRow {
  is_admin: boolean | null;
  tickets: number | null;
  paid_enabled: boolean | null;
  free_days: number;
  grace_days: number;
  warn_days?: number | null;
}

/** 내 편지권 잔액과 화면 노출 판단에 쓰는 값. 로그인 필요. */
export async function getMyEntitlements(): Promise<Entitlements> {
  const { data, error } = await getSupabase().rpc('get_my_entitlements');
  if (error) throw error;
  const row = data as EntitlementsRow;
  return {
    isAdmin: row.is_admin === true,
    tickets: Number(row.tickets ?? 0),
    paidEnabled: row.paid_enabled === true,
    freeDays: Number(row.free_days),
    graceDays: Number(row.grace_days),
    warnDays: Number(row.warn_days ?? 2),
  };
}

export type TicketReason = 'purchase' | 'use' | 'grant' | 'refund';

export interface TicketHistoryEntry {
  createdAt: string;
  delta: number;
  reason: TicketReason;
  letterTitle: string | null;
}

interface TicketHistoryRow {
  created_at: string;
  delta: number;
  reason: TicketReason;
  letter_title: string | null;
}

/** 편지권 내역 — 최근 순. */
export async function getMyTicketHistory(): Promise<TicketHistoryEntry[]> {
  const { data, error } = await getSupabase().rpc('get_my_ticket_history');
  if (error) throw error;
  return ((data ?? []) as TicketHistoryRow[]).map((row) => ({
    createdAt: row.created_at,
    delta: Number(row.delta),
    reason: row.reason,
    letterTitle: row.letter_title,
  }));
}

// ---------------------------------------------------------------------------
// 편지권 사용 — 이미 영구인 편지는 차감 없이 성공, 관리자는 차감 없음
// ---------------------------------------------------------------------------

/** 게이트 오류(NO_TICKET·LETTER_GONE 등)는 타입 있는 에러로, 나머지는 그대로 던진다. */
function throwMapped(error: unknown): never {
  throw toAccessError(error) ?? error;
}

/** 보낸 사람이 자기 편지를 영구로 만든다. FORBIDDEN·NO_TICKET·LETTER_GONE. */
export async function makeLetterPermanent(letterId: string): Promise<void> {
  const { error } = await getSupabase().rpc('make_letter_permanent', { p_letter_id: letterId });
  if (error) throwMapped(error);
}

/**
 * 받은 사람이 링크로 받은 편지를 간직한다. 성공하면 받은 편지함에 들어간다.
 * 무료 기간 안(open)에도, 잠긴 뒤(locked)에도 쓸 수 있다(0041).
 * p_password는 암호가 없어도 키를 생략하지 않고 null을 보낸다(PostgREST 함수 매칭).
 */
export async function keepReceivedLetter(token: string, password: string | null): Promise<void> {
  const { error } = await getSupabase().rpc('keep_received_letter', {
    p_token: token,
    p_password: password,
  });
  if (error) throwMapped(error);
}

// ---------------------------------------------------------------------------
// 사본 — Edge Function duplicate-letter
// ---------------------------------------------------------------------------

/**
 * 같은 내용으로 새 편지를 만들고 새 편지 id를 돌려준다(무료 편지로 시작, 링크 없음).
 * 실패하면 서버 코드(unauthorized·letter_not_found·bad_request·copy_failed)를 메시지로 실은 Error.
 */
export async function duplicateLetter(letterId: string): Promise<string> {
  const { data, error } = await getSupabase().functions.invoke('duplicate-letter', {
    body: { letterId },
  });
  if (error) {
    // non-2xx면 supabase-js가 FunctionsHttpError를 주고, 본문 {error}는 context(Response)에 있다.
    const ctx = (error as { context?: Response }).context;
    let code = 'copy_failed';
    if (ctx && typeof ctx.json === 'function') {
      try {
        const body = (await ctx.json()) as { error?: string };
        if (body?.error) code = String(body.error);
      } catch {
        /* 본문 파싱 실패 — 기본 코드 */
      }
    }
    throw new Error(code);
  }
  const newId = (data as { letterId?: unknown } | null)?.letterId;
  if (typeof newId !== 'string' || !newId) throw new Error('copy_failed');
  return newId;
}
