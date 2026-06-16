-- supabase/migrations/0009_connections.sql
--
-- 특정 사람과의 연결: 초대 링크로 연결 + 연결된 사람에게 직접 발송.
--   - connection_invites: 초대 토큰(발급자). 상대가 로그인 후 수락하면 연결 생성.
--   - connections: 양방향 연결(정규화: user_a = least, user_b = greatest).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. 테이블
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists connection_invites (
  token       text primary key,
  inviter_id  uuid not null references auth.users(id) on delete cascade,
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  created_at  timestamptz not null default now()
);
alter table connection_invites enable row level security;
alter table connection_invites force row level security;
-- 발급자 본인만 직접 접근(조회/수락은 RPC 경유). anon 직접 접근 차단.
create policy "invites_owner" on connection_invites
  for all using (auth.uid() = inviter_id) with check (auth.uid() = inviter_id);

create table if not exists connections (
  id         uuid primary key default gen_random_uuid(),
  user_a     uuid not null references auth.users(id) on delete cascade,
  user_b     uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_a, user_b),
  check (user_a < user_b)
);
alter table connections enable row level security;
alter table connections force row level security;
-- 당사자만 조회(쓰기는 RPC 경유).
create policy "connections_member_read" on connections
  for select using (auth.uid() = user_a or auth.uid() = user_b);

create index if not exists connections_a_idx on connections(user_a);
create index if not exists connections_b_idx on connections(user_b);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RPC: 초대 생성 / 조회 / 수락
-- ─────────────────────────────────────────────────────────────────────────────

-- 초대 생성. 토큰은 클라이언트가 generateToken()으로 만들어 전달(issue_link와 동일 패턴).
create or replace function create_connect_invite(p_token text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if length(p_token) < 22 or p_token !~ '^[A-Za-z0-9_\-]+$' then raise exception 'TOKEN_INVALID'; end if;
  insert into connection_invites (token, inviter_id) values (p_token, auth.uid());
  return p_token;
end;
$$;
revoke all on function create_connect_invite(text) from public;
grant execute on function create_connect_invite(text) to authenticated;

-- 초대 정보 조회(수락 페이지용). 수락자는 로그인 필요.
create or replace function get_connect_invite(p_token text)
returns table (inviter_id uuid, inviter_nickname text, is_self boolean, already_connected boolean)
language plpgsql security definer set search_path = public as $$
declare v_inviter uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select ci.inviter_id into v_inviter from connection_invites ci where ci.token = p_token;
  if v_inviter is null then raise exception 'INVITE_NOT_FOUND'; end if;
  return query
    select v_inviter,
           (select nickname from profiles where id = v_inviter),
           v_inviter = auth.uid(),
           exists (
             select 1 from connections c
             where c.user_a = least(v_inviter, auth.uid())
               and c.user_b = greatest(v_inviter, auth.uid())
           );
end;
$$;
revoke all on function get_connect_invite(text) from public;
grant execute on function get_connect_invite(text) to authenticated;

-- 초대 수락 → 연결 생성.
create or replace function accept_connect_invite(p_token text)
returns void language plpgsql security definer set search_path = public as $$
declare v_inviter uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select inviter_id into v_inviter from connection_invites where token = p_token;
  if v_inviter is null then raise exception 'INVITE_NOT_FOUND'; end if;
  if v_inviter = auth.uid() then raise exception 'CANNOT_CONNECT_SELF'; end if;

  insert into connections (user_a, user_b)
  values (least(v_inviter, auth.uid()), greatest(v_inviter, auth.uid()))
  on conflict (user_a, user_b) do nothing;

  update connection_invites
    set accepted_by = auth.uid(), accepted_at = now()
    where token = p_token;
end;
$$;
revoke all on function accept_connect_invite(text) from public;
grant execute on function accept_connect_invite(text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RPC: 내 연결 목록
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function get_my_connections()
returns table (user_id uuid, nickname text, connected_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  return query
    select case when c.user_a = auth.uid() then c.user_b else c.user_a end,
           p.nickname,
           c.created_at
    from connections c
    left join profiles p
      on p.id = case when c.user_a = auth.uid() then c.user_b else c.user_a end
    where c.user_a = auth.uid() or c.user_b = auth.uid()
    order by c.created_at desc;
end;
$$;
revoke all on function get_my_connections() from public;
grant execute on function get_my_connections() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RPC: 연결된 사람에게 직접 발송
--    내 편지 + 연결 확인 후, delivery_link 생성(암호 없음) + 수신자 inbox에 직접 추가.
--    토큰은 클라이언트 generateToken()으로 만들어 전달.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function send_to_connection(p_letter_id uuid, p_recipient uuid, p_token text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (select 1 from letters where id = p_letter_id and owner_id = auth.uid()) then
    raise exception 'FORBIDDEN';
  end if;
  if not exists (
    select 1 from connections
    where user_a = least(auth.uid(), p_recipient)
      and user_b = greatest(auth.uid(), p_recipient)
  ) then
    raise exception 'NOT_CONNECTED';
  end if;
  if length(p_token) < 22 or p_token !~ '^[A-Za-z0-9_\-]+$' then raise exception 'TOKEN_INVALID'; end if;

  insert into delivery_links (letter_id, owner_id, token)
  values (p_letter_id, auth.uid(), p_token);

  insert into inbox (user_id, letter_id, token)
  values (p_recipient, p_letter_id, p_token)
  on conflict (user_id, letter_id) do update set token = excluded.token, saved_at = now();

  return p_token;
end;
$$;
revoke all on function send_to_connection(uuid, uuid, text) from public;
grant execute on function send_to_connection(uuid, uuid, text) to authenticated;
