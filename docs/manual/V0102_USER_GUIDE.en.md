# DomainHarness v0.10.2 — User Guide (English)

**Released source:** [v0.10.2 Git tag](https://github.com/kaicreator-mm/domain-harness/tree/v0.10.2), pinned to `cee14399d9d0af4e20e34b9111861b16a465b690`. Release Qualification was **CONDITIONAL**; consult [release status](../release/V0102_RELEASE_STATUS.md).

## What it is

A minimal runtime SDK for a **trusted prebuilt Domain App** assembled from selected K/S/B/C Domain Packages. External BUILD seals modules, hashes, roles, dependency closure and routes. The runtime **loads** that output; it does not compile, discover or download packages.

- **Microkernel** loads, binds and disposes. Its public facade has `send`, `query`, `subscribe` and `stop`.
- **Kernel Primary (K)** owns Admission, durable State/Journal, Effect permission, Replay and UNKNOWN.
- **Standard (S)** interprets selected semantics and workflows; **Business (B)** owns domain policy; **Capability (C)** provides explicitly declared operations.
- **Node Host** optionally supplies physical CAS/SQLite/resources; never replaces K's authority. SQLite is not a universal Microkernel dependency.

[Architecture diagrams](../architecture/V0102_RUNTIME_DIAGRAMS.md) clarify the flow and boundaries.

## Prerequisites and reproducible examples

Use Node **24**, the physically qualified version line; no OS brand or 128GB host is required by the product. Check out the exact Git tag and run from the monorepo root:

~~~sh
node --version
npm ci
npm run build
node examples/v0102-package-authoring/projection-smoke.mjs
node --import tsx --test tests/integration/v010-clean-consumers/clean-consumers.test.ts
~~~

These are **recipes**, not newly executed test receipts. Workspaces remain at manifest version `0.10.2-rc.0`: the Git tag does **not** prove npm registry publication. For isolated, clean-installed producer/consumer code use [external producer](../../examples/v0102-external-producer/README.md) and [authoring template](../../examples/v0102-package-authoring/README.md).

## Two separate processes

**Producer only:**

~~~ts
import { buildV10App } from '@kaicreator/domain-harness-build';
const prebuiltApp = buildV10App(buildOptions);
~~~

**Runtime only:**

~~~ts
import { load } from '@kaicreator/domain-harness-microkernel';
const runtime = await load(prebuiltApp, { store, queryAuthority });
try {
  await runtime.send(intent);
  await runtime.query(selector);
  const subscription = await runtime.subscribe(selector, event => observe(event));
  subscription.unsubscribe();
} finally {
  runtime.stop();
}
~~~

The italicized code **does not define your application inputs**. Supply trusted `buildOptions`, sealed App artifact, `V10DocStore`, scoped authority and typed selectors yourself. Do not copy this illustration as a standalone executable. See [API reference](V0102_API_CHEATSHEET.md).

## Tiny vs Rich

Tiny is for single-process minimal apps (the example file store is **single-writer only**). Rich opts in to `@kaicreator/domain-harness-host-node` and a native SQLite driver for real transaction-backed CAS across processes; this does not require SQLite in every Domain App. Never import private legacy Compiler or `src/`/`dist/` paths.

**Release qualification:** 8 P0 and 2 required P1 product domains accepted, Hidden 7/7 PASS. Full `npm test EXIT1`, root `NOT_RUN` due host-resource exhaustion: a narrowly approved exception applies only to this exact source SHA; no implicit PASS or future-version waiver. [FAQ](V0102_TROUBLESHOOTING.md) and [Agent guide](../agents/V0102_PLAYBOOK.md) cover diagnostics and safe automation.
## Feedback, bugs and lessons from real SDK use

While integrating another project, report **reproducible SDK defects** and **valuable positive/negative adoption lessons** through the [SDK feedback and GitHub Issue guide](../feedback/SDK_USAGE_FEEDBACK.md). Search duplicates, include exact SDK SHA, impacted public API, minimal sanitized reproduction and true test EXIT/NOT_RUN. Separate SDK product behavior from consumer configuration or OS resource failures. Coding Agents may **draft** the Issue, but must obtain your explicit approval before publishing any downstream material; no SDK usage is uploaded automatically. The [installable Agent Skill](../agents/V0102_SDK_SKILL_INSTALL.md) includes this reporting workflow.
