-- supabase/migrations/0017_read_receipts.sql
--
-- 읽음 확인(read receipt): 수신자가 편지 링크를 "편지 열기 ▶"로 실제 연 순간을 기록하고,
-- 발신자가 발송함(Sent)·링크 관리(LinkManager)에서 "열어봤어요"를 본다.
--
-- 모델: 열림은 전달 링크(token) 단위 이벤트다. 익명 수신자도 발생시키므로
--   계정이 아니라 token을 키로 집계한다(한 토큰당 1행, upsert로 횟수/최근시각 누적).
--   한 편지에 링크가 여럿이면 letter_id로 롤업한다.
--
-- 보안:
--   - record_letter_open: anon 호출 허용(수신자 무계정). 유효한 token에 한해서만 기록하고,
--     revoke/expiry면 조용히 no-op(수신자에게 링크 상태를 누설하지 않는다).
--   - 읽기는 소유자만: letter_opens에 owner-select RLS 정책 + 롤업 RPC(authenticated 전용).
--   - 쓰기는 security definer RPC(함수 소유자 postgres=BYPASSRLS)만 — 직접 INSERT 정책 없음.
--   - 앱(iOS) 푸시 알림이 이후 같은 테이블을 재사용한다(웹·앱 공유 Supabase).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. letter_opens 테이블 — 토큰당 1행(열림 횟수/최초·최근 시각)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists letter_opens (
  token           text primary key references delivery_links(token) on delete cascade,
  letter_id       uuid not null references letters(id) on delete cascade,
  first_opened_at timestamptz not null default now(),
  last_opened_at  timestamptz not null default now(),
  open_count      integer not null default 1
);

create index if not exists letter_opens_letter_id_idx on letter_opens(letter_id);

-- RLS: 직접 접근은 소유자 SELECT만. 쓰기는 security definer RPC(postgres=BYPASSRLS)만.
alter table letter_opens enable row level security;
alter table letter_opens force row level security;

-- 소유자(편지 주인)만 자신의 편지 열람 기록을 조회. LinkManager의 임베드 조회가 이 정책을 쓴다.
create policy "letter_opens_owner_select" on letter_opens
  for select
  using (
    exists (
      select 1 from letters l
      where l.id = letter_opens.letter_id and l.owner_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. record_letter_open(p_token) — 수신자가 편지를 연 순간 기록(anon 허용, fire-and-forget)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function record_letter_open(p_token text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_link delivery_links;
begin
  -- 유효한 토큰만 기록. 알 수 없음/무효/만료는 조용히 무시(수신자에게 상태 누설 방지).
  select * into v_link from delivery_links where token = p_token;
  if not found then return; end if;
  if v_link.revoked then return; end if;
  if v_link.expires_at is not null and v_link.expires_at < now() then return; end if;

  insert into letter_opens (token, letter_id, first_opened_at, last_opened_at, open_count)
  values (p_token, v_link.letter_id, now(), now(), 1)
  on conflict (token) do update
    set last_opened_at = now(),
        open_count     = letter_opens.open_count + 1;
end;
$$;

revoke all on function record_letter_open(text) from public;
grant execute on function record_letter_open(text) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. get_my_letter_opens() — 발송함(Sent) 편지별 열람 롤업(소유자 전용)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function get_my_letter_opens()
returns table (
  letter_id      uuid,
  open_count     bigint,
  last_opened_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  return query
    select lo.letter_id, sum(lo.open_count)::bigint, max(lo.last_opened_at)
    from letter_opens lo
    join letters l on l.id = lo.letter_id
    where l.owner_id = auth.uid()
    group by lo.letter_id;
end;
$$;

revoke all on function get_my_letter_opens() from public;
grant execute on function get_my_letter_opens() to authenticated;
