// delivery_links CRUD + 수신 조회. supabase-data + capability-links 스킬 참조.
// 링크 발급은 server-side RPC(issue_link)를 경유해 암호를 서버에서 해시한다.
// 수신 조회는 RPC get_letter_by_token — anon이 letters를 직접 SELECT하지 않는다.
//
// 보안 수정:
//   H-1: revokeLink가 RPC revoke_link를 호출 (소유권 서버 검증, 직접 UPDATE 제거)
//   M-3: DeliveryLinkRow에 revoked_at 추가, rowToLink 오매핑 수정
//   L-3: openByToken의 내부 에러 코드를 사용자 메시지로 정규화

import { getSupabase } from './supabase';
import { generateToken } from '../lib/token';
import type { DeliveryLink } from './types';

// ---------------------------------------------------------------------------
// DB row 타입 (delivery_links 테이블 스키마와 1:1)
// ---------------------------------------------------------------------------

interface DeliveryLinkRow {
  id: string;
  letter_id: string;
  owner_id: string;
  token: string;
  password_hash: string | null;
  claim_device_id: string | null;
  claimed_at: string | null;
  expires_at: string | null;
  revoked: boolean;
  revoked_at: string | null; // M-3: 0002 마이그레이션에 추가된 컬럼
  created_at: string;
}

// ---------------------------------------------------------------------------
// DB row → domain 매핑
// ---------------------------------------------------------------------------

function rowToLink(row: DeliveryLinkRow): DeliveryLink {
  return {
    token: row.token,
    letterId: row.letter_id,
    hasPassword: row.password_hash !== null,
    claimedDeviceId: row.claim_device_id ?? undefined,
    expiresAt: row.expires_at ?? undefined,
    // M-3: revoked_at 컬럼을 사용 (이전에는 claimed_at을 잘못 참조했음)
    revokedAt: row.revoked ? (row.revoked_at ?? undefined) : undefined,
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

// ---------------------------------------------------------------------------
// L-3: 내부 RPC 에러 코드 → 사용자 메시지 정규화
// ---------------------------------------------------------------------------

/** 내부 코드는 로깅용으로만 보존하고 UI에는 단일 사용자 메시지를 노출한다. */
function normalizeOpenError(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);

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
  if (msg.includes('DEVICE_MISMATCH')) {
    throw new Error('다른 기기에서 이미 열린 링크입니다. 발신자에게 새 링크를 요청하세요.');
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

  const { data, error } = await sb.rpc('issue_link', {
    p_letter_id: letterId,
    p_token: token,
    p_password: input.password ?? null,
    p_expires_at: input.expiresAt ?? null,
  });

  if (error) throw error;

  // RPC가 발급된 링크 row를 반환한다 (issue_link SQL 참조)
  const row = data as DeliveryLinkRow;
  return rowToLink(row);
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

  const { data, error } = await sb
    .from('delivery_links')
    .select('*')
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
 *  3. claim-and-bind: 원자적 UPDATE로 첫 기기 바인딩, 이후 다른 기기 거부 (M-1)
 *
 * L-3: 내부 에러 코드(TOKEN_NOT_FOUND 등)는 사용자 메시지로 정규화해 노출한다.
 */
export async function openByToken(
  token: string,
  password: string | undefined,
  deviceId: string,
): Promise<LetterPayload> {
  const sb = getSupabase();

  const { data, error } = await sb.rpc('get_letter_by_token', {
    p_token: token,
    p_password: password ?? null,
    p_device_id: deviceId,
  });

  if (error) normalizeOpenError(error);
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
