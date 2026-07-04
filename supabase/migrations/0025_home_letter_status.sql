-- supabase/migrations/0025_home_letter_status.sql
--
-- 홈(우체통)에서 "보낸 편지" vs "임시저장"을 정확히 구분하기 위한 파생 상태.
--   - letters에는 발송 상태 컬럼이 없다(작성=행 생성). "보낸"은 운용 파생 상태다.
--   - is_sent := 이 편지에 delivery_link가 하나라도 있거나(링크 발급), 타인의 inbox에 들어갔다(직접 발송).
--     · 전달 링크 발급(issue_link)      → delivery_links 행 생성.
--     · 연결 상대 직접 발송(send_to_connection) → delivery_links + inbox 동시 삽입.
--     따라서 두 조건의 OR이 "한 번이라도 전달됨"을 원자적으로 판정한다(누락 없음).
--
-- 왜 security definer인가: delivery_links/inbox는 owner/본인 RLS로 잠겨 있어, 교차 판정을
-- 클라이언트에 열면 새 policy(정보 노출면 확대)가 필요하다. 서버 함수 내부에서만 조인해
-- 순수 boolean만 돌려주는 것이 RLS 안전(supabase-data 스킬 · 기존 get_my_* RPC와 동일 패턴).
--
-- get_my_sent_with_recipients()와의 역할 구분: 그 함수는 수신자(닉네임·저장시각)까지 포함한
-- "교환" 뷰다. 이 함수는 홈 세그먼트 전용으로 편지 본문(paragraphs)+단순 is_sent만 돌려주는 경량 뷰다.

create or replace function get_my_letters_with_status()
returns table (
  id          uuid,
  title       text,
  template_id text,
  paragraphs  jsonb,
  updated_at  timestamptz,
  is_sent     boolean
)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  return query
    select
      l.id, l.title, l.template_id, l.paragraphs, l.updated_at,
      (
        exists (select 1 from delivery_links dl where dl.letter_id = l.id)
        or exists (select 1 from inbox i where i.letter_id = l.id and i.user_id <> l.owner_id)
      ) as is_sent
    from letters l
    where l.owner_id = auth.uid()   -- 본인 편지만(타계정 데이터 누출 0)
    order by l.updated_at desc;
end;
$$;

revoke all on function get_my_letters_with_status() from public;
grant execute on function get_my_letters_with_status() to authenticated;
