#!/bin/bash
# Seed Gmail tokens from rclone config to Cloudflare KV
# Run this once to bootstrap tokens, then token refresh handles the rest

set -e

# Extract tokens from rclone config
echo "Extracting tokens from rclone config..."

# Parse rclone.conf and extract tokens
RCLONE_CONFIG="$HOME/.config/rclone/rclone.conf"

if [ ! -f "$RCLONE_CONFIG" ]; then
  echo "Error: rclone config not found at $RCLONE_CONFIG"
  exit 1
fi

# Accounts to seed
ACCOUNTS=("nick_aribia_main" "aribia_llc" "it_can_be_llc")

for account in "${ACCOUNTS[@]}"; do
  echo "Processing $account..."

  # Extract token JSON from rclone config
  TOKEN=$(awk -v section="$account" '
    $0 ~ "\\[" section "\\]" { found=1; next }
    /^\[/ { found=0 }
    found && /^token/ {
      gsub(/^token = /, "")
      print
    }
  ' "$RCLONE_CONFIG")

  if [ -z "$TOKEN" ]; then
    echo "  No token found for $account, skipping"
    continue
  fi

  echo "  Found token, uploading to KV..."

  # Upload to Cloudflare KV via wrangler
  wrangler kv:key put --namespace-id="863b20701b5145c3a5e1561469f93ee4" \
    "gmail_token_$account" "$TOKEN" --env production

  echo "  Done"
done

echo ""
echo "Token seeding complete!"
echo ""
echo "The tokens will refresh automatically via the GmailTokenManager."
echo "Make sure you have refresh_tokens configured in 1Password for production use."
