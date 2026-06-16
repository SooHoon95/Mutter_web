-- supabase/migrations/0007_delete_account.sql
--
-- 계정 삭제: 본인 계정(auth.users)을 삭제하면 FK on delete cascade로
-- profiles / letters / delivery_links / inbox 가 모두 함께 삭제된다.
-- 클라이언트는 admin 권한이 없으므로 security definer RPC로 처리한다.

create or replace function delete_my_account()
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function delete_my_account() from public;
grant execute on function delete_my_account() to authenticated;
