#!/usr/bin/env bash
set -euo pipefail

kubectl patch deployment myapp \
  -p '{"spec":{"template":{"spec":{"containers":[{"name":"myapp","image":"myapp:v2","env":[{"name":"APP_VERSION","value":"v2"},{"name":"FLASK_DEBUG","value":"false"},{"name":"FLASHSALE_DB_PATH","value":"/data/flashsale.db"},{"name":"FLASHSALE_LOG_PATH","value":"/data/logs/flashsale.log"}]}]}}}}'
kubectl rollout status deployment/myapp --timeout=60s
