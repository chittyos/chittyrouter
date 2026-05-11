# Registered Delivery via RPost (Multi-Account)

This service supports outbound registered email through an external provider adapter.
Current provider: `rpost`.

## Environment Variables

Required (single account):
- `REGISTERED_DELIVERY_PROVIDER=rpost`
- `RPOST_API_KEY=...`

Optional (single account):
- `RPOST_BASE_URL=https://api.rpost.com`
- `RPOST_SEND_PATH=/api/v1/registered-email/send`
- `RPOST_STATUS_PATH=/api/v1/registered-email/status`

Preferred (multi-account):
- `RPOST_ACCOUNTS_JSON={"legal":{"apiKeyEnv":"RPOST_API_KEY_LEGAL"},"finance":{"apiKeyEnv":"RPOST_API_KEY_FINANCE"}}`
- `RPOST_DEFAULT_ACCOUNT=legal`
- `RPOST_API_KEY_LEGAL=...`
- `RPOST_API_KEY_FINANCE=...`

Auth for worker endpoints:
- `CHITTY_AUTH_SERVICE_TOKEN=...`

## HTTP Endpoints (Unified Worker)

All require `Authorization: Bearer $CHITTY_AUTH_SERVICE_TOKEN`.

- `POST /email/registered/send`
- `GET /email/registered/status?externalId=<id>&accountId=<optional>`
- `GET /email/registered/accounts`

## MCP Tools (`NOTIFICATION_AGENT`)

- `notification__registered_send`
- `notification__registered_status`
- `notification__registered_accounts`

## Payload: Send

```json
{
  "to": "recipient@example.com",
  "from": "legal@chitty.cc",
  "subject": "Registered Notice",
  "bodyText": "Notice body",
  "bodyHtml": "<p>Notice body</p>",
  "accountId": "legal",
  "idempotencyKey": "notice-2026-05-10-001",
  "reference_id": "CASE-123",
  "org": "ChittyCounsel",
  "metadata": {
    "caseId": "CASE-123",
    "threadId": "thread-abc"
  }
}
```
