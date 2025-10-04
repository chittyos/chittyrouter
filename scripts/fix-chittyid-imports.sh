#!/usr/bin/env bash

# Fix all chittyid-generator imports to use ChittyIDValidator

echo "🔧 Fixing ChittyID generator imports..."

# Files to update
FILES=(
  "src/ai/intelligent-router.js"
  "src/ai/email-processor.js"
  "src/workers/email-worker.js"
  "src/routing/cloudflare-integration.js"
)

for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "  Updating $file..."

    # Replace import statement
    sed -i.bak "s/import { generateEmailChittyID } from '..\/utils\/chittyid-generator.js';/import { ChittyIDValidator } from '..\/chittyid\/chittyid-validator.js';/g" "$file"
    sed -i.bak "s/import { generateEmailChittyID, generateDocumentChittyID } from '..\/utils\/chittyid-generator.js';/import { ChittyIDValidator } from '..\/chittyid\/chittyid-validator.js';/g" "$file"

    # Clean up backup files
    rm -f "${file}.bak"
  fi
done

echo "✅ Import fixes complete"
echo "⚠️  Note: You'll need to update the actual usage of generateEmailChittyID to use ChittyIDValidator.generateChittyID()"