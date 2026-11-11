set lock_timeout = '3s'; set statement_timeout = '30s';

-- supabase/migrations/0039_letter_expiry_jobs.sql
--
-- 무료 편지 만료 처리: 보낸 사람에게 "곧 닫혀요"·"닫혔어요" 푸시, 유예가 끝난 편지 삭제.
-- 설계: Mutter/docs/superpowers/specs/2026-11-11-permanent-letter-ticket-design.md (5.7·5.8, 9절 우선)
--
-- 받은 사람에게는 푸시를 보내지 않는다(화면 안내만). 14일 규칙 대상(is_metered) 편지가 없으면
-- 두 작업 모두 아무 일도 하지 않는다.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. 잠김 예고·잠김 푸시 — 편지당 각 1회. 보내려 한 건수를 돌려준다.
--    notify_push(0029)는 push_config가 없으면 조용히 건너뛴다.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function private.notify_letter_locks()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_row   record;
  v_title text;
  v_count int := 0;
begin
  for v_row in
    select a.letter_id, l.owner_id, l.title, s.state, s.access_until, s.delete_at,
           a.lock_warned_at, a.lock_notified_at
      from letter_access a
      join letters_all l on l.id = a.letter_id
      cross join lateral private.letter_state(a.letter_id) s
     where a.is_metered
       and a.permanent_at is null
       and a.first_opened_at is not null
       and a.purge_claimed_at is null
       and l.deleted_at is null          -- 삭제함에 있는 편지는 알리지 않는다
       and (
         (s.state = 'open' and a.lock_warned_at is null and s.access_until - now() <= interval '3 days')
         or (s.state = 'locked' and a.lock_notified_at is null)
       )
  loop
    v_title := coalesce(nullif(btrim(v_row.title), ''), '제목 없는 편지');
    if v_row.state = 'open' then
      perform notify_push(
        v_row.owner_id,
        '편지가 곧 닫혀요',
        format('"%s" 편지가 3일 뒤 닫혀요. 편지권으로 간직할 수 있어요.', v_title),
        jsonb_build_object('type', 'letter_lock_soon', 'letter_id', v_row.letter_id)
      );
      update letter_access set lock_warned_at = now() where letter_id = v_row.letter_id;
    else
      perform notify_push(
        v_row.owner_id,
        '편지가 닫혔어요',
        format('"%s" 편지의 보관 기간이 끝났어요. %s까지 다시 열 수 있어요.',
               v_title, to_char(v_row.delete_at at time zone 'Asia/Seoul', 'FMMM"월" FMDD"일"')),
        jsonb_build_object('type', 'letter_locked', 'letter_id', v_row.letter_id)
      );
      -- 예고 없이 바로 잠긴 편지(작업이 며칠 멈췄던 경우)에 뒤늦은 예고가 가지 않게 둘 다 찍는다.
      update letter_access
         set lock_notified_at = now(), lock_warned_at = coalesce(lock_warned_at, now())
       where letter_id = v_row.letter_id;
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke all on function private.notify_letter_locks() from public, anon, authenticated;

-- 매일 09:00 KST(00:00 UTC).
select cron.schedule(
  'notify-letter-locks',
  '0 0 * * *',
  $$ select private.notify_letter_locks() $$
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. 유예가 끝난 편지 삭제 — Edge Function purge-deleted-letters(service role)가 쓴다.
--    Storage 객체는 SQL로 지울 수 없어 함수가 사진 폴더 → 행 순서로 지운다(0035와 같은 이유).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.expired_letter_ids(p_limit int)
returns table (id uuid, owner_id uuid)
language sql stable security definer set search_path = public as $$
  select l.id, l.owner_id
    from letter_access a
    join letters_all l on l.id = a.letter_id
   where a.is_metered
     and a.permanent_at is null
     and (a.purge_claimed_at is not null
          or (select s.state from private.letter_state(a.letter_id) s) = 'gone')
   order by a.first_opened_at
   limit p_limit;
$$;
revoke all on function public.expired_letter_ids(int) from public, anon, authenticated;
grant execute on function public.expired_letter_ids(int) to service_role;

-- 지우기 직전에 다시 확인하고 "집는다". 목록을 받은 뒤 누군가 편지권을 붙였거나 관리자가 된
-- 경우 false → 함수는 그 편지를 건너뛴다. 한 번 집힌 편지는 letter_state가 항상 gone이라
-- 사진을 지우는 사이에 영구화될 수 없다.
create or replace function public.claim_expired_letter(p_letter_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_a letter_access;
begin
  select * into v_a from letter_access where letter_id = p_letter_id for update;
  if not found then return false; end if;
  if v_a.purge_claimed_at is not null then return true; end if;  -- 이전 실행이 집고 실패 → 다시 시도
  if (select s.state from private.letter_state(p_letter_id) s) <> 'gone' then return false; end if;
  update letter_access set purge_claimed_at = now() where letter_id = p_letter_id;
  return true;
end $$;
revoke all on function public.claim_expired_letter(uuid) from public, anon, authenticated;
grant execute on function public.claim_expired_letter(uuid) to service_role;
