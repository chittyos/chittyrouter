#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:8787}"
AUTH_TOKEN="${AUTH_TOKEN:-${CHITTY_AUTH_SERVICE_TOKEN:-}}"

if [[ -z "${AUTH_TOKEN}" ]]; then
  echo "ERROR: AUTH_TOKEN or CHITTY_AUTH_SERVICE_TOKEN is required"
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required"
  exit 1
fi

hdr=(-H "Authorization: Bearer ${AUTH_TOKEN}" -H "Content-Type: application/json")

echo "[1/3] List configured accounts"
curl -sS "${BASE_URL}/email/registered/accounts" "${hdr[@]}" | jq .

echo "[2/3] Send registered email"
send_payload=$(cat <<JSON
{
  "to": "recipient@example.com",
  "from": "legal@chitty.cc",
  "subject": "Smoke Test Registered Delivery",
  "bodyText": "Smoke test body",
  "accountId": "legal",
  "idempotencyKey": "smoke-registered-$(date +%s)"
}
JSON
)

send_resp=$(curl -sS -X POST "${BASE_URL}/email/registered/send" "${hdr[@]}" -d "${send_payload}")
echo "${send_resp}" | jq .

external_id=$(echo "${send_resp}" | jq -r '.externalId // empty')
if [[ -z "${external_id}" ]]; then
  echo "WARN: No externalId returned; skipping status call"
  exit 0
fi

echo "[3/3] Query delivery status"
status_url="${BASE_URL}/email/registered/status?externalId=${external_id}&accountId=legal"
curl -sS "${status_url}" "${hdr[@]}" | jq .
