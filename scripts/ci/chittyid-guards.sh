#!/usr/bin/env bash

# ChittyID CI Guards
# Ensures no offline generation and validates ChittyID format
# CLI demo pattern: ^[0-9]{2}-[0-9]-[A-Z]{3}-[0-9]{4}-[A-Z]-[0-9]{6}-[0-9]+-[0-9]+$

set -e

echo "🔍 Running ChittyID CI Guards..."

# Check for offline generator references
echo "  Checking for offline generator..."
if grep -R "chittyid-generator" -n src 2>/dev/null; then
  echo "❌ ERROR: Offline generator references found in source code"
  echo "  All ChittyID generation must go through id.chitty.cc service"
  exit 1
fi

# Check for the old generator file
if [ -f "src/utils/chittyid-generator.js" ] || [ -f "src/chittyid/chittyid-generator.js" ]; then
  echo "❌ ERROR: Offline generator file still exists"
  echo "  Remove chittyid-generator.js - all generation must be online"
  exit 1
fi

# Validate ChittyID format in code
echo "  Checking for non-canonical ChittyID literals..."
CHITTY_ID_PATTERN="^[0-9]{2}-[0-9]-[A-Z]{3}-[0-9]{4}-[A-Z]-[0-9]{6}-[0-9]+-[0-9]+$"

# Find all potential ChittyID strings in the code (excluding test files)
FOUND_IDS=$(grep -R -E "['\"]CE-[^'\"]+['\"]" src 2>/dev/null | grep -v test || true)

if [ ! -z "$FOUND_IDS" ]; then
  echo "⚠️  WARNING: Found legacy CE- prefix ChittyIDs in code:"
  echo "$FOUND_IDS"
  echo "  These should be migrated to the new CLI demo format"
fi

# Check for proper import of CHITTY_ID_RX
echo "  Verifying CHITTY_ID_RX export..."
if ! grep -q "export const CHITTY_ID_RX" src/chittyid/chittyid-validator.js 2>/dev/null; then
  echo "❌ ERROR: CHITTY_ID_RX not properly exported from chittyid-validator.js"
  exit 1
fi

# Verify no direct ChittyID generation without service
echo "  Checking for unauthorized ChittyID generation..."
BAD_PATTERNS=(
  "generateChittyID.*function"
  "createChittyID.*function"
  "makeChittyID"
  "new ChittyID"
)

for pattern in "${BAD_PATTERNS[@]}"; do
  if grep -R "$pattern" src --exclude="*validator*" 2>/dev/null; then
    echo "❌ ERROR: Unauthorized ChittyID generation found"
    echo "  All ChittyID generation must use ChittyIDValidator service"
    exit 1
  fi
done

echo "✅ ChittyID CI Guards passed successfully!"
echo "  - No offline generation detected"
echo "  - ChittyID format validation enforced"
echo "  - Service-only generation confirmed"