-- supabase/migrations/0035_letter_trash.sql
--
-- 편지 삭제함(30일 보관) + 되돌리기. 설계: Mutter/docs/superpowers/specs/2026-11-09-letter-trash-design.md
--
-- 방식: 실제 테이블을 letters_all로 바꾸고 deleted_at을 더한 뒤, 같은 이름의 뷰 letters가
-- "삭제되지 않은 편지"만 보여 준다.
--   - 기존 RPC·트리거·클라이언트 질의는 모두 이름으로 letters를 찾는다(SQL 본문을 실행 때 해석) →
--     삭제된 편지는 내 편지·받은 편지함·스레드·링크 열람·OG 미리보기·사진 URL·링크 발급 어디에도
--     안 나온다. 20여 개 함수에 필터를 덧대지 않는다.
--   - FK(delivery_links·inbox·letter_opens·takedowns)는 OID를 따라 letters_all을 가리킨다.
--     보관 중엔 연관 행이 그대로 남아, 복구하면 링크·받은 사람 보관함·읽음 기록이 그대로 돌아온다
--     (다시 넣지 않으니 "편지가 도착했어요" 푸시도 다시 울리지 않는다).
--   - 뷰의 INSTEAD OF DELETE가 지우기를 보관(deleted_at = now())으로 바꾼다. 이미 설치된 앱
--     (iOS 1.0.5·Android 1.3.0)의 delete도 그대로 보관된다 → 앱 업데이트 전부터 보호.
--   - 서버 내부 삭제(계정 탈퇴 FK cascade·영구 삭제·30일 정리)는 letters_all을 직접 지워 보관을 거치지 않는다.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. 테이블 → letters_all, 뷰 letters
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.letters rename to letters_all;
alter table public.letters_all add column deleted_at timestamptz;
create index letters_all_deleted_at_idx on public.letters_all (deleted_at) where deleted_at is not null;

-- 보관·복구가 updated_at(편집 시각)을 바꾸지 않게 한다 — 복구한 편지가 "방금 고친 편지"로 보이면 안 된다.
drop trigger if exists letters_updated_at on public.letters_all;
create trigger letters_updated_at
  before update on public.letters_all
  for each row
  when (old.deleted_at is not distinct from new.deleted_at)
  execute function update_updated_at();

-- security_invoker: 호출자 권한으로 letters_all의 RLS(letters_owner_rw)가 그대로 적용된다.
-- 단순 뷰라 insert/update는 자동 갱신(빠진 열은 letters_all 기본값).
create view public.letters with (security_invoker = true) as
  select id, owner_id, title, paragraphs, template_id, created_at, updated_at, audio_disabled
    from public.letters_all
   where deleted_at is null;

grant select, insert, update, delete on public.letters to anon, authenticated, service_role;

-- 지우기 → 보관. 호출자 권한(invoker)이라 RLS가 소유자만 허용한다.
create or replace function public.letters_soft_delete()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  update letters_all set deleted_at = now() where id = old.id and deleted_at is null;
  if not found then
    return null;  -- 남의 편지(RLS)·이미 보관된 편지 → 0행 처리
  end if;
  return old;
end $$;

create trigger letters_soft_delete
  instead of delete on public.letters
  for each row execute function public.letters_soft_delete();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. 삭제함 RPC — 모두 invoker + RLS(소유자만)
-- ─────────────────────────────────────────────────────────────────────────────

-- 내 삭제함, 최근에 지운 순. purge_at 이후 정리 작업이 영구 삭제한다.
create or replace function public.get_my_deleted_letters()
returns table (id uuid, title text, template_id text, deleted_at timestamptz, purge_at timestamptz)
language plpgsql stable security invoker set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  return query
    select l.id, l.title, l.template_id, l.deleted_at, l.deleted_at + interval '30 days'
      from letters_all l
     where l.owner_id = auth.uid() and l.deleted_at is not null
     order by l.deleted_at desc;
end $$;

-- 복구: 보관 표시만 지운다(되돌리기 토스트·삭제함 공용).
create or replace function public.restore_letter(p_letter_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  update letters_all set deleted_at = null
   where id = p_letter_id and owner_id = auth.uid() and deleted_at is not null;
  if not found then raise exception 'LETTER_NOT_FOUND'; end if;
end $$;

-- 영구 삭제: 보관 중인 내 편지만. 연관 행은 FK cascade. 사진은 이 호출 뒤 클라이언트가 지운다
-- (행이 사라져야 아래 Storage delete 정책이 풀린다).
create or replace function public.purge_letter(p_letter_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  delete from letters_all
   where id = p_letter_id and owner_id = auth.uid() and deleted_at is not null;
  if not found then raise exception 'LETTER_NOT_FOUND'; end if;
end $$;

revoke all on function public.get_my_deleted_letters() from public, anon;
revoke all on function public.restore_letter(uuid) from public, anon;
revoke all on function public.purge_letter(uuid) from public, anon;
grant execute on function public.get_my_deleted_letters() to authenticated;
grant execute on function public.restore_letter(uuid) to authenticated;
grant execute on function public.purge_letter(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. 보관 중인 편지의 사진은 지울 수 없다(0034 delete 정책 교체).
--    구버전 클라이언트가 편지 삭제 직후 사진 폴더를 지우려 해도 남는다.
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "letter_photos_delete_own" on storage.objects;
create policy "letter_photos_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'letter-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not exists (
      select 1 from public.letters_all l
       where l.id::text = (storage.foldername(name))[2]
         and l.deleted_at is not null
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. 30일 정리 — 매일 03:00 KST(18:00 UTC) pg_cron → pg_net → Edge Function purge-deleted-letters.
--    Storage 객체는 SQL로 지울 수 없어(storage.protect_delete) 함수가 맡는다.
--    함수는 기한이 지난 것만 지우므로 누가 불러도 무해하다 → 비밀값 없이 호출한다.
-- ─────────────────────────────────────────────────────────────────────────────
create extension if not exists pg_cron;

select cron.schedule(
  'purge-deleted-letters',
  '0 18 * * *',
  $$
    select net.http_post(
      url := 'https://aqotppfdrbxhthlqwwhp.supabase.co/functions/v1/purge-deleted-letters',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{}'::jsonb
    );
  $$
);
