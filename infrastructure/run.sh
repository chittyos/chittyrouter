#!/usr/bin/env bash

# ChittyOS Infrastructure Runner
# Wrapper script to run any command with 1Password environment

set -euo pipefail

# Check if op is available
if ! command -v op &> /dev/null; then
  echo "❌ ERROR: 1Password CLI (op) not installed"
  echo "Install: brew install --cask 1password-cli"
  exit 1
fi

# Default to validate-deployment.sh if no args
if [ $# -eq 0 ]; then
  echo "🔐 Running infrastructure validation with 1Password..."
  op run --env-file=../.env.op -- ./validate-deployment.sh
else
  echo "🔐 Running command with 1Password environment..."
  op run --env-file=../.env.op -- "$@"
fi