// Supabase letters CRUD. supabase-data 스킬 참조.
// DB row ↔ domain(Letter) 매핑을 이 레이어에서 담당한다.
// owner_id는 세션 user에서 추출 — service role key는 클라이언트에 절대 노출 금지.

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from './supabase';
import type { Letter, Paragraph } from './types';

// ---------------------------------------------------------------------------
// DB row 타입 (Supabase 테이블 스키마와 1:1)
// ---------------------------------------------------------------------------

/** letters 테이블 DB row 구조 */
interface LetterRow {
  id: string;
  owner_id: string;
  title: string;
  paragraphs: Paragraph[]; // JSONB 컬럼
  template_id: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// DB row → domain 매핑
// ---------------------------------------------------------------------------

function rowToLetter(row: LetterRow): Letter {
  return {
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    paragraphs: row.paragraphs ?? [],
    templateId: row.template_id ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** 초안 생성 입력 */
export interface CreateDraftInput {
  title: string;
  paragraphs?: Paragraph[];
  templateId?: string;
}

/** 편지 업데이트 입력 */
export interface UpdateLetterInput {
  title?: string;
  paragraphs?: Paragraph[];
  templateId?: string;
}

// ---------------------------------------------------------------------------
// 내부 헬퍼: 현재 세션 user id 추출
// ---------------------------------------------------------------------------

async function getCurrentUserId(sb: SupabaseClient): Promise<string> {
  const { data, error } = await sb.auth.getSession();
  if (error) throw error;
  const userId = data.session?.user.id;
  if (!userId) throw new Error('[letters] 세션이 없습니다. 로그인이 필요합니다.');
  return userId;
}

// ---------------------------------------------------------------------------
// 공개 CRUD API
// ---------------------------------------------------------------------------

/**
 * 새 편지 초안을 생성한다.
 * owner_id는 현재 세션 user에서 자동 설정 — 클라이언트가 주입 불가.
 */
export async function createDraft(input: CreateDraftInput): Promise<Letter> {
  const sb = getSupabase();
  const ownerId = await getCurrentUserId(sb);

  const { data, error } = await sb
    .from('letters')
    .insert({
      owner_id: ownerId,
      title: input.title,
      paragraphs: input.paragraphs ?? [],
      template_id: input.templateId ?? 'default',
    })
    .select()
    .single<LetterRow>();

  if (error) throw error;
  return rowToLetter(data);
}

/**
 * 편지 내용을 업데이트한다.
 * RLS가 owner_id = auth.uid()를 강제하므로 타계정 편지는 자동으로 거부된다.
 */
export async function updateLetter(id: string, input: UpdateLetterInput): Promise<Letter> {
  const sb = getSupabase();

  const patch: Partial<Omit<LetterRow, 'id' | 'owner_id' | 'created_at'>> & {
    updated_at: string;
  } = {
    updated_at: new Date().toISOString(),
  };

  if (input.title !== undefined) patch.title = input.title;
  if (input.paragraphs !== undefined) patch.paragraphs = input.paragraphs;
  if (input.templateId !== undefined) patch.template_id = input.templateId;

  const { data, error } = await sb
    .from('letters')
    .update(patch)
    .eq('id', id)
    .select()
    .single<LetterRow>();

  if (error) throw error;
  return rowToLetter(data);
}

/**
 * id로 편지를 조회한다.
 * RLS에 의해 소유자만 접근 가능. 없거나 타계정이면 null 반환.
 */
export async function getLetter(id: string): Promise<Letter | null> {
  const sb = getSupabase();

  const { data, error } = await sb
    .from('letters')
    .select('*')
    .eq('id', id)
    .maybeSingle<LetterRow>();

  if (error) throw error;
  if (!data) return null;
  return rowToLetter(data);
}

/**
 * 현재 사용자가 소유한 편지 목록을 반환한다.
 * updated_at 내림차순(최신 수정 순).
 */
export async function listMyLetters(): Promise<Letter[]> {
  const sb = getSupabase();
  const ownerId = await getCurrentUserId(sb);

  const { data, error } = await sb
    .from('letters')
    .select('*')
    .eq('owner_id', ownerId)
    .order('updated_at', { ascending: false })
    .returns<LetterRow[]>();

  if (error) throw error;
  return (data ?? []).map(rowToLetter);
}
