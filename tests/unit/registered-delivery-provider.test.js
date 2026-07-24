/**
 * Unit Tests for RPost Registered Delivery Provider
 * Verifies the provider speaks the real RMail® REST API:
 * token grant, attachment upload, Mail send, MessageStatus, Receipt zip.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  RPostRegisteredDeliveryProvider,
  createRegisteredDeliveryProvider,
} from '../../src/email/registered-delivery-provider.js';

const BASE = 'https://webapi.r1.rpost.net';

function jsonRes(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function tokenRes(token = 'tok-1', expiresIn = 1209599) {
  return jsonRes({
    access_token: token,
    token_type: 'bearer',
    expires_in: expiresIn,
    userName: 'nick@chitty.cc',
  });
}

function sendRes(trackingId = 'A02A3FA23782D3CBA1306C38B686EB8480') {
  return jsonRes({
    StatusCode: 200,
    StatusText: 'OK',
    Status: 'Success',
    Message: [{ Message: 'Request to send message received', MessageId: 'MAIL-1011' }],
    ResultContent: { TrackingId: trackingId },
  });
}

describe('RPostRegisteredDeliveryProvider', () => {
  let env;
  let fetchMock;

  beforeEach(() => {
    env = {
      SERVICE_NAME: 'chittyrouter',
      RPOST_USERNAME: 'nick@chitty.cc',
      RPOST_PASSWORD: 'secret',
      RPOST_CLIENT_ID: 'client-123',
    };
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe('account configuration', () => {
    it('parses the single-account fallback from env', () => {
      const provider = new RPostRegisteredDeliveryProvider(env);
      expect(provider.listAccounts()).toEqual({
        provider: 'rpost',
        defaultAccountId: 'default',
        accounts: ['default'],
      });
    });

    it('parses multi-account config with env-indirected secrets', () => {
      const provider = new RPostRegisteredDeliveryProvider({
        RPOST_ACCOUNTS_JSON: JSON.stringify({
          legal: { usernameEnv: 'U_LEGAL', passwordEnv: 'P_LEGAL', baseUrl: 'https://webapi.r2.rpost.net/' },
          ops: { username: 'ops@chitty.cc', password: 'pw' },
        }),
        U_LEGAL: 'legal@chitty.cc',
        P_LEGAL: 'pw-legal',
        RPOST_DEFAULT_ACCOUNT: 'legal',
      });
      expect(provider.listAccounts().accounts.sort()).toEqual(['legal', 'ops']);
      const legal = provider.resolveAccount('legal');
      expect(legal.username).toBe('legal@chitty.cc');
      expect(legal.baseUrl).toBe('https://webapi.r2.rpost.net');
    });

    it('skips accounts with missing secrets and throws when none resolve', () => {
      const provider = new RPostRegisteredDeliveryProvider({
        RPOST_ACCOUNTS_JSON: JSON.stringify({ legal: { usernameEnv: 'MISSING', passwordEnv: 'ALSO_MISSING' } }),
      });
      expect(provider.listAccounts().accounts).toEqual([]);
      expect(() => provider.resolveAccount()).toThrow(/No configured RPost account/);
    });

    it('createRegisteredDeliveryProvider rejects unknown providers', () => {
      expect(() => createRegisteredDeliveryProvider({ REGISTERED_DELIVERY_PROVIDER: 'sendgrid' }))
        .toThrow(/Unsupported REGISTERED_DELIVERY_PROVIDER/);
    });
  });

  describe('token flow', () => {
    it('requests an OAuth2 password-grant token and caches it', async () => {
      fetchMock
        .mockResolvedValueOnce(tokenRes())
        .mockResolvedValueOnce(sendRes())
        .mockResolvedValueOnce(sendRes('SECOND'));

      const provider = new RPostRegisteredDeliveryProvider(env);
      await provider.sendRegisteredEmail({ to: 'a@b.com', subject: 'Hi', bodyText: 'x' });
      await provider.sendRegisteredEmail({ to: 'a@b.com', subject: 'Hi again', bodyText: 'y' });

      // 1 token call + 2 sends (token cached across sends)
      expect(fetchMock).toHaveBeenCalledTimes(3);
      const [tokenUrl, tokenInit] = fetchMock.mock.calls[0];
      expect(tokenUrl).toBe(`${BASE}/token`);
      expect(tokenInit.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
      const form = new URLSearchParams(tokenInit.body);
      expect(form.get('grant_type')).toBe('password');
      expect(form.get('username')).toBe('nick@chitty.cc');
      expect(form.get('password')).toBe('secret');
      expect(form.get('Client_Id')).toBe('client-123');
    });

    it('re-authenticates once on 401 and retries the request', async () => {
      fetchMock
        .mockResolvedValueOnce(tokenRes('tok-old'))
        .mockResolvedValueOnce(new Response('unauthorized', { status: 401 }))
        .mockResolvedValueOnce(tokenRes('tok-new'))
        .mockResolvedValueOnce(sendRes());

      const provider = new RPostRegisteredDeliveryProvider(env);
      const result = await provider.sendRegisteredEmail({ to: 'a@b.com', subject: 'Hi', bodyText: 'x' });

      expect(result.ok).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(4);
      const retryInit = fetchMock.mock.calls[3][1];
      expect(retryInit.headers.Authorization).toBe('Bearer tok-new');
    });

    it('throws when the token endpoint rejects credentials', async () => {
      fetchMock.mockResolvedValueOnce(jsonRes({ error: 'invalid_grant' }, 400));
      const provider = new RPostRegisteredDeliveryProvider(env);
      await expect(provider.sendRegisteredEmail({ to: 'a@b.com', subject: 'Hi', bodyText: 'x' }))
        .rejects.toThrow(/RPost token request failed \(400\)/);
    });
  });

  describe('sendRegisteredEmail', () => {
    it('maps the payload onto the RMail /api/v1/Mail contract', async () => {
      fetchMock
        .mockResolvedValueOnce(tokenRes())
        .mockResolvedValueOnce(sendRes());

      const provider = new RPostRegisteredDeliveryProvider(env);
      const result = await provider.sendRegisteredEmail({
        to: 'a@b.com;c@d.com',
        cc: 'e@f.com',
        from: 'legal@chitty.cc',
        subject: 'Notice of Service',
        bodyHtml: '<p>Served</p>',
        bodyText: 'Served',
        idempotencyKey: 'DD-12345',
        features: { encrypt: true, encryptTls: true, clientCode: 'ARIAS-2024D007847' },
        options: { 'X-RPost-NoAck': '1' },
      });

      const [sendUrl, sendInit] = fetchMock.mock.calls[1];
      expect(sendUrl).toBe(`${BASE}/api/v1/Mail`);
      expect(sendInit.headers.Authorization).toBe('Bearer tok-1');
      const body = JSON.parse(sendInit.body);
      expect(body).toMatchObject({
        From: 'legal@chitty.cc',
        To: 'a@b.com;c@d.com',
        Cc: 'e@f.com',
        Subject: 'Notice of Service',
        Body: '<p>Served</p>',
        Attachments: [],
        IsLargeMail: false,
      });
      expect(body.Options).toMatchObject({
        'X-RPost-Type': '1',
        'X-RPost-App': 'chittyrouter',
        'X-RPost-SecuRmail': '1',
        'X-RPost-TLS': '1',
        'X-RPost-ClientCode': 'ARIAS-2024D007847',
        'X-Rpost-CustomerTrackingId': 'DD-12345',
        'X-RPost-NoAck': '1',
      });

      expect(result).toMatchObject({
        ok: true,
        provider: 'rpost',
        accountId: 'default',
        status: 'Success',
        externalId: 'A02A3FA23782D3CBA1306C38B686EB8480',
      });
    });

    it('uploads inline attachments first and passes returned ids', async () => {
      fetchMock
        .mockResolvedValueOnce(tokenRes())
        .mockResolvedValueOnce(jsonRes('c142e3c3'))
        .mockResolvedValueOnce(sendRes());

      const provider = new RPostRegisteredDeliveryProvider(env);
      await provider.sendRegisteredEmail({
        to: 'a@b.com',
        subject: 'With attachment',
        bodyText: 'see attached',
        attachments: [
          'pre-uploaded-id',
          { filename: 'notice.pdf', content: btoa('PDFDATA'), contentType: 'application/pdf' },
        ],
      });

      const [uploadUrl, uploadInit] = fetchMock.mock.calls[1];
      expect(uploadUrl).toBe(`${BASE}/api/Upload`);
      expect(uploadInit.body).toBeInstanceOf(FormData);
      expect(uploadInit.body.get('notice.pdf')).toBeTruthy();

      const sendBody = JSON.parse(fetchMock.mock.calls[2][1].body);
      expect(sendBody.Attachments).toEqual(['pre-uploaded-id', 'c142e3c3']);
    });

    it('rejects invalid payloads before any network call', async () => {
      const provider = new RPostRegisteredDeliveryProvider(env);
      await expect(provider.sendRegisteredEmail({ to: 'a@b.com', subject: 'no body' }))
        .rejects.toThrow(/Invalid registered email payload/);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('surfaces API-level failure statuses', async () => {
      fetchMock
        .mockResolvedValueOnce(tokenRes())
        .mockResolvedValueOnce(jsonRes({ Status: 'Failure', Message: [{ Message: 'bad recipient' }] }));

      const provider = new RPostRegisteredDeliveryProvider(env);
      await expect(provider.sendRegisteredEmail({ to: 'a@b.com', subject: 'Hi', bodyText: 'x' }))
        .rejects.toThrow(/RPost send failed/);
    });
  });

  describe('getDeliveryStatus', () => {
    it('posts the TrackingId to Receipt/MessageStatus and normalizes the result', async () => {
      fetchMock
        .mockResolvedValueOnce(tokenRes())
        .mockResolvedValueOnce(jsonRes({
          Status: 'Success',
          ResultContent: {
            TrackingId: 'TRACK-1',
            Status: 'All Delivered',
            Recipients: [{ Address: 'a@b.com', DeliveryStatus: 'Delivered to Mailbox' }],
          },
        }));

      const provider = new RPostRegisteredDeliveryProvider(env);
      const result = await provider.getDeliveryStatus({ externalId: 'TRACK-1' });

      const [statusUrl, statusInit] = fetchMock.mock.calls[1];
      expect(statusUrl).toBe(`${BASE}/api/v1/Receipt/MessageStatus`);
      expect(JSON.parse(statusInit.body)).toEqual({ TrackingId: 'TRACK-1' });
      expect(result.status).toBe('All Delivered');
      expect(result.recipients).toHaveLength(1);
    });

    it('requires an externalId', async () => {
      const provider = new RPostRegisteredDeliveryProvider(env);
      await expect(provider.getDeliveryStatus({})).rejects.toThrow(/externalId is required/);
    });
  });

  describe('getRegisteredReceipt', () => {
    it('fetches the receipt zip by TrackingId', async () => {
      const zipBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
      fetchMock
        .mockResolvedValueOnce(tokenRes())
        .mockResolvedValueOnce(new Response(zipBytes, {
          status: 200,
          headers: { 'Content-Type': 'application/zip' },
        }));

      const provider = new RPostRegisteredDeliveryProvider(env);
      const result = await provider.getRegisteredReceipt({ externalId: 'TRACK-1' });

      expect(fetchMock.mock.calls[1][0]).toBe(`${BASE}/api/v1/Receipt/TRACK-1`);
      expect(result.contentType).toBe('application/zip');
      expect(new Uint8Array(result.body)).toEqual(zipBytes);
    });
  });
});
