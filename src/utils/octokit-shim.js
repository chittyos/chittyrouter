/**
 * Workers-compatible Octokit shim
 * Uses fetch instead of @octokit/rest for Cloudflare Workers compatibility
 */

export class Octokit {
  constructor(options = {}) {
    this.auth = options.auth;
    this.baseUrl = options.baseUrl || 'https://api.github.com';
  }

  async request(endpoint, options = {}) {
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'ChittyRouter/2.0',
      ...(this.auth && { 'Authorization': `Bearer ${this.auth}` }),
      ...options.headers
    };

    const response = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.data ? JSON.stringify(options.data) : undefined
    });

    const data = await response.json();

    if (!response.ok) {
      const error = new Error(data.message || 'GitHub API error');
      error.status = response.status;
      error.response = { data };
      throw error;
    }

    return { data, status: response.status };
  }

  get repos() {
    return {
      getContent: async (params) => {
        const { owner, repo, path, ref } = params;
        let url = `/repos/${owner}/${repo}/contents/${path}`;
        if (ref) url += `?ref=${ref}`;
        return this.request(url);
      },
      createOrUpdateFileContents: async (params) => {
        const { owner, repo, path, ...data } = params;
        return this.request(`/repos/${owner}/${repo}/contents/${path}`, {
          method: 'PUT',
          data
        });
      },
      getBranch: async (params) => {
        const { owner, repo, branch } = params;
        return this.request(`/repos/${owner}/${repo}/branches/${branch}`);
      },
      createRef: async (params) => {
        const { owner, repo, ref, sha } = params;
        return this.request(`/repos/${owner}/${repo}/git/refs`, {
          method: 'POST',
          data: { ref, sha }
        });
      },
      listBranches: async (params) => {
        const { owner, repo, per_page } = params;
        let url = `/repos/${owner}/${repo}/branches`;
        if (per_page) url += `?per_page=${per_page}`;
        return this.request(url);
      },
      get: async (params) => {
        const { owner, repo } = params;
        return this.request(`/repos/${owner}/${repo}`);
      }
    };
  }

  get git() {
    return {
      createTree: async (params) => {
        const { owner, repo, ...data } = params;
        return this.request(`/repos/${owner}/${repo}/git/trees`, {
          method: 'POST',
          data
        });
      },
      createCommit: async (params) => {
        const { owner, repo, ...data } = params;
        return this.request(`/repos/${owner}/${repo}/git/commits`, {
          method: 'POST',
          data
        });
      },
      updateRef: async (params) => {
        const { owner, repo, ref, sha, force } = params;
        return this.request(`/repos/${owner}/${repo}/git/refs/${ref}`, {
          method: 'PATCH',
          data: { sha, force }
        });
      },
      getRef: async (params) => {
        const { owner, repo, ref } = params;
        return this.request(`/repos/${owner}/${repo}/git/ref/${ref}`);
      },
      getTree: async (params) => {
        const { owner, repo, tree_sha, recursive } = params;
        let url = `/repos/${owner}/${repo}/git/trees/${tree_sha}`;
        if (recursive) url += '?recursive=1';
        return this.request(url);
      }
    };
  }

  get issues() {
    return {
      create: async (params) => {
        const { owner, repo, ...data } = params;
        return this.request(`/repos/${owner}/${repo}/issues`, {
          method: 'POST',
          data
        });
      },
      listForRepo: async (params) => {
        const { owner, repo, state, labels, per_page } = params;
        const searchParams = new URLSearchParams();
        if (state) searchParams.append('state', state);
        if (labels) searchParams.append('labels', labels);
        if (per_page) searchParams.append('per_page', per_page.toString());
        const query = searchParams.toString();
        return this.request(`/repos/${owner}/${repo}/issues${query ? '?' + query : ''}`);
      }
    };
  }
}

export default Octokit;
