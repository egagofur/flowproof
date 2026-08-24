# Flowproof — Architectural Specification

> **"Don't just test the code. Prove the user flow."**

Flowproof is an AI-driven E2E verification orchestrator for software development workflows. It bridges business intent, automated execution, and human-verifiable evidence.

---

## 1. Core Architecture & System Boundaries

Flowproof enforces a strict three-tier separation of concerns:

```text
┌──────────────────────────────────────────────────────────────────┐
│                         FLOWPROOF CORE                           │
│  - Flow Contract & Schema Validation (Zod)                       │
│  - Flow Lifecycle & Metadata Manager                             │
│  - Verification Engine (Normalized Status: PROVEN, etc.)         │
│  - Evidence Manager (Screenshots, Traces, Retention, Masking)    │
│  - AI Intelligence Layer (Mapper, Impact Analyzer, Stale Detect) │
│  - Security & Credential Redaction                               │
│  - CLI & Agent Protocol Dispatcher                               │
└────────────────────────────────┬─────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│                        PROJECT ADAPTER                           │
│  - Project Configuration (flowproof.config.ts)                   │
│  - Auth Strategies (Password, Session, Token, OAuth, Browser)    │
│  - Custom Step Handlers & Domain Assertions                      │
│  - Fixtures & Test Data Bindings                                 │
└────────────────────────────────┬─────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│                      BROWSER EXECUTORS                           │
│  - BrowserExecutor Interface                                     │
│  ├── PlaywrightExecutor (Deterministic, CI, Regression)          │
│  ├── AsideExecutor (Agentic, Exploratory, Adaptive)              │
│  └── Hybrid / Fallback Strategy Dispatcher                       │
└────────────────────────────────┬─────────────────────────────────┘
                                 │
                                 ▼
                       Target Web Application
```

### Key Architectural Invariants
1. **Zero Project-Specific Selectors in Core**: Flowproof Core is completely domain-agnostic. All selectors, URLs, and custom authentication mechanisms live within Project Adapters.
2. **Pluggable Browser Execution**: Core never calls Playwright or Aside directly. All browser interactions are mediated through the `BrowserExecutor` interface.
3. **Evidence as First-Class Proof**: Assertions determine truth; visual and telemetry artifacts provide proof. Evidence is captured at explicit checkpoints, not blindly on every interaction.
4. **Machine & Human Usable**: Produces normalized JSON outputs for CI and AI agents, alongside rich visual summaries and Mattermost reports for engineering teams.

---

## 2. Flow Contract & Lifecycle Model

### 2.1 Flow Definition Schema

Flows are defined declaratively in YAML, JSON, or TypeScript:

```yaml
id: employee.remote-request.create
name: Employee Creates Remote Request
description: Employee submits a remote work request and verifies it appears in the list with Pending status.
priority: critical # critical | high | medium | low
tags:
  - remote-work
  - employee-portal

preconditions:
  - authenticated_as: employee
  - route: /remote-requests

steps:
  - id: step-1
    action: click
    target: "button:has-text('New Request')"
    description: Open request modal

  - id: step-2
    action: fill
    target: "input[name='reason']"
    value: "Working from home for focused sprint development"
    description: Enter request reason

  - id: step-3
    action: select_date
    target: "input[name='date']"
    value: tomorrow
    description: Select tomorrow's date

  - id: step-4
    action: submit
    target: "button[type='submit']"
    description: Submit remote request

assertions:
  - id: assert-modal-closed
    type: element_hidden
    target: "[role='dialog']"
    description: Modal dialog should close after submission

  - id: assert-request-visible
    type: element_visible
    target: "tr:has-text('Working from home')"
    description: Created request appears in the table

  - id: assert-status-pending
    type: text_contains
    target: "tr:has-text('Working from home') .status-badge"
    value: "Pending"
    description: Request status must be Pending

evidence:
  checkpoints:
    - id: request-form
      trigger: after_step
      stepId: step-2
      screenshot: true
      description: Request form filled out

    - id: request-submitted
      trigger: after_assertion
      assertionId: assert-request-visible
      screenshot: true
      description: Request visible in table

    - id: request-pending
      trigger: after_assertion
      assertionId: assert-status-pending
      screenshot: true
      description: Pending status verified
```

### 2.2 Flow Lifecycle State Machine

```text
  [Requirement / Code Change]
               │
               ▼
         [DISCOVERED]  (AI finds candidate user flow with confidence score)
               │
               ▼
           [DRAFT]     (Flow contract authored with steps & checkpoints)
               │
               ▼
          [REVIEWED]   (Validated by engineer or automated CI dry-run)
               │
               ▼
           [ACTIVE]    (Included in regular verification & impact runs)
               │
               ├───────────────────┐
               ▼ (UI Drift / Fail)  ▼ (Deleted Feature)
            [STALE]            [ARCHIVED]
               │
               ▼
          [RE-MAPPED]  (AI proposes contract patch -> back to REVIEWED)
```

---

## 3. Browser Executor Abstraction

```typescript
export interface ExecutionContext {
  executionId: string;
  flowId: string;
  baseUrl: string;
  env: Record<string, string>;
  auth?: AuthCredentials;
  artifactsDir: string;
  options: {
    headless?: boolean;
    timeoutMs?: number;
    recordTrace?: boolean;
    recordVideo?: boolean;
  };
}

export interface BrowserExecutor {
  readonly name: string;
  initialize(context: ExecutionContext): Promise<void>;
  execute(flow: FlowDefinition, context: ExecutionContext): Promise<ExecutionResult>;
  cleanup(): Promise<void>;
}
```

### 3.1 PlaywrightExecutor (Deterministic Execution)
- Uses Playwright `Browser`, `BrowserContext`, and `Page`.
- Manages trace recording (`trace.zip`), network HAR, console logs, and deterministic screenshot capture at checkpoints.
- Evaluates DOM assertions with built-in auto-waiting and retry mechanics.

### 3.2 AsideExecutor (Agentic Execution)
- Interacts with Aside agent API/CLI for adaptive, intent-driven flow execution.
- Employs semantic instructions when deterministic selectors fail or are absent.
- Gathers visual checkpoints and agent trajectory logs.

### 3.3 Hybrid & Fallback Strategy
- Configurable via `execution.preferred` in flow contract or `FLOWPROOF_BROWSER_EXECUTOR` environment variable.
- On deterministic failure due to potential UI drift, can optionally invoke Aside to investigate and gather diagnostic evidence for the Stale Flow Detector.

---

## 4. Project Adapter & Authentication

Projects configure custom adapters via `flowproof.config.ts`:

```typescript
import { defineConfig, PasswordAuthStrategy, SessionAuthStrategy } from 'flowproof';

export default defineConfig({
  baseUrl: process.env.APP_BASE_URL || 'http://localhost:3000',
  defaultExecutor: 'playwright',
  auth: {
    employee: new PasswordAuthStrategy({
      loginUrl: '/auth/login',
      usernameField: 'input[name="email"]',
      passwordField: 'input[name="password"]',
      submitField: 'button[type="submit"]',
      credentials: () => ({
        username: process.env.TEST_EMPLOYEE_EMAIL!,
        password: process.env.TEST_EMPLOYEE_PASSWORD!,
      }),
      validateSuccess: async (page) => {
        await page.waitForURL('**/dashboard');
      }
    }),
    admin: new SessionAuthStrategy({
      sessionStorageKey: 'auth_token',
      getToken: () => process.env.TEST_ADMIN_TOKEN!,
    })
  },
  customActions: {
    select_date: async (page, step) => {
      // Project-specific custom datepicker handler
    }
  }
});
```

---

## 5. Verification & Evidence Model

### 5.1 Verification Status
Flowproof classifies execution outcomes into 4 normalized top-level states:
- **`PROVEN`**: All steps executed and all assertions passed with required evidence artifacts captured.
- **`FAILED`**: One or more assertions failed (true business defect or UI mismatch).
- **`BLOCKED`**: Preconditions, authentication, network down, or environment setup failed before assertions could be evaluated.
- **`INCONCLUSIVE`**: Executor encountered an unexpected timeout, ambiguous state, or missing evidence where correctness cannot be established.

### 5.2 Evidence Directory Layout
```text
artifacts/
└── <execution-id>/
    ├── result.json                   # Normalized execution result
    ├── summary.md                    # Human-readable markdown summary
    ├── evidence/
    │   ├── checkpoint-request-form.png
    │   ├── checkpoint-request-submitted.png
    │   └── checkpoint-request-pending.png
    ├── trace/
    │   └── trace.zip                 # Playwright trace archive
    └── logs/
        ├── console.log               # Captured browser console output
        ├── network.log               # Intercepted network requests & errors
        └── orchestrator.log          # Detailed execution logs
```

---

## 6. AI Intelligence Capabilities

### 6.1 AI Flow Mapper (`flowproof discover` / `flowproof map`)
1. **Source Ingestion**: Analyzes requirements (`*.md`), OpenAPI specs, routes (`react-router`, `next.js`, `vue-router`), UI components, and existing E2E tests.
2. **Intent Extraction**: Identifies user roles, key user intents, critical paths, inputs, and expected outcomes.
3. **Flow Contract Synthesis**: Generates draft YAML/JSON flow definitions with confidence scores and source file provenance.

### 6.2 Change Impact Analyzer (`flowproof verify --affected`)
1. **Git Diff Analysis**: Extracts modified files, routes, and components between base and head refs.
2. **Dependency & Route Correlation**: Maps touched files to flow precondition routes, target components, and feature tags.
3. **Impact Scoring & Selection**: Produces a prioritized list of affected flows with explicit reasoning and confidence metrics.

### 6.3 AI Result Analyzer (`flowproof inspect <id>`)
1. Ingests `result.json`, assertion failures, error logs, and checkpoint screenshots.
2. Correlates failed assertion with recent code changes.
3. Distinguishes environment issues (e.g. 500 API error, auth timeout) from UI regressions (missing element, wrong text).
4. Produces actionable remediation advice.

### 6.4 Stale Flow Detector
1. Identifies when an assertion fails solely because of intentional label/copy/structure changes.
2. Proposes a surgical YAML patch for the flow definition without destructive auto-overwrites.

---

## 7. CLI Architecture

```text
flowproof <command> [options]

Commands:
  discover                  Discover potential user flows from repository code & specs
  flows                     List registered flow contracts and their lifecycle statuses
  verify                    Execute flow verification
    --flow <id>             Run a specific flow by ID
    --affected              Run only flows impacted by current git diff / changes
    --priority <p>          Filter by priority (critical | high | medium | low)
    --executor <e>          Override executor (playwright | aside)
    --json                  Output machine-readable JSON result
    --report-mattermost     Send formatted verification report to Mattermost
  inspect <execution-id>    View AI-assisted root cause analysis of a verification run
  evidence <execution-id>   Inspect or open evidence artifacts directory
  prune                     Prune old artifact directories based on retention policy
```

---

## 8. Security & Secret Isolation

1. **Credential Masking**: Credentials and sensitive tokens are injected via environment functions at runtime and NEVER logged or stored in flow contracts.
2. **Log & Trace Sanitization**: Regex-based redaction filters out Authorization headers, Bearer tokens, passwords, and private keys from stdout, console logs, and HAR files.
3. **Configurable Retention**: `FLOWPROOF_ARTIFACT_RETENTION_DAYS` automatically cleans up historical screenshot/trace directories to manage disk usage and data privacy.

---

## 9. Testing Strategy

1. **Unit Tests**:
   - Flow contract parsing, Zod validation, priority filtering, and lifecycle state transitions.
   - Evidence manager pathing, metadata formatting, and secret redaction filters.
   - Result normalization and status categorization.
2. **AI Engine Tests**:
   - Mocked source-file discovery to flow contract mapping.
   - Git diff parser and impact scoring heuristic accuracy.
   - Stale flow patch generation.
3. **Executor Integration Tests**:
   - Playwright executor against a local test web server validating real checkpoint screenshots and assertion passes/failures.
   - Aside executor contract abstraction tests.
4. **CLI Integration Tests**:
   - End-to-end CLI execution with `--json`, `--affected`, and `--flow`.
