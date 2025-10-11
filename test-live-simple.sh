#!/bin/bash

echo "Testing persistent agent..."

curl -X POST 'https://chittyrouter.chittycorp-llc.workers.dev/platform/agents/email-router/complete' \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"Route this customer complaint email","taskType":"email_routing"}'

echo ""
