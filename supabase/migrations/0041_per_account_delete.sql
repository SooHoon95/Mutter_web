set lock_timeout = '3s'; set statement_timeout = '30s';

-- supabase/migrations/0041_per_account_delete.sql
--
-- 1) 삭제는 계정 단위. 보낸 사람이 편지를 지워도 이미 받은 사람(받은 편지함에 가진 사람)은 계속 본다.
--    - 보낸 사람 삭제 = 보낸 편지 목록에서 빠짐(삭제함 30일, 되돌리기 가능) + 아직 안 받은 사람에게 링크가 닫힘.
--    - 삭제함 30일 경과·"영구 삭제"·회원 탈퇴 = 보낸 사람 쪽에서 완전히 끊김(owner_purged_at). 되돌릴 수 없다.
--    - 편지와 사진은 보낸 사람 쪽에서 끊겼고 받은 편지함에 가진 사람도 없을 때 지운다.
--    - 무료 기간·유예가 끝난 편지(gone)는 지금처럼 가진 사람이 있어도 지운다.
--    - 받은 사람이 편지권으로 간직한 편지는 보낸 사람이 지워도 남으므로 환급 규칙을 없앤다.
-- 2) 무료 기간 7일, 닫힘 예고는 2일 전(warn_days).
-- 3) 간직 요청(0040) 폐지 — 받은 사람이 보낸 사람에게 "편지권을 써 달라"고 하는 흐름이 부자연스럽다.
--    대신 받은 사람은 무료 기간 안에도 자기 편지권으로 간직할 수 있다(keep_received_letter는 open 상태에서도 된다).
--
-- "받은 사람" = inbox_all 행이 있는 사람(삭제함에 둔 것도 30일 동안 되살릴 수 있으니 포함).
-- 로그인한 받은 사람은 편지를 열 때 자동으로 받은 편지함에 들어간다(get_letter_by_token).
-- 로그인 없이 읽은 사람은 특정할 수 없어, 보낸 사람이 지우면 링크가 닫힌다.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. 설정
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.monetization_config
  add column warn_days int not null default 2 check (warn_days >= 0);
alter table public.monetization_config alter column free_days set default 7;
update public.monetization_config set free_days = 7 where id;

create or replace function public.get_my_entitlements()
returns json language plpgsql stable security definer set search_path = public as $$
declare
  v_cfg monetization_config;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_cfg from monetization_config where id;
  return json_build_object(
    'is_admin',     private.is_admin_user(auth.uid()),
    'tickets',      private.ticket_balance(auth.uid()),
    'paid_enabled', (v_cfg.paid_from is not null and now() >= v_cfg.paid_from) or private.is_tester(auth.uid()),
    'free_days',    v_cfg.free_days,
    'grace_days',   v_cfg.grace_days,
    'warn_days',    v_cfg.warn_days
  );
end $$;
revoke all on function public.get_my_entitlements() from public, anon, authenticated;
grant execute on function public.get_my_entitlements() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. 보낸 사람 쪽에서 끊긴 편지 표시 + 탈퇴해도 편지가 남게 FK를 푼다.
--    owner_id는 탈퇴 뒤에도 값이 남는다(사진 경로 <owner_id>/<letter_id>/ 를 찾는 데 필요하고,
--    이미 설치된 앱이 sender_id를 null로 받으면 디코딩에 실패한다). 그 uid는 다시 쓰이지 않는다.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.letters_all add column owner_purged_at timestamptz;
comment on column public.letters_all.owner_purged_at is
  '보낸 사람 쪽에서 완전히 끊긴 시각(삭제함 30일 경과·영구 삭제·탈퇴). 받은 사람이 가진 동안만 행이 남는다';
create index letters_all_owner_purged_idx on public.letters_all (owner_purged_at) where owner_purged_at is not null;

alter table public.letters_all drop constraint letters_owner_id_fkey;
alter table public.delivery_links drop constraint delivery_links_owner_id_fkey;

create or replace function private.detach_letters_on_user_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update letters_all
     set deleted_at      = coalesce(deleted_at, now()),
         owner_purged_at = coalesce(owner_purged_at, now())
   where owner_id = old.id;
  return old;
end $$;
revoke all on function private.detach_letters_on_user_delete() from public, anon, authenticated;

create trigger detach_letters_on_user_delete
  before delete on auth.users
  for each row execute function private.detach_letters_on_user_delete();

-- 받은 사람인가(받은 편지함에 가진 사람 — 삭제함에 둔 것 포함).
create or replace function private.is_letter_holder(p_letter_id uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_user is not null
     and exists (select 1 from inbox_all i where i.letter_id = p_letter_id and i.user_id = p_user);
$$;
revoke all on function private.is_letter_holder(uuid, uuid) from public, anon, authenticated;

-- 이 사람이 이 편지를 링크로 열 수 있는가: 보낸 사람이 지우지 않았거나, 이미 받은 사람이다.
create or replace function private.letter_reachable(p_letter_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from letters_all l
     where l.id = p_letter_id
       and (l.deleted_at is null or private.is_letter_holder(l.id, auth.uid())));
$$;
revoke all on function private.letter_reachable(uuid) from public, anon, authenticated;

-- 보낸 사람 닉네임. 탈퇴한 계정이면 '탈퇴한 사용자'.
create or replace function private.sender_nickname(p_owner uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select nickname from profiles where id = p_owner),
    case when not exists (select 1 from auth.users u where u.id = p_owner) then '탈퇴한 사용자' end);
$$;
revoke all on function private.sender_nickname(uuid) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. 읽기 게이트 — 0037과 같고 "편지 존재" 판정만 바뀐다.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function private.check_link(p_token text, p_password text)
returns delivery_links
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_link delivery_links;
begin
  select * into v_link from delivery_links where token = p_token;
  if not found then raise exception 'TOKEN_NOT_FOUND'; end if;

  if v_link.revoked then raise exception 'LINK_REVOKED'; end if;

  if v_link.expires_at is not null and v_link.expires_at < now() then
    raise exception 'LINK_EXPIRED';
  end if;

  if auth.uid() is null and (
       (select require_login from monetization_config where id)
       or exists (select 1 from letter_access a where a.letter_id = v_link.letter_id and a.is_metered)
     ) then
    raise exception 'LOGIN_REQUIRED';
  end if;

  if v_link.reveal_at is not null and v_link.reveal_at > now() then
    raise exception 'NOT_YET_REVEALED:%',
      to_char(v_link.reveal_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  end if;

  if v_link.password_hash is not null then
    if p_password is null or crypt(p_password, v_link.password_hash) <> v_link.password_hash then
      raise exception 'WRONG_PASSWORD';
    end if;
  end if;

  -- ⑦ 편지 존재: 보낸 사람이 지운 편지는 이미 받은 사람에게만 남아 있다.
  if not private.letter_reachable(v_link.letter_id) then
    raise exception 'LETTER_NOT_FOUND';
  end if;

  return v_link;
end $$;
revoke all on function private.check_link(text, text) from public, anon, authenticated;

create or replace function private.open_letter(p_token text, p_password text, p_record boolean)
returns letters_all
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_link   delivery_links;
  v_letter letters_all;
begin
  v_link := private.check_link(p_token, p_password);
  select * into v_letter from letters_all where id = v_link.letter_id;
  if not found then raise exception 'LETTER_NOT_FOUND'; end if;

  perform private.assert_readable(v_letter.id, v_letter.owner_id);

  if p_record and auth.uid() is not null and auth.uid() <> v_letter.owner_id then
    insert into letter_readers (letter_id, user_id)
    values (v_letter.id, auth.uid())
    on conflict (letter_id, user_id) do update
      set last_opened_at = now(), open_count = letter_readers.open_count + 1;

    update letter_access set first_opened_at = now()
     where letter_id = v_letter.id and first_opened_at is null;
  end if;

  return v_letter;
end $$;
revoke all on function private.open_letter(text, text, boolean) from public, anon, authenticated;

create or replace function public.get_letter_cover(p_token text)
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_link   delivery_links;
  v_letter letters_all;
  v_state  text;
  v_until  timestamptz;
  v_del    timestamptz;
begin
  select * into v_link from delivery_links where token = p_token;
  if not found
     or v_link.revoked
     or (v_link.expires_at is not null and v_link.expires_at < now())
     or v_link.password_hash is not null
     or (v_link.reveal_at is not null and v_link.reveal_at > now())
     or not private.letter_reachable(v_link.letter_id) then
    return json_build_object('sealed', true);
  end if;

  select * into v_letter from letters_all where id = v_link.letter_id;

  select s.state, s.access_until, s.delete_at into v_state, v_until, v_del
    from private.letter_state(v_letter.id) s;

  return json_build_object(
    'sealed',          false,
    'template_id',     coalesce(v_letter.template_id, 'classic-serif'),
    'title',           v_letter.title,
    'sender_nickname', private.sender_nickname(v_letter.owner_id),
    'state',           v_state,
    'access_until',    v_until,
    'delete_at',       v_del,
    'login_required',  (select require_login from monetization_config where id)
                       or exists (select 1 from letter_access a where a.letter_id = v_letter.id and a.is_metered)
  );
end $$;
revoke all on function public.get_letter_cover(text) from public, anon, authenticated;
grant execute on function public.get_letter_cover(text) to anon, authenticated;

create or replace function public.save_to_inbox(p_token text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_link  delivery_links;
  v_owner uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_link from delivery_links where token = p_token;
  if not found then raise exception 'TOKEN_NOT_FOUND'; end if;
  if v_link.revoked then raise exception 'LINK_REVOKED'; end if;
  if v_link.expires_at is not null and v_link.expires_at < now() then
    raise exception 'LINK_EXPIRED';
  end if;
  if not private.letter_reachable(v_link.letter_id) then raise exception 'LETTER_NOT_FOUND'; end if;

  select owner_id into v_owner from letters_all where id = v_link.letter_id;
  perform private.assert_readable(v_link.letter_id, v_owner);

  insert into inbox (user_id, letter_id, token)
  values (auth.uid(), v_link.letter_id, p_token)
  on conflict (user_id, letter_id)
    do update set token = excluded.token, saved_at = now();
end;
$$;

-- 읽음 기록은 보낸 사람을 위한 것 — 보낸 사람이 지운 편지는 기록하지 않는다.
create or replace function public.record_letter_open(p_token text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_link  delivery_links;
  v_state text;
begin
  select * into v_link from delivery_links where token = p_token;
  if not found then return; end if;
  if v_link.revoked then return; end if;
  if v_link.expires_at is not null and v_link.expires_at < now() then return; end if;
  if v_link.reveal_at is not null and v_link.reveal_at > now() then return; end if;
  if not exists (select 1 from letters where id = v_link.letter_id) then return; end if;

  if auth.uid() is null and (
       (select require_login from monetization_config where id)
       or exists (select 1 from letter_access a where a.letter_id = v_link.letter_id and a.is_metered)
     ) then
    return;
  end if;
  select s.state into v_state from private.letter_state(v_link.letter_id) s;
  if v_state in ('locked', 'gone')
     and auth.uid() is distinct from (select owner_id from letters_all where id = v_link.letter_id) then
    return;
  end if;

  insert into letter_opens (token, letter_id, first_opened_at, last_opened_at, open_count)
  values (p_token, v_link.letter_id, now(), now(), 1)
  on conflict (token) do update
    set last_opened_at = now(),
        open_count     = letter_opens.open_count + 1;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. 받은 사람 목록 — 보낸 사람이 지운 편지도 남는다(letters 뷰 대신 letters_all).
--    죽은 링크(회수·만료) 제외는 그대로: 회수는 보낸 사람이 접근을 끊는 수단으로 남는다.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.get_my_inbox()
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
    select i.letter_id, i.token, l.title, i.saved_at, l.owner_id, private.sender_nickname(l.owner_id)
    from inbox i
    join letters_all l on l.id = i.letter_id
    join delivery_links dl on dl.token = i.token
      and dl.revoked = false
      and (dl.expires_at is null or dl.expires_at > now())
    where i.user_id = auth.uid()
    order by i.saved_at desc;
end;
$$;

create or replace function public.get_my_deleted_inbox()
returns table (
  letter_id       uuid,
  token           text,
  title           text,
  sender_id       uuid,
  sender_nickname text,
  deleted_at      timestamptz,
  purge_at        timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  return query
    select i.letter_id, i.token, l.title, l.owner_id, private.sender_nickname(l.owner_id),
           i.deleted_at, i.deleted_at + interval '30 days'
      from inbox_all i
      join letters_all l on l.id = i.letter_id
     where i.user_id = auth.uid() and i.deleted_at is not null
     order by i.deleted_at desc;
end $$;

create or replace function public.get_thread(p_counterpart uuid)
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
    -- 보냄: 내가 지운 편지는 내 쪽에서 빠진다(letters 뷰).
    select l.id, null::text, l.title, 'sent'::text, i.saved_at
    from letters l
    join inbox i on i.letter_id = l.id
    where l.owner_id = auth.uid() and i.user_id = p_counterpart
    union all
    -- 받음: 상대가 지웠어도 내가 받은 편지는 남는다(letters_all).
    select l.id, i.token, l.title, 'received'::text, i.saved_at
    from inbox i
    join letters_all l on l.id = i.letter_id
    join delivery_links dl on dl.token = i.token
      and dl.revoked = false
      and (dl.expires_at is null or dl.expires_at > now())
    where i.user_id = auth.uid() and l.owner_id = p_counterpart
    order by at;
end;
$$;

create or replace function public.get_counterparts()
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
    select i.user_id as cp, i.saved_at as at
    from letters l
    join inbox i on i.letter_id = l.id
    where l.owner_id = auth.uid() and i.user_id <> auth.uid()
    union all
    select l.owner_id as cp, i.saved_at as at
    from inbox i
    join letters_all l on l.id = i.letter_id
    where i.user_id = auth.uid() and l.owner_id <> auth.uid()
  )
  select e.cp, private.sender_nickname(e.cp), count(*)::bigint, max(e.at)
  from exchanges e
  group by e.cp
  order by max(e.at) desc;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. 보낸 사람 삭제함 — 끊긴 편지는 목록·복구에서 빠진다. 영구 삭제는 받은 사람이 있으면 끊기만 한다.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.get_my_deleted_letters()
returns table (id uuid, title text, template_id text, deleted_at timestamptz, purge_at timestamptz)
language plpgsql stable security invoker set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  return query
    select l.id, l.title, l.template_id, l.deleted_at, l.deleted_at + interval '30 days'
      from letters_all l
     where l.owner_id = auth.uid() and l.deleted_at is not null and l.owner_purged_at is null
     order by l.deleted_at desc;
end $$;

create or replace function public.restore_letter(p_letter_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  update letters_all set deleted_at = null
   where id = p_letter_id and owner_id = auth.uid()
     and deleted_at is not null and owner_purged_at is null;
  if not found then raise exception 'LETTER_NOT_FOUND'; end if;
end $$;

-- definer: 받은 사람이 있는지는 남의 inbox 행을 봐야 안다. 본인 편지만 owner_id로 거른다.
create or replace function public.purge_letter(p_letter_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if exists (select 1 from inbox_all i where i.letter_id = p_letter_id) then
    update letters_all set owner_purged_at = now()
     where id = p_letter_id and owner_id = auth.uid()
       and deleted_at is not null and owner_purged_at is null;
  else
    delete from letters_all
     where id = p_letter_id and owner_id = auth.uid()
       and deleted_at is not null and owner_purged_at is null;
  end if;
  if not found then raise exception 'LETTER_NOT_FOUND'; end if;
end $$;
revoke all on function public.purge_letter(uuid) from public, anon;
grant execute on function public.purge_letter(uuid) to authenticated;

-- 환급 규칙 폐지(받은 사람이 간직한 편지는 보낸 사람이 지워도 남는다).
drop trigger if exists letters_refund_on_delete on public.letters_all;
drop trigger if exists letters_refund_on_trash on public.letters_all;
drop function if exists public.letters_refund_on_remove();

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. 정리 작업용(service role) — Edge Function purge-deleted-letters가 쓴다.
-- ─────────────────────────────────────────────────────────────────────────────
-- 삭제함 30일이 지난 편지를 보낸 사람 쪽에서 끊는다. 끊은 개수를 돌려준다.
create or replace function public.settle_trashed_letters()
returns int language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  update letters_all set owner_purged_at = now()
   where deleted_at < now() - interval '30 days' and owner_purged_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke all on function public.settle_trashed_letters() from public, anon, authenticated;
grant execute on function public.settle_trashed_letters() to service_role;

-- 지워도 되는 편지: 보낸 사람 쪽에서 끊겼고 받은 편지함에 가진 사람이 없다.
create or replace function public.deletable_letter_ids(p_limit int)
returns table (id uuid, owner_id uuid)
language sql stable security definer set search_path = public as $$
  select l.id, l.owner_id
    from letters_all l
   where l.owner_purged_at is not null
     and not exists (select 1 from inbox_all i where i.letter_id = l.id)
   order by l.owner_purged_at
   limit p_limit;
$$;
revoke all on function public.deletable_letter_ids(int) from public, anon, authenticated;
grant execute on function public.deletable_letter_ids(int) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. 그 밖
-- ─────────────────────────────────────────────────────────────────────────────
-- kept_by_recipient는 "지우면 영구가 풀려요" 경고용이었다 — 이제 풀리지 않으므로 항상 false.
-- keep_request_count(0040)는 간직 요청과 함께 없앤다(반환 형이 바뀌어 drop 후 다시 만든다).
drop function public.get_letter_access_states(uuid[]);
create function public.get_letter_access_states(p_letter_ids uuid[])
returns table (
  letter_id         uuid,
  state             text,
  access_until      timestamptz,
  delete_at         timestamptz,
  kept_by_recipient boolean
)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  return query
    select l.id, s.state, s.access_until, s.delete_at, false
      from letters_all l
      cross join lateral private.letter_state(l.id) s
     where l.id = any (p_letter_ids)
       and (
         l.owner_id = auth.uid()
         or exists (select 1 from inbox_all i where i.letter_id = l.id and i.user_id = auth.uid())
       );
end $$;
revoke all on function public.get_letter_access_states(uuid[]) from public, anon, authenticated;
grant execute on function public.get_letter_access_states(uuid[]) to authenticated;

-- 닫힘 예고를 warn_days 전에 보낸다. 문구의 일수는 실제 남은 날로 계산한다.
-- 보낸 사람(자기가 지운 편지는 빼고)과, 그 편지를 받은 편지함에 가진 사람 가운데 간직할 수 있는
-- 사람(편지권 화면이 열려 있거나 잔액이 있는 계정)에게 간다. 받은 사람 알림에는 그 사람의 링크 토큰이 실린다.
create or replace function private.notify_letter_locks()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_row    record;
  v_holder record;
  v_title  text;
  v_when   text;
  v_days   int;
  v_cfg    monetization_config;
  v_paid   boolean;
  v_count  int := 0;
begin
  select * into v_cfg from monetization_config where id;
  v_paid := v_cfg.paid_from is not null and now() >= v_cfg.paid_from;
  for v_row in
    select a.letter_id, l.owner_id, l.title, l.deleted_at, s.state, s.access_until, s.delete_at
      from letter_access a
      join letters_all l on l.id = a.letter_id
      cross join lateral private.letter_state(a.letter_id) s
     where a.is_metered
       and a.permanent_at is null
       and a.first_opened_at is not null
       and a.purge_claimed_at is null
       and (
         (s.state = 'open' and a.lock_warned_at is null
            and s.access_until - now() <= make_interval(days => v_cfg.warn_days))
         or (s.state = 'locked' and a.lock_notified_at is null)
       )
  loop
    v_title := coalesce(nullif(btrim(v_row.title), ''), '제목 없는 편지');
    if v_row.state = 'open' then
      v_days := greatest(ceil(extract(epoch from (v_row.access_until - now())) / 86400.0)::int, 0);
      v_when := case when v_days <= 0 then '오늘' else v_days || '일 뒤' end;
      if v_row.deleted_at is null then
        perform notify_push(
          v_row.owner_id,
          '편지가 곧 닫혀요',
          format('"%s" 편지가 %s 닫혀요. 편지권으로 간직할 수 있어요.', v_title, v_when),
          jsonb_build_object('type', 'letter_lock_soon', 'letter_id', v_row.letter_id)
        );
      end if;
      for v_holder in
        select i.user_id, i.token from inbox i
         where i.letter_id = v_row.letter_id and i.user_id <> v_row.owner_id
           and (v_paid or private.is_tester(i.user_id) or private.is_admin_user(i.user_id)
                or private.ticket_balance(i.user_id) > 0)
      loop
        perform notify_push(
          v_holder.user_id,
          '받은 편지가 곧 닫혀요',
          format('%s "%s" 편지가 %s 닫혀요. 간직해 둘 수 있어요.',
                 coalesce(nullif(btrim(private.sender_nickname(v_row.owner_id)), '') || '님의', '받은'),
                 v_title, v_when),
          jsonb_build_object('type', 'received_lock_soon', 'letter_id', v_row.letter_id, 'token', v_holder.token)
        );
      end loop;
      update letter_access set lock_warned_at = now() where letter_id = v_row.letter_id;
    else
      if v_row.deleted_at is null then
        perform notify_push(
          v_row.owner_id,
          '편지가 닫혔어요',
          format('"%s" 편지의 보관 기간이 끝났어요. %s까지 다시 열 수 있어요.',
                 v_title, to_char(v_row.delete_at at time zone 'Asia/Seoul', 'FMMM"월" FMDD"일"')),
          jsonb_build_object('type', 'letter_locked', 'letter_id', v_row.letter_id)
        );
      end if;
      update letter_access
         set lock_notified_at = now(), lock_warned_at = coalesce(lock_warned_at, now())
       where letter_id = v_row.letter_id;
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke all on function private.notify_letter_locks() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. 간직 요청 폐지 — 함수·테이블을 지우고, 편지권 사용에서 요청자 알림을 뺀다(0038 본문으로).
-- ─────────────────────────────────────────────────────────────────────────────
drop function public.request_keep_letter(text, text);
drop function public.get_letter_keep_requests(uuid);
drop table public.letter_keep_requests;

create or replace function private.spend_ticket_on(p_user uuid, p_letter_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_state text;
  v_admin boolean;
begin
  perform 1 from letter_access where letter_id = p_letter_id for update;
  if not found then raise exception 'LETTER_NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(hashtext(p_user::text));

  select s.state into v_state from private.letter_state(p_letter_id) s;
  if v_state = 'gone' then raise exception 'LETTER_GONE'; end if;
  if v_state = 'permanent' then return; end if;

  v_admin := private.is_admin_user(p_user);
  if not v_admin then
    if private.ticket_balance(p_user) < 1 then raise exception 'NO_TICKET'; end if;
    insert into ticket_ledger (user_id, delta, reason, letter_id) values (p_user, -1, 'use', p_letter_id);
  end if;

  update letter_access
     set permanent_at     = now(),
         permanent_by     = p_user,
         permanent_source = case when v_admin then 'admin' else 'ticket' end
   where letter_id = p_letter_id;
end $$;
revoke all on function private.spend_ticket_on(uuid, uuid) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. 권한 정리 — 이 함수들은 예전부터 anon에 execute가 남아 있었다(본문이 AUTH_REQUIRED로 막는다).
--    다시 만든 김에 명시적으로 거둔다.
-- ─────────────────────────────────────────────────────────────────────────────
revoke all on function public.get_my_inbox() from public, anon;
revoke all on function public.get_thread(uuid) from public, anon;
revoke all on function public.get_counterparts() from public, anon;
revoke all on function public.save_to_inbox(text) from public, anon;
revoke all on function public.get_my_deleted_inbox() from public, anon;
grant execute on function public.get_my_inbox() to authenticated;
grant execute on function public.get_thread(uuid) to authenticated;
grant execute on function public.get_counterparts() to authenticated;
grant execute on function public.save_to_inbox(text) to authenticated;
grant execute on function public.get_my_deleted_inbox() to authenticated;
