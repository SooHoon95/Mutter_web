#!/bin/sh
# 로컬 개발 서버(supabase start)에 케이스별 목데이터를 넣는다. 운영 DB에는 닿지 않는다(로컬 컨테이너에만 실행).
# 사용: scripts/dev-mock.sh [계정A 이메일] [계정B 이메일] [계정A 편지권 장수]
#   장수 기본값은 3. 결제 화면을 보려면 0으로 준다(계정B는 항상 3장).
# 다시 실행하면 이전 목데이터를 지우고 새로 만든다.
set -e
PATH="$PATH:/Applications/OrbStack.app/Contents/MacOS/xbin"
A="${1:-sender@test.local}"
B="${2:-recipient@test.local}"
TICKETS="${3:-3}"
cd "$(dirname "$0")/.."
docker exec -i supabase_db_mutter psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -v a="$A" -v b="$B" -v tickets="$TICKETS" \
  < supabase/dev/mock_cases.sql
