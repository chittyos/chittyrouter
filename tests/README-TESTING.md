# Email Worker Testing Guide

Comprehensive testing framework for the **chittyos-email-worker** AI-powered email routing system.

## Quick Start

```bash
# Run the test suite
cd ~/.claude/projects/-/CHITTYOS/chittyos-services/chittyrouter
./tests/email-worker-suite.sh

# Monitor live logs
CLOUDFLARE_ACCOUNT_ID=0bc21e3a5a9de1a4cc843be9c3e98121 wrangler tail chittyos-email-worker --format pretty
```

## Test Scenarios

### 1. Litigation Classification
Tests urgent legal matter detection and priority routing.

**Send Email:**
- **To:** test@chitty.cc
- **Subject:** Urgent: Court Filing Deadline
- **Body:** Need to file motion by 5pm tomorrow. Case: Arias v Bianchi.

**Expected Results:**
```json
{
  "classification": "litigation",
  "sentiment": "urgent",
  "urgency": "critical",
  "priority": true
}
```

**Routing:** → `legal@aribia.llc` (High Priority)

---

### 2. Contract Review
Tests contract-related email classification.

**Send Email:**
- **To:** test@chitty.cc
- **Subject:** Operating Agreement Review Needed
- **Body:** Please review the attached LLC operating agreement for ARIBIA LLC.

**Expected Results:**
```json
{
  "classification": "legal",
  "subtype": "contract",
  "urgency": "standard",
  "priority": false
}
```

**Routing:** → `mgmt@aribia.llc`

---

### 3. General Correspondence
Tests routine business email handling.

**Send Email:**
- **To:** test@chitty.cc
- **Subject:** Weekly Team Meeting
- **Body:** Let's meet at 3pm on Friday to discuss project updates.

**Expected Results:**
```json
{
  "classification": "general",
  "urgency": "routine",
  "priority": false
}
```

**Routing:** → `mgmt@aribia.llc`

---

### 4. High-Priority Emergency
Tests emergency detection and expedited routing.

**Send Email:**
- **To:** test@chitty.cc
- **Subject:** URGENT: Emergency Hearing Tomorrow
- **Body:** Emergency hearing scheduled for 9am tomorrow. Immediate response required for Arias v Bianchi case.

**Expected Results:**
```json
{
  "classification": "litigation",
  "sentiment": "urgent",
  "urgency": "critical",
  "priority": true,
  "headers": {
    "X-Priority": "High",
    "Importance": "high"
  }
}
```

**Routing:** → `legal@aribia.llc` (High Priority)

---

### 5. Entity Extraction
Tests AI's ability to extract case information and entities.

**Send Email:**
- **To:** test@chitty.cc
- **Subject:** Case 2024D007847 Update
- **Body:** Regarding Arias v Bianchi case 2024D007847. ARIBIA LLC as defendant. Luisa Arias is the plaintiff.

**Expected Results:**
```json
{
  "classification": "legal",
  "urgency": "standard",
  "entityCount": 3,
  "entities": [
    "Arias v Bianchi",
    "2024D007847",
    "ARIBIA LLC",
    "Luisa Arias"
  ]
}
```

**Routing:** → `legal@aribia.llc`

---

## Monitoring & Verification

### Live Log Monitoring

```bash
# Monitor all worker activity
wrangler tail chittyos-email-worker --format pretty

# Filter for specific transaction
wrangler tail chittyos-email-worker | grep "EMAIL-"
```

### Key Log Indicators

Look for these in the logs:

```javascript
// Email received
[EMAIL-123456789-abc] Email received: {
  from: 'sender@example.com',
  to: 'test@chitty.cc',
  domain: 'chitty.cc'
}

// AI analysis results
[EMAIL-123456789-abc] AI Analysis: {
  classification: 'legal',
  sentiment: 'neutral',
  urgency: 'critical',
  entityCount: 2
}

// Routing decision
[EMAIL-123456789-abc] AI routing: legal/litigation -> legal

// Processing complete
[EMAIL-123456789-abc] Email processed successfully
[EMAIL-123456789-abc] Would forward to: legal@aribia.llc (priority: true)
```

### Performance Metrics

Monitor these headers in logs:

- `X-Processing-Time`: Should be <2000ms
- `X-AI-Classification`: AI-determined category
- `X-AI-Urgency`: Urgency level (routine/standard/urgent/critical)
- `X-Priority`: Email priority header (if high-priority)

---

## Test Results Location

Results are saved to:
```
~/.claude/projects/-/CHITTYOS/chittyos-services/chittyrouter/test-results/
```

Files:
- `test-log.csv` - All test results with timestamps
- Individual test artifacts (if created)

---

## Continuous Testing Workflow

### Daily Smoke Test
```bash
# Send one test email per classification type
# Monitor logs for 5 minutes
# Verify all classifications are correct
```

### Weekly Comprehensive Test
```bash
# Run full test suite
./tests/email-worker-suite.sh

# Review results
cat test-results/test-log.csv | tail -20
```

### Before Deployment
```bash
# 1. Run full test suite
./tests/email-worker-suite.sh

# 2. Send 5-10 varied test emails
# 3. Monitor logs for errors
# 4. Verify routing accuracy

# 5. Deploy if all tests pass
wrangler deploy
```

---

## Troubleshooting

### Issue: AI classification is incorrect

**Check:**
1. Email content has clear indicators (e.g., "urgent", "deadline", "case number")
2. Processing time is reasonable (<2000ms)
3. AI model is responding (check logs for AI errors)

**Fix:**
- Update AI prompt in `src/workers/email-worker.js`
- Adjust classification thresholds
- Add more training examples

### Issue: Emails not being received

**Check:**
1. Email routing configured: `check_email_routing.sh`
2. Destination email verified in Cloudflare
3. Worker deployed successfully

**Fix:**
```bash
# Re-run email routing setup
./setup-routing.sh

# Redeploy worker
wrangler deploy
```

### Issue: High processing times (>2000ms)

**Check:**
1. AI model response time
2. Network latency
3. Worker resource usage

**Fix:**
- Optimize AI prompt (reduce tokens)
- Add caching for common patterns
- Consider upgrading worker plan

---

## Advanced Testing

### Load Testing
```bash
# Send 100 emails in 1 minute
# Monitor worker performance
# Check for rate limiting or errors
```

### Stress Testing
```bash
# Send emails with large attachments
# Send emails with complex formatting
# Send emails with many recipients
```

### Integration Testing
```bash
# Test with real case emails
# Verify integration with ChittyID
# Verify evidence collection workflow
```

---

## Future Enhancements

- [ ] Automated email sending for tests
- [ ] AI classification accuracy metrics
- [ ] Performance benchmarking dashboard
- [ ] Integration with case management system
- [ ] Automated regression testing

---

**Last Updated:** October 5, 2025
**Version:** 1.0.0
**Maintainer:** ChittyOS Platform Team
