# DomainHarness Project Overrides

## Repository profile

- Product: DomainHarness Portable Interactive Domain Runtime
- Version target: v0.2
- Repository: `kaicreator-mm/domain-harness`
- Integration branch: `v0.2`; implementation task branches are created from the current validated `v0.2` head after all declared dependencies are merged.
- Project form: embedded portable TypeScript Runtime SDK + build-time compiler + host bindings; no server or generic admin UI.
- Structure: Git monorepo. Primary portable SDK remains `packages/domain-harness`; compiler and host-specific adapters are separate workspace packages per frozen v0.2 L2.

## Frozen authority

- Product authority: `docs/product/DomainHarness_v0.2_PRD_FROZEN.md`, SHA-256 `e95534773b0879a7e4892ba995ca90928d6029730f0de1e70c2915aa56679d9b`. Imported byte-for-byte from frozen R4; MUST NOT be reformatted or rewritten.
- Architecture authority: `docs/architecture/DomainHarness_v0.2_L2_ARCHITECTURE_EVIDENCE.md`, as amended by `docs/architecture/DomainHarness_v0.2_L2_AMENDMENT_A2_RUNTIME_ENGINE.md` for the shipped v0.2 Runtime-engine reconciliation in Issue #153.
- Task authority: `docs/implementation/DomainHarness_v0.2_TASK_DAG.md` plus `docs/implementation/v0.2/task-packs/` and `TASK_PACKS.json`.
- v0.1 remains a historical frozen baseline; v0.2 does not retroactively redefine v0.1 behavior.
- Frozen product scope and frozen v0.2 architecture MUST NOT be reopened by implementation agents unless a documented architecture contradiction is found.

## Project-specific hard boundaries

- Runtime Core is platform-independent TypeScript and has no mandatory Node built-in dependency.
- Raw Domain Package discovery/compilation is build-time; application startup consumes Target Compiled Domain Package + Runtime Resources only.
- Domain semantics and authoritative User/Business Data remain outside DomainHarness Runtime authority.
- XState, if retained internally, is never a public/persistence/domain contract.
- One Workflow Instance serializes state-changing messages; different instances may execute concurrently; no global ordering is promised.
- Durable Domain Message is not a generic event bus/broker.
- RuntimeStore semantics are public-to-core; concrete SQLite drivers are host bindings.
- Projection is deterministic, declared-input-only, derived and non-authoritative; no Tool/Skill/external I/O inside Projection.
- Missing required host capability or pinned package fails closed; semantic substitution is prohibited.
- Script code is trusted target-compiled package code, not a hostile-code security sandbox.
- AI provider/model orchestration remains outside DomainHarness.

## Canonical commands

Until the v0.2 workspace-scaffold task updates scripts, the repository-root v0.1 commands remain the baseline smoke commands:

```text
npm ci
npm run lint
npm run typecheck
npm test
npm pack -w @kaicreator/domain-harness
```

T-001 is responsible for freezing the v0.2 monorepo-wide canonical commands without weakening the existing package regression.

## Validation execution profile

- Architecture/document review: GitHub exact-SHA evidence + repository documents.
- Node host: real Node Build Host for final truth.
- Non-Node host: real React Native / Expo Android profile using Hermes + `expo-sqlite`; Node-based mocks are insufficient for PRD AC-42.
- RuntimeStore and runtime semantic conformance suites must be shared across Node/Expo bindings.
- Process/device restart validation is required for durable ACK/recovery claims.
- Hidden Validation remains owner-held and separate from visible CI.

## CI profile

`minimal-per-task + version-closure-full`

- Task/PR CI proves the changed concern and required local regression only.
- Expensive Expo device/emulator, process-kill, cross-host conformance, migration, package-retention and Hidden Validation run at version integration/closure gates unless a task's acceptance explicitly requires them earlier.
- CI PASS is not Release Qualification PASS.

## Branch / task execution protocol

- Version integration branch: `v0.2`.
- Task branch: `v0.2_tNNN` (one concern per branch/PR).
- A task starts only after all `Depends On` tasks are merged into `v0.2`.
- Tasks marked parallel MAY run in separate conversations concurrently from the same dependency-complete `v0.2` checkpoint.
- Each task must stay within its declared write set where practical; shared-file edits are deferred to integration tasks to reduce merge conflicts.
- Task PR target is `v0.2`, not `main`.
- `v0.2` merges to `main` only after version closure/release-qualification evidence.

## Release gates

Release gates are derived in authority order from Frozen PRD → Frozen Architecture → Task acceptance → pinned standard defaults.

No v0.2 release/tag is allowed until required G1–G34 evidence, exact-SHA visible closure, owner-held Hidden Validation, and no unresolved P0/P1 Runtime blocker are recorded.
