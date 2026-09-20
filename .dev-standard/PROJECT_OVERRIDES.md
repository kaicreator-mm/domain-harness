# DomainHarness Project Overrides

## Repository profile

- Product: DomainHarness AI-native Domain State Machine Runtime.
- Version target: v0.3.
- Repository: `kaicreator-mm/domain-harness`.
- Version integration branch: `v0.3`; implementation task branches are created from the current dependency-complete validated `v0.3` head.
- Authority import baseline: `v0.3_l2_synthesis@fb793191c3b8fc827af54f88b0e06c2c52fef61d`.
- Project form: embedded portable TypeScript Runtime SDK + compiler + host bindings. XState is the single business control-flow foundation; DomainHarness does not introduce a peer Harness/agent runtime.
- Structure: Git monorepo. Portable runtime remains under `packages/domain-harness`; compiler and host-specific adapters remain workspace-separated where practical.

## Frozen authority

Authority order for v0.3 is:

1. Product authority: `docs/product/DomainHarness_v0.3_PRD_FROZEN.md` (Git blob `6a6fb59b156f576d48828019faf0e6039d08d5af`).
2. Architecture authority: `docs/architecture/DomainHarness_v0.3_L2_ARCHITECTURE_EVIDENCE_FROZEN.md` (Git blob `4a4755d1bb1f05a71ad0275cf12713f254335144`).
3. Task authority: `docs/implementation/DomainHarness_v0.3_TASK_DAG.md` plus task-specific acceptance / L3 evidence created from it.
4. Pinned development standard: `.dev-standard/VERSION` → `kaicreator-mm/ai-development-standard@0446f04583f6cf464c835f26e2f657c8b703cb4e` (`2.0.0`).

`docs/architecture/DomainHarness_v0.3_ARCHITECTURE_BASELINE_FROZEN.md` is a pre-L2 frozen input/history document. Where it differs from the final L2 synthesis, `DomainHarness_v0.3_L2_ARCHITECTURE_EVIDENCE_FROZEN.md` is authoritative.

The v0.1/v0.2 PRDs, L2 documents, task DAGs and closeout evidence remain historical baselines. v0.3 extends shipped v0.2 semantics and MUST NOT silently redefine v0.2 behavior except where the v0.3 frozen PRD/L2 explicitly does so.

Frozen v0.3 product scope and L2 architecture MUST NOT be reopened by implementation agents unless executable evidence demonstrates a genuine contradiction. Any such contradiction is reported explicitly before architecture/product changes are made.

## Project-specific hard boundaries

- XState Domain Machine is the single business control-state / event / guard / transition authority.
- `HarnessMachine` and promoted reusable workflows are invoked XState child machines/actors, not independent runtimes.
- Decision resolution order is `Rule → Exact Semantic Cache → Promoted Subworkflow → HarnessMachine`, allowing only the frozen deterministic semantic pre-read before cache lookup.
- Every resolver path returns structured decision/event data to current schema + synchronous guard + XState transition authority. LLM output never directly sets parent XState state ids.
- Exact semantic cache and execution journals are separate authorities. Cache reuse never proves message processing, transition, effect completion or mutation.
- Required declared semantic input/projection/revision missing is fail-closed; it is not hidden by cache bypass or LLM fallback.
- Running/recoverable instances retain exact target `packageId`; the global active package cannot substitute dependencies during recovery.
- Dynamically selected promoted children are resolved once per decision invocation and durably exact-pinned before journaled child work or state-changing terminal output.
- Promoted Artifact Registry is the sole durable owner/retention authority for promoted artifact bodies. Automatic LLM promotion, implicit latest/fuzzy selection and arbitrary generated executable code are prohibited.
- Business mutation remains behind DomainHarness durable effect identity/idempotency. Cache, Harness, registry and subworkflow execution have no mutation authority.
- Correctness-critical execution facts share one per-instance `DurableExecutionStore` durability/ordering domain: durable control-turn receipts, instance revision, recursive control snapshot, dynamic-child pins and AI/query/effect journals.
- Journal/effect commit precedes control advancement past committed work; snapshot-ahead-of-required-journal is fail-closed.
- Domain Facts remain authoritative outside DomainHarness. Compiled Domain Intelligence is content-addressed reusable domain cognition, not a generic knowledge/RAG/memory platform.
- Provider/model selection, provider execution, retry/fallback and provider strategy remain AI Runtime / ModelPort authority.
- Portable Runtime Core has no mandatory `node:*`, Node filesystem/process APIs or `better-sqlite3` dependency.
- Projection remains deterministic, declared-input-only, no external I/O/Tool/LLM, derived and non-authoritative.

## Canonical commands

Repository-root validation baseline:

```text
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm pack -w @kaicreator/domain-harness
```

Task-specific focused tests/validation may be narrower, but must not replace required exact-SHA validation for the concern.

## Validation execution profile

- Architecture/document review: GitHub exact-SHA evidence + frozen repository documents.
- Node host: real Node Build Host for final execution truth.
- Expo host: real React Native / Expo Android profile using Hermes + `expo-sqlite`; Node-only mocks are insufficient for cross-host durability claims.
- Portable digest/canonicalization, `DurableExecutionStore`, promoted-registry and semantic-cache logical contracts require shared conformance across supported Node/Expo adapters.
- Crash/restart claims require hard process termination on Node and force-stop/relaunch on Expo/Hermes at version closure.
- Dynamic-child recovery must prove exact retained definition pins; recovery must not re-resolve aliases or substitute the active package.
- Hidden Validation remains owner-held and separate from visible CI.

## CI profile

`minimal-per-task + version-closure-full`

- Task/PR CI proves the changed concern and low-cost regression on a clean checkout.
- Real device/emulator, hard-kill/force-stop recovery, cross-host durability matrices, long-running external-work journeys and Hidden Validation belong to exact-SHA Build Host / version closure unless a task explicitly requires them earlier.
- CI unavailability is recorded as `BLOCKED/WAIVED` evidence according to the pinned standard; it is never represented as PASS.
- CI PASS is not Validation PASS and PR PASS is not Release Qualification PASS.

## Branch / task execution protocol

- Version integration branch: `v0.3`.
- Task branch: `v0.3_tNNN` (one concern per branch/PR).
- Task PR base: `v0.3`, not `main`.
- A task starts only after every declared dependency is merged into `v0.3` and the exact dependency-complete base SHA is recorded.
- Parallel tasks MAY run concurrently only when their dependencies are complete; prefer branches from the same dependency-complete checkpoint.
- Each task stays within its declared concern/write set where practical. Central runtime wiring and shared export/barrel edits are deferred to integration tasks to reduce merge conflicts.
- Every high-risk implementation task follows task-specific L3 evidence order: `Tests → Contract/Interface → Core Implementation → Failure Handling → Reference`.
- `v0.3` merges to `main` only after integrated visible closure, Critical Journeys, required real-host validation, Hidden Validation and release qualification.

## Release gates

Release authority derives in order from Frozen v0.3 PRD → Frozen v0.3 L2 → this override → task-specific acceptance → pinned standard defaults.

The v0.3 release candidate must reconcile all PRD Acceptance Criteria 1–28, the frozen L2 ADR/invariants, exact-package/dynamic-child recovery, semantic-cache correctness, durable mutation authority, Node + Expo/Hermes termination/restart journeys, and owner-held Hidden Validation on one exact candidate SHA.

No v0.3 tag/release may be declared READY while a mandatory gate is FAIL/BLOCKED/NOT_RUN or an unresolved P0/P1 runtime correctness finding remains.
