# Configure GitHub Secrets for Deployment

## 🔑 **Setup GitHub Repository Secrets**

### **Required Secrets:**

1. **CLOUDFLARE_API_TOKEN**
   - Source: `op://Private/gxyne23yqngvk2nzjwl62uakx4/ChittyCorp LLC/global_api_key`
   - Description: ChittyCorp global API key for Cloudflare Workers deployment

2. **CLOUDFLARE_ACCOUNT_ID**
   - Value: `0bc21e3a5a9de1a4cc843be9c3e98121`
   - Description: ChittyCorp account ID

---

## 📋 **Step-by-Step Configuration**

### **Step 1: Get the API Token**
```bash
# Using 1Password CLI
op item get "gxyne23yqngvk2nzjwl62uakx4" --vault "Private" --fields "global_api_key" --reveal
```

### **Step 2: Configure GitHub Secrets**

1. **Go to Repository Settings**:
   ```
   https://github.com/chittyos/chittyrouter/settings/secrets/actions
   ```

2. **Add New Repository Secret**:
   - Click "New repository secret"
   - Name: `CLOUDFLARE_API_TOKEN`
   - Value: [Paste the token from 1Password]
   - Click "Add secret"

3. **Add Account ID Secret**:
   - Click "New repository secret"
   - Name: `CLOUDFLARE_ACCOUNT_ID`
   - Value: `0bc21e3a5a9de1a4cc843be9c3e98121`
   - Click "Add secret"

---

## 🚀 **Test Deployment**

Once secrets are configured:

### **Option 1: Re-run Failed Workflow**
1. Go to Actions tab
2. Click on the failed "Deploy ChittyRouter to Cloudflare" workflow
3. Click "Re-run all jobs"

### **Option 2: Trigger New Deployment**
```bash
# Force trigger deployment
git commit --allow-empty -m "Trigger deployment with secrets"
git push origin production
```

---

## ✅ **Expected Result**

After configuring secrets, deployment should succeed and be available at:

- **MCP Server**: `https://mcp.chitty.cc`
- **AI Gateway**: `https://ai.chitty.cc`
- **Router**: `https://router.chitty.cc`

### **Verification Commands**:
```bash
curl https://mcp.chitty.cc/info
curl https://mcp.chitty.cc/health
curl https://mcp.chitty.cc/tools
```

---

## 🔍 **Troubleshooting**

### **If Deployment Still Fails:**

1. **Check API Token Permissions**:
   - Must have Workers deployment permissions
   - Must be for ChittyCorp account

2. **Verify Account ID**:
   - Should be: `0bc21e3a5a9de1a4cc843be9c3e98121`

3. **Check Workflow Logs**:
   - Go to Actions → Failed workflow → View logs

### **Common Issues:**
- Token expired or invalid
- Insufficient permissions
- Wrong account ID
- Zone/domain not configured in Cloudflare

---

## 📞 **Quick Setup Commands**

```bash
# 1. Get token (when 1Password is accessible)
TOKEN=$(op item get "gxyne23yqngvk2nzjwl62uakx4" --vault "Private" --fields "global_api_key" --reveal)

# 2. Set GitHub secrets (requires gh CLI with admin access)
gh secret set CLOUDFLARE_API_TOKEN --body="$TOKEN"
gh secret set CLOUDFLARE_ACCOUNT_ID --body="0bc21e3a5a9de1a4cc843be9c3e98121"

# 3. Trigger deployment
git push origin production
```

---

**Ready for deployment once secrets are configured!** 🚀