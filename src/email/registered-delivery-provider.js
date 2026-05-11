/**
 * Registered delivery provider abstraction.
 * Supports multi-account account selection for outbound registered email.
 */

import { z } from 'zod';

const DEFAULT_BASE_URL = 'https://api.rpost.com';
const DEFAULT_SEND_PATH = '/api/v1/registered-email/send';
const DEFAULT_STATUS_PATH = '/api/v1/registered-email/status';

/**
 * Zod schema for registered email payload validation.
 * Ensures required fields are present and at least one body type is provided.
 */
const RegisteredEmailPayloadSchema = z.object({
  accountId: z.string().optional(),
  to: z.string().min(1, 'Recipient email is required'),
  from: z.string().min(1, 'Sender email is required'),
  subject: z.string().min(1, 'Subject is required'),
  bodyText: z.string().optional(),
  bodyHtml: z.string().optional(),
  metadata: z.record(z.any()).optional(),
  idempotencyKey: z.string().optional(),
}).refine(
  (data) => data.bodyText || data.bodyHtml,
  { message: 'Either bodyText or bodyHtml is required' }
);

function parseAccounts(env) {
  // Multi-account format (preferred):
  // RPOST_ACCOUNTS_JSON={"legal":{"apiKeyEnv":"RPOST_API_KEY_LEGAL","baseUrl":"https://..."}}
  const raw = env.RPOST_ACCOUNTS_JSON;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const out = {};
      for (const [id, cfg] of Object.entries(parsed)) {
        if (!cfg || typeof cfg !== 'object') continue;
        const apiKey = cfg.apiKey || (cfg.apiKeyEnv ? env[cfg.apiKeyEnv] : undefined);
        if (!apiKey) continue;
        out[id] = {
          id,
          apiKey,
          baseUrl: cfg.baseUrl || env.RPOST_BASE_URL || DEFAULT_BASE_URL,
          sendPath: cfg.sendPath || env.RPOST_SEND_PATH || DEFAULT_SEND_PATH,
          statusPath: cfg.statusPath || env.RPOST_STATUS_PATH || DEFAULT_STATUS_PATH,
        };
      }
      if (Object.keys(out).length > 0) return out;
    } catch (err) {
      console.error('Invalid RPOST_ACCOUNTS_JSON:', err.message);
    }
  }

  // Single-account fallback.
  if (env.RPOST_API_KEY) {
    return {
      default: {
        id: 'default',
        apiKey: env.RPOST_API_KEY,
        baseUrl: env.RPOST_BASE_URL || DEFAULT_BASE_URL,
        sendPath: env.RPOST_SEND_PATH || DEFAULT_SEND_PATH,
        statusPath: env.RPOST_STATUS_PATH || DEFAULT_STATUS_PATH,
      },
    };
  }

  return {};
}

export class RPostRegisteredDeliveryProvider {
  constructor(env) {
    this.env = env;
    this.accounts = parseAccounts(env);
    this.defaultAccountId = env.RPOST_DEFAULT_ACCOUNT || Object.keys(this.accounts)[0] || null;
  }

  listAccounts() {
    return {
      provider: 'rpost',
      defaultAccountId: this.defaultAccountId,
      accounts: Object.keys(this.accounts),
    };
  }

  resolveAccount(accountId) {
    const id = accountId || this.defaultAccountId;
    const account = id ? this.accounts[id] : null;
    if (!account) {
      throw new Error('No configured RPost account for requested accountId');
    }
    return account;
  }

  async sendRegisteredEmail(payload) {
    // Validate payload before processing
    try {
      payload = RegisteredEmailPayloadSchema.parse(payload);
    } catch (err) {
      throw new Error(`Invalid registered email payload: ${err.message}`);
    }

    const account = this.resolveAccount(payload.accountId);
    const body = {
      to: payload.to,
      from: payload.from,
      subject: payload.subject,
      body_text: payload.bodyText,
      body_html: payload.bodyHtml,
      metadata: payload.metadata || {},
    };

    const res = await fetch(`${account.baseUrl}${account.sendPath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${account.apiKey}`,
        ...(payload.idempotencyKey ? { 'Idempotency-Key': payload.idempotencyKey } : {}),
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch {}

    if (!res.ok) {
      throw new Error(`RPost send failed (${res.status}): ${text.slice(0, 400)}`);
    }

    return {
      ok: true,
      provider: 'rpost',
      accountId: account.id,
      status: parsed?.status || 'submitted',
      externalId: parsed?.id || parsed?.external_id || null,
      raw: parsed || { body: text },
    };
  }

  async getDeliveryStatus({ accountId, externalId }) {
    const account = this.resolveAccount(accountId);
    if (!externalId) throw new Error('externalId is required');

    const url = new URL(`${account.baseUrl}${account.statusPath}`);
    url.searchParams.set('id', externalId);

    const res = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${account.apiKey}`,
      },
    });

    const text = await res.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch {}

    if (!res.ok) {
      throw new Error(`RPost status failed (${res.status}): ${text.slice(0, 400)}`);
    }

    return {
      ok: true,
      provider: 'rpost',
      accountId: account.id,
      externalId,
      status: parsed?.status || 'unknown',
      raw: parsed || { body: text },
    };
  }
}

export function createRegisteredDeliveryProvider(env) {
  const provider = (env.REGISTERED_DELIVERY_PROVIDER || 'rpost').toLowerCase();
  if (provider !== 'rpost') {
    throw new Error(`Unsupported REGISTERED_DELIVERY_PROVIDER: ${provider}`);
  }
  return new RPostRegisteredDeliveryProvider(env);
}
