/**
 * ChittyConnect GitHub Client Proxy
 * Routes GitHub API calls through ChittyConnect for centralized credential management.
 * Provides an Octokit-compatible interface.
 */

export class GitHubClientProxy {
  constructor(env, options = {}) {
    this.env = env;
    this.org = options.org || 'ChittyOS';
    this.connectUrl = env.CHITTYCONNECT_URL || 'https://connect.chitty.cc';
    this.git = new GitProxy(this);
    this.repos = new ReposProxy(this);
  }

  async request(method, path, data) {
    const url = `${this.connectUrl}/github${path}`;
    const headers = {
      'Content-Type': 'application/json',
    };

    // Use service token if available
    if (this.env.CHITTYCONNECT_API_KEY) {
      headers['Authorization'] = `Bearer ${this.env.CHITTYCONNECT_API_KEY}`;
    }
    if (this.env.GITHUB_TOKEN) {
      headers['X-GitHub-Token'] = this.env.GITHUB_TOKEN;
    }

    const opts = { method, headers };
    if (data && method !== 'GET') {
      opts.body = JSON.stringify(data);
    }

    const response = await fetch(url, opts);
    if (!response.ok) {
      const error = new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      error.status = response.status;
      throw error;
    }
    return { data: await response.json() };
  }
}

class GitProxy {
  constructor(client) { this.client = client; }

  async getRef({ owner, repo, ref }) {
    return this.client.request('GET', `/repos/${owner || this.client.org}/${repo}/git/ref/${ref}`);
  }

  async createRef({ owner, repo, ref, sha }) {
    return this.client.request('POST', `/repos/${owner || this.client.org}/${repo}/git/refs`, { ref, sha });
  }
}

class ReposProxy {
  constructor(client) { this.client = client; }

  async get({ owner, repo }) {
    return this.client.request('GET', `/repos/${owner || this.client.org}/${repo}`);
  }

  async getContent({ owner, repo, path, ref }) {
    const query = ref ? `?ref=${ref}` : '';
    return this.client.request('GET', `/repos/${owner || this.client.org}/${repo}/contents/${path}${query}`);
  }

  async createOrUpdateFileContents({ owner, repo, path, message, content, sha, branch }) {
    return this.client.request('PUT', `/repos/${owner || this.client.org}/${repo}/contents/${path}`, {
      message, content, sha, branch
    });
  }

  async deleteFile({ owner, repo, path, message, sha, branch }) {
    return this.client.request('DELETE', `/repos/${owner || this.client.org}/${repo}/contents/${path}`, {
      message, sha, branch
    });
  }
}
