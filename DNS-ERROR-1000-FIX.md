# DNS Error 1000 Manual Fix Guide

## Issue Description

Two ChittyOS services are experiencing DNS Error 1000 (Invalid DNS configuration):
- **gateway.chitty.cc** - HTTP 403 Forbidden (DNS Error 1000)
- **register.chitty.cc** - HTTP 403 Forbidden (DNS Error 1000)

This error occurs when Workers Custom Domains conflict with existing A/AAAA DNS records.

## Root Cause

The Cloudflare API cannot automatically fix DNS Error 1000 because:
1. Existing A/AAAA DNS records conflict with Workers Custom Domain requirements
2. DNS records must be manually deleted through Cloudflare Dashboard
3. Workers Custom Domains require CNAME flattening, incompatible with A/AAAA records

## Manual Fix Steps

### Step 1: Access Cloudflare Dashboard DNS Settings

Visit the Cloudflare Dashboard DNS management page for chitty.cc:
```
https://dash.cloudflare.com/0bc21e3a5a9de1a4cc843be9c3e98121/chitty.cc/dns/records
```

**Account**: ChittyCorp LLC
**Account ID**: 0bc21e3a5a9de1a4cc843be9c3e98121
**Zone**: chitty.cc

### Step 2: Delete Conflicting DNS Records for gateway.chitty.cc

1. Navigate to DNS Records list
2. Search for "gateway.chitty.cc"
3. Identify and delete the following record types:
   - **Type A** (IPv4 address)
   - **Type AAAA** (IPv6 address)
4. Click the trash icon next to each record
5. Confirm deletion

**Note**: Do NOT delete CNAME records - those are correct for Workers Custom Domains

### Step 3: Delete Conflicting DNS Records for register.chitty.cc

1. Search for "register.chitty.cc"
2. Identify and delete the following record types:
   - **Type A** (IPv4 address)
   - **Type AAAA** (IPv6 address)
3. Click the trash icon next to each record
4. Confirm deletion

### Step 4: Verify Workers Custom Domain Configuration

After deleting conflicting records, verify Workers Custom Domains are correctly configured:

#### Gateway Worker
- **Worker Name**: chittyos-platform-prod
- **Custom Domain**: gateway.chitty.cc
- **Expected DNS**: CNAME record pointing to Workers infrastructure

#### Register Worker
- **Worker Name**: chittyregister (or equivalent)
- **Custom Domain**: register.chitty.cc
- **Expected DNS**: CNAME record pointing to Workers infrastructure

### Step 5: Verification Commands

After making DNS changes, wait 5 minutes for propagation, then verify:

```bash
# Test gateway.chitty.cc
curl -I https://gateway.chitty.cc/health

# Test register.chitty.cc
curl -I https://register.chitty.cc/health

# Check DNS resolution
dig gateway.chitty.cc
dig register.chitty.cc
```

**Expected Result**:
- HTTP 200 OK (instead of 403 Forbidden)
- DNS resolves to Cloudflare Workers infrastructure
- No Error 1000 messages

## Understanding DNS Error 1000

**What is DNS Error 1000?**
- Error indicating invalid DNS configuration preventing Worker access
- Commonly caused by A/AAAA records conflicting with Workers Custom Domains
- Requires manual intervention - API cannot auto-fix

**Why Can't Wrangler Fix It?**
- Cloudflare API intentionally blocks automatic DNS record deletion
- Prevents accidental removal of production DNS records
- Requires human verification through Dashboard

**Correct DNS Configuration for Workers Custom Domains**:
```
Type: CNAME
Name: gateway (or register)
Target: chittyos-platform-prod.chittycorp-llc.workers.dev (proxied)
TTL: Auto
Proxy: Yes (orange cloud)
```

## Alternative Solution: Use Different Subdomains

If the above manual steps cannot be completed, consider alternative subdomains:
- Instead of `gateway.chitty.cc` → Use `gw.chitty.cc`
- Instead of `register.chitty.cc` → Use `reg.chitty.cc`

Configure new custom domains via Wrangler:
```bash
npx wrangler deployments domains add gw.chitty.cc --worker chittyos-platform-prod
npx wrangler deployments domains add reg.chitty.cc --worker chittyregister
```

## Post-Fix Verification

After completing manual DNS fixes:

1. **Run ChittyCheck**:
   ```bash
   /Users/nb/.claude/projects/-/chittychat/chittycheck-enhanced.sh
   ```

2. **Verify Service Health**:
   ```bash
   curl https://gateway.chitty.cc/health
   curl https://register.chitty.cc/health
   ```

3. **Check Service Registry**:
   ```bash
   curl https://registry.chitty.cc/services | jq '.services[] | select(.domain | contains("gateway") or contains("register"))'
   ```

## Timeline

**Estimated Time to Fix**: 15-20 minutes
- Dashboard access: 2 minutes
- Delete DNS records: 5 minutes
- DNS propagation: 5 minutes
- Verification: 5 minutes

## Troubleshooting

**Issue**: Still getting Error 1000 after deleting records
**Solution**:
1. Clear DNS cache: `sudo dscacheutil -flushcache`
2. Wait up to 10 minutes for global DNS propagation
3. Verify no A/AAAA records remain: `dig gateway.chitty.cc +short`

**Issue**: Worker not accessible after DNS fix
**Solution**:
1. Check Worker deployment: `npx wrangler deployments list`
2. Verify Custom Domain binding: `npx wrangler deployments domains list`
3. Re-deploy if needed: `npm run deploy:production`

**Issue**: Cannot access Cloudflare Dashboard
**Solution**:
- Verify account access with: `npx wrangler whoami`
- Ensure logged in as: nick@chittycorp.com
- Account should show: ChittyCorp LLC (0bc21e3a5a9de1a4cc843be9c3e98121)

## Contact

If issues persist after following this guide:
- ChittyOS Framework Repository: `/Users/nb/.claude/projects/-/CHITTYOS`
- Cloudflare Support: https://dash.cloudflare.com/support
- ChittyCheck Validation: Run `/chittycheck` to re-verify

---

**Document Version**: 1.0
**Created**: 2025-10-06
**ChittyOS Framework**: v1.0.1
**Last Updated**: 2025-10-06 (Post-Recovery)
