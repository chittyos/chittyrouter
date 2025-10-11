#!/bin/bash

echo "Testing production deployment at router.chitty.cc..."
echo ""

curl -X POST 'https://router.chitty.cc/platform/agents/email-router/complete' \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"Test production agent","taskType":"email_routing"}'

echo ""
echo ""
echo "Testing agent stats..."
curl -s 'https://router.chitty.cc/platform/agents/email-router/stats'

echo ""
