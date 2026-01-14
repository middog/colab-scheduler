# RFC: GitHub Integration Expansion

**Status:** Draft  
**Author:** mid.dog / SDCoLab team  
**Created:** January 2025  
**Target Version:** v4.0.0 (Major) or v5.0.0 depending on scope

---

## Summary

Expand the scheduler's GitHub integration from single-repo Issues to a multi-repo, multi-feature platform supporting Issues, Discussions, Projects, and potentially Wiki—aligned with Fire Triangle governance and the sdcap-governance / sd-burner-vision ecosystem.

---

## Current State (v3.8.x)

```
┌─────────────────────────────────────────┐
│ SDCoLab Scheduler                       │
│                                         │
│  Booking Created ──► GitHub Issue       │
│                      (single repo)      │
│                      - sdcap-governance │
│                      - fire:* labels    │
└─────────────────────────────────────────┘
```

**Limitations:**
- Single hardcoded repo (`GITHUB_ORG`/`GITHUB_REPO`)
- Issues only—no Discussions, Projects, or Wiki
- All content types go to same place
- No routing logic based on content type or Fire Triangle classification

---

## Proposed Architecture (v4.0+)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ SDCoLab Scheduler                                                            │
│                                                                              │
│  ┌─────────────┐     ┌─────────────────────┐     ┌─────────────────────────┐ │
│  │ Booking     │     │ GitHub Router       │     │ Destinations            │ │
│  │ Created     │────►│                     │────►│                         │ │
│  │             │     │ Routes by:          │     │ sdcap-governance/       │ │
│  │ Maintenance │     │ - Content type      │     │   └─ Issues (access)    │ │
│  │ Request     │     │ - Fire element      │     │   └─ Discussions (policy│ │
│  │             │     │ - User config       │     │                         │ │
│  │ Feedback    │     │ - Admin override    │     │ sd-burner-vision/       │ │
│  │             │     │                     │     │   └─ Discussions (vision│ │
│  │ Vision      │     │                     │     │   └─ Projects (roadmap) │ │
│  │ Proposal    │     │                     │     │                         │ │
│  │             │     │                     │     │ sdcolab-ops/            │ │
│  │ Event       │     │                     │     │   └─ Issues (maint)     │ │
│  │ Idea        │     │                     │     │   └─ Wiki (inventory)   │ │
│  └─────────────┘     └─────────────────────┘     └─────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Fire Triangle Mapping to GitHub Features

### 🔥 FUEL (Physical Resources) → Operations

| Content Type | GitHub Feature | Target Repo | Example |
|-------------|----------------|-------------|---------|
| Tool booking | Issue | sdcolab-ops | "Laser Cutter - Jan 15" |
| Maintenance request | Issue | sdcolab-ops | "CNC Router needs calibration" |
| Equipment inventory | Wiki | sdcolab-ops | Tool specs, manuals |
| Supply requests | Issue | sdcolab-ops | "Need more PLA filament" |

### 💨 OXYGEN (Governance) → Policy & Access

| Content Type | GitHub Feature | Target Repo | Example |
|-------------|----------------|-------------|---------|
| Access request | Issue | sdcap-governance | "Request: Laser certification" |
| Policy discussion | Discussion | sdcap-governance | "Should we allow overnight prints?" |
| Rule change | Issue + Discussion | sdcap-governance | RFC process |
| Certification record | Issue (closed) | sdcap-governance | Audit trail |

### 🌡️ HEAT (Community) → Vision & Engagement

| Content Type | GitHub Feature | Target Repo | Example |
|-------------|----------------|-------------|---------|
| Vision proposal | Discussion | sd-burner-vision | "2025 expansion ideas" |
| Event planning | Discussion | sd-burner-vision | "Build day brainstorm" |
| Community feedback | Discussion (poll) | sd-burner-vision | "What tools should we add?" |
| Roadmap tracking | Project board | sd-burner-vision | Quarterly goals |

---

## Feature Breakdown

### Phase 1: Multi-Repo Issues (v4.0) — Minor-ish

**Scope:** Allow content to route to different repos based on type.

**Changes:**
- Config: Multiple repos with purpose tags
- UI: Repo selector for admins (or auto-route by content type)
- API: Routing logic in GitHubService
- Data model: Store `targetRepo` on bookings/requests

**Effort:** 2-3 days

```javascript
// New config structure
github: {
  token: process.env.GITHUB_TOKEN,
  org: process.env.GITHUB_ORG || 'middog',
  repos: {
    operations: process.env.GITHUB_REPO_OPS || 'sdcolab-ops',
    governance: process.env.GITHUB_REPO_GOV || 'sdcap-governance', 
    vision: process.env.GITHUB_REPO_VISION || 'sd-burner-vision'
  },
  routing: {
    booking: 'operations',
    maintenance: 'operations',
    access_request: 'governance',
    policy: 'governance',
    vision: 'vision',
    feedback: 'vision'
  }
}
```

### Phase 2: GitHub Discussions (v4.1) — Minor

**Scope:** Create Discussions for appropriate content types.

**Changes:**
- New DiscussionsService (GraphQL API required)
- Category mapping (Announcements, Ideas, Q&A, etc.)
- UI for starting discussions from scheduler

**Effort:** 3-4 days

**API Note:** Discussions require GraphQL API, not REST:
```graphql
mutation CreateDiscussion($repositoryId: ID!, $categoryId: ID!, $body: String!, $title: String!) {
  createDiscussion(input: {repositoryId: $repositoryId, categoryId: $categoryId, body: $body, title: $title}) {
    discussion {
      id
      url
    }
  }
}
```

### Phase 3: GitHub Projects Integration (v4.2) — Minor

**Scope:** Track items on project boards for visual management.

**Use cases:**
- Equipment maintenance schedule (board view)
- Certification pipeline (kanban)
- Event/build planning (timeline)

**Effort:** 3-4 days

### Phase 4: Wiki Integration (v5.0?) — Major

**Scope:** Sync tool inventory, procedures, manuals to Wiki.

**Use cases:**
- Auto-generate tool pages from config
- Link booking confirmations to wiki documentation
- Community-editable procedures

**Effort:** 1 week+

**Consideration:** Wiki might be overkill if GitBook/docs site already exists. Could be "nice to have" rather than essential.

---

## Version Strategy

| Version | Scope | Breaking Changes? |
|---------|-------|-------------------|
| **v3.9.0** | Prep: refactor GitHubService for extensibility | No |
| **v4.0.0** | Multi-repo routing + repo selection UI | Config format change (minor migration) |
| **v4.1.0** | Discussions support | No |
| **v4.2.0** | Projects integration | No |
| **v5.0.0** | Wiki + full "GitHub as facilities backend" | Possibly, depends on scope |

**Recommendation:** This is v4.0 territory. The multi-repo routing is a meaningful architectural change but not a complete rewrite. Discussions and Projects are additive features that warrant minor bumps.

---

## Configuration Design

### Current (v3.x)
```bash
GITHUB_TOKEN=ghp_xxx
GITHUB_ORG=middog
GITHUB_REPO=sdcap-governance
```

### Proposed (v4.x)
```bash
# Core
GITHUB_TOKEN=ghp_xxx
GITHUB_ORG=middog

# Repos (all optional, defaults to GITHUB_REPO for backwards compat)
GITHUB_REPO=sdcap-governance              # Legacy fallback
GITHUB_REPO_OPS=sdcolab-ops               # FUEL: operations, maintenance
GITHUB_REPO_GOV=sdcap-governance          # OXYGEN: access, policy
GITHUB_REPO_VISION=sd-burner-vision       # HEAT: community, vision

# Feature flags
ENABLE_GITHUB_ISSUES=true
ENABLE_GITHUB_DISCUSSIONS=true
ENABLE_GITHUB_PROJECTS=false
ENABLE_GITHUB_WIKI=false

# Routing (optional overrides)
GITHUB_ROUTE_BOOKING=operations           # Which repo for bookings
GITHUB_ROUTE_MAINTENANCE=operations
GITHUB_ROUTE_ACCESS=governance
GITHUB_ROUTE_POLICY=governance
GITHUB_ROUTE_VISION=vision
```

### Backwards Compatibility

If only `GITHUB_REPO` is set (v3.x style), all content routes there. New config is opt-in.

---

## UI/UX Considerations

### Admin Settings Page

```
GitHub Integration
─────────────────────────────────────────────────────
Token: ●●●●●●●●●●●●●●●●●● [connected]

Repository Routing                              
┌─────────────────────────────────────────────────┐
│ Content Type        │ Destination              │
├─────────────────────────────────────────────────┤
│ 🔧 Tool Bookings    │ [sdcolab-ops ▼]         │
│ 🔧 Maintenance      │ [sdcolab-ops ▼]         │
│ 🔑 Access Requests  │ [sdcap-governance ▼]    │
│ 📜 Policy Questions │ [sdcap-governance ▼]    │
│ 💡 Vision/Ideas     │ [sd-burner-vision ▼]    │
└─────────────────────────────────────────────────┘

GitHub Features
☑ Issues
☑ Discussions  
☐ Projects (coming soon)
☐ Wiki sync (coming soon)
```

### User-Facing

When creating content that goes to GitHub:

```
Submit Feedback
─────────────────────────────────────────────────────
What's on your mind?
┌─────────────────────────────────────────────────┐
│ I think we should add a vinyl cutter...        │
└─────────────────────────────────────────────────┘

This will be: [Discussion in sd-burner-vision ▼]
              ├─ Issue in sdcolab-ops
              ├─ Issue in sdcap-governance  
              ├─ Discussion in sdcap-governance
              └─ Discussion in sd-burner-vision ✓

[Submit]
```

---

## Token Permissions

### Current (Issues only)
- `repo` or `public_repo` scope

### Proposed (Full integration)
Fine-grained token with:
- **Issues:** Read and write
- **Discussions:** Read and write  
- **Projects:** Read and write (for v4.2+)
- **Metadata:** Read-only

Or classic token with:
- `repo` (covers all)
- `project` (for organization projects)
- `write:discussion`

---

## Open Questions

1. **Should users choose destination or auto-route?**
   - Auto-route by content type (simpler UX)
   - User choice (more flexible)
   - Hybrid: auto-suggest with override option

2. **How to handle repos that don't exist yet?**
   - Fail gracefully with warning
   - Fall back to default repo
   - Auto-create (dangerous)

3. **Cross-repo linking?**
   - Booking in sdcolab-ops links to access request in sdcap-governance
   - How to maintain these references?

4. **Discussion categories?**
   - Hard-code mapping (Announcements, Ideas, Q&A)
   - Fetch dynamically from repo
   - Admin configurable

5. **What about existing bookings?**
   - They reference old single-repo issues
   - Migration: add `githubRepo` field, backfill as "legacy"

---

## Alignment with Pack Protocols

This expansion follows **Pack Protocols** methodology:

- **Sense:** Identified need for content routing (bookings ≠ policy ≠ vision)
- **Stabilize:** v4.0 provides foundation with multi-repo
- **Strengthen:** v4.1+ adds Discussions, Projects for richer engagement

**"Own our story"** — By using GitHub as the facilities backbone, the community maintains full history and can fork/migrate if needed. No vendor lock-in to proprietary facilities management software.

---

## Next Steps

1. **Discuss:** Review this RFC, add questions/concerns
2. **Decide:** Confirm Phase 1 scope for v4.0
3. **Design:** Finalize config structure and routing logic
4. **Develop:** Start with refactor (v3.9) then multi-repo (v4.0)

---

## Appendix: GitHub API Reference

### Issues (REST)
```
POST /repos/{owner}/{repo}/issues
PATCH /repos/{owner}/{repo}/issues/{issue_number}
```

### Discussions (GraphQL)
```graphql
# Query repo ID and discussion categories
query {
  repository(owner: "middog", name: "sd-burner-vision") {
    id
    discussionCategories(first: 10) {
      nodes { id name }
    }
  }
}

# Create discussion
mutation {
  createDiscussion(input: {
    repositoryId: "R_xxx"
    categoryId: "DC_xxx"
    title: "2025 Vision Brainstorm"
    body: "What should we build?"
  }) {
    discussion { url }
  }
}
```

### Projects (GraphQL v2)
```graphql
# Add item to project
mutation {
  addProjectV2ItemById(input: {
    projectId: "PVT_xxx"
    contentId: "I_xxx"  # Issue or PR node ID
  }) {
    item { id }
  }
}
```

---

*🔥 Part of the SDCoLab Fire Triangle ecosystem*
