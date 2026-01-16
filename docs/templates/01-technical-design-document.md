# Technical Design Document Template

> **Purpose**: This document describes the full system design for a feature/component. It should be created BEFORE any code is written and reviewed by stakeholders and senior engineers.

---

## 1. Overview

### 1.1 Problem Statement
_What problem are we solving? Why does it matter?_

[Describe the user pain point or technical gap being addressed]

### 1.2 Proposed Solution
_High-level description of the approach_

[Brief summary of how you plan to solve the problem]

### 1.3 Goals & Non-Goals

**Goals:**
- [What this design WILL accomplish]
- [Measurable outcomes]

**Non-Goals:**
- [What this design explicitly WON'T address]
- [Out of scope items to avoid scope creep]

### 1.4 Success Metrics
_How will we know this succeeded?_

| Metric | Current State | Target | Measurement Method |
|--------|---------------|--------|-------------------|
| [Metric name] | [Baseline] | [Goal] | [How to measure] |

---

## 2. Background & Context

### 2.1 Current State
_What exists today? What are the limitations?_

[Describe the existing system/process and its shortcomings]

### 2.2 Prior Art
_What approaches have been tried? What can we learn from others?_

[Reference existing solutions, both internal and external]

### 2.3 Dependencies
_What does this feature depend on?_

| Dependency | Type | Status | Owner |
|------------|------|--------|-------|
| [Component/Service] | Hard/Soft | Active/Planned | [Team/Person] |

---

## 3. System Design

### 3.1 Architecture Overview

```
[ASCII diagram or reference to Excalidraw/Mermaid diagram]

┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Frontend   │────▶│   API       │────▶│  Database   │
└─────────────┘     └─────────────┘     └─────────────┘
```

### 3.2 Component Breakdown

#### Component A: [Name]
- **Responsibility**: [What it does]
- **Inputs**: [What it receives]
- **Outputs**: [What it produces]
- **Key Interfaces**: [API contracts]

#### Component B: [Name]
_[Repeat for each component]_

### 3.3 Data Model

```
[Schema definition or ERD reference]

Table: example_table
├── id (PK, UUID)
├── created_at (TIMESTAMP)
├── updated_at (TIMESTAMP)
└── [other fields]
```

### 3.4 API Contracts

#### Endpoint: `POST /api/example`
```json
// Request
{
  "field1": "string",
  "field2": "number"
}

// Response (200 OK)
{
  "id": "uuid",
  "status": "success"
}

// Error (400 Bad Request)
{
  "error": "validation_error",
  "message": "Field1 is required"
}
```

### 3.5 Integration Points

| System | Integration Type | Data Flow | Authentication |
|--------|-----------------|-----------|----------------|
| [External Service] | REST/GraphQL/Event | Inbound/Outbound | OAuth/API Key |

---

## 4. Technical Decisions

### 4.1 Key Design Decisions

#### Decision 1: [Title]
- **Context**: [Why this decision needed to be made]
- **Options Considered**:
  - Option A: [Description, Pros, Cons]
  - Option B: [Description, Pros, Cons]
- **Decision**: [Which option was chosen and why]
- **Consequences**: [What this decision means going forward]

### 4.2 Technology Choices

| Concern | Choice | Rationale |
|---------|--------|-----------|
| [Frontend Framework] | [Choice] | [Why] |
| [Database] | [Choice] | [Why] |
| [Testing] | [Choice] | [Why] |

---

## 5. Implementation Plan

### 5.1 Phases

#### Phase 1: Foundation (Est: X days)
- [ ] Task 1
- [ ] Task 2

#### Phase 2: Core Features (Est: X days)
- [ ] Task 3
- [ ] Task 4

#### Phase 3: Polish & Testing (Est: X days)
- [ ] Task 5
- [ ] Task 6

### 5.2 Migration Strategy
_If applicable, how do we migrate from old to new?_

[Describe rollout approach: feature flags, gradual migration, etc.]

---

## 6. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| [Risk description] | High/Med/Low | High/Med/Low | [How to address] |

---

## 7. Security & Privacy

### 7.1 Security Considerations
- **Authentication**: [How users are authenticated]
- **Authorization**: [How access is controlled]
- **Data Handling**: [How sensitive data is protected]

### 7.2 Privacy Considerations
- **Data Collection**: [What data is collected]
- **Data Retention**: [How long data is kept]
- **User Rights**: [How users can access/delete their data]

---

## 8. Observability

### 8.1 Logging
- [What events will be logged]
- [Log format and destination]

### 8.2 Metrics
| Metric | Type | Alert Threshold |
|--------|------|-----------------|
| [Metric name] | Counter/Gauge/Histogram | [Value] |

### 8.3 Tracing
- [Distributed tracing approach]

---

## 9. Testing Strategy

### 9.1 Test Coverage Plan

| Test Type | Coverage Target | Approach |
|-----------|----------------|----------|
| Unit Tests | 80% | Jest/Vitest |
| Integration Tests | Key paths | Supertest |
| E2E Tests | Critical flows | Playwright |

### 9.2 Test Scenarios
1. [Happy path scenario]
2. [Error case scenario]
3. [Edge case scenario]

---

## 10. Open Questions

- [ ] **Q1**: [Question that needs answer before proceeding]
  - _Status_: Open/Resolved
  - _Decision_: [If resolved]

---

## 11. References

- [Link to related docs]
- [Link to external resources]
- [Link to Excalidraw diagrams]

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | YYYY-MM-DD | [Name] | Initial draft |
