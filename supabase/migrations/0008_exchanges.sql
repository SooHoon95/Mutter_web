-- supabase/migrations/0008_exchanges.sql
--
-- 유저간 주고받은 편지 연결: 상대방 표시 + 주고받은 편지 스레드.
--   - 보낸이 = letters.owner_id
--   - 받은이 = 그 편지를 inbox에 저장한 사용자(로그인 + 저장 시 식별됨)
-- profiles/inbox는 RLS로 본인만 접근하므로, 상대 닉네임 조인은 security definer RPC로 한다.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. get_my_inbox 확장 — 보낸이(sender) 정보 포함 (반환 타입 변경 위해 drop 후 재생성)
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists get_my_inbox();
create or replace function get_my_inbox()
returns table (
  letter_id       uuid,
  token           text,
  title           text,
  saved_at        timestamptz,
  sender_id       uuid,
  sender_nickname text
)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  return query
    select i.letter_id, i.token, l.title, i.saved_at, l.owner_id, p.nickname
    from inbox i
    join letters l on l.id = i.letter_id
    left join profiles p on p.id = l.owner_id
    where i.user_id = auth.uid()
    order by i.saved_at desc;
end;
$$;
revoke all on function get_my_inbox() from public;
grant execute on function get_my_inbox() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. 내가 보낸 편지 + 받은이(저장한 사람) 목록
--    한 편지를 여러 명이 저장하면 여러 행. 아무도 저장 안 했으면 recipient=null.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function get_my_sent_with_recipients()
returns table (
  letter_id          uuid,
  title              text,
  created_at         timestamptz,
  recipient_id       uuid,
  recipient_nickname text,
  saved_at           timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  return query
    select l.id, l.title, l.created_at, i.user_id, p.nickname, i.saved_at
    from letters l
    left join inbox i on i.letter_id = l.id and i.user_id <> auth.uid()
    left join profiles p on p.id = i.user_id
    where l.owner_id = auth.uid()
    order by l.created_at desc;
end;
$$;
revoke all on function get_my_sent_with_recipients() from public;
grant execute on function get_my_sent_with_recipients() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. 주고받은 상대 목록(counterparts) — 편지 수·최근 시각
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function get_counterparts()
returns table (
  counterpart_id uuid,
  nickname       text,
  letter_count   bigint,
  last_at        timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  return query
  with exchanges as (
    -- 내가 보낸 편지를 저장한 사람
    select i.user_id as cp, i.saved_at as at
    from letters l
    join inbox i on i.letter_id = l.id
    where l.owner_id = auth.uid() and i.user_id <> auth.uid()
    union all
    -- 내가 저장한 편지의 보낸이
    select l.owner_id as cp, i.saved_at as at
    from inbox i
    join letters l on l.id = i.letter_id
    where i.user_id = auth.uid() and l.owner_id <> auth.uid()
  )
  select e.cp, p.nickname, count(*)::bigint, max(e.at)
  from exchanges e
  left join profiles p on p.id = e.cp
  group by e.cp, p.nickname
  order by max(e.at) desc;
end;
$$;
revoke all on function get_counterparts() from public;
grant execute on function get_counterparts() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. 특정 상대와 주고받은 편지 스레드(시간순)
--    direction='sent'    : 내가 보냄(나=owner, 상대가 저장). token=null → /create/:id로 열람(소유자).
--    direction='received': 내가 받음(상대=owner, 내가 저장). token=내 inbox token → /l/:token.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function get_thread(p_counterpart uuid)
returns table (
  letter_id uuid,
  token     text,
  title     text,
  direction text,
  at        timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  return query
    select l.id, null::text, l.title, 'sent'::text, i.saved_at
    from letters l
    join inbox i on i.letter_id = l.id
    where l.owner_id = auth.uid() and i.user_id = p_counterpart
    union all
    select l.id, i.token, l.title, 'received'::text, i.saved_at
    from inbox i
    join letters l on l.id = i.letter_id
    where i.user_id = auth.uid() and l.owner_id = p_counterpart
    order by at;
end;
$$;
revoke all on function get_thread(uuid) from public;
grant execute on function get_thread(uuid) to authenticated;
