<div align="center">

# 🌊🛡️ Flowproof

### **AI-Driven E2E Verification & Interactive Browser Flow Orchestrator**

> **"Don't just test the code. Prove the user flow."**

[![CI Status](https://github.com/egagofur/flowproof/actions/workflows/ci.yml/badge.svg)](https://github.com/egagofur/flowproof/actions)
[![NPM Version](https://img.shields.io/npm/v/@egagofur/flowproof.svg?style=flat&color=blue)](https://www.npmjs.com/package/@egagofur/flowproof)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-100%25-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Playwright](https://img.shields.io/badge/Playwright-Supported-2EAD33.svg?logo=playwright&logoColor=white)](https://playwright.dev/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

<p align="center">
  <a href="#-key-features">Key Features</a> •
  <a href="#-quick-start-in-60-seconds">Quick Start</a> •
  <a href="#-interactive-recording-flowproof-record">Interactive Recording</a> •
  <a href="#-executors-playwright-aside--hybrid">Executors</a> •
  <a href="#-declarative-flow-contract">Flow Contract</a> •
  <a href="#-ai-diagnostic-engine">AI Diagnostics</a> •
  <a href="#-ci-cd-integration">CI/CD</a> •
  <a href="#-contributing">Contributing</a>
</p>

</div>

---

## 💡 What is Flowproof?

Modern web applications are complex, and traditional E2E tests are notoriously **brittle, time-consuming to write, and hard to maintain** when CSS classes or UI frameworks change.

**Flowproof** re-imagines end-to-end testing as a **declarative, proof-driven verification system**. Instead of maintaining brittle test scripts with hardcoded selectors, Flowproof lets you:
1. 🔴 **Record User Flows Visually (`flowproof record`)**: Click and fill forms directly in your real browser; Flowproof automatically captures smart semantic selectors, network mutations, and generates clean YAML contracts.
2. 🤖 **Execute with Multiple Engines**: Choose fast deterministic **Playwright**, resilient **Aside AI Agent**, or **Hybrid Mode** with automatic self-healing fallback.
3. 🔐 **Authenticate Once (`InteractiveBrowserAuth`)**: Log in manually once through Google OAuth, SSO, or MFA; Flowproof securely persists your session for all future automated runs.
4. 📷 **Produce Audit-Ready Evidence**: Collect visual screenshot proofs at defined checkpoints, Playwright traces (`trace.zip`), and structured Markdown summaries.
5. 🧠 **AI Root-Cause Diagnosis (`flowproof inspect`)**: Automatically analyze why a test failed, pinpointing whether it was an **application regression**, **stale selector**, or **environment blip**.

---

## 🌟 Key Features

| Feature | Description |
| :--- | :--- |
| 🔴 **Interactive Flow Recorder** | Just browse and interact with your app; Flowproof synthesizes full YAML contracts automatically. |
| ⚡ **Playwright Engine** | Blazing-fast, deterministic execution for continuous integration and regression testing. |
| 🧠 **Aside AI Agentic Engine** | Natural language, goal-oriented browser automation that doesn't break when CSS selectors change. |
| 🔄 **Hybrid Self-Healing Mode** | Runs Playwright first; if a selector drifts, automatically falls back to Aside to verify if the business intent still works. |
| 🔐 **Interactive Universal Auth** | Built-in stealth Chrome mode that bypasses bot detection for Google OAuth, MFA, and SSO logins. |
| 📸 **First-Class Evidence Proof** | Captures screenshot checkpoints, traces, and execution timelines in organized artifact directories. |
| 🧭 **Automatic Route Discovery** | `flowproof discover` scans Next.js, Vite, React, and Vue routes to scaffold candidate flow contracts. |
| 🎯 **Change Impact Analysis** | `flowproof verify --affected` reads Git diffs to run only flows impacted by recent code changes. |
| 💬 **Mattermost & Chat Reporting** | Instant formatted markdown summaries ready for Mattermost, Slack, or PR comments. |

---

## 🚀 Quick Start in 60 Seconds

### 1. Installation

Install Flowproof globally or as a dev dependency in your project:

```bash
# Global CLI installation via GitHub (or NPM):
npm install -g github:egagofur/flowproof
# or via NPM:
npm install -g @egagofur/flowproof

# Or install as dev dependency in your project:
pnpm add -D github:egagofur/flowproof playwright
npx playwright install chromium
```

---

### 2. Initialize in Any Web Application

Run `flowproof init` in your project root (Next.js, Vite, React, Vue, Svelte, or Remix):

```bash
flowproof init
```

This automatically:
- Detects your framework and local dev port (e.g. Next.js `3000`, Vite `5173`).
- Generates `flowproof.config.ts` with recommended authentication strategies.
- Creates the `./flows` directory for declarative contracts.
- Configures `./artifacts` in `.gitignore`.

---

### 3. Record a User Flow Interactively (`flowproof record`)

No need to write YAML by hand! Simply start the interactive recorder:

```bash
flowproof record --flow app.user.create-item --url /dashboard/items/create
```

1. A real browser opens with your active session.
2. Fill the inputs, select dropdowns, pick dates, and click **Submit**.
3. Click the floating **`Finish & Save YAML`** button in the browser.
4. Flowproof instantly generates `./flows/app-user-create-item.yaml`!

---

### 4. Verify & Prove the User Flow

Run the verification orchestrator:

```bash
# Run with Aside Agentic Executor:
flowproof verify --flow app.user.create-item --executor aside

# Or run with fast Playwright:
flowproof verify --flow app.user.create-item --executor playwright

# Or run in Self-Healing Hybrid Mode:
flowproof verify --flow app.user.create-item --executor hybrid
```

---

## 🖥️ Interactive Recording (`flowproof record`)

The **Flowproof Recorder** watches real user interactions, extracts smart accessibility selectors, and outputs clean declarative YAML:

```text
┌────────────────────────────────────────────────────────────┐
│                    FLOWPROOF RECORDER                      │
│                                                            │
│ 1. Run: flowproof record --url /checkout                   │
│ 2. Real browser opens with your authenticated session      │
│ 3. You click items, fill inputs, and submit                │
│ 4. Click [Finish & Save YAML] on floating in-browser HUD   │
│ 5. Clean YAML contract is saved to ./flows/*.yaml          │
└────────────────────────────────────────────────────────────┘
```

---

## 🤖 Executors: Playwright, Aside & Hybrid

Flowproof decouples the **what** (flow contract) from the **how** (browser executor):

```
                       [ Flow Definition (YAML) ]
                                   │
                                   ▼
                       [ Flow Orchestrator ]
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         ▼                         ▼                         ▼
  [ Playwright ]              [ Aside AI ]              [ Hybrid ]
  Fast, deterministic       Adaptive, goal-based      Playwright speed +
  E2E for CI pipelines      resilient to UI drift     Aside self-healing
```

* **Playwright (`--executor playwright`)**: Highly optimized for deterministic assertions and maximum speed.
* **Aside (`--executor aside`)**: Evaluates semantic intent (e.g. *"Click Yes Continue button"* or *"Select active fiscal year"*), navigating complex UI libraries (Ant Design, Radix, Tailwind Headless UI) without brittle CSS selectors.
* **Hybrid (`--executor hybrid`)**: Runs Playwright; if a selector changed due to UI refactoring, Aside kicks in to diagnose if the user flow still succeeds.

---

## 📄 Declarative Flow Contract

Flow contracts are clean, human-readable YAML documents stored in `./flows/`:

```yaml
id: erp.master-data.create-fiscal-year
name: "[AUTOMATION] Master Data: Create & Save Fiscal Year"
description: Navigates to Master Data, selects Year, Position, District, Period Type, and submits.
priority: critical
roles:
  - user
tags:
  - master-data
  - enterprise
  - forms

preconditions:
  - authenticated_as: user
    route: /master-data/fiscal-years/create

steps:
  - id: step-navigate
    action: navigate
    target: /master-data/fiscal-years/create
    description: Open Create Fiscal Year form

  - id: step-select-year
    action: select
    target: '.ant-form-item:has-text("Year") .ant-select'
    value: "2027"
    description: Select Year (2027)

  - id: step-select-position
    action: select
    target: '.ant-form-item:has-text("Position") .ant-select'
    value: "Unfinal"
    description: Select Position (Unfinal)

  - id: step-fill-open-date
    action: fill
    target: 'input#open_date, input[placeholder="Select Open Date"]'
    value: "2027-01-01"
    description: Fill Open Date

  - id: step-click-submit
    action: click
    target: 'button:has-text("Submit"), button[type="submit"]'
    description: Click Submit button to persist data

assertions:
  - id: assert-submission-completed
    type: element_visible
    target: body
    description: Form submission completed and redirected

evidence:
  checkpoints:
    - id: form-filled-proof
      trigger: after_step
      stepId: step-fill-open-date
      screenshot: true
      description: "[PROOF] All required fields filled"

    - id: final-submission-proof
      trigger: after_step
      stepId: step-click-submit
      screenshot: true
      description: "[PROOF] Form submitted and response received"
```

---

## 🧠 AI Diagnostic Engine

When a flow fails, Flowproof doesn't just output a stack trace. The **AI Diagnostic Engine** classifies the failure into 4 actionable root causes:

1. **`application_regression`**: The flow failed because the application logic broke.
2. **`stale_selector`**: The UI still works, but a CSS class or button label changed (Flowproof proposes a YAML patch!).
3. **`auth_failure`**: Session expired or login credentials invalid.
4. **`environment_issue`**: Target backend/server unreachable or timed out.

Inspect any execution:

```bash
flowproof inspect <executionId>
```

```text
AI Diagnostic Analysis:
  Classification: stale_selector (Confidence: 88%)
  Summary:        Button 'Submit' was renamed to 'Save & Continue'.
  Proposed Patch: Update target from 'button:has-text("Submit")' to 'button:has-text("Save & Continue")'
```

---

## 🔐 Universal Authentication Strategies

Flowproof comes with built-in strategies for every auth mechanism:

```typescript
import { defineConfig, InteractiveBrowserAuthStrategy } from 'flowproof';

export default defineConfig({
  baseUrl: process.env.APP_BASE_URL || 'https://app.example.com',
  defaultExecutor: 'aside',
  auth: {
    // Interactive Auth with Google OAuth stealth support
    user: new InteractiveBrowserAuthStrategy({
      storageStatePath: './.auth/user-storage-state.json',
      loginUrl: 'https://app.example.com/auth/login',
      timeoutMs: 180000,
    }),
  },
});
```

---

## 📊 CI/CD Integration

### GitHub Actions Workflow

Add `.github/workflows/flowproof.yml` to your repository:

```yaml
name: E2E Flowproof Verification

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  verify:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install dependencies
        run: npm install -g flowproof && npx playwright install chromium

      - name: Verify Impacted Flows
        run: flowproof verify --affected --executor playwright

      - name: Upload Visual Evidence Artifacts
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: flowproof-evidence
          path: artifacts/
```

---

## 🛠️ CLI Command Reference

| Command | Description |
| :--- | :--- |
| `flowproof init` | Initialize Flowproof with auto-detected configuration and templates. |
| `flowproof record [options]` | Interactively record browser interactions and output clean YAML contracts. |
| `flowproof verify [options]` | Execute verification for registered flows and generate visual proof evidence. |
| `flowproof discover` | Discover candidate flows from frontend routes and source files. |
| `flowproof flows` | List registered flows, priority levels, roles, and tags. |
| `flowproof inspect <id>` | Inspect AI diagnostic analysis and root cause classifications. |
| `flowproof evidence <id>` | List and inspect visual screenshots and Playwright traces. |
| `flowproof prune` | Clean up old execution runs according to the retention policy. |

---

## 🤝 Contributing

We love contributions! Please read our [CONTRIBUTING.md](CONTRIBUTING.md) to learn how to set up the development environment, run tests, and submit Pull Requests.

---

## 📄 License

Flowproof is open-source software licensed under the **[MIT License](LICENSE)**.

---

<div align="center">
  <sub>Built with ❤️ by <a href="https://github.com/egagofur">Ega Gofur</a> & the open-source community.</sub>
</div>
