// delivery_links CRUD + 수신 조회. supabase-data + capability-links 스킬 참조.
// 링크 발급은 server-side RPC(issue_link)를 경유해 암호를 서버에서 해시한다.
// 수신 조회는 RPC get_letter_by_token — anon이 letters를 직접 SELECT하지 않는다.
//
// 보안 수정:
//   H-1: revokeLink가 RPC revoke_link를 호출 (소유권 서버 검증, 직접 UPDATE 제거)
//   M-3: DeliveryLinkRow에 revoked_at 추가, rowToLink 오매핑 수정
//   L-3: openByToken의 내부 에러 코드를 사용자 메시지로 정규화
// 마이그레이션 0011 이후:
//   claim-and-bind 제거 — p_device_id는 서버에서 무시됨. 클라이언트 deviceId 코드 삭제.

import { getSupabase } from './supabase';
import { generateToken } from '../lib/token';
import type { DeliveryLink } from './types';

// ---------------------------------------------------------------------------
// DB row 타입 (delivery_links 테이블 스키마와 1:1)
// ---------------------------------------------------------------------------

// 0011 마이그레이션 이후: claim_device_id / claimed_at 컬럼은 서버에서 더 이상 사용하지 않는다.
// listLinks의 select 명시 컬럼 목록에도 포함하지 않는다.
//
// P2: listLinks는 password_hash 원문을 브라우저에 전송하지 않는다.
// Supabase select에서 `password_hash IS NOT NULL` 표현식으로 존재 여부만 가져온다.
// issueLink는 RPC 반환 row에 password_hash가 포함되므로 RpcDeliveryLinkRow를 별도 유지한다.
interface DeliveryLinkRow {
  id: string;
  letter_id: string;
  owner_id: string;
  token: string;
  /** listLinks 전용: password_hash IS NOT NULL 표현식 결과 (boolean). */
  has_password: boolean;
  expires_at: string | null;
  revoked: boolean;
  revoked_at: string | null; // M-3: 0002 마이그레이션에 추가된 컬럼
  created_at: string;
  reveal_at: string | null; // 0018: 예약 공개 시각
}

/** issueLink RPC 반환 row — password_hash 원문을 포함한다(서버측 처리 후 반환). */
interface RpcDeliveryLinkRow {
  id: string;
  letter_id: string;
  owner_id: string;
  token: string;
  password_hash: string | null;
  expires_at: string | null;
  revoked: boolean;
  revoked_at: string | null;
  created_at: string;
  reveal_at: string | null; // 0018: 예약 공개 시각
}

// ---------------------------------------------------------------------------
// DB row → domain 매핑
// ---------------------------------------------------------------------------

// listLinks용: has_password boolean 필드를 직접 사용한다(password_hash 원문 불필요).
function rowToLink(row: DeliveryLinkRow): DeliveryLink {
  return {
    token: row.token,
    letterId: row.letter_id,
    hasPassword: row.has_password,
    // claimedDeviceId: 0011 마이그레이션 이후 claim-and-bind 제거 — 미설정
    expiresAt: row.expires_at ?? undefined,
    // M-3: revoked_at 컬럼을 사용 (이전에는 claimed_at을 잘못 참조했음)
    revokedAt: row.revoked ? (row.revoked_at ?? undefined) : undefined,
    revealAt: row.reveal_at ?? undefined,
  };
}

// issueLink RPC 반환용: password_hash 원문으로 hasPassword를 판단한다.
function rpcRowToLink(row: RpcDeliveryLinkRow): DeliveryLink {
  return {
    token: row.token,
    letterId: row.letter_id,
    hasPassword: row.password_hash !== null,
    expiresAt: row.expires_at ?? undefined,
    revokedAt: row.revoked ? (row.revoked_at ?? undefined) : undefined,
    revealAt: row.reveal_at ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// 공개 입력 타입
// ---------------------------------------------------------------------------

export interface IssueLinkInput {
  /** 암호 평문 (서버 RPC에서 해시 처리). undefined이면 암호 없음 */
  password?: string;
  /** 만료 일시 ISO 문자열 (옵션) */
  expiresAt?: string;
  /** 예약 공개 시각 ISO 문자열 (옵션). 이 시각 이후에만 열림(0018). */
  revealAt?: string;
}

/** RPC get_letter_by_token 반환 타입 (편지 본문 + 큐 메타) */
export interface LetterPayload {
  id: string;
  title: string;
  paragraphs: unknown;
  templateId: string;
  cues: unknown;
  /** T9: 권리주장자 takedown 통지로 오디오가 비활성화된 경우 true. 본문은 유지된다. */
  audioDisabled: boolean;
}

/**
 * 예약 공개(0018): reveal_at이 미래라 아직 열 수 없는 편지.
 * 서버 RPC가 `NOT_YET_REVEALED:<ISO>`로 raise하면 openByToken이 이 에러로 변환한다.
 * 뷰어는 이 에러를 잡아 "이 시각에 열려요" 봉인 화면을 보여준다.
 */
export class LinkNotYetError extends Error {
  /** 공개 가능 시각(ISO8601 UTC). */
  readonly revealAt: string;
  constructor(revealAt: string) {
    super('NOT_YET_REVEALED');
    this.name = 'LinkNotYetError';
    this.revealAt = revealAt;
  }
}

// ---------------------------------------------------------------------------
// 내부 RPC 에러 코드 → 사용자 메시지 정규화 (issueLink / openByToken 공용)
// ---------------------------------------------------------------------------

/**
 * err에서 메시지 문자열을 추출한다.
 * Supabase JS RPC 에러는 Error 인스턴스가 아닌 plain object {message, code, ...}로 올 수 있다.
 */
function extractMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

/** issueLink RPC 에러 코드 → 한국어 사용자 메시지. */
function normalizeIssueError(err: unknown): never {
  const msg = extractMessage(err);
  console.warn('[issueLink] internal error:', msg);

  if (msg.includes('FORBIDDEN') || msg.includes('not_authorized')) {
    throw new Error('링크를 발급할 권한이 없습니다.');
  }
  if (msg.includes('TOKEN_TOO_SHORT') || msg.includes('INVALID_TOKEN')) {
    throw new Error('토큰 형식이 올바르지 않습니다. 다시 시도해 주세요.');
  }
  if (msg.includes('LETTER_NOT_FOUND')) {
    throw new Error('편지를 찾을 수 없습니다.');
  }
  throw new Error(msg || '링크 발급에 실패했습니다. 잠시 후 다시 시도해 주세요.');
}

/** 내부 코드는 로깅용으로만 보존하고 UI에는 단일 사용자 메시지를 노출한다. */
function normalizeOpenError(err: unknown): never {
  const msg = extractMessage(err);
  // 로깅 (프로덕션에서는 원격 로거로 교체)
  console.warn('[openByToken] internal error:', msg);

  if (msg.includes('TOKEN_NOT_FOUND') || msg.includes('LETTER_NOT_FOUND')) {
    throw new Error('링크를 찾을 수 없습니다.');
  }
  if (msg.includes('LINK_REVOKED')) {
    throw new Error('이 링크는 발신자에 의해 무효화되었습니다.');
  }
  if (msg.includes('LINK_EXPIRED')) {
    throw new Error('링크가 만료되었습니다. 발신자에게 재발급을 요청하세요.');
  }
  if (msg.includes('WRONG_PASSWORD')) {
    throw new Error('암호가 올바르지 않습니다.');
  }
  // 알 수 없는 에러 — 내부 코드 비노출
  throw new Error('편지를 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.');
}

// ---------------------------------------------------------------------------
// 링크 발급
// ---------------------------------------------------------------------------

/**
 * 새 전달 링크를 발급한다.
 * 암호가 있으면 서버 RPC(issue_link)를 통해 bcrypt 해시(pgcrypto crypt)를 서버에서 처리한다.
 * 클라이언트는 평문을 RPC에 보낼 뿐, 해시를 직접 계산하거나 저장하지 않는다.
 *
 * 토큰은 클라이언트에서 generateToken()으로 생성 → RPC에 전달.
 * M-2: 서버 RPC가 토큰 형식(길이·문자셋)을 재검증한다.
 */
export async function issueLink(letterId: string, input: IssueLinkInput): Promise<DeliveryLink> {
  const sb = getSupabase();
  const token = generateToken(); // >=128bit 추측불가 토큰

  // p_reveal_at은 예약 공개를 설정했을 때만 포함한다(zero-downtime 하위호환):
  //   - 미설정(일반): 4개 인자만 전송 → 구(4-arg)·신(5-arg default) 함수 모두와 매칭.
  //   - 설정 시: 5개 인자 → 신(5-arg) 함수와 매칭. 예약 UI 자체가 0018 이후라 안전.
  const params: Record<string, unknown> = {
    p_letter_id: letterId,
    p_token: token,
    p_password: input.password ?? null,
    p_expires_at: input.expiresAt ?? null,
  };
  if (input.revealAt) params.p_reveal_at = input.revealAt;

  const { data, error } = await sb.rpc('issue_link', params);

  // P2: 내부 RPC 에러 코드를 한국어 사용자 메시지로 정규화한다.
  if (error) normalizeIssueError(error);

  // issue_link는 `returns setof`이므로 data는 배열이다. 첫 행을 취한다.
  const rows = (Array.isArray(data) ? data : [data]) as RpcDeliveryLinkRow[];
  const row = rows[0];
  if (!row || !row.token) throw new Error('링크 발급 응답이 비어 있습니다.');
  return rpcRowToLink(row);
}

// ---------------------------------------------------------------------------
// 링크 목록 조회
// ---------------------------------------------------------------------------

/**
 * 편지 id에 속한 모든 전달 링크를 반환한다.
 * RLS에 의해 소유자만 접근 가능.
 */
export async function listLinks(letterId: string): Promise<DeliveryLink[]> {
  const sb = getSupabase();

  // P2: password_hash 원문을 브라우저에 전송하지 않는다.
  // `password_hash IS NOT NULL` 표현식으로 존재 여부만 has_password boolean으로 받는다.
  // has_password는 생성 컬럼(0019) — PostgREST가 raw 표현식을 못 받으므로 실 컬럼으로 노출.
  // password_hash 원문은 select하지 않는다(클라이언트 비노출).
  const { data, error } = await sb
    .from('delivery_links')
    .select(
      'id, letter_id, owner_id, token, expires_at, revoked, revoked_at, created_at, reveal_at, has_password',
    )
    .eq('letter_id', letterId)
    .order('created_at', { ascending: false })
    .returns<DeliveryLinkRow[]>();

  if (error) throw error;
  return (data ?? []).map(rowToLink);
}

// ---------------------------------------------------------------------------
// 링크 revoke (H-1: 직접 UPDATE → RPC revoke_link로 교체)
// ---------------------------------------------------------------------------

/**
 * 토큰으로 링크를 즉시 무효화(revoke)한다.
 * H-1: 클라이언트 직접 .update().eq() 대신 security definer RPC를 사용.
 *       서버가 owner_id = auth.uid() 를 검증하므로 비대칭 권한 문제 해소.
 * M-3: RPC 내부에서 revoked_at 타임스탬프도 설정한다.
 */
export async function revokeLink(token: string): Promise<void> {
  const sb = getSupabase();

  const { error } = await sb.rpc('revoke_link', {
    p_token: token,
  });

  if (error) throw error;
}

// ---------------------------------------------------------------------------
// 수신 조회 (토큰 + 암호 + 기기 ID)
// ---------------------------------------------------------------------------

/**
 * 수신자가 토큰 URL을 열 때 편지 본문을 가져온다.
 * 직접 letters SELECT가 아닌 security definer RPC를 통해서만 접근한다.
 *
 * 서버 RPC(get_letter_by_token)가 다음을 순서대로 검증한다:
 *  1. 토큰 유효성 (존재·revoke·expiry)
 *  2. 암호가 설정된 경우 pgcrypto crypt 비교 (서버 측 — 클라이언트는 평문만 전송)
 *
 * 마이그레이션 0011: claim-and-bind 제거 — p_device_id는 서버에서 무시된다.
 * L-3: 내부 에러 코드(TOKEN_NOT_FOUND 등)는 사용자 메시지로 정규화해 노출한다.
 */
export async function openByToken(
  token: string,
  password: string | undefined,
): Promise<LetterPayload> {
  const sb = getSupabase();

  const { data, error } = await sb.rpc('get_letter_by_token', {
    p_token: token,
    p_password: password ?? null,
  });

  if (error) {
    // 0018 예약 공개: `NOT_YET_REVEALED:<ISO>`는 일반 에러 정규화 전에 별도 타입으로 변환.
    const msg = extractMessage(error);
    const notYet = msg.match(/NOT_YET_REVEALED:(.+)$/);
    if (notYet) throw new LinkNotYetError(notYet[1].trim());
    normalizeOpenError(error);
  }
  if (!data) throw new Error('편지를 찾을 수 없습니다.');

  // RPC 반환 구조를 domain 타입으로 변환
  const raw = data as {
    id: string;
    title: string;
    paragraphs: unknown;
    template_id: string;
    cues: unknown;
    audio_disabled: boolean;
  };

  return {
    id: raw.id,
    title: raw.title,
    paragraphs: raw.paragraphs,
    templateId: raw.template_id,
    cues: raw.cues,
    audioDisabled: raw.audio_disabled === true,
  };
}

// ---------------------------------------------------------------------------
// 읽음 확인 기록 (0017) — 수신자가 편지를 연 순간 fire-and-forget로 호출.
// ---------------------------------------------------------------------------

/**
 * 수신자가 편지를 실제로 연 순간("편지 열기 ▶" 통과)을 서버에 기록한다.
 * 발신자가 발송함/링크 관리에서 "열어봤어요"를 보게 된다.
 *
 * 수신 경험을 절대 방해하지 않는다(fire-and-forget): 실패해도 throw하지 않고
 * 콘솔 경고만 남긴다. 서버 RPC(record_letter_open)는 anon 호출을 허용하며
 * 무효/만료 링크면 조용히 no-op한다(수신자에게 상태를 누설하지 않음).
 */
export async function recordLetterOpen(token: string): Promise<void> {
  try {
    const sb = getSupabase();
    const { error } = await sb.rpc('record_letter_open', { p_token: token });
    if (error) console.warn('[recordLetterOpen] rpc error:', error);
  } catch (err) {
    // 네트워크/클라이언트 예외도 수신 경험을 막지 않는다.
    console.warn('[recordLetterOpen] failed:', err);
  }
}
