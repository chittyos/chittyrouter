#!/bin/bash
set -euo pipefail
echo "=== chittyrouter Onboarding ==="
curl -s -X POST "${GETCHITTY_ENDPOINT:-https://get.chitty.cc/api/onboard}" \
  -H "Content-Type: application/json" \
  -d '{"service_name":"chittyrouter","organization":"CHITTYOS","type":"gateway","tier":2,"domains":["router.chitty.cc"]}' | jq .
