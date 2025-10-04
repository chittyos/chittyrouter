# Migrate itcan.llc Domain to ChittyCorp LLC Account

## 🎯 Goal
Move `itcan.llc` to ChittyCorp LLC account so `no-reply@itcan.llc` can receive forwarded emails

---

## 🚀 Quick Migration Steps

### 1. Add Domain to ChittyCorp Account (5 min)
**URL**: https://dash.cloudflare.com/0bc21e3a5a9de1a4cc843be9c3e98121/add-site

1. Click "Add a Site"
2. Enter: `itcan.llc`
3. Select plan (Free is fine)
4. Click "Add Site"
5. Note the nameservers shown

### 2. Update Nameservers at Registrar (2 min)
1. Go to your domain registrar (where you bought itcan.llc)
2. Find DNS/Nameserver settings
3. Update to Cloudflare nameservers (shown in step 1)
4. Save changes

### 3. Wait for Propagation (2-24 hours)
```bash
# Check if migration complete
dig NS itcan.llc
# Should show: cloudflare.net nameservers
```

### 4. Enable Email Routing (5 min)
Once propagated:

1. Go to: https://dash.cloudflare.com/0bc21e3a5a9de1a4cc843be9c3e98121/itcan.llc/email
2. Click "Enable Email Routing"
3. MX records added automatically
4. Add destination address: `no-reply@itcan.llc`
5. Verify the address (check email)

---

## ✅ Quick Checklist

- [ ] Add itcan.llc to ChittyCorp account
- [ ] Update nameservers at registrar
- [ ] Wait for DNS propagation
- [ ] Enable Email Routing on itcan.llc
- [ ] Verify no-reply@itcan.llc as destination
- [ ] Test: Send email to test@chitty.cc
- [ ] Verify: Arrives at no-reply@itcan.llc

---

## 🧪 Test After Migration

```bash
# Send test email
echo "Testing itcan.llc migration" | mail -s "Test" test@chitty.cc

# Monitor worker processing
wrangler tail chittyos-email-worker --format pretty

# Check destination inbox
# Should arrive at: no-reply@itcan.llc
```

---

## 📊 Current Setup

**Email Flow:**
```
Email arrives → test@chitty.cc (already in ChittyCorp account ✅)
      ↓
Worker processes → chittyos-email-worker (deployed ✅)
      ↓
Forwards to → no-reply@itcan.llc (needs itcan.llc in ChittyCorp ⏳)
```

**Why migration needed:**
- Destination address must be verified in same account as email routing
- itcan.llc needs to be in ChittyCorp LLC account
- Then no-reply@itcan.llc can be verified as destination

---

## 🔗 Quick Links

**Add itcan.llc:**
https://dash.cloudflare.com/0bc21e3a5a9de1a4cc843be9c3e98121/add-site

**Check propagation:**
```bash
dig NS itcan.llc
```

**Enable Email Routing (after migration):**
https://dash.cloudflare.com/0bc21e3a5a9de1a4cc843be9c3e98121/itcan.llc/email

---

**Start here:** Add itcan.llc to ChittyCorp account
https://dash.cloudflare.com/0bc21e3a5a9de1a4cc843be9c3e98121/add-site
