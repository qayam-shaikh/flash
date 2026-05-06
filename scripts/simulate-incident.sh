#!/usr/bin/env bash
set -euo pipefail

AUTHOR="${1:-$(git log -1 --pretty=format:%an 2>/dev/null || echo local-user)}"
VERSION="${2:-v2}"
REASON="${3:-Deployment health check failed}"
BACKEND_URL="${BACKEND_URL:-http://localhost:4000}"

curl -sS -X POST "${BACKEND_URL}/api/incident" \
  -H "Content-Type: application/json" \
  -d "{\"author\":\"${AUTHOR}\",\"version\":\"${VERSION}\",\"reason\":\"${REASON}\",\"action\":\"Auto rollback\",\"restored\":\"System restored to last stable version\"}"

echo
