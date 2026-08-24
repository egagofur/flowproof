# Flowproof 🌊🛡️

> **"Don't just test the code. Prove the user flow."**

Flowproof is an AI-driven E2E verification orchestrator for software development workflows. It bridges business intent, automated browser execution, visual evidence collection, and AI-assisted root-cause diagnosis.

---

## 🌟 Key Features

* **Flow-First Intent Verification**: Prove whether the user's business intent still works after a change, beyond simple PASS/FAIL checks.
* **Deterministic & Agentic Execution**: Pluggable `BrowserExecutor` abstraction supporting:
  * **Playwright** for deterministic, fast, repeatable CI and regression verification.
  * **Aside** for adaptive, exploratory verification without fragile selectors.
  * **Hybrid mode** for fallback diagnostics on ambiguous failures.
* **Zero Project-Specific Selectors in Core**: Flowproof Core is completely domain-agnostic. All selectors and authentication flows live in declarative contracts or project adapters.
* **First-Class Evidence**: Captures visual screenshot proofs at defined verification checkpoints, Playwright traces (`trace.zip`), and network/console logs.
* **Normalized Verification Outcomes**: 4 top-level states: `PROVEN`, `FAILED`, `BLOCKED`, `INCONCLUSIVE`.
* **AI Intelligence Layer**:
  * **Flow Discovery & Mapping (`flowproof discover`)**: Analyzes requirements, specs, and routes to generate draft flow contracts with confidence scores.
  * **Change Impact Analysis (`flowproof verify --affected`)**: Uses Git diffs to run only flows impacted by modified files.
  * **AI Result Diagnostics (`flowproof inspect <id>`)**: Pinpoints failure root causes, differentiating app regressions from environment/stale selector drift.
  * **Stale Flow Detector**: Detects UI drift and proposes surgical contract patches without destructive auto-overwrites.
* **Security & Credential Isolation**: Masking and secret redaction for auth headers, tokens, and credentials in logs and visual artifacts. Configurable retention pruning.
* **Mattermost Integration**: Formatted markdown summaries with checkpoint evidence counts and sender attribution (`from: "AI Agent"`).

---

## 📦 Installation & Setup

```bash
npm install -g flowproof
# or inside a project:
npm install -D flowproof playwright
npx playwright install chromium
```

### Automatic Scaffolding with `flowproof init`
Initialize Flowproof in any project (Next.js, Vite, React, Vue, generic SPA):

```bash
npx flowproof init
```
This automatically:
1. Detects your frontend framework and port (e.g. Next.js `3000`, Vite `5173`).
2. Generates `flowproof.config.ts` with recommended authentication strategies.
3. Scaffolds initial flow contracts in `flows/`.
4. Adds `artifacts/` to `.gitignore`.

---

## 🚀 Quick Start

### 1. Define a Flow Contract (`flows/employee.remote-request.create.yaml`)

```yaml
id: employee.remote-request.create
name: Employee Creates Remote Request
description: Employee submits a remote work request and verifies Pending status.
priority: critical
roles:
  - employee
tags:
  - remote-request

preconditions:
  - authenticated_as: employee
  - route: /remote-requests

steps:
  - id: step-open-modal
    action: click
    target: "button#btn-new-request"
    description: Open request modal

  - id: step-fill-reason
    action: fill
    target: "textarea#request-reason"
    value: "Focused sprint work from home"
    description: Enter request reason

  - id: step-select-date
    action: select_date
    target: "input#request-date"
    value: tomorrow
    description: Select tomorrow's date

  - id: step-submit
    action: click
    target: "button#btn-submit-request"
    description: Submit remote work request

assertions:
  - id: assert-modal-closed
    type: element_hidden
    target: "div#request-modal:not(.hidden)"

  - id: assert-request-visible
    type: text_contains
    target: "table#requests-table"
    value: "Focused sprint work from home"

  - id: assert-status-pending
    type: text_contains
    target: "table#requests-table .status-badge"
    value: "Pending"

evidence:
  checkpoints:
    - id: request-form
      trigger: after_step
      stepId: step-fill-reason
      screenshot: true

    - id: request-created
      trigger: after_assertion
      assertionId: assert-request-visible
      screenshot: true

    - id: request-pending
      trigger: after_assertion
      assertionId: assert-status-pending
      screenshot: true
```

### 2. Configure Project Adapter (`flowproof.config.ts`)

```typescript
import { defineConfig, PasswordAuthStrategy } from 'flowproof';

export default defineConfig({
  baseUrl: process.env.APP_BASE_URL || 'http://localhost:3000',
  defaultExecutor: 'playwright',
  auth: {
    employee: new PasswordAuthStrategy({
      loginUrl: '/login',
      usernameField: 'input#email',
      passwordField: 'input#password',
      submitField: 'button#btn-login',
      credentials: () => ({
        username: process.env.TEST_EMPLOYEE_EMAIL!,
        password: process.env.TEST_EMPLOYEE_PASSWORD!,
      }),
      validateSuccess: async (page) => {
        await page.waitForSelector('#dashboard-view:not(.hidden)');
      },
    }),
  },
  customActions: {
    select_date: async (page, step) => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      await page.fill(step.target!, tomorrow.toISOString().split('T')[0]);
    },
  },
});
```

### 3. Run Verification

```bash
# Verify a specific flow
flowproof verify --flow employee.remote-request.create

# Verify only flows affected by recent git changes
flowproof verify --affected

# Filter by priority
flowproof verify --priority critical

# Inspect run diagnostics & evidence
flowproof inspect exec-employee_remote-request_create-xxx
flowproof evidence exec-employee_remote-request_create-xxx
```

---

## 🛠️ Architecture

```text
Requirements & Specs
         ↓
  AI Flow Mapper  ───────►  Flow Definition Contract
                                   │
                                   ▼
                            FLOWPROOF CORE
                                   │
                        ┌──────────┴──────────┐
                        ▼                     ▼
                 Project Adapter      Evidence Manager
                        │                     │
                        ▼                     ▼
                 Browser Executor        Checkpoints
                 (Playwright / Aside)    (Screenshots / Traces)
                        │                     │
                        └──────────┬──────────┘
                                   │
                                   ▼
                        Normalized Result
                                   │
                                   ▼
                           AI Result Analysis
                                   │
                        ┌──────────┴──────────┐
                        ▼                     ▼
                   CLI Output          Mattermost Report
```

---

## 🧪 Testing

```bash
# Run unit & integration test suite
pnpm test

# Build package
pnpm build
```

---

## 📄 License

MIT
