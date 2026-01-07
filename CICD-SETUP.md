# ChittyRouter CI/CD Setup Guide

## 🚀 **Automated Deployment via GitHub Actions**

This repository is configured for automated deployment to Cloudflare Workers using GitHub Actions CI/CD pipelines.

---

## 📋 **Required GitHub Secrets**

Before the CI/CD pipeline can deploy, you need to configure these secrets in your GitHub repository:

### **1. Go to Repository Settings**
Navigate to: `Settings` → `Secrets and variables` → `Actions`

### **2. Add Required Secrets**

| Secret Name | Value | Description |
|------------|-------|-------------|
| `CLOUDFLARE_API_TOKEN` | Your API Token | Cloudflare API token with Workers deployment permissions |
| `CLOUDFLARE_ACCOUNT_ID` | `0bc21e3a5a9de1a4cc843be9c3e98121` | ChittyCorp account ID |

### **3. Getting Cloudflare API Token**

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens)
2. Click "Create Token"
3. Use template: "Edit Cloudflare Workers"
4. Configure permissions:
   - Account: ChittyCorp
   - Permissions: Workers Scripts:Edit
5. Copy the token and add it as `CLOUDFLARE_API_TOKEN` secret

---

## 🔄 **CI/CD Workflows**

### **1. Continuous Integration (`ci.yml`)**
Runs on every push and pull request:
- ✅ Linting
- ✅ Unit & Integration Tests
- ✅ Build Validation
- ✅ Security Scanning
- ✅ MCP Integration Validation

### **2. Deployment Pipeline (`deploy.yml`)**

#### **Staging Deployment**
- **Trigger**: Push to `main` branch
- **URL**: `https://staging.router.chitty.cc`
- **Automatic**: Yes

#### **Production Deployment**
- **Trigger**: Push to `production` branch OR manual workflow dispatch
- **URLs**:
  - `https://mcp.chitty.cc` (MCP Server)
  - `https://ai.chitty.cc` (AI Gateway)
  - `https://router.chitty.cc` (Router)
- **Features**: Health check verification, automatic rollback on failure

---

## 🎯 **Deployment Process**

### **Option 1: Automatic Deployment**

1. **For Staging**:
   ```bash
   git checkout main
   git push origin main
   ```
   → Automatically deploys to staging

2. **For Production**:
   ```bash
   git checkout production
   git merge main
   git push origin production
   ```
   → Automatically deploys to production

### **Option 2: Manual Deployment**

1. Go to repository's Actions tab
2. Select "Deploy ChittyRouter to Cloudflare"
3. Click "Run workflow"
4. Select environment (staging/production)
5. Click "Run workflow"

---

## 🔍 **Deployment Verification**

After deployment, the pipeline automatically verifies:

1. **Health Checks**:
   - `/health` - General health status
   - `/mcp/info` - MCP server information
   - `/mcp/tools` - Available tools
   - `/mcp/health` - MCP-specific health

2. **Endpoint Tests**:
   - `https://mcp.chitty.cc` - MCP Server
   - `https://ai.chitty.cc` - AI Gateway
   - `https://router.chitty.cc` - Router Service

---

## 📊 **GitHub Environments**

The repository uses GitHub Environments for deployment protection:

### **Staging Environment**
- **Name**: `staging`
- **URL**: `https://staging.router.chitty.cc`
- **Protection**: None (auto-deploy on main push)

### **Production Environment**
- **Name**: `production`
- **URL**: `https://mcp.chitty.cc`
- **Protection**: Can add manual approval requirement

To add protection rules:
1. Go to Settings → Environments
2. Click on "production"
3. Add protection rules:
   - Required reviewers
   - Deployment branches (only `production`)
   - Environment secrets

---

## 🛠️ **Local Testing**

Before pushing to trigger CI/CD:

```bash
# Run CI checks locally
npm run lint
npm test
npm run build

# Test MCP integration
node -e "console.log('MCP routes configured')"
```

---

## 📈 **Monitoring Deployments**

### **GitHub Actions Dashboard**
- View running workflows: `Actions` tab
- Check deployment history: `Deployments` section
- Review logs: Click on any workflow run

### **Cloudflare Dashboard**
- Workers & Pages → chittyrouter-ai
- View metrics, logs, and settings

---

## 🔄 **Rollback Process**

If production deployment fails:
1. **Automatic Rollback**: Pipeline automatically rolls back on failure
2. **Manual Rollback**:
   ```bash
   git checkout production
   git reset --hard HEAD~1
   git push --force origin production
   ```

---

## 📝 **Branch Strategy**

```
main          → Staging deployment (automatic)
production    → Production deployment (automatic)
feature/*     → Feature branches (CI only, no deployment)
```

---

## ✅ **Setup Checklist**

- [ ] Configure `CLOUDFLARE_API_TOKEN` secret
- [ ] Configure `CLOUDFLARE_ACCOUNT_ID` secret
- [ ] Create `production` branch if not exists
- [ ] Set up GitHub Environments (optional)
- [ ] Test CI pipeline with a push
- [ ] Verify staging deployment
- [ ] Test production deployment

---

## 🚨 **Important Notes**

1. **Account ID**: The ChittyCorp account ID is hardcoded: `0bc21e3a5a9de1a4cc843be9c3e98121`
2. **Routes**: Configured for `mcp.chitty.cc`, `ai.chitty.cc`, `router.chitty.cc`
3. **Worker Name**: `chittyrouter-ai`
4. **Environments**: Staging and Production
5. **Auto-release**: Creates GitHub release on production deployment

---

## 📞 **Support**

For CI/CD issues:
1. Check Actions tab for workflow logs
2. Verify secrets are correctly set
3. Ensure Cloudflare API token has correct permissions
4. Check branch protection rules

---

**Last Updated**: 2025-09-28
**Version**: CI/CD v1.0.0
**Account**: ChittyCorp LLC