# 🐕 Pack Protocols: Development Methodology
## ITIL-Aligned Feature Development for SDCoLab Ecosystem

---

## 1. Repository Initialization Ritual

### 1.1 First Commit Structure

```bash
# Initialize with intention
git init
git checkout -b main

# First commit: Foundation
git add .
git commit -m "🔥 ignite: initial scaffold

- Core architecture established
- Feature flags for optional integrations
- Infrastructure as Code (OpenTofu)
- Fire Triangle alignment: FUEL layer

Ref: SDCAP-001"
```

### 1.2 Branch Naming Convention (Pack Territories)

```
main                    # The Den - production stable
├── develop             # The Yard - integration testing
├── feature/SDCAP-XXX-* # Hunting Grounds - new capabilities
├── fix/SDCAP-XXX-*     # Mending - bug repairs
├── chore/SDCAP-XXX-*   # Grooming - maintenance
└── docs/SDCAP-XXX-*    # Howling - documentation
```

### 1.3 Commit Message Format (Bark Types)

```
<bark>: <what changed>

<why it matters>

Ref: SDCAP-XXX
Co-sniffed-by: @collaborator
```

**Bark Types:**
| Bark | Meaning | Fire Triangle |
|------|---------|---------------|
| 🔥 `ignite` | New feature | HEAT |
| 🦴 `fetch` | Add dependency/resource | FUEL |
| 🐾 `track` | Refactor/improve | OXYGEN |
| 🩹 `mend` | Bug fix | FUEL |
| 📜 `howl` | Documentation | OXYGEN |
| 🧹 `groom` | Chores/cleanup | OXYGEN |
| 🧪 `sniff` | Tests | OXYGEN |
| 🚀 `release` | Version bump | HEAT |

---

## 2. The 3S Development Cycle

Aligned with ITIL Service Lifecycle + Pack Protocols:

```
    ┌─────────────────────────────────────────────┐
    │                                             │
    │   SENSE          STABILIZE        STRENGTHEN │
    │   (Discover)     (Deliver)        (Improve)  │
    │                                             │
    │   ┌─────┐        ┌─────┐         ┌─────┐   │
    │   │Scout│───────▶│Build│────────▶│Guard│   │
    │   └─────┘        └─────┘         └─────┘   │
    │      │              │                │      │
    │      ▼              ▼                ▼      │
    │   Issues         PRs/Code        Retros     │
    │   RFCs           Tests           Metrics    │
    │   Spikes         Deploy          Iterate    │
    │                                             │
    └─────────────────────────────────────────────┘
```

### 2.1 SENSE Phase (Service Strategy)

**Purpose:** Sniff out what needs doing

**Artifacts:**
- GitHub Issue with template
- RFC (Request for Comment) for big changes
- Spike ticket for unknowns

**Issue Template:**
```markdown
## 🐕 Scent Report: [Feature Name]

### What's the trail?
<!-- Describe what you're sensing -->

### Why follow it?
<!-- Business value / user need -->

### Fire Triangle Classification
- [ ] 🟡 FUEL (infrastructure, tools, resources)
- [ ] 🔵 OXYGEN (process, governance, docs)
- [ ] 🔴 HEAT (community, events, engagement)

### Sniff Test (Acceptance Criteria)
- [ ] Criterion 1
- [ ] Criterion 2

### Pack Notes
<!-- Dependencies, blockers, who else is on this trail -->
```

### 2.2 STABILIZE Phase (Service Design + Transition)

**Purpose:** Build and ship

**Workflow:**
```
Issue Created
    │
    ▼
Branch Created: feature/SDCAP-XXX-short-name
    │
    ▼
Development (with iterative prompts - see Section 4)
    │
    ▼
PR Opened → Review → Tests Pass
    │
    ▼
Merge to develop → Integration Test
    │
    ▼
Merge to main → Deploy
```

### 2.3 STRENGTHEN Phase (Service Operation + Improvement)

**Purpose:** Guard what we built, improve continuously

**Activities:**
- Monitor logs and metrics
- Gather feedback at Fire Party
- Create follow-up issues
- Update documentation
- Celebrate wins! 🎉

---

## 3. Feature Development Template

### 3.1 Feature Specification (The Hunt Plan)

```markdown
# Feature: [SDCAP-XXX] [Feature Name]

## Trail Summary
One paragraph describing the feature.

## Pack Members
- **Lead:** @username
- **Reviewer:** @username
- **Stakeholder:** @username

## Fire Triangle
- **Type:** FUEL / OXYGEN / HEAT
- **Impact:** Low / Medium / High
- **Effort:** S / M / L / XL

## Scent Markers (Requirements)

### Must Have (P0)
- [ ] Requirement 1
- [ ] Requirement 2

### Should Have (P1)
- [ ] Requirement 3

### Could Have (P2)
- [ ] Requirement 4

## Technical Approach

### Architecture Changes
<!-- Describe what changes -->

### API Changes
<!-- New/modified endpoints -->

### Data Model Changes
<!-- Schema updates -->

### Integration Points
<!-- What this touches -->

## Test Plan
- [ ] Unit tests for X
- [ ] Integration test for Y
- [ ] Manual test: Z

## Rollout Plan
1. Deploy to dev
2. Smoke test
3. Deploy to prod
4. Monitor for 24h

## Rollback Plan
<!-- How to undo if needed -->
```

---

## 4. Iterative Prompt Methodology (The Fetch Protocol)

### 4.1 Prompt Structure for Claude

Use this format to maintain context across sessions:

```markdown
## 🐕 FETCH: [Short Task Name]

### Context Sniff
**Project:** SDCoLab Scheduler
**Branch:** feature/SDCAP-XXX-feature-name
**Issue:** https://github.com/middog/colab-scheduler/issues/XXX
**Last Session:** [Date] - [What we accomplished]

### Current Trail
**Phase:** SENSE / STABILIZE / STRENGTHEN
**Blocked:** Yes/No - [reason if yes]

### Today's Hunt
<!-- What you want to accomplish -->

1. Primary objective
2. Secondary objective

### Artifacts to Fetch
<!-- What you expect as output -->

- [ ] Code for X
- [ ] Tests for Y
- [ ] Documentation for Z

### Constraints
<!-- Important limitations -->

- Must work with existing auth
- Cannot break API compatibility
- Needs to deploy to Lambda

### Reference Scents
<!-- Relevant files or prior context -->

- See: `/backend/src/routes/bookings.js`
- Prior discussion: [link or summary]
```

### 4.2 Troubleshooting Prompt Template

```markdown
## 🩹 MEND: [Error Summary]

### Wound Report
**Error:** [Exact error message]
**When:** [What action triggered it]
**Where:** [File/endpoint/component]

### What I Tried
1. Attempt 1 - result
2. Attempt 2 - result

### Logs/Evidence
```
[paste relevant logs]
```

### Suspected Cause
<!-- Your hypothesis -->

### Environment
- Node: X.X
- AWS Region: us-west-2
- Last Deploy: [timestamp]
```

### 4.3 Progress Recording Template

After each session, record:

```markdown
## 📜 HOWL: Session Log [Date]

### Trail Covered
- ✅ Completed X
- ✅ Completed Y
- 🔄 In progress: Z

### Artifacts Created
- `path/to/file.js` - description
- `path/to/test.js` - description

### Decisions Made
1. Decision: [what]
   Rationale: [why]

2. Decision: [what]
   Rationale: [why]

### Open Questions
- [ ] Question 1
- [ ] Question 2

### Next Hunt
<!-- What to tackle next session -->

1. Priority item
2. Secondary item

### Commit Summary
```
git log --oneline -5
```
```

---

## 5. GitHub Project Board Structure

### 5.1 Columns (Pack Stations)

| Column | Purpose | ITIL Phase |
|--------|---------|------------|
| 🐕 Scent Pile | New issues, untriaged | Strategy |
| 🔍 Sniffing | Being investigated/refined | Strategy |
| 📋 Ready to Hunt | Groomed, ready for dev | Design |
| 🏃 On the Trail | In active development | Transition |
| 👀 Pack Review | PR open, awaiting review | Transition |
| ✅ In the Den | Merged to main | Operation |
| 🎉 Released | Deployed to prod | Operation |

### 5.2 Labels

```
# Fire Triangle
fire:fuel       🟡 #F0E68C
fire:oxygen     🔵 #87CEEB  
fire:heat       🔴 #FFB6C1

# Priority
p0:critical     🔴 #FF0000
p1:high         🟠 #FFA500
p2:medium       🟡 #FFFF00
p3:low          🟢 #00FF00

# Type
type:feature    ✨
type:bug        🐛
type:chore      🧹
type:docs       📚
type:spike      🔬

# Status
status:blocked  🚫
status:wip      🚧
status:review   👀

# Size
size:xs         
size:s          
size:m          
size:l          
size:xl         
```

---

## 6. Communication Templates

### 6.1 Fire Party Update (Weekly)

```markdown
## 🔥 Fire Party Update - [Date]

### Flames Lit This Week
- ✅ [Feature/fix completed]
- ✅ [Feature/fix completed]

### Currently Burning
- 🔄 [In progress item] - ETA: [date]
- 🔄 [In progress item] - ETA: [date]

### Sparks Needed (Blockers)
- 🚫 [Blocker] - Need: [what you need]

### Next Week's Kindling
- [ ] [Planned item]
- [ ] [Planned item]

### Metrics
- PRs Merged: X
- Issues Closed: Y
- Bugs Squashed: Z
```

### 6.2 Async Decision Request

```markdown
## 🗳️ Pack Decision: [Topic]

### The Fork in the Trail
[Describe the decision needed]

### Options

**Option A: [Name]**
- Pro: X
- Con: Y
- Effort: S/M/L

**Option B: [Name]**
- Pro: X
- Con: Y
- Effort: S/M/L

### Recommendation
[Your recommendation and why]

### Vote
Please react:
- 🅰️ for Option A
- 🅱️ for Option B
- 🤔 need more info

**Deadline:** [Date/Time]
```

---

## 7. Initial Repository Checklist

### First Push Ritual

```bash
# 1. Create repo on GitHub
gh repo create middog/colab-scheduler --public

# 2. Initialize locally
cd ~/colab-scheduler
git init
git remote add origin git@github.com:middog/colab-scheduler.git

# 3. Create initial structure
git checkout -b main

# 4. First commit
git add .
git commit -m "🔥 ignite: SDCoLab Scheduler MVP

Initial release of serverless tool booking system.

Features:
- Member booking requests
- Admin approval workflow  
- Optional GCal/GitHub/Slack integrations
- DynamoDB persistence
- React frontend

Architecture:
- AWS Lambda + API Gateway
- DynamoDB (bookings, users, audit)
- S3 static hosting
- OpenTofu IaC

Fire Triangle: FUEL layer foundation

Ref: SDCAP-001"

# 5. Push
git push -u origin main

# 6. Create develop branch
git checkout -b develop
git push -u origin develop

# 7. Protect main branch (via GitHub UI or CLI)
gh api repos/middog/colab-scheduler/branches/main/protection -X PUT \
  -F required_status_checks='{"strict":true,"contexts":[]}' \
  -F enforce_admins=false \
  -F required_pull_request_reviews='{"required_approving_review_count":1}'

# 8. Create initial issues for roadmap
gh issue create --title "🔥 [SDCAP-002] Google Calendar Integration" \
  --body "Enable calendar sync for approved bookings" \
  --label "fire:fuel,type:feature,p1:high"

gh issue create --title "🔥 [SDCAP-003] GitHub Issues Integration" \
  --body "Create issues for booking workflow" \
  --label "fire:oxygen,type:feature,p2:medium"
```

---

## 8. Quick Reference Card

### Prompt Prefixes
| Prefix | Use When |
|--------|----------|
| `FETCH:` | Building new feature |
| `MEND:` | Fixing a bug |
| `SNIFF:` | Investigating/exploring |
| `GROOM:` | Refactoring/cleanup |
| `HOWL:` | Documentation |
| `GUARD:` | Adding tests |

### Session Start Template
```
🐕 FETCH: [Task]
Context: colab-scheduler, branch: [X], issue: #[Y]
Last time: [summary]
Today: [goals]
Constraints: [limits]
```

### Session End Checklist
- [ ] Code committed with proper bark type
- [ ] Progress logged in issue
- [ ] Blockers noted
- [ ] Next steps documented

---

## 9. Example: First Feature Addition

### Issue
```markdown
## 🐕 Scent Report: [SDCAP-004] Email Notifications

### What's the trail?
Members should receive email when their booking is approved/rejected.

### Why follow it?
Currently no way to know booking status without checking app.

### Fire Triangle Classification
- [x] 🔴 HEAT (community engagement)

### Sniff Test
- [ ] Email sent on approval
- [ ] Email sent on rejection
- [ ] Unsubscribe option
- [ ] Works with SES
```

### First Prompt
```markdown
🐕 FETCH: Email notifications for booking status

Context: colab-scheduler, branch: feature/SDCAP-004-email-notifications
Issue: #4
Last time: N/A (new feature)

Today:
1. Add SES integration to backend
2. Create email templates
3. Hook into booking approval flow

Constraints:
- Use AWS SES (already have account)
- Follow existing integration pattern (like slack.js)
- Feature flag: ENABLE_EMAIL

Reference:
- Pattern: /backend/src/integrations/slack.js
- Hook point: /backend/src/integrations/index.js
```

### Progress Log
```markdown
📜 HOWL: Session Log 2026-01-08

Trail Covered:
- ✅ Created /backend/src/integrations/email.js
- ✅ Added SES config to config.js
- ✅ Hooked into booking.approved event
- 🔄 Email templates in progress

Artifacts:
- `backend/src/integrations/email.js` - SES service
- `backend/src/templates/` - Email templates (WIP)

Decisions:
1. Use HTML emails with text fallback
2. Template with Handlebars

Next Hunt:
1. Complete templates
2. Add ENABLE_EMAIL flag to Terraform
3. Test end-to-end

Commits:
abc1234 🦴 fetch: add SES dependency
def5678 🔥 ignite: email integration scaffold
```

---

*Woof! Now go fetch some features!* 🐕🔥
