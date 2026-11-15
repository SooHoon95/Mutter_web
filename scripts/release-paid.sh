#!/bin/bash
# 편지권 출시 — 운영 Supabase에 서버 변경을 반영한다. 사람이 직접 실행한다(운영 쓰기).
# 순서와 나머지 콘솔 작업은 Mutter/docs/release/2026-11-paid-launch.md.
#
# 사용: scripts/release-paid.sh            반영할 것만 보여 준다(아무것도 바꾸지 않음)
#       scripts/release-paid.sh --apply    실제로 반영한다
#
# 하는 일
#   1. DB 마이그레이션 0041·0042·0043 (supabase db push)
#   2. Edge Function 배포: verify-purchase · apple-notifications · play-voided-sync · purge-deleted-letters · letter-photo-urls · duplicate-letter
#   3. 비밀값 확인: PURCHASE_MODE=live, PLAY_SERVICE_ACCOUNT_JSON 있음
# 하지 않는 일: 유료 스위치(paid_from) 켜기, 웹(main) 배포 — 심사 승인 뒤 따로 한다.
set -euo pipefail
cd "$(dirname "$0")/.."

APPLY=0
[ "${1:-}" = "--apply" ] && APPLY=1

FUNCTIONS=(verify-purchase apple-notifications play-voided-sync purge-deleted-letters letter-photo-urls duplicate-letter)

echo "== 연결된 프로젝트"
supabase projects list 2>/dev/null | grep -E '●' || { echo "supabase link가 안 돼 있다"; exit 1; }

echo "== 아직 반영 안 된 마이그레이션"
# 열: 로컬 | 운영 | 시각 — 운영 칸이 비어 있으면 아직 반영 안 된 것
supabase migration list --linked 2>/dev/null | awk -F'|' 'NF>2 && $1 ~ /[0-9]/ && $2 !~ /[0-9]/ {gsub(/ /,"",$1); print "  " $1}'

echo "== 비밀값(이름만)"
SECRETS=$(supabase secrets list 2>/dev/null | awk -F'|' '{gsub(/ /,"",$1); print $1}')
for name in PURCHASE_MODE PLAY_SERVICE_ACCOUNT_JSON; do
  if echo "$SECRETS" | grep -qx "$name"; then echo "  $name 있음"; else echo "  $name 없음 ← 설정 필요"; fi
done
echo "  PURCHASE_MODE 값은 live여야 한다: supabase secrets set PURCHASE_MODE=live"
echo "  Google 키:                       supabase secrets set PLAY_SERVICE_ACCOUNT_JSON=\"\$(cat <키 파일>.json)\""

if [ "$APPLY" -ne 1 ]; then
  echo
  echo "확인만 했다. 반영하려면: scripts/release-paid.sh --apply"
  exit 0
fi

read -r -p "운영 DB와 함수에 반영한다. 계속할까? (yes) " answer
[ "$answer" = "yes" ] || { echo "그만둔다"; exit 1; }

echo "== 1. 마이그레이션"
supabase db push

echo "== 2. 함수 배포"
for fn in "${FUNCTIONS[@]}"; do
  supabase functions deploy "$fn" --no-verify-jwt
done

echo "== 3. 확인"
supabase migration list --linked 2>/dev/null | tail -4
echo "완료. 다음: docs/release/2026-11-paid-launch.md의 '반영 뒤 확인'"
