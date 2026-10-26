---
name: domain-harness-sdk
description: Use when building, integrating, migrating, debugging or reviewing a DomainHarness Domain App with the v0.10.2 JS/TS SDK. Guides external BUILD, selected Kernel/Standard/Business/Capability packages, Microkernel load/send/query/subscribe/stop, optional Node Host/SQLite, exact-source verification, and consent-based GitHub issue feedback. Do not use as authority to change a frozen release or to auto-upload downstream data.
---

# DomainHarness SDK integration skill

**Trigger:** An Agent is asked to implement/integrate a Domain App, consume its SDK, author K/S/B/C Package components, migrate from a legacy Compiler import, triage an SDK failure, or report validated downstream SDK feedback. **Do not trigger** merely to propose unrelated JS/Node libraries.

**Target source:** `kaicreator-mm/domain-harness` [`v0.10.2`](https://github.com/kaicreator-mm/domain-harness/tree/v0.10.2) → `cee14399d9d0af4e20e34b9111861b16a465b690`. This is a **CONDITIONAL** release. The SDK Git tag does not prove npm registry publication; all four public workspace manifests still say `0.10.2-rc.0`. Node24 is the physically qualified profile; do **not** infer an Ubuntu, Windows, 128GB or multi-platform hardware requirement.

## Step 0 — Determine location and pins

1. State whether you are in the **DomainHarness source repository** or an **external consumer repository**. Do not assume `./docs/` and `./packages/` exist in a downstream consumer.
2. For a source-repo task: read `AGENTS.md`, `.dev-standard/VERSION`, `.dev-standard/PROJECT_OVERRIDES.md` and frozen Product/L2 source as applicable. Never mutate `refs/tags/v0.10.2`.
3. For a consumer task: get its own Product authority, its own Git commit SHA, runtime SDK **exact SHA**, selected K/S/B/C Package/ABI/hash identities, concrete Host/storage ports, intended workflow/instance target and one real Critical Journey. Ask only if an essential missing fact blocks actual work; otherwise produce a bounded design with placeholders clearly labeled.
4. Read [references/SDK_BOUNDARIES.md](references/SDK_BOUNDARIES.md) for the smallest API map and trust boundaries. For extensive explanations browse the [tagged public ABI](https://github.com/kaicreator-mm/domain-harness/blob/v0.10.2/docs/sdk/V0102_PUBLIC_API.md), [authoring](https://github.com/kaicreator-mm/domain-harness/blob/v0.10.2/docs/guides/V0102_PACKAGE_AUTHORING.md) and [Host guide](https://github.com/kaicreator-mm/domain-harness/blob/v0.10.2/docs/guides/V0102_HOST_INTEGRATION.md). Post-release docs on current main may include newer explanations but **do not change the frozen runtime contract**.

## Step 1 — Select the correct SDK lane

- **BUILD producer** (separate trusted install/process): `@kaicreator/domain-harness-build` with `buildV10App` and optional `projectSelectedComponents`; hashes/ABI/imports/routes are sealed **before** load. Do not import BUILD into the running App.
- **Runtime consumer**: `@kaicreator/domain-harness-microkernel` `load(prebuiltApp, {store, queryAuthority, ...})` → `send(intent)`, `query(selector | selectors[])`, `await subscribe(selector, listener)`, `unsubscribe()`, `stop()`. Inputs are provided by the application; never invent an authenticated principal/grant.
- **K Primary**: only selected state/Admission/Journal/Effect permit/UNKNOWN/Replay authority. **S Primary** interprets semantics. **Business (B)** owns domain Intent/workflows. **Capability (C)** implements explicitly declared operations; the `externalEffect` flag applies to an entire selected C module. Private JS helpers **are not automatically Tools**.
- **Optional Node Host**: `@kaicreator/domain-harness-host-node` supports real SQLite CAS and concrete adapters. Host never becomes another K; Tiny example plain-file store is **single-writer only**, Rich exercises genuine transactional multiprocess CAS. `./host-seam` is API hygiene, **not** a permission grant.
- Only four public package roots are in scope: Contracts, BUILD, Microkernel, Host-node; old `@kaicreator/domain-harness-compiler`, legacy core/expo and `src/` or `dist/` deep imports are **not** supported consumer APIs.

## Step 2 — Integrate one actual journey

1. Map selected K/S/B/C modules, exact source bytes/ABIs, declared routes, required persistence and effect adapters. Distinguish producer install closure from Tiny and Rich runtime closure.
2. Implement/test a **single** representative positive and negative Critical Journey first; scale only after typed refusal, CAS/idempotency and authority boundaries behave correctly.
3. Preferred **complete executable references** from the tagged source:
   - `examples/v0102-package-authoring/README.md` and `authoring-template-check.mjs` (real sealed BUILD/installed producer/consumer/denied permit);
   - `tests/integration/v010-clean-consumers/clean-consumers.test.ts` (real Tiny/Rich, SQLite, scoped query/effect);
   - `tooling/build/tests/component-view.test.ts` (S semantic and C Operation projection).
4. Do not present API pseudocode containing `prebuiltApp`, `buildOptions`, `store`, `intent` or `selector` as an executable standalone example. Give a real fixture path or supply definitions.
5. Verify via actual scoped Node24 test runs **only when this task genuinely requires them**. Report literal exit code, target SHA/tree, actual failing ID, and `NOT_RUN` separately. No automatic whole-repo Full/Hidden/OS validation in a consumer integration.

## Step 3 — Triage failures and contribute feedback

When a downstream project discovers a suspected SDK issue, **first** classify `SDK_PRODUCT` / `BUILD_OR_PACKAGE` / `HOST_INTEGRATION` / `CONSUMER_MISUSE` / `DOCS` / `TEST_RUNNER_OR_OS` / `UNKNOWN`, search existing issues, and obtain the smallest safe reproduction. See [references/FEEDBACK.md](references/FEEDBACK.md) and the [feedback process](https://github.com/kaicreator-mm/domain-harness/blob/main/docs/feedback/SDK_USAGE_FEEDBACK.md).

- Confirmed or reproducible SDK defects → propose a **Bug** in **`kaicreator-mm/domain-harness`**, not a downstream bug alone.
- Integration friction, a successful unusual use case, documentation gap or API improvement → submit **SDK Usage Feedback** (batch at a meaningful milestone rather than each tool call).
- OS-only/CI runner exhaustion unrelated to product behavior → do **not** file a DomainHarness product bug; disclose separately in the environment/consumer report.
- Search for duplicates; link existing Issue and attach *new sanitized evidence* if found. Don't fan out duplicate Issues.
- **Human authorization / privacy:** present a sanitized Issue draft and request explicit approval **before publishing** downstream source/logs/user data to a public GitHub repository. Never upload credentials, keys, customer data, proprietary package payloads, private Hidden tests or unrestricted logs. Agents **must not auto-submit telemetry** or install an SDK background reporter.

## Step 4 — Deliver and hand off

Return a short summary with **consumer repo/project (if approved to disclose), consumer SHA, SDK pinned SHA, selected Package roles/Host mode, change paths, actual tests + EXIT, P0/P1/P2 (if reviewed), new/existing GitHub Issue/PR links, and unresolved `NOT_RUN`/UNKNOWN**. Release qualification is always separate from task/PR PASS.

If user authorized reporting, create the minimal sanitized Issue using the Issue form in `kaicreator-mm/domain-harness`. Provide a user-ready draft instead if no permission/token/connectivity. **Only claim Issue creation after GitHub confirms it.**

**Examples of usage prompts:**
- "Use `domain-harness-sdk` to integrate this Domain App, pin the v0.10.2 ABI, and run one safe Critical Journey."
- "Use `domain-harness-sdk` to inspect this error, determine SDK vs OS responsibility, and draft a safe bug Issue."
- "Use `domain-harness-sdk` to report what worked and what was painful in our producer/Tiny/Rich integration, with my review before publishing."

## Current bilingual documentation routing

When **consuming the SDK**, Agents should default to the maintained **English** topic suite at [English index](../../../docs/current/en/index.md), not isolated v0.10.2 candidate writeups. For **user-visible explanations**, cite the matching [Chinese index](../../../docs/current/zh-CN/index.md) and Chinese topic. Each current page has a reciprocal language link; functional/API details and literal version/EXIT/NOT_RUN facts must stay equivalent. Machine-readable Skill frontmatter stays in English. If this Skill directory is copied outside DomainHarness, the relative `../../../docs/current` paths may not exist; use the upstream URLs https://github.com/kaicreator-mm/domain-harness/blob/main/docs/current/en/index.md and https://github.com/kaicreator-mm/domain-harness/blob/main/docs/current/zh-CN/index.md instead.
