# Design Review Document Template

> **Purpose**: This document captures the outcome of the design review session. It should be completed AFTER the Technical Design Document review with Senior Engineers.

---

## Review Metadata

| Field | Value |
|-------|-------|
| **Design Doc** | [Link to TDD] |
| **Author** | [Name] |
| **Reviewers** | [Names of Senior Engineers] |
| **Review Date** | YYYY-MM-DD |
| **Review Duration** | X hours |
| **Decision** | ✅ Approved / ⚠️ Approved with Changes / ❌ Rejected |

---

## 1. Architecture Review

### 1.1 Architecture Diagram Review

_Was the architecture clearly explained? Any gaps?_

**Whiteboard Session Notes:**
- [Key points discussed]
- [Components that needed clarification]
- [Data flows that were unclear]

**Diagram Updates Required:**
- [ ] [Update needed]
- [ ] [Update needed]

### 1.2 Architecture Concerns Raised

| Concern | Raised By | Resolution |
|---------|-----------|------------|
| [Scalability concern] | [Reviewer] | [How to address] |
| [Coupling concern] | [Reviewer] | [How to address] |

---

## 2. Technical Feedback

### 2.1 Critical Issues (Must Fix)

_Issues that MUST be addressed before implementation can proceed_

#### Issue 1: [Title]
- **Description**: [What's wrong]
- **Raised By**: [Reviewer]
- **Resolution**: [How to fix]
- **Status**: ⬜ Open / ✅ Resolved

#### Issue 2: [Title]
_[Repeat as needed]_

### 2.2 Major Suggestions (Should Consider)

_Strong recommendations that should be addressed but won't block_

| Suggestion | Rationale | Will Implement? |
|------------|-----------|-----------------|
| [Suggestion] | [Why it matters] | Yes/No/Partial |

### 2.3 Minor Suggestions (Nice to Have)

- [ ] [Suggestion 1]
- [ ] [Suggestion 2]

---

## 3. Scope Clarification

### 3.1 In Scope (Confirmed)
_Items that were confirmed to be in scope for this implementation_

- [Feature/functionality 1]
- [Feature/functionality 2]

### 3.2 Out of Scope (Confirmed)
_Items explicitly moved to future work_

| Item | Reason | Future Milestone |
|------|--------|------------------|
| [Feature] | [Why deferred] | v2.0 / TBD |

### 3.3 Scope Changes from Review
_Any scope additions or removals resulting from review_

- **Added**: [New requirement identified in review]
- **Removed**: [Item descoped during review]

---

## 4. Risk Assessment

### 4.1 Risks Identified in Review

| Risk | Severity | Owner | Mitigation Plan |
|------|----------|-------|-----------------|
| [Risk] | High/Med/Low | [Name] | [Plan] |

### 4.2 Unknowns Flagged

| Unknown | Investigation Needed | Deadline | Owner |
|---------|---------------------|----------|-------|
| [Unknown] | [What to research] | YYYY-MM-DD | [Name] |

---

## 5. Dependencies Review

### 5.1 External Dependencies Validated

| Dependency | Owner | Status | Notes |
|------------|-------|--------|-------|
| [Service/Team] | [Name] | ✅ Confirmed / ⚠️ At Risk | [Details] |

### 5.2 New Dependencies Identified

- [Dependency discovered during review]

---

## 6. Implementation Guidance

### 6.1 Recommended Approach Changes

_Changes to implementation approach suggested by reviewers_

| Original Approach | Recommended Change | Rationale |
|-------------------|-------------------|-----------|
| [What was planned] | [What's now recommended] | [Why] |

### 6.2 Code Patterns to Follow

_Specific patterns or existing code to reference_

- Reference: [Link to similar implementation]
- Pattern: [Design pattern to use]

### 6.3 Anti-Patterns to Avoid

- Don't: [What to avoid]
- Instead: [What to do]

---

## 7. Testing Requirements from Review

### 7.1 Test Scenarios Required

_Specific test scenarios that reviewers mandated_

| Scenario | Type | Priority | Notes |
|----------|------|----------|-------|
| [Scenario] | Unit/Integration/E2E | P0/P1/P2 | [Details] |

### 7.2 Performance Requirements

| Metric | Requirement | How to Verify |
|--------|-------------|---------------|
| [Latency] | < X ms | Load test |
| [Throughput] | X rps | Stress test |

---

## 8. Action Items

### 8.1 Pre-Implementation Actions

| Action | Owner | Due Date | Status |
|--------|-------|----------|--------|
| Update TDD with feedback | [Name] | YYYY-MM-DD | ⬜ |
| Spike on [unknown] | [Name] | YYYY-MM-DD | ⬜ |
| Get sign-off from [team] | [Name] | YYYY-MM-DD | ⬜ |

### 8.2 During Implementation Checkpoints

- [ ] **Checkpoint 1**: Review after [milestone] with [reviewer]
- [ ] **Checkpoint 2**: Review after [milestone] with [reviewer]

---

## 9. Approval Sign-off

### Reviewers

| Reviewer | Role | Decision | Date |
|----------|------|----------|------|
| [Name] | Senior Engineer | ✅ / ⚠️ / ❌ | YYYY-MM-DD |
| [Name] | Tech Lead | ✅ / ⚠️ / ❌ | YYYY-MM-DD |
| [Name] | Security Review | ✅ / ⚠️ / ❌ | YYYY-MM-DD |

### Final Decision

**Status**: ✅ Approved to proceed to Subsystem Planning

**Conditions** (if any):
1. [Condition that must be met]
2. [Condition that must be met]

---

## 10. Notes from Whiteboard Session

_Attach or link to photos/exports of whiteboard diagrams_

- [Excalidraw link]
- [Photo attachment]

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | YYYY-MM-DD | [Name] | Initial review captured |
