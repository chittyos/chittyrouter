# ChittyRouter PR Merge Visualization

## Current State (Main Branch)

```
main branch (3d325b0)
├── package.json
│   ├── @neondatabase/serverless: ^1.0.1
│   ├── mimetext: ^3.0.27
│   ├── esbuild: ^0.19.0
│   ├── eslint: ^8.0.0
│   └── wrangler: ^4.37.1
├── .github/workflows/
│   ├── ci.yml (uses checkout@v4, setup-node@v4)
│   ├── deploy.yml (uses checkout@v4, setup-node@v4, gh-release@v1)
│   ├── deploy-direct.yml (uses checkout@v4, setup-node@v4)
│   └── chittyconnect-sync.yml (uses checkout@v4)
├── deploy.sh ❌ DOES NOT EXIST
└── docs/ (no architecture docs yet)
```

---

## PR Dependency Graph

```
┌─────────────────────────────────────────────────────────────────┐
│                     PHASE 1: Housekeeping                       │
└─────────────────────────────────────────────────────────────────┘

PR #15 [CLOSE - DUPLICATE OF #14]
  └─ Already merged as PR #14


┌─────────────────────────────────────────────────────────────────┐
│              PHASE 2: Low-Risk Dependencies                     │
└─────────────────────────────────────────────────────────────────┘

PR #11 (mimetext)          PR #10 (@neondatabase/serverless)
    ↓                            ↓
package.json               package.json
package-lock.json          package-lock.json

[Independent - no conflicts]


┌─────────────────────────────────────────────────────────────────┐
│                  PHASE 3: GitHub Actions                        │
└─────────────────────────────────────────────────────────────────┘

PR #6 (checkout v4→v6)  ←─ MERGE FIRST (touches most files)
    ↓
    ├── ci.yml (5 instances)
    ├── deploy.yml (5 instances)
    ├── deploy-direct.yml (1 instance)
    └── chittyconnect-sync.yml (1 instance)
    
PR #5 (setup-node v4→v6)  ←─ MERGE AFTER #6
    ↓
    ├── ci.yml (5 instances)
    ├── deploy.yml (1 instance)
    └── deploy-direct.yml (1 instance)
    
PR #4 (gh-release v1→v2)  ←─ MERGE AFTER #5
    ↓
    └── deploy.yml (1 instance)

[Overlapping files but different lines - auto-resolves]


┌─────────────────────────────────────────────────────────────────┐
│              PHASE 4: Documentation & Scripts                   │
└─────────────────────────────────────────────────────────────────┘

PR #2 (docs)               PR #12 (deploy.sh)
    ↓                           ↓
docs/FOUR-PILLARS.md       deploy.sh (NEW FILE)
docs/CHITTYPROOF.md
docs/CHITTYDLVR.md

[Independent - all new files]


┌─────────────────────────────────────────────────────────────────┐
│           PHASE 5: Medium-Risk Dependencies (TEST!)             │
└─────────────────────────────────────────────────────────────────┘

PR #9 (esbuild 0.19→0.27)  ⚠️  TEST BUILD FIRST
    ↓
    ├── package.json
    └── package-lock.json (294 lines changed)
    
    Test: npm run build && wrangler deploy --dry-run
    Risk: Node engine >=12 → >=18 (we already require 18, OK)
          New platform binaries, may affect bundle
          
─────────────────────────────────────────────────────────────────

PR #8 (wrangler 4.37→4.63)  ⚠️  TEST DEPLOY FIRST
    ↓
    ├── package.json
    └── package-lock.json (852 lines changed)
    
    Test: wrangler dev && wrangler deploy --dry-run
    Risk: 26 versions jump, potential CLI behavior changes


┌─────────────────────────────────────────────────────────────────┐
│          PHASE 6: High-Risk Dependency (REVIEW!)                │
└─────────────────────────────────────────────────────────────────┘

PR #7 (eslint 8→10)  🔴  MAJOR VERSION - BREAKING CHANGES
    ↓
    ├── package.json
    └── package-lock.json (785 lines changed)
    
    Actions Required:
    1. Check ESLint 9→10 migration guide
    2. May need to migrate to flat config (eslint.config.js)
    3. Test: npm run lint
    4. Fix any config issues before merge


┌─────────────────────────────────────────────────────────────────┐
│                    PHASE 7: Draft PRs                           │
└─────────────────────────────────────────────────────────────────┘

PR #3 (E2E test harness) [DRAFT]
    ↓
    src/storage/email-storage-sinks.js (NEW FILE)
    
    Status: Wait for author to mark ready for review
```

---

## File Conflict Matrix

| PR | package.json | package-lock.json | .github/workflows | docs/ | scripts |
|----|--------------|-------------------|-------------------|-------|---------|
| #2 | - | - | - | ✅ NEW | - |
| #3 | - | - | - | - | ✅ NEW |
| #4 | - | - | ⚠️ deploy.yml | - | - |
| #5 | - | - | ⚠️ ci.yml, deploy*.yml | - | - |
| #6 | - | - | ⚠️ ALL workflows | - | - |
| #7 | ⚠️ Line 44 | ✅ | - | - | - |
| #8 | ⚠️ Line 47 | ✅ | - | - | - |
| #9 | ⚠️ Line 43 | ✅ | - | - | - |
| #10 | ⚠️ Line 36 | ✅ | - | - | - |
| #11 | ⚠️ Line 39 | ✅ | - | - | - |
| #12 | - | - | - | - | ✅ NEW |
| #15 | - | - | - | - | 🚫 CLOSE |

Legend:
- ✅ = No conflict (new file or different section)
- ⚠️ = Overlapping file (auto-resolves if merged sequentially)
- 🚫 = Action required

---

## Sequential Merge Impact

### After Phase 2 (Low-Risk Deps)
```diff
package.json:
- "@neondatabase/serverless": "^1.0.1"
+ "@neondatabase/serverless": "^1.0.2"  ← PR #10
- "mimetext": "^3.0.27"
+ "mimetext": "^3.0.28"                  ← PR #11
```

### After Phase 3 (GitHub Actions)
```diff
.github/workflows/*:
- uses: actions/checkout@v4
+ uses: actions/checkout@v6              ← PR #6
- uses: actions/setup-node@v4
+ uses: actions/setup-node@v6            ← PR #5
- uses: softprops/action-gh-release@v1
+ uses: softprops/action-gh-release@v2   ← PR #4
```

### After Phase 4 (Docs & Scripts)
```diff
+ docs/FOUR-PILLARS.md                   ← PR #2
+ docs/CHITTYPROOF.md                    ← PR #2
+ docs/CHITTYDLVR.md                     ← PR #2
+ deploy.sh                              ← PR #12
```

### After Phase 5 (Medium-Risk Deps)
```diff
package.json:
- "esbuild": "^0.19.0"
+ "esbuild": "^0.27.3"                   ← PR #9
- "wrangler": "^4.37.1"
+ "wrangler": "^4.63.0"                  ← PR #8
```

### After Phase 6 (High-Risk Dep)
```diff
package.json:
- "eslint": "^8.0.0"
+ "eslint": "^10.0.1"                    ← PR #7

May also require:
+ eslint.config.js (new flat config)
- .eslintrc.* (old config - if flat config adopted)
```

---

## Merge Command Sequence

```bash
# Phase 1: Housekeeping
gh pr close 15 --comment "Duplicate of #14 which was already merged"

# Phase 2: Low-Risk Dependencies
gh pr merge 11 --squash --delete-branch
gh pr merge 10 --squash --delete-branch

# Phase 3: GitHub Actions
gh pr merge 6 --squash --delete-branch
gh pr merge 5 --squash --delete-branch
gh pr merge 4 --squash --delete-branch

# Phase 4: Documentation & Scripts
gh pr merge 2 --squash --delete-branch
gh pr merge 12 --squash --delete-branch

# Phase 5: Medium-Risk (with testing)
gh pr checkout 9
npm ci && npm run build && npm run build:enhanced && wrangler deploy --dry-run
# If tests pass:
gh pr merge 9 --squash --delete-branch

gh pr checkout 8
npm ci && wrangler dev  # Test locally, then Ctrl+C
wrangler deploy --dry-run
# If tests pass:
gh pr merge 8 --squash --delete-branch

# Phase 6: High-Risk (with review)
gh pr checkout 7
npm ci
npm run lint  # Check if config needs migration
# If lint works:
gh pr merge 7 --squash --delete-branch
# If lint fails, update config first, then merge

# Phase 7: Draft
# Leave PR #3 open until author marks ready
```

---

## Rollback Plan

If any merge causes issues:

```bash
# Identify problematic PR merge commit
git log --oneline -20

# Revert the merge
git revert <commit-hash>
git push origin main

# Re-open the PR if needed
gh pr reopen <PR_NUMBER>
```

---

## Post-Merge Validation

After all merges complete:

```bash
# 1. Fresh checkout
git checkout main
git pull

# 2. Clean install
rm -rf node_modules package-lock.json
npm install

# 3. Full validation
npm run validate  # lint + test:all + build

# 4. Staging deployment
npm run deploy:staging

# 5. Monitor staging
# Wait 24 hours, check:
# - Worker logs
# - Error rates
# - Performance metrics
# - AI model availability

# 6. If staging stable, deploy to production
npm run deploy:production
```

---

## Risk Mitigation Checklist

- [ ] All merges done one at a time (no batch merges)
- [ ] Test suite run after each merge
- [ ] Build verification after dependency updates
- [ ] Wrangler dry-run before each deploy
- [ ] Staging monitored for 24h before production
- [ ] Rollback plan documented and tested
- [ ] Team notified of upcoming changes
- [ ] Monitoring alerts configured for new versions

