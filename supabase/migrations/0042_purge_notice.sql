set lock_timeout = '3s'; set statement_timeout = '30s';

-- supabase/migrations/0042_purge_notice.sql
--
-- 닫힌 뒤 grace_days일이 지나면 편지가 삭제된다는 것을 미리 알린다.
-- 계약: Mutter/docs/specs/permanent-letter-contract.md "삭제 안내".
--
-- 1) 닫힘 푸시에 삭제 날짜를 넣고("…까지 다시 열 수 있어요" → "…에 삭제돼요"), 받은 사람에게도 보낸다(received_locked).
-- 2) 삭제 purge_warn_days일 전에 양쪽에 한 번 더 알린다(letter_purge_soon · received_purge_soon).
-- 화면 안내(목록·상세·잠김 화면)는 이미 내려가는 delete_at·grace_days로 클라이언트가 그린다 — 서버 변경 없음.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. 설정·기록 칸
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.monetization_config
  add column purge_warn_days int not null default 3 check (purge_warn_days >= 0);
comment on column public.monetization_config.purge_warn_days is
  '삭제 며칠 전에 "곧 삭제돼요" 푸시를 보낼지';

alter table public.letter_access
  add column purge_warned_at timestamptz;
comment on column public.letter_access.purge_warned_at is
  '"곧 삭제돼요" 푸시를 보낸 시각(편지당 1회)';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. 닫힘·삭제 알림 — 편지당 단계마다 1회. 보내려 한 편지 수를 돌려준다.
--    단계: 곧 닫혀요(open) → 닫혔어요(locked) → 곧 삭제돼요(locked, 삭제 purge_warn_days일 전).
--    보낸 사람은 자기가 지운 편지에 대해서는 받지 않는다. 받은 사람은 그 편지를 받은 편지함에 가진 사람 가운데
--    간직할 수 있는 계정(편지권 화면이 열려 있거나 잔액이 있는 계정)이고, 알림에 그 사람의 링크 토큰이 실린다.
--    한 번 실행에 한 편지는 한 단계만 보낸다(닫힘 알림이 밀려 있었으면 닫힘 먼저, 삭제 예고는 다음 실행에).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function private.notify_letter_locks()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_row    record;
  v_holder record;
  v_title  text;
  v_when   text;
  v_date   text;
  v_from   text;
  v_days   int;
  v_cfg    monetization_config;
  v_paid   boolean;
  v_count  int := 0;
begin
  select * into v_cfg from monetization_config where id;
  v_paid := v_cfg.paid_from is not null and now() >= v_cfg.paid_from;
  for v_row in
    select a.letter_id, l.owner_id, l.title, l.deleted_at, s.state, s.access_until, s.delete_at,
           a.lock_notified_at
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
         or (s.state = 'locked' and a.purge_warned_at is null
            and s.delete_at - now() <= make_interval(days => v_cfg.purge_warn_days))
       )
  loop
    v_title := coalesce(nullif(btrim(v_row.title), ''), '제목 없는 편지');
    v_from  := coalesce(nullif(btrim(private.sender_nickname(v_row.owner_id)), '') || '님의', '받은');

    if v_row.state = 'open' then
      -- 곧 닫혀요
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
          format('%s "%s" 편지가 %s 닫혀요. 간직해 둘 수 있어요.', v_from, v_title, v_when),
          jsonb_build_object('type', 'received_lock_soon', 'letter_id', v_row.letter_id, 'token', v_holder.token)
        );
      end loop;
      update letter_access set lock_warned_at = now() where letter_id = v_row.letter_id;

    elsif v_row.lock_notified_at is null then
      -- 닫혔어요 — 삭제 날짜를 말한다
      v_date := to_char(v_row.delete_at at time zone 'Asia/Seoul', 'FMMM"월" FMDD"일"');
      if v_row.deleted_at is null then
        perform notify_push(
          v_row.owner_id,
          '편지가 닫혔어요',
          format('"%s" 편지가 닫혔어요. %s에 삭제돼요. 편지권으로 간직할 수 있어요.', v_title, v_date),
          jsonb_build_object('type', 'letter_locked', 'letter_id', v_row.letter_id)
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
          '받은 편지가 닫혔어요',
          format('%s "%s" 편지가 닫혔어요. %s에 삭제돼요.', v_from, v_title, v_date),
          jsonb_build_object('type', 'received_locked', 'letter_id', v_row.letter_id, 'token', v_holder.token)
        );
      end loop;
      update letter_access
         set lock_notified_at = now(), lock_warned_at = coalesce(lock_warned_at, now())
       where letter_id = v_row.letter_id;

    else
      -- 곧 삭제돼요
      v_days := greatest(ceil(extract(epoch from (v_row.delete_at - now())) / 86400.0)::int, 0);
      v_when := case when v_days <= 0 then '오늘' else v_days || '일 뒤' end;
      if v_row.deleted_at is null then
        perform notify_push(
          v_row.owner_id,
          '편지가 곧 삭제돼요',
          format('"%s" 편지가 %s 삭제돼요. 편지권으로 간직할 수 있어요.', v_title, v_when),
          jsonb_build_object('type', 'letter_purge_soon', 'letter_id', v_row.letter_id)
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
          '받은 편지가 곧 삭제돼요',
          format('%s "%s" 편지가 %s 삭제돼요. 간직해 둘 수 있어요.', v_from, v_title, v_when),
          jsonb_build_object('type', 'received_purge_soon', 'letter_id', v_row.letter_id, 'token', v_holder.token)
        );
      end loop;
      update letter_access set purge_warned_at = now() where letter_id = v_row.letter_id;
    end if;

    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke all on function private.notify_letter_locks() from public, anon, authenticated;
