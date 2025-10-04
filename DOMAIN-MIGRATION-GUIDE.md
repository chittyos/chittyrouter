# Domain Migration Guide: chitty.cc → ChittyCorp LLC Account

## 🎯 Goal
Migrate `chitty.cc` from current Cloudflare account to **ChittyCorp LLC** account (ID: `0bc21e3a5a9de1a4cc843be9c3e98121`)

---

## 📋 Pre-Migration Checklist

### 1. Identify Current Account
**Check which account chitty.cc is currently in:**

```bash
# Login to current account if needed
wrangler login

# List zones to find chitty.cc
wrangler whoami
```

Or visit: https://dash.cloudflare.com/

### 2. Document Current Settings (IMPORTANT!)

Before migrating, save these settings from the **current account**:

**DNS Records:**
- Go to: DNS tab
- Export DNS records (Download CSV or screenshot)
- Note: A, AAAA, CNAME, MX, TXT, etc.

**Workers Routes:**
- Go to: Workers & Pages → Workers
- Screenshot all routes assigned to chitty.cc

**Email Routing:**
- Go to: Email → Routing
- Note: Current forwarding rules, verified addresses

**SSL/TLS Settings:**
- Go to: SSL/TLS
- Note: Encryption mode, certificates

**Page Rules:**
- Go to: Rules → Page Rules
- Screenshot any custom rules

**Firewall Rules:**
- Go to: Security → WAF
- Note any custom rules

---

## 🔄 Migration Methods

### Method 1: Add Domain to New Account (Recommended)

This keeps the domain registered where it is, but moves Cloudflare management to new account.

**Steps:**

1. **In Target Account (ChittyCorp LLC)**
   - Login: https://dash.cloudflare.com/
   - Switch to: ChittyCorp LLC account
   - Click "Add a Site"
   - Enter: `chitty.cc`
   - Select plan (Free or paid)
   - Click "Add Site"

2. **Update Nameservers at Domain Registrar**
   - Cloudflare will show you new nameservers:
     ```
     ns1.chitty.cc.cdn.cloudflare.net
     ns2.chitty.cc.cdn.cloudflare.net
     ```
   - Go to your domain registrar (GoDaddy, Namecheap, etc.)
   - Update nameservers to the ones shown
   - Save changes

3. **Wait for DNS Propagation**
   - Usually takes 2-24 hours
   - Check status: `dig NS chitty.cc`

4. **Remove from Old Account**
   - Once migration complete, remove domain from old account
   - This prevents conflicts

### Method 2: Domain Transfer Between Accounts

If both accounts belong to you:

1. **In Old Account:**
   - Go to domain overview → Advanced Actions
   - Look for "Transfer Domain" option
   - Initiate transfer to ChittyCorp LLC account email

2. **In New Account (ChittyCorp LLC):**
   - Check email for transfer request
   - Accept transfer
   - Domain moves automatically with all settings

**Note:** This option may not be available in all plans.

---

## 🚀 Quick Migration (Minimal Downtime)

### Before Migration

1. **Lower DNS TTL** (24 hours before)
   - In current account, set all DNS record TTLs to 300 (5 min)
   - This speeds up propagation

2. **Export All Settings**
   ```bash
   # DNS records
   wrangler zones list
   # Screenshot all configs
   ```

### During Migration

1. **Add Domain to ChittyCorp Account**
2. **Recreate Critical DNS Records First:**
   - A records (website)
   - MX records (email) ← CRITICAL
   - TXT records (verification)
3. **Update Nameservers**
4. **Monitor:**
   ```bash
   # Check nameservers
   dig NS chitty.cc

   # Check DNS resolution
   dig A chitty.cc
   dig MX chitty.cc
   ```

### After Migration

1. **Setup Email Routing**
   - Enable Email Routing in new account
   - Add MX records (automatic)
   - Verify destination: no-reply@itcan.llc
   - Create worker route

2. **Redeploy Worker if Needed**
   - Worker already deployed to ChittyCorp account ✅
   - Just need to link domain

3. **Restore Settings**
   - Workers routes
   - SSL settings
   - Firewall rules
   - Page rules

---

## 📧 Email Routing Specific Steps

Once domain is in ChittyCorp LLC account:

### 1. Enable Email Routing
```
Dashboard → chitty.cc → Email → Enable Email Routing
```

### 2. DNS Records (Automatic)
Cloudflare adds these automatically:
```
MX  chitty.cc  →  isaac.mx.cloudflare.net  (priority 29)
MX  chitty.cc  →  linda.mx.cloudflare.net  (priority 40)
MX  chitty.cc  →  amir.mx.cloudflare.net   (priority 6)
TXT chitty.cc  →  v=spf1 include:_spf.mx.cloudflare.net ~all
```

### 3. Add Destination Address
```
Email → Destination addresses → Add
Enter: no-reply@itcan.llc
Verify: Check email and click link
```

### 4. Create Email Worker Route
```
Email → Email Workers → Create Route
Matcher: *@chitty.cc
Worker: chittyos-email-worker
Enabled: ✓
Save
```

### 5. Test
```bash
echo "Test migration" | mail -s "Migration Test" test@chitty.cc
wrangler tail chittyos-email-worker --format pretty
```

---

## 🔍 Verify Migration Complete

### DNS Propagation Check
```bash
# Should show Cloudflare nameservers for ChittyCorp account
dig NS chitty.cc

# Should resolve to your IP
dig A chitty.cc

# Should show Cloudflare MX records
dig MX chitty.cc
```

### Email Routing Check
```bash
# Send test email
echo "Test" | mail -s "Test" test@chitty.cc

# Check it arrives at no-reply@itcan.llc
# Check logs show processing
wrangler tail chittyos-email-worker
```

### Worker Check
```bash
# List workers in account
wrangler deployments list --name chittyos-email-worker

# Should show: ChittyCorp LLC account
```

---

## 🚨 Troubleshooting Migration Issues

### Issue: Domain not showing in new account

**Solution:**
1. Verify nameservers updated at registrar
2. Wait 24 hours for propagation
3. Check: `dig NS chitty.cc`

### Issue: Email not routing

**Solution:**
1. Verify MX records exist:
   ```bash
   dig MX chitty.cc
   ```
2. Check Email Routing is enabled in dashboard
3. Verify destination address is verified
4. Check worker route exists and is enabled

### Issue: Worker not accessible

**Solution:**
1. Worker is already in correct account ✅
2. Just need to create email worker route after domain migration
3. No redeployment needed

### Issue: DNS records missing after migration

**Solution:**
1. Manually recreate DNS records from backup/export
2. Check DNS tab in new account
3. Verify A, AAAA, CNAME records restored

---

## 📱 Quick Commands Reference

```bash
# Check current nameservers
dig NS chitty.cc

# Check MX records
dig MX chitty.cc

# Check A record
dig A chitty.cc

# Test email routing
echo "Test" | mail -s "Test" test@chitty.cc

# Monitor worker
wrangler tail chittyos-email-worker --format pretty

# Check which account you're on
wrangler whoami

# List all zones in account
wrangler zones list
```

---

## 🎯 Migration Checklist

**Pre-Migration:**
- [ ] Identify current account with chitty.cc
- [ ] Export DNS records (CSV/screenshot)
- [ ] Document all current settings
- [ ] Lower DNS TTL to 300 seconds
- [ ] Note all worker routes
- [ ] Backup email routing configuration

**Migration:**
- [ ] Add chitty.cc to ChittyCorp LLC account
- [ ] Copy nameservers shown
- [ ] Update nameservers at domain registrar
- [ ] Wait for DNS propagation (check with `dig NS chitty.cc`)
- [ ] Recreate critical DNS records
- [ ] Verify DNS resolution working

**Post-Migration:**
- [ ] Enable Email Routing in new account
- [ ] Verify MX records added automatically
- [ ] Add destination: no-reply@itcan.llc
- [ ] Verify destination email address
- [ ] Create email worker route (*@chitty.cc → chittyos-email-worker)
- [ ] Test email routing (send to test@chitty.cc)
- [ ] Verify email arrives at no-reply@itcan.llc
- [ ] Check worker logs show processing
- [ ] Remove domain from old account
- [ ] Restore SSL/TLS settings
- [ ] Restore firewall rules
- [ ] Restore page rules
- [ ] Restore worker routes (non-email)

---

## 📞 Quick Links

**ChittyCorp LLC Dashboard:**
https://dash.cloudflare.com/0bc21e3a5a9de1a4cc843be9c3e98121

**Add Domain:**
https://dash.cloudflare.com/0bc21e3a5a9de1a4cc843be9c3e98121/add-site

**Email Routing (after migration):**
https://dash.cloudflare.com/0bc21e3a5a9de1a4cc843be9c3e98121/chitty.cc/email/routing/overview

**Current Email Worker:**
- Name: chittyos-email-worker
- Status: Deployed in ChittyCorp LLC account ✅
- Ready to use once domain migrated

---

## ⏱️ Timeline

**Total Time:** 2-24 hours (mostly waiting for DNS propagation)

**Active Work:** ~30 minutes
- Add domain: 5 min
- Update nameservers: 5 min
- Recreate DNS records: 10 min
- Enable email routing: 5 min
- Test: 5 min

**Waiting Time:** 2-24 hours for DNS propagation

---

## ✅ Success Criteria

Migration is complete when:

1. ✅ `dig NS chitty.cc` shows Cloudflare nameservers
2. ✅ `dig MX chitty.cc` shows Cloudflare MX records
3. ✅ Dashboard shows chitty.cc in ChittyCorp LLC account
4. ✅ Email Routing is enabled
5. ✅ Email worker route is created
6. ✅ Test email to test@chitty.cc arrives at no-reply@itcan.llc
7. ✅ Worker logs show email processing

---

**Ready to start migration? First step: Add chitty.cc to ChittyCorp LLC account**

https://dash.cloudflare.com/0bc21e3a5a9de1a4cc843be9c3e98121/add-site
