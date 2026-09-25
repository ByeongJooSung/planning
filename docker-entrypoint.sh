#!/bin/sh
set -e
ROOT="${PLANNING_ROOT:-/data}"
mkdir -p "$ROOT"
if [ "${SEED_EXAMPLES:-1}" != "0" ] && [ -z "$(ls -A "$ROOT" 2>/dev/null)" ]; then
  cp -r /app/examples/projects/. "$ROOT"/
  rm -f "$ROOT/viewer.html"
  echo "샘플 프로젝트를 $ROOT 에 복사했습니다 (첫 가입자가 운영자가 됩니다)"
fi
exec "$@"
