-- supabase/migrations/0029_push_triggers.sql
--
-- 3개 이벤트에서 send-push Edge Function을 비동기(pg_net) 호출한다.
--   ① 편지 도착   : inbox INSERT            → 수신자(new.user_id)
--   ② 열람(첫 회)  : letter_opens INSERT      → 편지 발신자(letters.owner_id)
--   ③ 초대 수락    : connection_invites UPDATE(accepted_by null→set) → 초대자(inviter_id)
--
-- 안전 원칙:
--  - 트리거 함수는 예외를 삼킨다 → 푸시 실패가 편지 저장/열람/수락을 절대 롤백하지 않음.
--  - net.http_post는 비동기(큐잉) → 트리거가 FCM 응답을 기다리지 않음.
--  - private.push_config 미설정이면 notify_push가 조용히 skip → 배포 후 설정 전에도 안전.

create extension if not exists pg_net;

-- ── 발송 설정(함수 URL + 공유 시크릿). 단일 행. private 스키마=클라 접근 불가. ──
create schema if not exists private;
create table if not exists private.push_config (
  id             int primary key default 1,
  function_url   text not null,   -- https://<project-ref>.supabase.co/functions/v1/send-push
  trigger_secret text not null,   -- send-push의 PUSH_TRIGGER_SECRET와 동일 값
  check (id = 1)
);
-- 배포 후 1회: insert into private.push_config(function_url, trigger_secret) values ('...','...');

-- ── 공통 발송 헬퍼 ──
create or replace function notify_push(
  p_recipient uuid,
  p_title text,
  p_body text,
  p_data jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_url text;
  v_secret text;
begin
  select function_url, trigger_secret into v_url, v_secret from private.push_config where id = 1;
  if v_url is null then return; end if;           -- 미설정 → skip
  if p_recipient is null then return; end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    body := jsonb_build_object(
      'recipient_user_id', p_recipient,
      'title', p_title,
      'body', p_body,
      'data', p_data
    )
  );
exception when others then
  return;  -- 발송 실패는 무시(핵심 동작 보호)
end $$;

-- ── ① 편지 도착 ──────────────────────────────────────────────
create or replace function trg_notify_letter_received() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_sender text;
begin
  select coalesce(p.nickname, '누군가') into v_sender
  from letters l left join profiles p on p.id = l.owner_id
  where l.id = new.letter_id;
  perform notify_push(
    new.user_id,
    '편지가 도착했어요',
    coalesce(v_sender, '누군가') || '님이 편지를 보냈어요.',
    jsonb_build_object('type', 'letter_received', 'token', new.token)
  );
  return new;
exception when others then
  return new;
end $$;

drop trigger if exists on_inbox_insert on inbox;
create trigger on_inbox_insert after insert on inbox
  for each row execute function trg_notify_letter_received();

-- ── ② 열람(첫 회) ────────────────────────────────────────────
create or replace function trg_notify_letter_read() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_title text;
begin
  select owner_id, nullif(title, '') into v_owner, v_title from letters where id = new.letter_id;
  perform notify_push(
    v_owner,
    '편지를 읽었어요',
    coalesce(v_title, '보낸 편지') || '을(를) 상대가 읽었어요.',
    jsonb_build_object('type', 'letter_read', 'letter_id', new.letter_id::text)
  );
  return new;
exception when others then
  return new;
end $$;

drop trigger if exists on_letter_opens_insert on letter_opens;
create trigger on_letter_opens_insert after insert on letter_opens
  for each row execute function trg_notify_letter_read();

-- ── ③ 초대 수락 ──────────────────────────────────────────────
create or replace function trg_notify_invite_accepted() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_accepter text;
begin
  select coalesce(nickname, '상대방') into v_accepter from profiles where id = new.accepted_by;
  perform notify_push(
    new.inviter_id,
    '연결됐어요',
    coalesce(v_accepter, '상대방') || '님이 연결을 수락했어요.',
    jsonb_build_object('type', 'connection_accepted', 'user_id', new.accepted_by::text)
  );
  return new;
exception when others then
  return new;
end $$;

drop trigger if exists on_invite_accepted on connection_invites;
create trigger on_invite_accepted after update on connection_invites
  for each row when (old.accepted_by is null and new.accepted_by is not null)
  execute function trg_notify_invite_accepted();
