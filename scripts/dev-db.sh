#!/bin/sh
# 로컬 개발 DB(이 맥 안에서 도는 Supabase)를 켜고·끄고·본다. 운영 DB에는 닿지 않는다.
#
#   scripts/dev-db.sh up       켜기 (OrbStack도 같이 켠다. 1~2분)
#   scripts/dev-db.sh down     끄기 (데이터는 남는다)
#   scripts/dev-db.sh status   켜져 있는지, 주소
#   scripts/dev-db.sh open     DB 화면(Studio)을 브라우저로 열기
#   scripts/dev-db.sh mock [계정A] [계정B] [계정A 편지권 장수]   케이스별 목데이터 다시 넣기
set -e
PATH="$PATH:/Applications/OrbStack.app/Contents/MacOS/xbin:/opt/homebrew/bin"
cd "$(dirname "$0")/.."
STUDIO="http://127.0.0.1:54323"
API="http://127.0.0.1:54321"

is_up() { curl -s -o /dev/null -m 3 "$API/auth/v1/health"; }

wait_docker() {
  if docker info >/dev/null 2>&1; then return 0; fi
  echo "OrbStack을 켜는 중…"
  open -a OrbStack
  i=0
  while ! docker info >/dev/null 2>&1; do
    i=$((i + 1))
    if [ "$i" -gt 60 ]; then echo "OrbStack이 켜지지 않았어요. 앱을 직접 실행한 뒤 다시 해 주세요."; exit 1; fi
    sleep 2
  done
}

show() {
  echo "DB 화면   $STUDIO"
  echo "메일함    http://127.0.0.1:54324   (로그인 코드 메일이 여기로 온다)"
  echo "웹        http://localhost:5173    (letter-app에서 npm run dev)"
  echo "테스트 계정 비밀번호: mutter-local-1234"
}

case "${1:-status}" in
  up)
    wait_docker
    if is_up; then echo "이미 켜져 있어요."; else supabase start -x logflare,vector,imgproxy >/dev/null; echo "켰어요."; fi
    show
    ;;
  down)
    if docker info >/dev/null 2>&1; then supabase stop >/dev/null 2>&1 || true; fi
    echo "껐어요. 데이터는 남아 있고, 다시 켜면 그대로 보여요."
    ;;
  status)
    if is_up; then echo "켜져 있어요."; show; else echo "꺼져 있어요. 켜려면: scripts/dev-db.sh up"; fi
    ;;
  open)
    if is_up; then open "$STUDIO/project/default/editor"; else echo "꺼져 있어요. 켜려면: scripts/dev-db.sh up"; fi
    ;;
  mock)
    shift
    if is_up; then ./scripts/dev-mock.sh "$@"; else echo "꺼져 있어요. 켜려면: scripts/dev-db.sh up"; fi
    ;;
  *)
    echo "사용: scripts/dev-db.sh up | down | status | open | mock"
    exit 1
    ;;
esac
