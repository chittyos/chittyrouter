/**
 * Registered delivery provider abstraction.
 * Supports multi-account account selection for outbound registered email.
 *
 * RPost RMail® REST API (verified against RPost's official Postman collection,
 * "RMail® Email Security REST APIs by RPost®"):
 *   POST {base}/token                        - OAuth2 password grant (form-urlencoded)
 *   POST {base}/api/Upload                   - multipart attachment upload -> id string
 *   POST {base}/api/v1/Mail                  - send Registered Email™ -> ResultContent.TrackingId
 *   POST {base}/api/v1/Receipt/MessageStatus - delivery status by TrackingId
 *   GET  {base}/api/v1/Receipt/{TrackingId}  - Registered Receipt® zip of .eml files
 */

import { z } from 'zod';

const DEFAULT_BASE_URL = 'https://webapi.r1.rpost.net';
const TOKEN_EXPIRY_MARGIN_MS = 60_000;

/**
 * Zod schema for registered email payload validation.
 * Ensures required fields are present and at least one body type is provided.
 */
const AttachmentSchema = z.union([
  // Pre-uploaded RMail attachment id from POST /api/Upload
  z.string().min(1),
  z.object({
    filename: z.string().min(1).max(160, 'RMail file names are limited to 160 characters'),
    // Base64-encoded file content
    content: z.string().min(1),
    contentType: z.string().optional(),
  }),
]);

const FeaturesSchema = z.object({
  // Message-level encryption (X-RPost-SecuRmail)
  encrypt: z.boolean().optional(),
  // Downgrade encryption to TLS-only (requires encrypt)
  encryptTls: z.boolean().optional(),
  // Encryption password handling
  encryptPassword: z.string().optional(),
  autoPassword: z.boolean().optional(),
  sendPassword: z.boolean().optional(),
  // E-Sign: 'epaper' | 'oneclick'
  esign: z.enum(['epaper', 'oneclick']).optional(),
  // Send without the RMail banner
  unmarked: z.boolean().optional(),
  // Route attachments through LargeMail
  largeMail: z.boolean().optional(),
  // Client/reference code shown on the Registered Receipt® (max 64 chars)
  clientCode: z.string().max(64).optional(),
}).optional();

const RegisteredEmailPayloadSchema = z.object({
  accountId: z.string().optional(),
  to: z.string().min(1, 'Recipient email is required'),
  cc: z.string().optional(),
  bcc: z.string().optional(),
  from: z.string().optional(),
  subject: z.string().min(1, 'Subject is required'),
  bodyText: z.string().optional(),
  bodyHtml: z.string().optional(),
  attachments: z.array(AttachmentSchema).optional(),
  features: FeaturesSchema,
  // Raw X-RPost-* option overrides; applied last, wins over feature-derived options
  options: z.record(z.string(), z.string()).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  // Surfaced as X-Rpost-CustomerTrackingId so sends can be correlated via MessageStatus
  idempotencyKey: z.string().optional(),
}).refine(
  (data) => data.bodyText || data.bodyHtml,
  { message: 'Either bodyText or bodyHtml is required' }
);

function readSecret(env, cfg, directKey, envKey) {
  if (cfg[directKey]) return cfg[directKey];
  if (cfg[envKey]) return env[cfg[envKey]];
  return undefined;
}

function parseAccounts(env) {
  // Multi-account format (preferred):
  // RPOST_ACCOUNTS_JSON={"legal":{"usernameEnv":"RPOST_USERNAME_LEGAL","passwordEnv":"RPOST_PASSWORD_LEGAL","clientIdEnv":"RPOST_CLIENT_ID_LEGAL","baseUrl":"https://..."}}
  const raw = env.RPOST_ACCOUNTS_JSON;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const out = {};
      for (const [id, cfg] of Object.entries(parsed)) {
        if (!cfg || typeof cfg !== 'object') continue;
        const username = readSecret(env, cfg, 'username', 'usernameEnv');
        const password = readSecret(env, cfg, 'password', 'passwordEnv');
        if (!username || !password) continue;
        out[id] = {
          id,
          username,
          password,
          clientId: readSecret(env, cfg, 'clientId', 'clientIdEnv') || env.RPOST_CLIENT_ID,
          baseUrl: (cfg.baseUrl || env.RPOST_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, ''),
        };
      }
      if (Object.keys(out).length > 0) return out;
    } catch (err) {
      console.error('Invalid RPOST_ACCOUNTS_JSON:', err.message);
    }
  }

  // Single-account fallback.
  if (env.RPOST_USERNAME && env.RPOST_PASSWORD) {
    return {
      default: {
        id: 'default',
        username: env.RPOST_USERNAME,
        password: env.RPOST_PASSWORD,
        clientId: env.RPOST_CLIENT_ID,
        baseUrl: (env.RPOST_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, ''),
      },
    };
  }

  return {};
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function buildSendOptions(env, payload) {
  const features = payload.features || {};
  const options = {
    'X-RPost-Type': features.unmarked ? '2' : '1',
    'X-RPost-App': env.SERVICE_NAME || 'chittyrouter',
  };

  if (features.encrypt) {
    options['X-RPost-SecuRmail'] = '1';
    if (features.encryptTls) options['X-RPost-TLS'] = '1';
    if (features.encryptPassword) options['X-RPost-SecuRmail-Password'] = features.encryptPassword;
    if (features.autoPassword) options['X-RPost-SecuRmail-AutoPassword'] = '1';
    if (features.sendPassword) options['X-RPost-SendPassword'] = '1';
  }
  if (features.esign) {
    options['X-RPost-Esign'] = features.esign === 'oneclick' ? '2' : '1';
  }
  if (features.clientCode) {
    options['X-RPost-ClientCode'] = features.clientCode;
  }
  if (payload.idempotencyKey) {
    options['X-Rpost-CustomerTrackingId'] = payload.idempotencyKey;
  }

  return { ...options, ...(payload.options || {}) };
}

async function parseResponse(res) {
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch {}
  return { text, parsed };
}

export class RPostRegisteredDeliveryProvider {
  constructor(env) {
    this.env = env;
    this.accounts = parseAccounts(env);
    this.defaultAccountId = env.RPOST_DEFAULT_ACCOUNT || Object.keys(this.accounts)[0] || null;
    this.tokenCache = new Map();
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

  async getAccessToken(account) {
    const cached = this.tokenCache.get(account.id);
    if (cached && cached.expiresAt > Date.now() + TOKEN_EXPIRY_MARGIN_MS) {
      return cached.token;
    }

    const form = new URLSearchParams({
      grant_type: 'password',
      username: account.username,
      password: account.password,
    });
    if (account.clientId) form.set('Client_Id', account.clientId);

    const res = await fetch(`${account.baseUrl}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });

    const { text, parsed } = await parseResponse(res);
    if (!res.ok || !parsed?.access_token) {
      throw new Error(`RPost token request failed (${res.status}): ${text.slice(0, 400)}`);
    }

    this.tokenCache.set(account.id, {
      token: parsed.access_token,
      expiresAt: Date.now() + (parsed.expires_in ? parsed.expires_in * 1000 : 3600_000),
    });
    return parsed.access_token;
  }

  /**
   * Authenticated fetch with a single retry on 401 (token expiry/revocation).
   */
  async authorizedFetch(account, path, init = {}) {
    let token = await this.getAccessToken(account);
    let res = await fetch(`${account.baseUrl}${path}`, {
      ...init,
      headers: { ...(init.headers || {}), 'Authorization': `Bearer ${token}` },
    });
    if (res.status === 401) {
      this.tokenCache.delete(account.id);
      token = await this.getAccessToken(account);
      res = await fetch(`${account.baseUrl}${path}`, {
        ...init,
        headers: { ...(init.headers || {}), 'Authorization': `Bearer ${token}` },
      });
    }
    return res;
  }

  /**
   * Upload inline attachments, returning RMail attachment ids.
   * String entries are assumed to be already-uploaded ids and pass through.
   * The Upload endpoint returns a single id per request, so each file gets
   * its own call.
   */
  async uploadAttachments(account, attachments) {
    const ids = [];
    for (const att of attachments) {
      if (typeof att === 'string') {
        ids.push(att);
        continue;
      }

      const form = new FormData();
      const bytes = base64ToBytes(att.content);
      form.append(
        att.filename,
        new Blob([bytes], { type: att.contentType || 'application/octet-stream' }),
        att.filename,
      );

      const res = await this.authorizedFetch(account, '/api/Upload', {
        method: 'POST',
        body: form,
      });
      const { text, parsed } = await parseResponse(res);
      if (!res.ok) {
        throw new Error(`RPost upload failed (${res.status}) for ${att.filename}: ${text.slice(0, 400)}`);
      }

      // The API returns the id string (JSON-encoded), e.g. "c142e3c3"
      const id = typeof parsed === 'string' ? parsed : text.replace(/^"|"$/g, '').trim();
      if (!id) throw new Error(`RPost upload returned no attachment id for ${att.filename}`);
      ids.push(id);
    }
    return ids;
  }

  async sendRegisteredEmail(payload) {
    // Validate payload before processing
    try {
      payload = RegisteredEmailPayloadSchema.parse(payload);
    } catch (err) {
      throw new Error(`Invalid registered email payload: ${err.message}`);
    }

    const account = this.resolveAccount(payload.accountId);

    let attachmentIds = [];
    if (payload.attachments?.length) {
      attachmentIds = await this.uploadAttachments(account, payload.attachments);
    }

    const body = {
      From: payload.from || '',
      To: payload.to,
      Cc: payload.cc || '',
      Bcc: payload.bcc || '',
      Subject: payload.subject,
      // The Body field accepts HTML
      Body: payload.bodyHtml || payload.bodyText,
      Attachments: attachmentIds,
      IsLargeMail: Boolean(payload.features?.largeMail),
      Options: buildSendOptions(this.env, payload),
    };

    const res = await this.authorizedFetch(account, '/api/v1/Mail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const { text, parsed } = await parseResponse(res);
    if (!res.ok || parsed?.Status === 'Failure') {
      throw new Error(`RPost send failed (${res.status}): ${text.slice(0, 400)}`);
    }

    return {
      ok: true,
      provider: 'rpost',
      accountId: account.id,
      status: parsed?.Status || 'submitted',
      externalId: parsed?.ResultContent?.TrackingId || null,
      raw: parsed || { body: text },
    };
  }

  async getDeliveryStatus({ accountId, externalId }) {
    const account = this.resolveAccount(accountId);
    if (!externalId) throw new Error('externalId is required');

    const res = await this.authorizedFetch(account, '/api/v1/Receipt/MessageStatus', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ TrackingId: externalId }),
    });

    const { text, parsed } = await parseResponse(res);
    if (!res.ok) {
      throw new Error(`RPost status failed (${res.status}): ${text.slice(0, 400)}`);
    }

    return {
      ok: true,
      provider: 'rpost',
      accountId: account.id,
      externalId,
      status: parsed?.ResultContent?.Status || parsed?.Status || 'unknown',
      recipients: parsed?.ResultContent?.Recipients || [],
      raw: parsed || { body: text },
    };
  }

  /**
   * Fetch the Registered Receipt® zip (.eml per recipient).
   * Available ~2h after send, up to 30 days.
   */
  async getRegisteredReceipt({ accountId, externalId }) {
    const account = this.resolveAccount(accountId);
    if (!externalId) throw new Error('externalId is required');

    const res = await this.authorizedFetch(account, `/api/v1/Receipt/${encodeURIComponent(externalId)}`, {
      method: 'GET',
    });

    if (!res.ok) {
      const { text } = await parseResponse(res);
      throw new Error(`RPost receipt failed (${res.status}): ${text.slice(0, 400)}`);
    }

    return {
      ok: true,
      provider: 'rpost',
      accountId: account.id,
      externalId,
      contentType: res.headers.get('Content-Type') || 'application/zip',
      body: await res.arrayBuffer(),
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
