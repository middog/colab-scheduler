# Sprint Planning Document Template

> **Purpose**: Break down subsystem implementation into discrete, AI-agent-digestible tasks. Tasks should be small enough that an AI coding agent can complete them without hallucinating context.

---

## Sprint Info

| Field | Value |
|-------|-------|
| **Sprint** | [Sprint number/name] |
| **Dates** | YYYY-MM-DD to YYYY-MM-DD |
| **Goal** | [One-sentence sprint goal] |
| **Parent Docs** | [Links to TDD, Design Review, Subsystem Plans] |

---

## 1. Sprint Scope

### 1.1 In Scope for This Sprint
- [Feature/subsystem 1]
- [Feature/subsystem 2]

### 1.2 Explicitly Out of Scope
- [Deferred item 1]
- [Deferred item 2]

### 1.3 Dependencies on Other Teams
| Team | Dependency | Status | Blocker? |
|------|------------|--------|----------|
| [Team] | [What we need] | ✅ Ready / ⏳ Pending | Yes/No |

---

## 2. Task Breakdown

### Task Template

Each task should follow this format for AI coding agents:

```
### TASK-XXX: [Brief Title]

**Type**: Feature / Bug / Refactor / Test / Docs
**Points**: [1/2/3/5/8]
**Assignee**: [Name or "AI Agent"]
**Priority**: P0 / P1 / P2

#### Context
[1-2 sentences of why this task exists]

#### Acceptance Criteria
- [ ] [Specific, testable criterion]
- [ ] [Specific, testable criterion]

#### Technical Details
- **Files to modify**: `path/to/file.ts`, `path/to/other.ts`
- **Files to create**: `path/to/new-file.ts`
- **Dependencies**: [Other tasks that must be done first]

#### Implementation Hints
- [Specific guidance for implementation]
- [Code pattern to follow]
- [Reference: link to similar code]

#### Test Requirements
- [ ] Unit test for [scenario]
- [ ] Integration test for [scenario]

#### Definition of Done
- [ ] Code compiles without errors
- [ ] All tests pass
- [ ] PR approved
- [ ] Documentation updated (if applicable)
```

---

## 3. Sprint Tasks

### TASK-001: [Title]

**Type**: Feature
**Points**: 3
**Assignee**: AI Agent
**Priority**: P0

#### Context
[Why this task exists]

#### Acceptance Criteria
- [ ] [Criterion 1]
- [ ] [Criterion 2]

#### Technical Details
- **Files to modify**: `src/example.ts`
- **Files to create**: None
- **Dependencies**: None

#### Implementation Hints
- Follow existing pattern in `src/similar.ts`
- Use the `ExistingHelper` utility

#### Test Requirements
- [ ] Unit test for happy path
- [ ] Unit test for error case

#### Definition of Done
- [ ] Code compiles
- [ ] Tests pass
- [ ] PR approved

---

### TASK-002: [Title]

**Type**: Test
**Points**: 2
**Assignee**: AI Agent
**Priority**: P1

#### Context
[Why this task exists]

#### Acceptance Criteria
- [ ] [Criterion 1]
- [ ] [Criterion 2]

#### Technical Details
- **Files to modify**: `src/__tests__/`
- **Files to create**: `src/__tests__/new.test.ts`
- **Dependencies**: TASK-001

#### Implementation Hints
- Reference existing test structure in `existing.test.ts`
- Use fixtures from `fixtures/`

#### Test Requirements
- N/A (this IS the test task)

#### Definition of Done
- [ ] Tests written and passing
- [ ] Coverage target met
- [ ] PR approved

---

_[Continue with additional tasks...]_

---

## 4. Task Dependencies Graph

```
TASK-001 (Foundation)
    │
    ├──▶ TASK-002 (Tests for 001)
    │
    └──▶ TASK-003 (Builds on 001)
              │
              └──▶ TASK-004 (Builds on 003)
                        │
                        └──▶ TASK-005 (Final integration)
```

---

## 5. Task Order (Recommended Sequence)

| Order | Task ID | Title | Blocked By |
|-------|---------|-------|------------|
| 1 | TASK-001 | [Title] | None |
| 2 | TASK-002 | [Title] | TASK-001 |
| 3 | TASK-003 | [Title] | TASK-001 |
| 4 | TASK-004 | [Title] | TASK-003 |
| 5 | TASK-005 | [Title] | TASK-002, TASK-004 |

---

## 6. AI Agent Guidelines

### 6.1 Context Limits
- Each task should be completable with ~2000 tokens of context
- If a task requires more context, it should be split
- Always reference specific file paths, not "the auth module"

### 6.2 Success Patterns for AI Tasks
✅ Good task:
- "Add validation for email field in UserForm.tsx"
- Specific file, specific function, clear scope

❌ Bad task:
- "Improve the authentication system"
- Too vague, no specific files, unlimited scope

### 6.3 Information to Always Include
- Exact file paths (absolute from repo root)
- Function/class names to modify
- Expected input/output types
- Error handling requirements
- Link to similar existing code

### 6.4 Information to Avoid
- Don't assume AI remembers previous conversations
- Don't reference "the usual way" - be explicit
- Don't use pronouns without antecedents

---

## 7. Progress Tracking

### Daily Standup Format
| Task | Yesterday | Today | Blockers |
|------|-----------|-------|----------|
| TASK-001 | Started implementation | Complete + PR | None |

### Sprint Board States
1. **Backlog**: Not started
2. **In Progress**: Being worked on
3. **In Review**: PR submitted
4. **Done**: Merged to main

---

## 8. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| [Risk] | High/Med/Low | High/Med/Low | [Plan] |

---

## 9. Sprint Retrospective Items (Post-Sprint)

### What Went Well
- [Item]

### What Could Improve
- [Item]

### Action Items for Next Sprint
- [ ] [Action]

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | YYYY-MM-DD | [Name] | Initial sprint plan |
