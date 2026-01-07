/**
 * Gmail Token Manager
 * Handles OAuth token refresh and management for multiple Gmail accounts
 * Integrates with 1Password via ChittyConnect for secure credential storage
 */

export class GmailTokenManager {
  constructor(env) {
    this.env = env;
    this.tokenCache = new Map();
    this.refreshBuffer = 5 * 60 * 1000; // 5 minutes before expiry

    // Account configurations - matches rclone remotes
    this.accounts = {
      nick_aribia_main: {
        email: 'nick@aribia.cc',
        clientId: '187458330646-irp331653sb9c4f8mjgumsg75qbb59rm.apps.googleusercontent.com',
        opPath: 'op://Private/gmail-nick-aribia/credentials'
      },
      aribia_llc: {
        email: 'admin@aribia.cc',
        clientId: '187458330646-p0bho083tarmja05p89i0uc7d5lt96rr.apps.googleusercontent.com',
        opPath: 'op://Private/gmail-aribia-llc/credentials'
      },
      it_can_be_llc: {
        email: 'admin@itcanbe.llc',
        clientId: '187458330646-p0bho083tarmja05p89i0uc7d5lt96rr.apps.googleusercontent.com',
        opPath: 'op://Private/gmail-it-can-be/credentials'
      }
    };
  }

  /**
   * Get valid access token for an account
   */
  async getToken(accountName) {
    // Check memory cache first
    const cached = this.tokenCache.get(accountName);
    if (cached && !this.isExpired(cached)) {
      return cached.access_token;
    }

    // Check KV cache
    try {
      const kvToken = await this.env.AI_CACHE?.get(`gmail_token_${accountName}`, 'json');
      if (kvToken && !this.isExpired(kvToken)) {
        this.tokenCache.set(accountName, kvToken);
        return kvToken.access_token;
      }

      // Token expired or missing - refresh it
      const refreshed = await this.refreshToken(accountName);
      if (refreshed) {
        await this.cacheToken(accountName, refreshed);
        return refreshed.access_token;
      }
    } catch (error) {
      console.error(`Failed to get token for ${accountName}:`, error);
    }

    return null;
  }

  /**
   * Check if token is expired (with buffer)
   */
  isExpired(tokenData) {
    if (!tokenData.expiry) return true;
    const expiry = new Date(tokenData.expiry).getTime();
    return Date.now() > (expiry - this.refreshBuffer);
  }

  /**
   * Refresh an expired token using refresh_token
   */
  async refreshToken(accountName) {
    const account = this.accounts[accountName];
    if (!account) {
      console.error(`Unknown account: ${accountName}`);
      return null;
    }

    try {
      // Get credentials from 1Password via ChittyConnect
      const creds = await this.getCredentialsFromOP(account.opPath);
      if (!creds?.refresh_token || !creds?.client_secret) {
        console.error(`Missing credentials for ${accountName}`);
        return null;
      }

      // Exchange refresh token for new access token
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: account.clientId,
          client_secret: creds.client_secret,
          refresh_token: creds.refresh_token,
          grant_type: 'refresh_token'
        })
      });

      if (!response.ok) {
        const error = await response.text();
        console.error(`Token refresh failed for ${accountName}:`, error);
        return null;
      }

      const data = await response.json();

      // Calculate expiry time
      const expiry = new Date();
      expiry.setSeconds(expiry.getSeconds() + (data.expires_in || 3600));

      return {
        access_token: data.access_token,
        token_type: data.token_type,
        expiry: expiry.toISOString(),
        expires_in: data.expires_in,
        scope: data.scope
      };
    } catch (error) {
      console.error(`Token refresh error for ${accountName}:`, error);
      return null;
    }
  }

  /**
   * Get credentials from 1Password via ChittyConnect
   */
  async getCredentialsFromOP(opPath) {
    try {
      // Try ChittyConnect first
      const response = await fetch('https://connect.chitty.cc/secrets/read', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.env.CHITTYCONNECT_TOKEN}`
        },
        body: JSON.stringify({ path: opPath })
      });

      if (response.ok) {
        return await response.json();
      }

      // Fallback: check if stored in KV
      const kvCreds = await this.env.AI_CACHE?.get(`credentials_${opPath}`, 'json');
      if (kvCreds) {
        return kvCreds;
      }

      console.warn(`Could not retrieve credentials from ${opPath}`);
      return null;
    } catch (error) {
      console.error('Failed to get credentials from 1Password:', error);
      return null;
    }
  }

  /**
   * Cache token in memory and KV
   */
  async cacheToken(accountName, tokenData) {
    // Memory cache
    this.tokenCache.set(accountName, tokenData);

    // KV cache
    try {
      await this.env.AI_CACHE?.put(
        `gmail_token_${accountName}`,
        JSON.stringify(tokenData),
        { expirationTtl: 3600 } // 1 hour
      );
    } catch (error) {
      console.error(`Failed to cache token for ${accountName}:`, error);
    }
  }

  /**
   * Get all configured account names
   */
  getAccountNames() {
    return Object.keys(this.accounts);
  }

  /**
   * Get account email for display
   */
  getAccountEmail(accountName) {
    return this.accounts[accountName]?.email || accountName;
  }

  /**
   * Test token validity for an account
   */
  async testToken(accountName) {
    const token = await this.getToken(accountName);
    if (!token) {
      return { valid: false, error: 'No token available' };
    }

    try {
      const response = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/profile',
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      if (response.ok) {
        const profile = await response.json();
        return { valid: true, email: profile.emailAddress };
      }

      return { valid: false, status: response.status };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }
}

/**
 * Initialize token manager with stored tokens from rclone config
 * This is a bootstrap function to seed tokens from local rclone config
 */
export async function seedTokensFromRclone(env, rcloneTokens) {
  const manager = new GmailTokenManager(env);

  for (const [accountName, tokenData] of Object.entries(rcloneTokens)) {
    await manager.cacheToken(accountName, tokenData);
  }

  return manager;
}
