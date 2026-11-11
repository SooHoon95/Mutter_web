set lock_timeout = '3s'; set statement_timeout = '30s';

-- supabase/migrations/0038_tickets.sql
--
-- 영구 편지권: 구매 기록 · 원장 · 사용 · 자동 환급.
-- 설계: Mutter/docs/superpowers/specs/2026-11-11-permanent-letter-ticket-design.md (9절 우선)
--
-- 잔액은 원장(ticket_ledger) 합계다. 지급은 Edge Function verify-purchase가 service role로
-- credit_purchase를 부를 때만 일어난다. 클라이언트는 두 테이블을 읽기만 한다(본인 행).
--
-- 운영자가 편지권을 그냥 줄 때:
--   insert into ticket_ledger (user_id, delta, reason) values ('<uuid>', 3, 'grant');

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. 테이블
-- ─────────────────────────────────────────────────────────────────────────────
create table public.ticket_purchases (
  id                   uuid primary key default gen_random_uuid(),
  -- 탈퇴해도 행을 남긴다(거래 유일성·감사 기록 보존 → 같은 영수증으로 다시 지급받을 수 없다).
  user_id              uuid references auth.users(id) on delete set null,
  platform             text not null check (platform in ('ios', 'android')),
  product_id           text not null,
  -- 스토어 거래를 유일하게 가리키는 키. 테스트 환경의 거래 번호는 재사용되므로 verify-purchase가
  -- 환경·사용자·시각을 섞어 유일하게 만들어 넘긴다.
  store_transaction_id text not null,
  tickets              int not null check (tickets > 0),
  environment          text not null,
  raw                  jsonb,
  created_at           timestamptz not null default now(),
  unique (platform, store_transaction_id)
);
comment on table public.ticket_purchases is '편지권 구매 기록(스토어 거래 1건당 1행). 중복 지급 방지의 기준';

create table public.ticket_ledger (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  delta       int not null check (delta <> 0),
  reason      text not null check (reason in ('purchase', 'use', 'grant', 'refund')),
  purchase_id uuid references public.ticket_purchases(id),
  letter_id   uuid references public.letters_all(id) on delete set null,
  environment text,  -- 구매 행의 스토어 환경(Xcode·Sandbox·PlayTest·…). 실판매 전환 때 테스트분 정리에 쓴다.
  created_at  timestamptz not null default now()
);
comment on table public.ticket_ledger is '편지권 원장 — 잔액 = sum(delta)';
create index ticket_ledger_user_idx on public.ticket_ledger (user_id, created_at desc);

alter table public.ticket_purchases enable row level security;
alter table public.ticket_ledger enable row level security;
revoke all on public.ticket_purchases from public, anon, authenticated;
revoke all on public.ticket_ledger from public, anon, authenticated;
grant select on public.ticket_purchases to authenticated;
grant select on public.ticket_ledger to authenticated;
create policy "ticket_purchases_self_select" on public.ticket_purchases
  for select using (user_id = auth.uid());
create policy "ticket_ledger_self_select" on public.ticket_ledger
  for select using (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. 잔액 · 권한 조회
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function private.ticket_balance(p_user uuid)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(sum(delta), 0)::int from ticket_ledger where user_id = p_user;
$$;
revoke all on function private.ticket_balance(uuid) from public, anon, authenticated;

-- 앱은 이것 하나로 구매 화면 노출을 정한다. paid_enabled가 false면 편지권 UI를 보이지 않는다.
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
    'grace_days',   v_cfg.grace_days
  );
end $$;
revoke all on function public.get_my_entitlements() from public, anon, authenticated;
grant execute on function public.get_my_entitlements() to authenticated;

create or replace function public.get_my_ticket_history()
returns table (created_at timestamptz, delta int, reason text, letter_title text)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  return query
    select t.created_at, t.delta, t.reason, l.title
      from ticket_ledger t
      left join letters_all l on l.id = t.letter_id
     where t.user_id = auth.uid()
     order by t.created_at desc;
end $$;
revoke all on function public.get_my_ticket_history() from public, anon, authenticated;
grant execute on function public.get_my_ticket_history() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. 사용 — 편지를 영구로 만든다.
--    잠금 순서 고정: 편지 행(letter_access) → 사용자(advisory). 보낸 사람과 받은 사람이 같은 편지에
--    동시에 써도 뒤에 온 쪽은 "이미 영구"를 보고 차감 없이 끝난다.
-- ─────────────────────────────────────────────────────────────────────────────
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
end $$;
revoke all on function private.spend_ticket_on(uuid, uuid) from public, anon, authenticated;

-- 보낸 사람용.
create or replace function public.make_letter_permanent(p_letter_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (select 1 from letters l where l.id = p_letter_id and l.owner_id = auth.uid()) then
    raise exception 'FORBIDDEN';
  end if;
  perform private.spend_ticket_on(auth.uid(), p_letter_id);
end $$;
revoke all on function public.make_letter_permanent(uuid) from public, anon, authenticated;
grant execute on function public.make_letter_permanent(uuid) to authenticated;

-- 받은 사람용. 링크 검사(회수·만료·예약 공개·암호)를 본문 게이트와 똑같이 지난다.
-- 잠긴 뒤 처음 온 사람도 쓸 수 있고, 쓰면 받은 편지함에 들어간다.
create or replace function public.keep_received_letter(p_token text, p_password text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_link  delivery_links;
  v_owner uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  v_link := private.check_link(p_token, p_password);
  perform private.spend_ticket_on(auth.uid(), v_link.letter_id);

  -- 소유자는 받은 편지함에 넣지 않는다(자기 편지가 받은함에 생기고 "편지가 도착했어요" 푸시가 간다 — 0022 ⑦과 같은 규칙).
  select owner_id into v_owner from letters_all where id = v_link.letter_id;
  if auth.uid() <> v_owner then
    insert into inbox (user_id, letter_id, token)
    values (auth.uid(), v_link.letter_id, p_token)
    on conflict (user_id, letter_id)
      do update set token = excluded.token, saved_at = now();
  end if;
end $$;
revoke all on function public.keep_received_letter(text, text) from public, anon, authenticated;
grant execute on function public.keep_received_letter(text, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. 지급 — verify-purchase(Edge Function, service role) 전용.
--    새로 지급하면 true, 같은 거래가 이미 있으면 false(원장 불변).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.credit_purchase(
  p_user           uuid,
  p_platform       text,
  p_product_id     text,
  p_transaction_id text,
  p_tickets        int,
  p_environment    text,
  p_raw            jsonb
)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_purchase uuid;
begin
  insert into ticket_purchases (user_id, platform, product_id, store_transaction_id, tickets, environment, raw)
  values (p_user, p_platform, p_product_id, p_transaction_id, p_tickets, p_environment, p_raw)
  on conflict (platform, store_transaction_id) do nothing
  returning id into v_purchase;

  if v_purchase is null then return false; end if;

  insert into ticket_ledger (user_id, delta, reason, purchase_id, environment)
  values (p_user, p_tickets, 'purchase', v_purchase, p_environment);
  return true;
end $$;
revoke all on function public.credit_purchase(uuid, text, text, text, int, text, jsonb) from public, anon, authenticated;
grant execute on function public.credit_purchase(uuid, text, text, text, int, text, jsonb) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. 환급 — 받은 사람이 편지권을 붙인 편지를 보낸 사람이 지우면(삭제함 이동·영구 삭제·탈퇴)
--    그 받은 사람에게 1장을 돌려주고 영구 표시를 지운다.
--    영구 표시를 지우는 이유: 그대로 두면 계정 두 개로 "편지권 사용 → 삭제 → 복구"를 반복해
--    편지권을 돌려받으면서 편지는 영구로 남길 수 있다.
--    시계 보정: 복구된 편지가 이미 유예까지 지난 상태면 다음 정리 작업이 편지와 사진을 지워
--    "되돌리기"가 편지를 잃게 만든다 → 최악의 경우에도 "방금 잠김"이 되게 맞춘다.
--    security definer: 삭제는 authenticated 권한(letters 뷰의 soft delete)으로 일어난다.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.letters_refund_on_remove()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_a    letter_access;
  v_free int;
begin
  select * into v_a from letter_access where letter_id = old.id for update;
  if found
     and v_a.permanent_source = 'ticket'
     and v_a.permanent_by is distinct from old.owner_id
     and v_a.refunded_at is null then

    if exists (select 1 from auth.users u where u.id = v_a.permanent_by) then
      insert into ticket_ledger (user_id, delta, reason, letter_id)
      values (v_a.permanent_by, 1, 'refund', old.id);
    end if;

    select free_days into v_free from monetization_config where id;
    update letter_access
       set permanent_at     = null,
           permanent_by     = null,
           permanent_source = null,
           refunded_at      = now(),
           first_opened_at  = case when first_opened_at is null then null
                                   else greatest(first_opened_at, now() - make_interval(days => v_free)) end,
           lock_warned_at   = null,
           lock_notified_at = null
     where letter_id = old.id;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.letters_refund_on_remove() from public, anon, authenticated;

create trigger letters_refund_on_delete
  before delete on public.letters_all
  for each row execute function public.letters_refund_on_remove();

-- PostgREST로 letters_all.deleted_at을 직접 바꾸는 경로도 여기서 잡힌다.
create trigger letters_refund_on_trash
  after update of deleted_at on public.letters_all
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.letters_refund_on_remove();
