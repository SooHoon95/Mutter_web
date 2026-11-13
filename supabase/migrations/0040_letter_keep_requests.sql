set lock_timeout = '3s'; set statement_timeout = '30s';

-- supabase/migrations/0040_letter_keep_requests.sql
--
-- 간직 요청: 잠긴 편지를 받은 사람이 편지권을 쓰는 대신 보낸 사람에게 "간직하고 싶어요"를 알린다.
-- 보낸 사람은 푸시와 보낸 편지 상세에서 누가 요청했는지 보고 편지권을 붙인다(make_letter_permanent).
-- 받은 사람의 편지권 사용(keep_received_letter)은 그대로 남는다 — 요청은 돈을 쓰지 않는 다른 선택지다.
--
-- 한 편지에 한 사람당 한 번만 알린다(같은 사람이 거듭 눌러도 푸시는 한 번).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. 요청 기록. 클라이언트 접근 없음 — 아래 함수만 쓴다.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.letter_keep_requests (
  letter_id  uuid not null references public.letters_all(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (letter_id, user_id)
);
comment on table public.letter_keep_requests is '간직 요청(편지×받은 사람) — 보낸 사람에게 영구 편지로 만들어 달라고 알린 기록';

alter table public.letter_keep_requests enable row level security;
revoke all on public.letter_keep_requests from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. 받은 사람: 요청 보내기. 링크 검사는 본문 게이트와 같다(잠긴 편지도 링크 검사는 지난다).
--    돌려주는 값: 이번에 새로 알렸으면 true, 이미 알렸거나 알릴 일이 없으면(영구·내 편지) false.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.request_keep_letter(p_token text, p_password text)
returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_link  delivery_links;
  v_owner uuid;
  v_title text;
  v_state text;
  v_nick  text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  v_link := private.check_link(p_token, p_password);

  select owner_id, title into v_owner, v_title from letters_all where id = v_link.letter_id;
  if v_owner = auth.uid() then return false; end if;

  select s.state into v_state from private.letter_state(v_link.letter_id) s;
  if v_state = 'gone' then raise exception 'LETTER_GONE'; end if;
  if v_state = 'permanent' then return false; end if;

  insert into letter_keep_requests (letter_id, user_id)
  values (v_link.letter_id, auth.uid())
  on conflict (letter_id, user_id) do nothing;
  if not found then return false; end if;

  select nullif(btrim(nickname), '') into v_nick from profiles where id = auth.uid();
  perform notify_push(
    v_owner,
    '편지를 간직하고 싶어 해요',
    format('%s "%s" 편지를 간직하고 싶어 해요. 영구 편지로 만들 수 있어요.',
           case when v_nick is null then '받은 분이' else v_nick || '님이' end,
           coalesce(nullif(btrim(v_title), ''), '제목 없는 편지')),
    jsonb_build_object('type', 'letter_keep_request', 'letter_id', v_link.letter_id)
  );
  return true;
end $$;
revoke all on function public.request_keep_letter(text, text) from public, anon, authenticated;
grant execute on function public.request_keep_letter(text, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. 보낸 사람: 누가 요청했는지.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.get_letter_keep_requests(p_letter_id uuid)
returns table (user_id uuid, nickname text, requested_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (select 1 from letters l where l.id = p_letter_id and l.owner_id = auth.uid()) then
    raise exception 'FORBIDDEN';
  end if;
  return query
    select q.user_id, p.nickname, q.created_at
      from letter_keep_requests q
      left join profiles p on p.id = q.user_id
     where q.letter_id = p_letter_id
     order by q.created_at;
end $$;
revoke all on function public.get_letter_keep_requests(uuid) from public, anon, authenticated;
grant execute on function public.get_letter_keep_requests(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. 목록 화면용 상태 조회에 keep_request_count를 더한다(반환 형이 바뀌어 drop 후 다시 만든다).
--    보낸 사람에게만, 아직 영구가 아닌 편지에만 0보다 크다 — 영구가 된 뒤에는 요청을 보일 이유가 없다.
-- ─────────────────────────────────────────────────────────────────────────────
drop function public.get_letter_access_states(uuid[]);
create function public.get_letter_access_states(p_letter_ids uuid[])
returns table (
  letter_id          uuid,
  state              text,
  access_until       timestamptz,
  delete_at          timestamptz,
  kept_by_recipient  boolean,
  keep_request_count int
)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  return query
    select l.id, s.state, s.access_until, s.delete_at,
           l.owner_id = auth.uid() and exists (
             select 1 from letter_access a
              where a.letter_id = l.id
                and a.permanent_source = 'ticket'
                and a.permanent_by is distinct from l.owner_id
           ),
           case when l.owner_id = auth.uid() and s.state in ('open', 'locked')
                then (select count(*)::int from letter_keep_requests q where q.letter_id = l.id)
                else 0 end
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. 봉투에 keep_requested를 더한다 — 잠김 화면이 "이미 알렸어요"를 다시 들어와도 기억한다.
--    나머지는 0037과 같다.
-- ─────────────────────────────────────────────────────────────────────────────
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
     or (v_link.reveal_at is not null and v_link.reveal_at > now()) then
    return json_build_object('sealed', true);
  end if;

  select * into v_letter from letters_all where id = v_link.letter_id and deleted_at is null;
  if not found then
    return json_build_object('sealed', true);
  end if;

  select s.state, s.access_until, s.delete_at into v_state, v_until, v_del
    from private.letter_state(v_letter.id) s;

  return json_build_object(
    'sealed',          false,
    'template_id',     coalesce(v_letter.template_id, 'classic-serif'),
    'title',           v_letter.title,
    'sender_nickname', (select nickname from profiles where id = v_letter.owner_id),
    'state',           v_state,
    'access_until',    v_until,
    'delete_at',       v_del,
    'login_required',  (select require_login from monetization_config where id)
                       or exists (select 1 from letter_access a where a.letter_id = v_letter.id and a.is_metered),
    'keep_requested',  auth.uid() is not null and exists (
                         select 1 from letter_keep_requests q
                          where q.letter_id = v_letter.id and q.user_id = auth.uid())
  );
end $$;
revoke all on function public.get_letter_cover(text) from public, anon, authenticated;
grant execute on function public.get_letter_cover(text) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. 편지가 영구가 되면 요청했던 사람들에게 알린다(편지권을 쓴 본인은 뺀다).
--    나머지는 0038과 같다.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function private.spend_ticket_on(p_user uuid, p_letter_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_state text;
  v_admin boolean;
  v_title text;
  v_req   record;
begin
  perform 1 from letter_access where letter_id = p_letter_id for update;
  if not found then raise exception 'LETTER_NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(hashtext(p_user::text));

  select s.state into v_state from private.letter_state(p_letter_id) s;
  if v_state = 'gone' then raise exception 'LETTER_GONE'; end if;
  if v_state = 'permanent' then return; end if;  -- 이미 영구(또는 14일 규칙 밖) → 차감 없음

  v_admin := private.is_admin_user(p_user);
  if not v_admin then
    if private.ticket_balance(p_user) < 1 then raise exception 'NO_TICKET'; end if;
    insert into ticket_ledger (user_id, delta, reason, letter_id) values (p_user, -1, 'use', p_letter_id);
  end if;

  update letter_access
     set permanent_at     = now(),
         permanent_by     = p_user,
         permanent_source = case when v_admin then 'admin' else 'ticket' end,
         refunded_at      = null
   where letter_id = p_letter_id;

  select coalesce(nullif(btrim(title), ''), '제목 없는 편지') into v_title from letters_all where id = p_letter_id;
  for v_req in
    select q.user_id from letter_keep_requests q where q.letter_id = p_letter_id and q.user_id <> p_user
  loop
    perform notify_push(
      v_req.user_id,
      '편지를 계속 볼 수 있어요',
      format('"%s" 편지가 영구 편지가 됐어요.', v_title),
      jsonb_build_object('type', 'letter_kept', 'letter_id', p_letter_id)
    );
  end loop;
end $$;
revoke all on function private.spend_ticket_on(uuid, uuid) from public, anon, authenticated;
