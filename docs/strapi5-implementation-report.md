# Intentproof Strapi 5 Implementation Report

## Commit or working tree
- Branch: `main`
- Commit: base commit `aebe689`; implementation is currently uncommitted
- Uncommitted files: contracts, Playwright executor/actions/assertions, orchestration/config/auth, recorder, CLI/exports, Strapi adapter and fixtures, tests, README, lockfile, and this report (see `git status --short` for the authoritative list)

## Implemented
- Backward-compatible structured semantic locators for role/name/exact, label, test ID, text, placeholder, and explicit selector targets, resolved through one Playwright locator module.
- Strapi-compatible `select_option`, `select_relation`, `remove_relation`, `toggle`, `upload_file`, and `fill_tiptap` actions. Portaled listbox options are resolved from the page and selection completion is observed before the next step.
- Configurable page/console/HTTP/request/dialog/visible-danger-notification error policy with safe glob or regular-expression allowlists.
- Automatic best-effort failure screenshots, page HTML, accessibility snapshot, trace, and logs before browser cleanup, with artifact warnings for partial capture failure.
- Runtime interpolation with unique `runId`, safe current date/time values, explicit `env.*` lookup, project fixture values, early missing-variable errors, and secret redaction integration.
- Suite lifecycle (`beforeAll`, per-flow hooks, `afterAll` in `finally`) and per-flow cleanup registration.
- Role-scoped password-auth memory cache and optional validated disk storage-state cache.
- Deterministic Strapi schema discovery, normalized manifest, generated draft flows, cycle detection, capability/unsupported reporting, and synthetic fixtures.
- Recorder output now prefers semantic targets, recognizes custom combobox option clicks, and emits a meaningful route check or an explicit TODO completion assertion instead of body-only proof.
- Playwright upgraded from `1.49.1` to `1.62.1` without unrelated dependency upgrades.

## Public API and YAML changes
- Existing string `target` selectors and existing YAML remain valid.
- `target` additionally accepts exactly one structured form: `{ role, name?, exact? }`, `{ label, exact? }`, `{ testId }`, `{ text, exact? }`, `{ placeholder, exact? }`, or `{ selector }`.
- Flow root adds optional `variables`; all values and safe target strings support `${name}` interpolation. Environment lookup requires `${env.NAME}`.
- New actions: `select_option`, `select_relation`, `remove_relation`, `toggle`, `upload_file`, and `fill_tiptap`.
- `ExecutionOptions` adds `errorPolicy` and `screenshotMaskTargets`; `ProjectConfig` adds `variables`; hook callbacks receive an additive lifecycle argument.
- Result contracts add policy violations, artifact warnings, page HTML, and accessibility artifact paths.
- New public exports include interpolation, locator/policy utilities, and the Strapi adapter/generator.

## Strapi generator command
```bash
intentproof generate --adapter strapi --dir . --output-dir flows/strapi
```

Use `--dry-run` to report without writing and `--json` for a machine-readable report. The default output is `flows/strapi`, including `manifest.json`.

## Generated config expected by the CMS
```ts
import { defineConfig, PasswordAuthStrategy } from 'intentproof';

export default defineConfig({
  baseUrl: process.env.STRAPI_ADMIN_URL ?? 'http://localhost:1337',
  flowsDir: 'flows',
  artifactsDir: 'artifacts',
  defaultExecutor: 'playwright',
  options: {
    browser: 'chromium',
    recordTrace: true,
    errorPolicy: {
      failOnPageError: true,
      failOnConsoleError: true,
      failOnHttp5xx: true,
      failOnHttp4xx: false,
      failOnRequestFailed: false,
      failOnDangerNotification: true,
      failOnUnexpectedDialog: true,
      ignoredConsolePatterns: [],
      ignoredRequestPatterns: [],
    },
    screenshotMaskTargets: [],
  },
  variables: (flow) => ({
    // Add deterministic, project-owned fixture values selected by flow tags/ID.
  }),
  auth: {
    'strapi-admin': new PasswordAuthStrategy({
      loginUrl: '/admin/auth/login',
      storageStatePath: '.auth/strapi-{role}.storage-state.json',
      credentials: () => ({
        username: process.env.STRAPI_ADMIN_EMAIL!,
        password: process.env.STRAPI_ADMIN_PASSWORD!,
      }),
      validateSuccess: async (page) => {
        await page.getByRole('navigation').waitFor({ state: 'visible' });
      },
    }),
  },
  customActions: {
    // Map generated strapi.todo.* draft handlers or replace drafts with hand-authored steps.
  },
  customAssertions: {
    // Implement strapi.todo.verify-content-state for generated drafts.
  },
});
```

## Supported Strapi fields
- The manifest deterministically discovers and reports scalar, date/time, enumeration, boolean, JSON, numeric, UID, password/email, media, custom-field, dynamic-zone, component, repeatable-component, and relation metadata found in Strapi schema JSON.
- Relations preserve cardinality/type and target UID, including nested component relations.
- Components are recursively expanded with cycle markers instead of infinite recursion.
- Generated tags identify collection/single, localization, Draft & Publish, media, component, repeatable component, custom field, and relation capabilities.
- Runtime primitives can hand-author reliable text/input, custom combobox, relation, boolean, upload, date, and TipTap interactions.

## Unsupported or manual fields
- Generated drafts intentionally do not guess safe values or UI routes for project-specific custom fields, dynamic zones, media-library policy, component add/remove UX, relation fixtures, or destructive cleanup. These are emitted as explicit `strapi.todo.*` custom actions/assertions and listed in the report.
- Custom TipTap fields can use `fill_tiptap`, but generated schema metadata cannot infer every custom-field toolbar/validation contract.
- Collection create/update/delete and single capture/edit/restore are draft handler boundaries until the CMS supplies fixture policy and ownership-safe cleanup.
- Component cycles are reported and truncated at the cycle edge.

## Error and evidence behavior
- Defaults fail on uncaught page errors, console errors, HTTP 500+, visible semantic danger notifications, and unexpected dialogs. HTTP 4xx and failed requests are recorded but only fail when enabled.
- Ignore patterns are anchored globs or `/regex/flags` (`i`/`m` only); no arbitrary code is evaluated.
- Dialogs are captured and dismissed so alert/confirm/prompt cannot hang execution.
- Failed/blocked live-browser runs attempt `evidence/failure.png`, `evidence/failure-full-page.png`, `evidence/page.html`, `evidence/accessibility.json`, `trace/trace.zip`, `logs/console.log`, `logs/network.log`, `result.json`, and `summary.md`.
- Password inputs are masked by default; configured semantic mask targets are additive. Registered secret variables and sensitive environment values are redacted from textual artifacts/results.
- Capture failures are `artifactWarnings`; the original application/step/assertion error remains primary.

## Authentication and lifecycle behavior
- `verify` invokes `beforeAll` once, then orchestrator `beforeFlow`/`afterFlow` for each selected flow, and `afterAll` once in a `finally` path, including thrown flow/setup paths.
- `beforeFlow` receives `registerCleanup`; cleanups execute in reverse registration order after executor cleanup and `afterFlow`, including failed flows.
- `PasswordAuthStrategy` caches successful credentials in memory by role. Optional `storageStatePath` loads state across processes; `validateSuccess` verifies disk state and stale state is refreshed through login.
- Existing password configuration without a cache path and existing interactive/session strategies remain valid.
- `.auth/`, `auth-state/`, and `*.storage-state.json` are ignored and must not be committed.

## Verification results
- `pnpm test`: passed — 20 test files, 64 tests
- `pnpm typecheck`: passed
- `pnpm build`: passed (ESM and declaration output)
- Browser tests: passed — portaled Design System combobox, console/page/HTTP 500 policy failure, automatic screenshots/HTML/accessibility/trace/log artifacts, and observable partial screenshot-capture warnings; generator determinism passed in `tests/adapter/strapi-generator.test.ts`

## Self-audit findings and fixes
- Preserved old string-selector YAML and made root `variables` optional in the public TypeScript contract despite Zod defaulting it at load time.
- Removed duplicated Playwright target resolution and propagated structured targets to Aside assertions, doctor checks, recorder, summaries, and stale-selector handling.
- Tightened relation/combobox completion to wait for the selected portaled option to become hidden before Save can follow.
- Moved policy evaluation and failure capture before trace stop/context cleanup; added catastrophic executor capture before orchestrator cleanup.
- Made empty console/network logs persist so expected failure artifact paths are stable.
- Added default password screenshot masking and textual artifact secret redaction.
- Kept generator ordering stable and excluded timestamps from generated files.
- Added `afterAll` `finally` behavior and failed-flow cleanup tests.
- Replaced recorder framework CSS preferences and body-only completion proof.

## Remaining risks
- Strapi versions/plugins can expose accessible names differently; CMS integration must validate labels/test IDs and use configured danger-notification fallbacks only where semantic roles are absent.
- A browser that crashes completely may make screenshot/DOM capture impossible; this is reported as an artifact warning and trace availability depends on whether Playwright can still stop tracing.
- Disk auth state without `validateSuccess` is trusted for backward compatibility; CMS configuration should always provide validation.
- Generated drafts are not executable coverage until the CMS implements or replaces every reported `strapi.todo.*` handler.
- Screenshot pixels cannot be text-redacted; sensitive non-password UI must be included in `screenshotMaskTargets` by the CMS.

## Exact CMS integration steps
1. Install/use this Intentproof working tree or its eventual commit and run `pnpm exec playwright install chromium` for Playwright `1.62.1` in the execution environment.
2. Add the configuration above with CMS URL and credentials supplied only through environment variables; keep `.auth` and artifacts uncommitted.
3. Run `intentproof generate --adapter strapi --dir . --output-dir flows/strapi --json` from the CMS root and review the generated report before claiming coverage.
4. Implement project-owned fixture values and every listed `strapi.todo.*` action/assertion, or replace those boundaries with hand-authored semantic steps.
5. Prefer role/name, label, and existing test IDs; add CMS accessibility/test IDs only where the real UI has no stable semantic address.
6. Seed relation fixtures before flows and register reverse-order cleanup with `lifecycle.registerCleanup` so failed flows do not leak content.
7. Validate storage-state reuse with `validateSuccess`, then run one collection and one single-type flow headed before scaling to all generated drafts.
8. Tune ignore patterns narrowly from recorded evidence; never globally ignore Strapi API 500 responses.
9. Run the generated suite in Chromium and archive the per-execution artifact directory in CI.
