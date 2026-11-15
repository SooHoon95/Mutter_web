set lock_timeout = '3s'; set statement_timeout = '30s';

-- supabase/migrations/0043_store_refunds.sql
--
-- 스토어 환불을 편지권에 반영한다. 계약: Mutter/docs/specs/permanent-letter-contract.md "환불".
--
-- 1) 구매 행에 환불 시각을 남기고, 원장에 그 구매의 장수만큼 음수(reason 'refund')를 넣는다 — 거래당 한 번.
--    이미 쓴 편지권이면 잔액이 0 아래로 내려갈 수 있다. 그동안은 편지권을 쓸 수 없다(spend는 잔액 ≥ 1을 본다).
--    편지에 붙은 영구 표시는 되돌리지 않는다(받은 사람에게 이미 간 편지를 닫지 않는다).
-- 2) 화면에 보이는 잔액은 0 아래로 보이지 않게 한다(get_my_entitlements.tickets).
--
-- 호출하는 곳: Edge Function apple-notifications(App Store Server Notifications V2 · REFUND),
--              play-voided-sync(Google Play Voided Purchases API, 하루 한 번).

alter table public.ticket_purchases add column refunded_at timestamptz;
comment on column public.ticket_purchases.refunded_at is '스토어 환불이 반영된 시각(한 번만)';

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. 환불 반영 — p_keys 중 하나와 거래 키가 같은 구매를 찾는다(Play는 orderId·구매 토큰 둘 다 넘긴다).
--    반영하면 true, 이미 반영했거나 모르는 거래면 false.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.refund_purchase(p_platform text, p_keys text[], p_raw jsonb default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v ticket_purchases;
begin
  select * into v from ticket_purchases
   where platform = p_platform and store_transaction_id = any(p_keys)
   order by created_at
   limit 1
   for update;
  if not found or v.refunded_at is not null then return false; end if;

  update ticket_purchases
     set refunded_at = now(),
         raw = coalesce(raw, '{}'::jsonb) || jsonb_build_object('refund', p_raw)
   where id = v.id;

  -- 탈퇴한 사용자의 구매는 원장이 없다(행만 남긴다).
  if v.user_id is not null and exists (select 1 from auth.users where id = v.user_id) then
    insert into ticket_ledger (user_id, delta, reason, purchase_id, environment)
    values (v.user_id, -v.tickets, 'refund', v.id, v.environment);
  end if;
  return true;
end $$;
revoke all on function public.refund_purchase(text, text[], jsonb) from public, anon, authenticated;
grant execute on function public.refund_purchase(text, text[], jsonb) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. 보이는 잔액은 0 아래로 내려가지 않게(0041 본문 + greatest).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.get_my_entitlements()
returns json language plpgsql stable security definer set search_path = public as $$
declare
  v_cfg monetization_config;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_cfg from monetization_config where id;
  return json_build_object(
    'is_admin',     private.is_admin_user(auth.uid()),
    'tickets',      greatest(private.ticket_balance(auth.uid()), 0),
    'paid_enabled', (v_cfg.paid_from is not null and now() >= v_cfg.paid_from) or private.is_tester(auth.uid()),
    'free_days',    v_cfg.free_days,
    'grace_days',   v_cfg.grace_days,
    'warn_days',    v_cfg.warn_days
  );
end $$;
revoke all on function public.get_my_entitlements() from public, anon, authenticated;
grant execute on function public.get_my_entitlements() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Google Play 환불 확인 — 하루 한 번(한국 시각 새벽 4시). 함수는 같은 환불을 두 번 반영하지 않는다.
--    로컬 개발 DB에서는 운영 함수를 부르지 않게 supabase start 뒤 cron.unschedule('play-voided-sync')를 한다.
-- ─────────────────────────────────────────────────────────────────────────────
select cron.schedule(
  'play-voided-sync',
  '0 19 * * *',
  $$
    select net.http_post(
      url := 'https://aqotppfdrbxhthlqwwhp.supabase.co/functions/v1/play-voided-sync',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{}'::jsonb
    );
  $$
);
