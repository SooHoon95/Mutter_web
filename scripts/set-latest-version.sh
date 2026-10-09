#!/usr/bin/env bash
# 스토어 업로드 직후 app_config.latest_version을 갱신한다(iOS·Android fastlane이 호출).
#
#   scripts/set-latest-version.sh ios 1.0.5
#   scripts/set-latest-version.sh android 1.3.0
#
# latest_version만 바꾼다. min_version(강제 업데이트 기준)은 건드리지 않는다 —
# 심사 통과 전에 올리면 Android 사용자가 받을 수 없는 버전으로 강제 업데이트 화면에 갇힌다.
# app_config 쓰기는 service role 전용이라 링크된 프로젝트에 Management API로 실행한다
# (이 저장소에서 `supabase link`·`supabase login`이 되어 있어야 한다).
set -euo pipefail

platform="${1:-}"
version="${2:-}"

case "$platform" in
  ios|android) ;;
  *) echo "usage: $0 <ios|android> <version>" >&2; exit 2 ;;
esac
if ! [[ "$version" =~ ^[0-9]+(\.[0-9]+){1,2}$ ]]; then
  echo "invalid version: '$version' (예: 1.3.0)" >&2
  exit 2
fi

cd "$(dirname "$0")/.."

supabase db query --linked --agent=no -o table \
  "update app_config set latest_version = '$version', updated_at = now() where platform = '$platform' returning platform, min_version, latest_version, updated_at"
