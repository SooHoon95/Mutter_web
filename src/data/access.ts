// 편지 접근 상태 데이터 레이어 (0037 읽기 게이트). supabase-data 스킬 참조.
// 서버 계약: Mutter/docs/specs/permanent-letter-contract.md
//
// - 봉투(get_letter_cover): 로그인 전 화면·잠김 화면의 겉면(제목·보낸 사람). 본문·열람 기록 없음.
// - 목록 상태(get_letter_access_states): 보낸 편지·받은 편지함에 합칠 영구/남은 기간/닫힘.
// - 열람자(get_letter_readers): 보낸 사람(소유자)만.
// - 게이트 오류 코드(LOGIN_REQUIRED·LETTER_LOCKED:<ISO>·LETTER_GONE·NO_TICKET)를 타입 있는 에러로 바꾼다.

import { getSupabase } from './supabase';

// ---------------------------------------------------------------------------
// 게이트 오류 — 화면이 instanceof로 분기한다(문구는 계약의 문구 표 그대로)
// ---------------------------------------------------------------------------

/** 로그인해야 열리는 편지(익명 호출). 봉투 화면 → 로그인 → 같은 편지로 복귀. */
export class LoginRequiredError extends Error {
  constructor() {
    super('로그인하면 편지가 열려요');
    this.name = 'LoginRequiredError';
  }
}

/** 무료 기간이 끝난 편지. deleteAt(ISO8601 UTC)까지 편지권으로 다시 열 수 있다. */
export class LetterLockedError extends Error {
  readonly deleteAt: string;
  constructor(deleteAt: string) {
    super('보관 기간이 지난 편지예요');
    this.name = 'LetterLockedError';
    this.deleteAt = deleteAt;
  }
}

/** 유예까지 끝나 되살릴 수 없는 편지. */
export class LetterGoneError extends Error {
  constructor() {
    super('더 이상 열 수 없는 편지예요');
    this.name = 'LetterGoneError';
  }
}

/** 편지권 잔액 부족. 웹은 구매가 없으므로 앱 안내만 한다. */
export class NoTicketError extends Error {
  constructor() {
    super('편지권이 없어요');
    this.name = 'NoTicketError';
  }
}

/** Supabase 에러는 Error가 아닌 plain object {message}로 올 수 있다. */
function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

/** 게이트 오류 코드면 타입 있는 에러로, 아니면 null(호출부가 기존 정규화를 탄다). */
export function toAccessError(err: unknown): Error | null {
  const msg = errorMessage(err);
  const locked = msg.match(/LETTER_LOCKED:(\S+)/);
  if (locked) return new LetterLockedError(locked[1]);
  if (msg.includes('LOGIN_REQUIRED')) return new LoginRequiredError();
  if (msg.includes('LETTER_GONE')) return new LetterGoneError();
  if (msg.includes('NO_TICKET')) return new NoTicketError();
  return null;
}

// ---------------------------------------------------------------------------
// 상태
// ---------------------------------------------------------------------------

/** 편지의 접근 상태. permanent=기간 제한 없음, open=무료 기간 안, locked=잠김, gone=삭제 대상. */
export type LetterState = 'permanent' | 'open' | 'locked' | 'gone';

export interface LetterAccess {
  state: LetterState;
  /** open: 잠기는 시각(아직 아무도 안 열었으면 null) · locked: 잠긴 시각. */
  accessUntil: string | null;
  /** 삭제 예정 시각. */
  deleteAt: string | null;
}

function toState(raw: unknown): LetterState {
  return raw === 'open' || raw === 'locked' || raw === 'gone' ? raw : 'permanent';
}

interface AccessStateRow {
  letter_id: string;
  state: string;
  access_until: string | null;
  delete_at: string | null;
}

/**
 * 편지 id 목록의 접근 상태를 letterId → 상태로 돌려준다.
 * 내가 보냈거나 받은 편지함에 가진 편지만 오고, 나머지 id는 조용히 빠진다.
 */
export async function getLetterAccessStates(letterIds: string[]): Promise<Map<string, LetterAccess>> {
  if (letterIds.length === 0) return new Map();
  const { data, error } = await getSupabase().rpc('get_letter_access_states', {
    p_letter_ids: letterIds,
  });
  if (error) throw error;
  return new Map(
    ((data ?? []) as AccessStateRow[]).map((row) => [
      row.letter_id,
      { state: toState(row.state), accessUntil: row.access_until, deleteAt: row.delete_at },
    ]),
  );
}

// ---------------------------------------------------------------------------
// 봉투
// ---------------------------------------------------------------------------

/**
 * 봉투. sealed면 이유(토큰 없음·회수·만료·암호·예약 공개 전·삭제함)를 알 수 없고 겉면도 없다.
 */
export type LetterCover =
  | { sealed: true }
  | {
      sealed: false;
      templateId: string;
      title: string;
      senderNickname: string | null;
      access: LetterAccess;
      /** 이 편지가 로그인을 요구하는지(호출자의 로그인 여부와 무관). */
      loginRequired: boolean;
    };

interface CoverRow {
  sealed?: boolean;
  template_id?: string | null;
  title?: string | null;
  sender_nickname?: string | null;
  state?: string | null;
  access_until?: string | null;
  delete_at?: string | null;
  login_required?: boolean | null;
}

/** 토큰의 봉투(겉면)를 받는다. anon·로그인 모두 호출 가능, 부수효과 없음. */
export async function getLetterCover(token: string): Promise<LetterCover> {
  const { data, error } = await getSupabase().rpc('get_letter_cover', { p_token: token });
  if (error) throw error;
  const row = (data ?? { sealed: true }) as CoverRow;
  if (row.sealed !== false) return { sealed: true };
  return {
    sealed: false,
    templateId: row.template_id ?? 'classic-serif',
    title: row.title ?? '',
    senderNickname: row.sender_nickname ?? null,
    access: {
      state: toState(row.state),
      accessUntil: row.access_until ?? null,
      deleteAt: row.delete_at ?? null,
    },
    loginRequired: row.login_required === true,
  };
}

// ---------------------------------------------------------------------------
// 열람자 (보낸 사람 전용)
// ---------------------------------------------------------------------------

export interface LetterReader {
  userId: string;
  nickname: string | null;
  firstOpenedAt: string;
  lastOpenedAt: string;
  openCount: number;
}

interface ReaderRow {
  user_id: string;
  nickname: string | null;
  first_opened_at: string;
  last_opened_at: string;
  open_count: number;
}

/** 내 편지를 연 사람들 — 처음 연 순. 소유자가 아니면 서버가 FORBIDDEN. */
export async function getLetterReaders(letterId: string): Promise<LetterReader[]> {
  const { data, error } = await getSupabase().rpc('get_letter_readers', { p_letter_id: letterId });
  if (error) throw error;
  return ((data ?? []) as ReaderRow[]).map((row) => ({
    userId: row.user_id,
    nickname: row.nickname,
    firstOpenedAt: row.first_opened_at,
    lastOpenedAt: row.last_opened_at,
    openCount: Number(row.open_count),
  }));
}
