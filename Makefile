# ChittyOS Infrastructure Makefile

.PHONY: validate deploy test clean help

# Default target
help:
	@echo "ChittyOS Infrastructure Management"
	@echo "=================================="
	@echo "make validate    - Validate all infrastructure components"
	@echo "make test        - Run consolidation tests"
	@echo "make ci-guards   - Run ChittyID CI guards"
	@echo "make clean       - Clean up old files"
	@echo ""
	@echo "Requires: 1Password CLI (op) installed and configured"

# Validate infrastructure using 1Password
validate:
	@echo "🔐 Validating infrastructure with 1Password..."
	@op run --env-file=.env.op -- ./infrastructure/validate-deployment.sh

# Run tests
test:
	@echo "🧪 Running consolidation tests..."
	@unset NODE_OPTIONS && node test-hardened-single.js
	@unset NODE_OPTIONS && node test-verifiable-randomness.js

# Run CI guards
ci-guards:
	@echo "🔍 Running ChittyID CI guards..."
	@bash scripts/ci/chittyid-guards.sh

# Clean up old files marked for deletion
clean:
	@echo "🧹 Cleaning up old files..."
	@find . -name "*.deleted" -o -name "*.old" -o -name "*.bak" | while read f; do \
		echo "  Removing: $$f"; \
		rm -f "$$f"; \
	done
	@echo "✅ Cleanup complete"

# Quick validation (without 1Password, requires env vars)
validate-quick:
	@if [ -z "$$CF_API_TOKEN" ] || [ -z "$$CF_ACCOUNT_ID" ]; then \
		echo "❌ ERROR: Set CF_API_TOKEN and CF_ACCOUNT_ID first"; \
		exit 1; \
	fi
	@./infrastructure/validate-deployment.sh

# Deploy workers (example)
deploy-workers:
	@echo "🚀 Deploying Workers..."
	@op run --env-file=.env.op -- wrangler deploy --env production

# Deploy pages (example)
deploy-pages:
	@echo "📄 Deploying Pages..."
	@op run --env-file=.env.op -- wrangler pages deploy dist/