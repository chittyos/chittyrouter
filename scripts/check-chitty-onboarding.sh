#!/usr/bin/env bash
set -euo pipefail

config_path="${1:-.github/chittyconnect.example.yml}"

[[ -f "$config_path" ]] || {
  echo "Missing onboarding config: $config_path" >&2
  exit 1
}

required_keys=(
  "chitty_id"
  "context"
  "owner"
)

for key in "${required_keys[@]}"; do
  if ! grep -Eq "^[[:space:]]*${key}:[[:space:]]*[^[:space:]].*$" "$config_path"; then
    echo "Missing required onboarding key with non-empty value: ${key}" >&2
    exit 1
  fi
done

echo "ChittyID onboarding config validated: $config_path"
