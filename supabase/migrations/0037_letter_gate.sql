set lock_timeout = '3s'; set statement_timeout = '30s';

-- supabase/migrations/0037_letter_gate.sql
--
-- 편지 읽기 게이트: 로그인 요구 · 14일 잠김 · 열람자 기록.
-- 설계: Mutter/docs/superpowers/specs/2026-11-11-permanent-letter-ticket-design.md (9절 우선)
--
-- 받은 사람의 본문 읽기는 전부 private.open_letter를 지난다(get_letter_by_token, 사진 URL).
-- monetization_config가 꺼져 있고(paid_from null, require_login false) 테스터가 없으면
-- 기존 편지에 대한 예외 문자열·검사 순서·JSON 키는 0022와 같다(키 추가만 있다).
--
-- 기존 RPC의 시그니처·반환 형태는 바꾸지 않는다. 새 정보는 새 RPC로 준다
-- (get_letter_cover, get_letter_access_states, get_letter_readers).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. 열람자 — 편지 × 사람당 1행. 게이트가 직접 쓴다(클라이언트의 record_letter_open에 의존하지 않는다).
--    기존 letter_opens(토큰 단위 횟수)는 그대로 두고, 이름으로 보여 주는 화면은 이 테이블을 쓴다.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.letter_readers (
  letter_id       uuid not null references public.letters_all(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  first_opened_at timestamptz not null default now(),
  last_opened_at  timestamptz not null default now(),
  open_count      int not null default 1,
  primary key (letter_id, user_id)
);
comment on table public.letter_readers is '편지를 연 로그인 사용자(편지×사람). 보낸 사람은 get_letter_readers로 본다';

alter table public.letter_readers enable row level security;
revoke all on public.letter_readers from public, anon, authenticated;
grant select on public.letter_readers to authenticated;
create policy "letter_readers_self_select" on public.letter_readers
  for select using (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. 링크 검사 — 0022 get_letter_by_token의 ①~⑤(편지 존재)와 같은 순서·문자열.
--    ④ 로그인 요구만 새로 끼어든다: 설정이 켜졌거나 그 편지가 14일 규칙 대상일 때.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function private.check_link(p_token text, p_password text)
returns delivery_links
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_link delivery_links;
begin
  -- ① 토큰 조회
  select * into v_link from delivery_links where token = p_token;
  if not found then raise exception 'TOKEN_NOT_FOUND'; end if;

  -- ② revoke
  if v_link.revoked then raise exception 'LINK_REVOKED'; end if;

  -- ③ expiry
  if v_link.expires_at is not null and v_link.expires_at < now() then
    raise exception 'LINK_EXPIRED';
  end if;

  -- ④ 로그인 요구(예약 공개·암호보다 먼저 — 익명으로 링크 상태를 더 캐지 못하게).
  if auth.uid() is null and (
       (select require_login from monetization_config where id)
       or exists (select 1 from letter_access a where a.letter_id = v_link.letter_id and a.is_metered)
     ) then
    raise exception 'LOGIN_REQUIRED';
  end if;

  -- ⑤ 예약 공개: reveal_at이 미래면 본문/암호 이전에 차단(공개 시각을 ISO로 전달).
  if v_link.reveal_at is not null and v_link.reveal_at > now() then
    raise exception 'NOT_YET_REVEALED:%',
      to_char(v_link.reveal_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  end if;

  -- ⑥ 암호 비교 (서버 bcrypt)
  if v_link.password_hash is not null then
    if p_password is null or crypt(p_password, v_link.password_hash) <> v_link.password_hash then
      raise exception 'WRONG_PASSWORD';
    end if;
  end if;

  -- ⑦ 편지 존재(삭제함에 있는 편지는 letters 뷰에 없다)
  if not exists (select 1 from letters where id = v_link.letter_id) then
    raise exception 'LETTER_NOT_FOUND';
  end if;

  return v_link;
end $$;
revoke all on function private.check_link(text, text) from public, anon, authenticated;

-- 잠김·삭제 대상이면 예외. 소유자는 편지가 존재하는 한 항상 통과한다.
create or replace function private.assert_readable(p_letter_id uuid, p_owner_id uuid)
returns void language plpgsql stable security definer set search_path = public as $$
declare
  v_state text;
  v_del   timestamptz;
begin
  if auth.uid() is not null and auth.uid() = p_owner_id then return; end if;
  select s.state, s.delete_at into v_state, v_del from private.letter_state(p_letter_id) s;
  if v_state = 'locked' then
    raise exception 'LETTER_LOCKED:%', to_char(v_del at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  elsif v_state = 'gone' then
    raise exception 'LETTER_GONE';
  end if;
end $$;
revoke all on function private.assert_readable(uuid, uuid) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. 본문 게이트. p_record = true면 열람을 기록한다(본문 열기), false면 부수효과가 없다(사진 URL).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function private.open_letter(p_token text, p_password text, p_record boolean)
returns letters_all
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_link   delivery_links;
  v_letter letters_all;
begin
  v_link := private.check_link(p_token, p_password);
  select * into v_letter from letters_all where id = v_link.letter_id and deleted_at is null;
  if not found then raise exception 'LETTER_NOT_FOUND'; end if;

  -- ⑧ 무료 기간이 끝난 편지는 받은 사람에게 닫힌다.
  perform private.assert_readable(v_letter.id, v_letter.owner_id);

  -- ⑨ 열람 기록 + 14일 시계 시작(로그인한 비소유자만 — 익명은 사람을 특정할 수 없다).
  if p_record and auth.uid() is not null and auth.uid() <> v_letter.owner_id then
    insert into letter_readers (letter_id, user_id)
    values (v_letter.id, auth.uid())
    on conflict (letter_id, user_id) do update
      set last_opened_at = now(), open_count = letter_readers.open_count + 1;

    update letter_access set first_opened_at = now()
     where letter_id = v_letter.id and first_opened_at is null;
  end if;

  return v_letter;
end $$;
revoke all on function private.open_letter(text, text, boolean) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. get_letter_by_token — 0022 본문과 같은 결과에 is_permanent·access_until만 더한다.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.get_letter_by_token(
  p_token    text,
  p_password text
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_letter letters_all;
  v_state  text;
  v_until  timestamptz;
  v_result json;
begin
  v_letter := private.open_letter(p_token, p_password, true);

  -- 열람 기록 뒤에 계산한다 → 첫 열람 응답에도 "지금 + 무료 기간"이 실린다.
  select s.state, s.access_until into v_state, v_until from private.letter_state(v_letter.id) s;

  v_result := json_build_object(
    'id',             v_letter.id,
    'title',          v_letter.title,
    'paragraphs',     v_letter.paragraphs,
    'template_id',    v_letter.template_id,
    'cues',           '[]'::json,
    'audio_disabled', v_letter.audio_disabled,
    'is_permanent',   v_state = 'permanent',
    'access_until',   v_until
  );

  -- [EC-3.6] 로그인 수신자 자동 받은함 저장(0022 ⑦ 그대로).
  if auth.uid() is not null and auth.uid() <> v_letter.owner_id then
    insert into inbox (user_id, letter_id, token)
    values (auth.uid(), v_letter.id, p_token)
    on conflict (user_id, letter_id)
      do update set token = excluded.token, saved_at = now();
  end if;

  return v_result;
end;
$$;

revoke all on function public.get_letter_by_token(text, text) from public;
grant execute on function public.get_letter_by_token(text, text) to anon, authenticated;

-- 사진 URL 발급용 — 같은 게이트, 부수효과 없음(열람 기록·받은함 저장 없음).
-- Edge Function letter-photo-urls가 호출자 권한(로그인 사용자 JWT 또는 anon)으로 부른다.
create or replace function public.get_letter_photo_access(p_token text, p_password text)
returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_letter letters_all;
begin
  v_letter := private.open_letter(p_token, p_password, false);
  return json_build_object('id', v_letter.id, 'paragraphs', v_letter.paragraphs);
end $$;
revoke all on function public.get_letter_photo_access(text, text) from public, anon, authenticated;
grant execute on function public.get_letter_photo_access(text, text) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. 봉투 — 로그인 전 화면과 잠김 화면에 쓸 겉면 정보. 본문 없음, 기록 없음.
--    0033 get_letter_preview(링크 카드용)는 "카드만으로는 아무것도 알 수 없다"를 지킨다. 이 함수는
--    의도적으로 다르다: 토큰을 가진 사람에게 제목과 보낸 사람 닉네임을 보여 준다. 제목은 토큰
--    보유자가 원래 본문과 함께 읽을 수 있던 정보이고, 닉네임은 새로 드러나는 정보다(봉투 화면의
--    "누가 보냈는지 보고 로그인한다"를 위해 스펙이 승인).
--    암호·예약 공개·회수·만료·삭제함 편지는 0033과 같이 sealed만 돌려준다.
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
                       or exists (select 1 from letter_access a where a.letter_id = v_letter.id and a.is_metered)
  );
end $$;
revoke all on function public.get_letter_cover(text) from public, anon, authenticated;
grant execute on function public.get_letter_cover(text) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. 보낸 사람용 열람자 목록 · 목록 화면용 상태 조회
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.get_letter_readers(p_letter_id uuid)
returns table (
  user_id         uuid,
  nickname        text,
  first_opened_at timestamptz,
  last_opened_at  timestamptz,
  open_count      int
)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (select 1 from letters l where l.id = p_letter_id and l.owner_id = auth.uid()) then
    raise exception 'FORBIDDEN';
  end if;
  return query
    select r.user_id, p.nickname, r.first_opened_at, r.last_opened_at, r.open_count
      from letter_readers r
      left join profiles p on p.id = r.user_id
     where r.letter_id = p_letter_id
     order by r.first_opened_at;
end $$;
revoke all on function public.get_letter_readers(uuid) from public, anon, authenticated;
grant execute on function public.get_letter_readers(uuid) to authenticated;

-- 내가 보냈거나 받은 편지함에 가진 편지만 돌려준다(나머지 id는 조용히 빠진다).
-- kept_by_recipient: 받은 사람이 자기 편지권으로 영구로 만든 편지인가. 보낸 사람에게만 true가 된다
-- (삭제 확인에서 "지우면 영구가 풀려요"를 알리는 데 쓴다. 받은 사람에게 남의 결제 여부를 알리지 않는다).
create or replace function public.get_letter_access_states(p_letter_ids uuid[])
returns table (
  letter_id         uuid,
  state             text,
  access_until      timestamptz,
  delete_at         timestamptz,
  kept_by_recipient boolean
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
           )
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
-- 7. 기존 함수에 잠김 반영
-- ─────────────────────────────────────────────────────────────────────────────

-- save_to_inbox(0022 본문) + 닫힌 편지는 저장할 수 없다(열 수 없는 편지를 받은함에 새로 넣지 않는다).
create or replace function public.save_to_inbox(p_token text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_link  delivery_links;
  v_owner uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_link from delivery_links where token = p_token;
  if not found then raise exception 'TOKEN_NOT_FOUND'; end if;
  if v_link.revoked then raise exception 'LINK_REVOKED'; end if;

  -- [EC-1.7] 만료된 링크는 저장 불가(편지 자체를 열 수 없으므로 받은함에 넣어도 무의미).
  if v_link.expires_at is not null and v_link.expires_at < now() then
    raise exception 'LINK_EXPIRED';
  end if;

  select owner_id into v_owner from letters_all where id = v_link.letter_id;
  perform private.assert_readable(v_link.letter_id, v_owner);

  insert into inbox (user_id, letter_id, token)
  values (auth.uid(), v_link.letter_id, p_token)
  on conflict (user_id, letter_id)
    do update set token = excluded.token, saved_at = now();
end;
$$;
revoke all on function public.save_to_inbox(text) from public;
grant execute on function public.save_to_inbox(text) to authenticated;

-- record_letter_open(0019 본문) + 닫힌 편지·로그인이 필요한데 익명인 호출은 기록하지 않는다
-- (열 수 없는 편지에 "열어봤어요"가 찍히지 않게).
create or replace function public.record_letter_open(p_token text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_link  delivery_links;
  v_state text;
begin
  select * into v_link from delivery_links where token = p_token;
  if not found then return; end if;
  if v_link.revoked then return; end if;
  if v_link.expires_at is not null and v_link.expires_at < now() then return; end if;
  -- 예약 공개 전이면 아직 "열림"이 아니다 — 기록하지 않는다.
  if v_link.reveal_at is not null and v_link.reveal_at > now() then return; end if;

  if auth.uid() is null and (
       (select require_login from monetization_config where id)
       or exists (select 1 from letter_access a where a.letter_id = v_link.letter_id and a.is_metered)
     ) then
    return;
  end if;
  select s.state into v_state from private.letter_state(v_link.letter_id) s;
  if v_state in ('locked', 'gone')
     and auth.uid() is distinct from (select owner_id from letters_all where id = v_link.letter_id) then
    return;
  end if;

  insert into letter_opens (token, letter_id, first_opened_at, last_opened_at, open_count)
  values (p_token, v_link.letter_id, now(), now(), 1)
  on conflict (token) do update
    set last_opened_at = now(),
        open_count     = letter_opens.open_count + 1;
end;
$$;

revoke all on function public.record_letter_open(text) from public;
grant execute on function public.record_letter_open(text) to anon, authenticated;
