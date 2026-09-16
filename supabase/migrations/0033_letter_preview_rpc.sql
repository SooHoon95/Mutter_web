-- 0033: 링크 미리보기(OG)용 RPC — 본문 없이 "어떤 편지지인지"와 "봉인 여부"만 돌려준다.
--
-- 왜 별도 RPC인가: 카카오톡 등 크롤러가 /l/:token을 긁을 때 서버(Edge Function)가 OG 태그를 채워야
-- 하는데, get_letter_by_token은 (a) 본문을 돌려주고 (b) 로그인 수신자 받은함 저장 부수효과가 있다.
-- 미리보기는 그 어느 것도 필요 없다. 이 함수는 읽기만 하고, 본문·제목·예약 시각·암호 유무를 내보내지 않는다.
--
-- 봉인(sealed) 규칙: 토큰 없음·revoke·만료·암호·예약공개(미래) 모두 같은 응답이다 —
-- 카드만 보고 "존재하는 링크인지", "왜 잠겼는지"를 구분할 수 없어야 한다(capability-links).
create or replace function get_letter_preview(p_token text)
returns json
language plpgsql
security definer
set search_path = public  -- crypt() 등 extensions 함수를 쓰지 않으므로 public만(get_letter_by_token과 달리 의도적).
as $$
declare
  v_link     delivery_links;
  v_template text;
begin
  select * into v_link from delivery_links where token = p_token;
  if not found
     or v_link.revoked
     or (v_link.expires_at is not null and v_link.expires_at < now())
     or v_link.password_hash is not null
     or (v_link.reveal_at is not null and v_link.reveal_at > now()) then
    return json_build_object('sealed', true, 'template_id', null);
  end if;

  select template_id into v_template from letters where id = v_link.letter_id;
  if not found then
    return json_build_object('sealed', true, 'template_id', null);
  end if;

  return json_build_object('sealed', false, 'template_id', coalesce(v_template, 'classic-serif'));
end;
$$;

revoke all on function get_letter_preview(text) from public;
grant execute on function get_letter_preview(text) to anon, authenticated;
