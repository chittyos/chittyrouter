#!/usr/bin/env bash

# ChittyOS Infrastructure Runner
# Wrapper script to run any command directly with environment variables

set -euo pipefail

export CF_API_TOKEN="${CF_API_TOKEN:-${CLOUDFLARE_API_TOKEN:-}}"
export CF_ACCOUNT_ID="${CF_ACCOUNT_ID:-${CLOUDFLARE_ACCOUNT_ID:-}}"

# Default to validate-deployment.sh if no args
if [ $# -eq 0 ]; then
  echo "⚡ Running infrastructure validation..."
  ./validate-deployment.sh
else
  echo "⚡ Running command..."
  "$@"
fi
