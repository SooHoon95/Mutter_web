-- supabase/dev/mock_cases.sql
--
-- 로컬 개발 서버 전용 목데이터 — 영구 편지권 화면을 케이스별로 볼 수 있게 한다.
-- 실행: scripts/dev-mock.sh [계정A 이메일] [계정B 이메일]   (기본 sender@test.local, recipient@test.local)
--
-- 두 계정이 같은 케이스 묶음을 서로에게 보낸 상태를 만든다 → 어느 쪽으로 로그인해도
-- 보낸 편지 목록과 받은 편지함에서 모든 케이스가 보인다.
-- 편지를 여는 것·간직하는 것·지우는 것은 실제 서버 함수를 그 계정 권한으로 부르고, 날짜만 과거로 돌린다
-- (손으로 행을 끼워 넣으면 실제 동작과 어긋난 상태가 생길 수 있다).
-- 다시 실행하면 이전 목데이터(토큰이 mock- 로 시작하는 편지)를 지우고 새로 만든다.
-- 날짜는 실행 시각 기준이라 하루가 지나면 "내일 닫힘"이 "닫힘"이 된다 — 그때 다시 실행한다.

select set_config('mock.a', :'a', false), set_config('mock.b', :'b', false) \gset

do $$
declare
  a uuid; b uuid; g uuid;
  s uuid; r uuid; tag text; c jsonb; l uuid; tok text;
  v_age int; v_opened int; v_para jsonb; u uuid; v_bal int;
  cases jsonb := $j$[
    {"k":"perm","title":"영구 편지 · 보낸 사람이 편지권 사용","tpl":"classic-serif","age":20,"opened":18,"sp":true,
     "body":["보내기 전에 '영구 편지로 보내기'를 고른 편지예요.","받은 사람이 연 지 18일이 지났지만 닫히지 않아요. 편지 끝에 닫힘 안내나 '계속 간직하기'가 보이면 안 돼요.","보낸 사람 목록에는 영구 편지로 표시돼요."]},
    {"k":"unopened","title":"아직 열지 않은 편지","tpl":"modern-minimal","age":1,
     "body":["무료 7일 편지인데 아직 아무도 열지 않았어요.","기간은 받은 사람이 처음 여는 순간부터 세요. 그래서 지금은 남은 날짜가 없어요.","받은 편지함에는 아직 없으니 링크로 열어 보세요."]},
    {"k":"open","title":"열린 편지 · 5일 남음","tpl":"warm-craft","age":3,"opened":2,
     "body":["받은 사람이 이틀 전에 처음 열었어요. 닫히기까지 5일 남았어요.","받은 사람에게는 편지 끝에 '이 편지는 ○월 ○일까지 열려요 · 계속 간직하기'가 보여요.","보낸 사람에게는 그 안내가 보이지 않아요."]},
    {"k":"soon","title":"곧 닫히는 편지 · 내일 닫힘","tpl":"night-sky","age":7,"opened":6,
     "body":["받은 사람이 연 지 6일째예요. 내일 닫혀요.","닫히기 이틀 전부터는 닫힘 예고와 '간직하기'가 보여야 해요.","보낸 사람 목록에서도 곧 닫힌다는 표시가 보여요."]},
    {"k":"locked","title":"잠긴 편지 · 어제 닫힘","tpl":"spring-day","age":9,"opened":8,
     "body":["무료 7일이 끝나 어제 닫혔어요.","받은 사람이 열면 본문 대신 '보관 기간이 지난 편지예요'와 '편지권으로 간직하기'가 보여요.","30일 안에 편지권을 쓰면 다시 열려요."]},
    {"k":"lockend","title":"잠긴 편지 · 2일 뒤 삭제","tpl":"vintage-typewriter","age":36,"opened":35,
     "body":["닫힌 지 28일이 지났어요. 이틀 뒤에는 완전히 지워져요.","잠김 화면의 '○월 ○일까지 다시 열 수 있어요' 날짜가 모레여야 해요."]},
    {"k":"gone","title":"사라진 편지 · 보관 기간 끝","tpl":"pure-space","age":41,"opened":40,
     "body":["닫힌 뒤 30일이 지나 더는 열 수 없는 편지예요.","편지권으로도 되살릴 수 없어요. 정리 작업이 돌면 목록에서도 사라져요."]},
    {"k":"kept","title":"받은 사람이 간직한 편지","tpl":"classic-serif","age":15,"opened":14,"rk":true,
     "body":["닫힌 뒤에 받은 사람이 자기 편지권으로 간직한 편지예요.","간직한 직후에만 '간직한 편지예요'가 보이고, 그 뒤로는 닫힘 안내 없이 양쪽 모두에게 계속 열려요.","편지권 한 장이면 양쪽 모두에게 영구 편지가 돼요."]},
    {"k":"sdel","title":"보낸 사람이 삭제한 편지","tpl":"modern-minimal","age":5,"opened":4,"sd":true,
     "body":["보낸 사람이 자기 목록에서 지운 편지예요.","보낸 사람에게는 삭제함에만 보여요. 이미 받은 사람의 받은 편지함에는 그대로 남아 계속 열려요.","받은 적 없는 계정이 링크를 열면 '편지를 찾을 수 없어요'가 나와요."]},
    {"k":"rdel","title":"받은 사람이 삭제한 편지","tpl":"warm-craft","age":5,"opened":4,"rd":true,
     "body":["받은 사람이 받은 편지함에서 지운 편지예요.","받은 사람에게는 삭제함에만 보이고, 보낸 사람 목록에는 그대로 있어요."]},
    {"k":"legacy","title":"예전 편지 · 기간 제한 없음","tpl":"night-sky","age":90,"opened":88,"legacy":true,
     "body":["유료 전환 전에 만든 편지예요.","기간 제한이 없어서 닫힘 안내도, 간직하기도 보이지 않아요."]}
  ]$j$;
  ghost_cases jsonb := $j$[
    {"k":"open","title":"탈퇴한 사용자의 편지 · 열림","tpl":"spring-day","age":3,"opened":2,
     "body":["보낸 사람이 탈퇴했지만 받은 사람의 편지함에는 남아 있어요.","보낸 사람 이름은 '탈퇴한 사용자'로 보여요. 닫히기까지 5일 남았어요."]},
    {"k":"locked","title":"탈퇴한 사용자의 편지 · 잠김","tpl":"vintage-typewriter","age":9,"opened":8,
     "body":["보낸 사람이 탈퇴한 뒤에 닫힌 편지예요.","받은 사람이 자기 편지권으로 간직하면 다시 열려요."]}
  ]$j$;
begin
  select id into a from auth.users where email = current_setting('mock.a');
  select id into b from auth.users where email = current_setting('mock.b');
  if a is null or b is null or a = b then
    raise exception '계정을 찾을 수 없어요: % / %', current_setting('mock.a'), current_setting('mock.b');
  end if;

  -- 이전 목데이터 정리
  delete from letters_all where id in (select letter_id from delivery_links where token like 'mock-%');
  delete from auth.users where email = 'mock-ghost@test.local';

  -- 두 계정 모두 구매 테스터(7일 규칙·편지권 화면이 켜진다), 닉네임이 없으면 채운다
  insert into purchase_testers (user_id, note) values (a, 'mock'), (b, 'mock') on conflict do nothing;
  update profiles set nickname = '보내는이' where id = a and nickname is null;
  update profiles set nickname = '받는이'   where id = b and nickname is null;

  -- 편지권: 목데이터가 쓸 만큼 먼저 넣고, 끝에서 3장으로 맞춘다
  delete from ticket_ledger where user_id in (a, b) and purchase_id is null;
  insert into ticket_ledger (user_id, delta, reason) values (a, 5, 'grant'), (b, 5, 'grant');

  -- ── 두 계정이 서로에게 보낸 편지 ──────────────────────────────────────────
  for i in 1..2 loop
    if i = 1 then s := a; r := b; tag := 'ab'; else s := b; r := a; tag := 'ba'; end if;

    for c in select * from jsonb_array_elements(cases) loop
      v_age    := (c->>'age')::int;
      v_opened := (c->>'opened')::int;
      tok      := 'mock-' || tag || '-' || (c->>'k');
      select jsonb_agg(jsonb_build_object('id', 'p' || ord, 'order', ord - 1, 'text', txt) order by ord)
        into v_para from jsonb_array_elements_text(c->'body') with ordinality t(txt, ord);

      insert into letters_all (owner_id, title, paragraphs, template_id, created_at, updated_at)
      values (s, c->>'title', v_para, c->>'tpl', now() - make_interval(days => v_age), now() - make_interval(days => v_age))
      returning id into l;
      insert into delivery_links (letter_id, owner_id, token, created_at)
      values (l, s, tok, now() - make_interval(days => v_age));
      update letter_access
         set is_metered = not coalesce((c->>'legacy')::boolean, false),
             created_at = now() - make_interval(days => v_age)
       where letter_id = l;

      -- 보낸 사람이 보내기 전에 영구 편지를 골랐다
      if coalesce((c->>'sp')::boolean, false) then
        perform set_config('role', 'authenticated', true);
        perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
        perform make_letter_permanent(l);
        perform set_config('role', 'none', true);
        update letter_access set permanent_at = now() - make_interval(days => v_age) where letter_id = l;
      end if;

      -- 받은 사람이 열었다 → 연 날짜를 과거로
      if v_opened is not null then
        perform set_config('role', 'authenticated', true);
        perform set_config('request.jwt.claims', json_build_object('sub', r, 'role', 'authenticated')::text, true);
        perform get_letter_by_token(tok, null);
        perform record_letter_open(tok);
        perform set_config('role', 'none', true);

        update letter_access  set first_opened_at = now() - make_interval(days => v_opened) where letter_id = l;
        update letter_readers set first_opened_at = now() - make_interval(days => v_opened),
                                  last_opened_at  = now() - make_interval(days => greatest(v_opened - 1, 0))
         where letter_id = l;
        update letter_opens   set first_opened_at = now() - make_interval(days => v_opened),
                                  last_opened_at  = now() - make_interval(days => greatest(v_opened - 1, 0))
         where token = tok;
        update inbox_all      set saved_at = now() - make_interval(days => v_opened) where letter_id = l;
      end if;

      -- 닫힌 뒤에 받은 사람이 자기 편지권으로 간직했다
      if coalesce((c->>'rk')::boolean, false) then
        perform set_config('role', 'authenticated', true);
        perform set_config('request.jwt.claims', json_build_object('sub', r, 'role', 'authenticated')::text, true);
        perform keep_received_letter(tok, null);
        perform set_config('role', 'none', true);
        update letter_access set permanent_at = now() - interval '3 days' where letter_id = l;
        update inbox_all     set saved_at = now() - make_interval(days => v_opened) where letter_id = l;
      end if;

      -- 보낸 사람이 자기 목록에서 지웠다
      if coalesce((c->>'sd')::boolean, false) then
        perform set_config('role', 'authenticated', true);
        perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
        delete from letters where id = l;
        perform set_config('role', 'none', true);
      end if;

      -- 받은 사람이 받은 편지함에서 지웠다
      if coalesce((c->>'rd')::boolean, false) then
        perform set_config('role', 'authenticated', true);
        perform set_config('request.jwt.claims', json_build_object('sub', r, 'role', 'authenticated')::text, true);
        delete from inbox where letter_id = l;
        perform set_config('role', 'none', true);
      end if;
    end loop;
  end loop;

  -- ── 탈퇴한 사용자가 두 계정에게 보낸 편지 ─────────────────────────────────
  g := gen_random_uuid();
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (g, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mock-ghost@test.local', '',
          now(), '{"provider":"email","providers":["email"]}', '{}', now() - interval '60 days', now());
  insert into profiles (id, nickname) values (g, '떠난이')
    on conflict (id) do update set nickname = excluded.nickname;

  foreach u in array array[a, b] loop
    tag := case when u = a then 'ga' else 'gb' end;
    for c in select * from jsonb_array_elements(ghost_cases) loop
      v_age    := (c->>'age')::int;
      v_opened := (c->>'opened')::int;
      tok      := 'mock-' || tag || '-' || (c->>'k');
      select jsonb_agg(jsonb_build_object('id', 'p' || ord, 'order', ord - 1, 'text', txt) order by ord)
        into v_para from jsonb_array_elements_text(c->'body') with ordinality t(txt, ord);

      insert into letters_all (owner_id, title, paragraphs, template_id, created_at, updated_at)
      values (g, c->>'title', v_para, c->>'tpl', now() - make_interval(days => v_age), now() - make_interval(days => v_age))
      returning id into l;
      insert into delivery_links (letter_id, owner_id, token, created_at)
      values (l, g, tok, now() - make_interval(days => v_age));
      update letter_access set is_metered = true, created_at = now() - make_interval(days => v_age) where letter_id = l;

      perform set_config('role', 'authenticated', true);
      perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
      perform get_letter_by_token(tok, null);
      perform set_config('role', 'none', true);

      update letter_access  set first_opened_at = now() - make_interval(days => v_opened) where letter_id = l;
      update letter_readers set first_opened_at = now() - make_interval(days => v_opened),
                                last_opened_at  = now() - make_interval(days => v_opened - 1)
       where letter_id = l;
      update inbox_all      set saved_at = now() - make_interval(days => v_opened) where letter_id = l;
    end loop;
  end loop;

  delete from auth.users where id = g;   -- 탈퇴: 편지는 받은 사람에게 남는다

  -- 편지권을 3장으로 맞춘다
  foreach u in array array[a, b] loop
    v_bal := private.ticket_balance(u);
    if v_bal <> 3 then
      insert into ticket_ledger (user_id, delta, reason) values (u, 3 - v_bal, 'grant');
    end if;
  end loop;
end $$;

-- 결과 요약
select case when dl.token like 'mock-ab-%' then 'A→B' when dl.token like 'mock-ba-%' then 'B→A'
            when dl.token like 'mock-ga-%' then '탈퇴→A' else '탈퇴→B' end as 방향,
       l.title as 케이스,
       s.state as 상태,
       to_char(s.access_until at time zone 'Asia/Seoul', 'MM-DD') as 닫힘,
       to_char(s.delete_at    at time zone 'Asia/Seoul', 'MM-DD') as 삭제,
       'http://localhost:5173/l/' || dl.token as 링크
  from delivery_links dl
  join letters_all l on l.id = dl.letter_id
  cross join lateral private.letter_state(l.id) s
 where dl.token like 'mock-%'
 order by 1, l.created_at desc;

select u.email as 계정, private.ticket_balance(u.id) as 편지권
  from auth.users u where u.email in (current_setting('mock.a'), current_setting('mock.b'));
