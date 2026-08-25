# Contributing to Flowproof 🌊🛡️

Thank you for your interest in contributing to **Flowproof**! Flowproof is built to give engineering teams high-confidence user flow verification with visual evidence and AI diagnostics.

We welcome contributions of all kinds: bug reports, new executors, auth strategies, AI mappers, framework templates, and documentation improvements!

---

## 🧭 Development Setup

### 1. Prerequisites
- **Node.js**: >= 18.0.0 (or `mise` / `nvm`)
- **pnpm**: >= 9.0.0
- **Google Chrome** or Playwright browsers installed

### 2. Clone and Install

```bash
git clone https://github.com/egagofur/flowproof.git
cd flowproof
pnpm install
npx playwright install chromium
```

### 3. Build & Test

```bash
# Build the TypeScript project
pnpm build

# Run unit & integration tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Link locally for testing in other projects
npm link
```

---

## 🧱 Architecture Overview

Flowproof follows a clean modular architecture:
- `src/core`: Contracts, Schemas (Zod), Execution Context, Artifact Store, Evidence Manager, and Flow Orchestrator.
- `src/executors`: Pluggable execution engines (`PlaywrightExecutor`, `AsideExecutor`, `HybridExecutor`).
- `src/adapter`: Framework detectors, dynamic config loaders, and auth strategies (`InteractiveBrowserAuthStrategy`, `SessionAuth`, etc.).
- `src/ai`:
  - `recorder`: Interactive in-browser action recording and YAML synthesis (`flowproof record`).
  - `mapper`: Automatic route/component to flow contract discovery (`flowproof discover`).
  - `analyzer`: AI diagnostic classifier (app regression vs stale selector vs auth failure).
  - `stale`: UI drift detection and patch generation.
  - `impact`: Git diff change impact analysis (`flowproof verify --affected`).
- `src/cli`: Commander-based CLI commands (`init`, `record`, `verify`, `discover`, `flows`, `inspect`, `evidence`, `prune`).

---

## 🌿 How to Submit a Pull Request

1. **Fork** the repository on GitHub: `https://github.com/egagofur/flowproof`.
2. Create a feature branch: `git checkout -b feat/my-awesome-feature`.
3. Ensure all tests pass and code compiles: `pnpm build && pnpm test`.
4. Commit your changes with clear conventional commit messages: `feat: add support for SvelteKit detector`.
5. Push to your fork and submit a Pull Request against `main`.

---

## 💬 Community & Questions

- **Issues & Bug Reports**: [GitHub Issues](https://github.com/egagofur/flowproof/issues)
- **Discussions**: [GitHub Discussions](https://github.com/egagofur/flowproof/discussions)

Thank you for helping make E2E verification delightful and proof-driven for developers worldwide! 💙
