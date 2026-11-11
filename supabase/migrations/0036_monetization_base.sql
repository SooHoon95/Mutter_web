set lock_timeout = '3s'; set statement_timeout = '30s';

-- supabase/migrations/0036_monetization_base.sql
--
-- 수익화 기반: 설정 · 편지별 접근 상태 · 관리자 · 구매 테스터.
-- 설계: Mutter/docs/superpowers/specs/2026-11-11-permanent-letter-ticket-design.md (9절 우선)
--
-- 이 마이그레이션만으로는 동작이 바뀌지 않는다. paid_from이 null이고 테스터가 없으면
-- 모든 편지가 is_metered = false → 상태는 항상 'permanent'다.
--
-- 왜 letters_all 컬럼이 아니라 별도 테이블인가: 소유자는 RLS(letters_owner_rw)로 자기 letters_all 행을
-- 직접 고칠 수 있다(created_at 포함). 상태를 그 행에 두면 스스로 영구로 바꿀 수 있다.
-- letter_access는 클라이언트 권한이 없고 security definer 함수·트리거만 쓴다.
--
-- 권한: Supabase는 public 스키마의 새 테이블·함수를 anon·authenticated에 자동 grant한다 →
-- 전부 명시적으로 revoke한 뒤 필요한 것만 다시 준다.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. 설정(단일 행). 읽기는 누구나(앱이 일수를 표시), 쓰기는 대시보드/service role만.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.monetization_config (
  id            boolean primary key default true check (id),
  paid_from     timestamptz,                    -- null = 유료 전환 꺼짐. 켠 시각 이후에 만든 편지만 14일 규칙.
  free_days     int not null default 14 check (free_days > 0),
  grace_days    int not null default 30 check (grace_days >= 0),
  require_login boolean not null default false  -- true = 기존 편지 포함 모든 편지가 로그인해야 열린다
);
comment on table public.monetization_config is '수익화 원격 설정(단일 행) — 유료 전환 시각, 무료 기간, 잠김 유예, 로그인 요구';
insert into public.monetization_config default values;

alter table public.monetization_config enable row level security;
revoke all on public.monetization_config from public, anon, authenticated;
grant select on public.monetization_config to anon, authenticated;
create policy "monetization_config_public_read" on public.monetization_config
  for select using (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. 관리자 · 구매 테스터. 정책 없음 = 대시보드/service role 전용.
--    운영: insert into app_admins (user_id, note) values ('<uuid>', '메모');
-- ─────────────────────────────────────────────────────────────────────────────
create table public.app_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  note       text,
  created_at timestamptz not null default now()
);
comment on table public.app_admins is '관리자 — 구매와 상관없이 모든 유료 기능 사용. 보내는 편지는 자동 영구';
alter table public.app_admins enable row level security;
revoke all on public.app_admins from public, anon, authenticated;

create table public.purchase_testers (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  note       text,
  created_at timestamptz not null default now()
);
comment on table public.purchase_testers is '구매 테스터 — 유료 전환 전에도 14일 규칙과 (테스트 모드) 편지권 구매가 적용되는 계정';
alter table public.purchase_testers enable row level security;
revoke all on public.purchase_testers from public, anon, authenticated;

create or replace function private.is_admin_user(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_user is not null and exists (select 1 from app_admins where user_id = p_user);
$$;
revoke all on function private.is_admin_user(uuid) from public, anon, authenticated;

create or replace function private.is_tester(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_user is not null and exists (select 1 from purchase_testers where user_id = p_user);
$$;
revoke all on function private.is_tester(uuid) from public, anon, authenticated;

-- 앱이 "나는 관리자인가"만 묻는다(다른 사람의 관리자 여부는 알 수 없다).
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select private.is_admin_user(auth.uid());
$$;
revoke all on function public.is_admin() from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. 편지별 접근 상태. 편지 1통당 1행(트리거가 만든다).
-- ─────────────────────────────────────────────────────────────────────────────
create table public.letter_access (
  letter_id        uuid primary key references public.letters_all(id) on delete cascade,
  created_at       timestamptz not null default now(),  -- 서버가 찍는다(letters_all.created_at은 소유자가 위조 가능)
  is_metered       boolean not null default false,       -- 14일 규칙 적용 여부. 편지를 만들 때 한 번 정한다.
  first_opened_at  timestamptz,                          -- 소유자가 아닌 로그인 사용자가 처음 본문을 받은 시각
  permanent_at     timestamptz,
  permanent_by     uuid,
  permanent_source text check (permanent_source in ('ticket', 'admin')),
  lock_warned_at   timestamptz,                          -- "3일 뒤 닫혀요" 푸시를 보낸 시각
  lock_notified_at timestamptz,                          -- "닫혔어요" 푸시를 보낸 시각
  refunded_at      timestamptz,                          -- 받은 사람에게 편지권을 돌려준 시각
  purge_claimed_at timestamptz                           -- 삭제 작업이 집은 시각. 찍히면 항상 gone
);
comment on table public.letter_access is '편지별 접근 상태(무료 14일·영구·잠김·삭제). 클라이언트 접근 없음 — 서버 함수 전용';
create index letter_access_metered_idx on public.letter_access (first_opened_at)
  where is_metered and permanent_at is null;

alter table public.letter_access enable row level security;
revoke all on public.letter_access from public, anon, authenticated;

-- 기존 편지는 전부 14일 규칙 밖(영원히 영구).
insert into public.letter_access (letter_id, created_at, is_metered)
select id, created_at, false from public.letters_all;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. 상태 판정 — 모든 게이트·목록·정리 작업이 이 함수 하나를 쓴다.
--    permanent: 14일 규칙 밖이거나 영구가 된 편지
--    open     : 아직 열린 적 없거나 무료 기간 안
--    locked   : 무료 기간이 끝났고 유예 기간 안(편지권을 붙이면 다시 열린다)
--    gone     : 유예도 끝났거나 삭제 작업이 집은 편지
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function private.letter_state(p_letter_id uuid)
returns table (state text, access_until timestamptz, delete_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  v_a     letter_access;
  v_cfg   monetization_config;
  v_until timestamptz;
  v_del   timestamptz;
begin
  select * into v_a from letter_access where letter_id = p_letter_id;
  select * into v_cfg from monetization_config where id;

  -- 삭제 작업이 집은 편지는 설정이 바뀌어도 되살아나지 않는다(사진이 이미 지워졌을 수 있다).
  if found and v_a.purge_claimed_at is not null then
    return query select 'gone'::text, null::timestamptz, v_a.purge_claimed_at;
    return;
  end if;

  if v_a.letter_id is null or not v_a.is_metered or v_a.permanent_at is not null then
    return query select 'permanent'::text, null::timestamptz, null::timestamptz;
    return;
  end if;

  if v_a.first_opened_at is null then
    return query select 'open'::text, null::timestamptz, null::timestamptz;
    return;
  end if;

  v_until := v_a.first_opened_at + make_interval(days => v_cfg.free_days);
  v_del   := v_until + make_interval(days => v_cfg.grace_days);
  return query select
    case when now() < v_until then 'open' when now() < v_del then 'locked' else 'gone' end,
    v_until, v_del;
end $$;
revoke all on function private.letter_state(uuid) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. 트리거 — 전부 security definer. 편지 작성은 authenticated 권한으로 letters 뷰를 거치므로
--    invoker면 letter_access에 쓸 권한이 없어 모든 앱에서 편지 작성이 실패한다.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.letter_access_init()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_paid_from timestamptz;
  v_admin     boolean := private.is_admin_user(new.owner_id);
begin
  select paid_from into v_paid_from from monetization_config where id;
  insert into letter_access (letter_id, is_metered, permanent_at, permanent_by, permanent_source)
  values (
    new.id,
    (v_paid_from is not null and now() >= v_paid_from) or private.is_tester(new.owner_id),
    case when v_admin then now() end,
    case when v_admin then new.owner_id end,
    case when v_admin then 'admin' end
  )
  on conflict (letter_id) do nothing;
  return new;
end $$;
revoke all on function public.letter_access_init() from public, anon, authenticated;

create trigger letter_access_init
  after insert on public.letters_all
  for each row execute function public.letter_access_init();

-- 관리자로 지정하면 그 사람의 기존 편지도 영구가 된다. 삭제 대상(gone)은 사진이 없을 수 있어 뺀다.
-- 관리자에서 빼도 이미 영구가 된 편지는 그대로 둔다(받은 사람 쪽에서 갑자기 사라지면 안 된다).
create or replace function public.app_admins_grant()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update letter_access a
     set permanent_at = now(), permanent_by = new.user_id, permanent_source = 'admin'
    from letters_all l
   where l.id = a.letter_id
     and l.owner_id = new.user_id
     and a.permanent_at is null
     and (select s.state from private.letter_state(a.letter_id) s) <> 'gone';
  return new;
end $$;
revoke all on function public.app_admins_grant() from public, anon, authenticated;

create trigger app_admins_grant
  after insert on public.app_admins
  for each row execute function public.app_admins_grant();
