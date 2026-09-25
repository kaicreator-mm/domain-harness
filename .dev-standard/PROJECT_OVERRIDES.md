# DomainHarness Project Overrides

## Repository profile

- Product: DomainHarness Domain Application Runtime + Scoped AI Execution
- Version target: v0.3
- Repository: `kaicreator-mm/domain-harness`
- Version integration branch: `v0.3`; implementation task branches are created from the current dependency-complete `v0.3` head.
- Project form: embedded portable TypeScript Runtime SDK + build-time compiler + host bindings; no server or generic admin UI.
- Structure: Git monorepo. Primary portable SDK remains `packages/domain-harness`; compiler and host-specific adapters remain separate workspace packages.
- v0.3 is an incremental productionization of the shipped v0.2 runtime, not a rewrite.

## Frozen authority

Product authority is the complete frozen composition:

1. `docs/product/DomainHarness_v0.3_PRD_FROZEN.md`;
2. `docs/product/amendments/DomainHarness_v0.3_PRD_AMENDMENT_A1_ROUND2_REVIEW_CANDIDATE.md`, frozen by `docs/product/amendments/DomainHarness_v0.3_PRD_AMENDMENT_A1_FREEZE_RECORD.md`;
3. `docs/architecture/DomainHarness_v0.3_L2_ARCHITECTURE_EVIDENCE_FROZEN.md`;
4. `docs/architecture/DomainHarness_v0.3_L2_ARCHITECTURE_AMENDMENT_A1.md`, frozen by `docs/architecture/DomainHarness_v0.3_L2_ARCHITECTURE_AMENDMENT_A1_FREEZE_RECORD.md`;
5. `docs/product/amendments/DomainHarness_v0.3_PRD_AMENDMENT_A2_DAC_V002_REVIEW_CANDIDATE.md` (PRD Amendment A2 — DAC v0.0.2 cross-layer reference adoption), frozen by `docs/architecture/DomainHarness_v0.3_AMENDMENT_A2_DAC_V002_FREEZE_RECORD.md`;
6. `docs/architecture/DomainHarness_v0.3_L2_ARCHITECTURE_AMENDMENT_A2_DAC_V002_REVIEW_CANDIDATE.md` (L2 Amendment A2 — DAC v0.0.2 cross-layer reference adoption), frozen by the same record.

Each Amendment supersedes only its explicitly mapped clauses. Every unaffected Frozen PRD / PRD A1 / L2 / L2 A1 contract remains authoritative.

Amendment A2 provenance is pinned by its freeze record: reviewed candidate HEAD `677056c4978a6379daf28e502842b0b0bb9080c1`, merged via PR #297 as `main@2fe688401bd89dbc8ba1a9bd2cd3bffaea8c84d4`, against DAC v0.0.2 exact baseline `kaicreator-mm/domain-application-contract@9c3ef91b8b40d893e4fe2b0370200e765816ec2b`, and adopted onto `v0.3` byte-identically without semantic edits.

Task authority after planning freeze is `docs/implementation/DomainHarness_v0.3_TASK_DAG.md` plus v0.3 task packs / GitHub Execution Issues generated from that DAG. Implementation task authority for the A2 DAC-adoption line is the reviewed #300 A2 Task DAG materialized as GitHub Execution Issues #304–#311, branched JIT from dependency-complete exact `v0.3` SHAs.

v0.1 and v0.2 remain historical frozen baselines. v0.3 does not retroactively redefine their persisted behavior.

Frozen product scope and architecture MUST NOT be reopened by implementation agents unless a documented architecture contradiction is found.

## Project-specific hard boundaries

- `Domain Data = Domain Facts + Compiled Domain Intelligence`.
- Domain Facts remain mutable/external business reality; they are not implicitly promoted/versioned CDI.
- Domain Governance Baseline is a separate exact authority: Hard Invariants and governance-critical promotion/activation/evaluation/exploration/fallback policy are not self-modifying CDI.
- Domain Workflow / Domain Machine is the single product-level business control-flow authority.
- XState is the selected v0.3 implementation engine, not product/public identity; no peer workflow runtime is allowed.
- Business Harness / HarnessMachine is a bounded child capability for unresolved semantics. It may propose structured DomainDecision/DomainEvent output but cannot own transition, mutation, promotion, activation, governance or provider-routing authority.
- Guard and Hard-Invariant predicates are synchronous for the admission decision, deterministic, side-effect-free and contain no LLM, Tool or external I/O.
- Runtime Core remains portable TypeScript with no mandatory Node built-in dependency.
- Raw Domain Package discovery/compilation is build-time; App startup consumes target compiled package + Runtime Resources only.
- Business mutation stays behind durable effect authority.
- One per-instance `DurableExecutionStore` ordering domain preserves journal-first committed-work truth, recursive control snapshots, `executionFactRevision`, package pin, `DynamicChildExecutionPin`, and v0.3 `GovernanceExecutionPin`.
- Recovery uses exact package/governance/child-definition pins. `current`, `latest`, `active`, fuzzy or compatible substitution is not recovery authority.
- Exact semantic cache is separate from execution replay. `ObservedDependencySet` and `SemanticRevisionPort` boundaries remain mandatory where cache reuse is enabled.
- Promoted artifact bodies are immutable/content-addressed and retained by the Promoted Artifact Registry while active/recoverable references require them.
- Executable Candidate validation is deterministic and baseline-bound. Candidate != validated != evaluated != promoted != activated.
- Human/operator promotion remains at least as strict as Frozen L2 ADR-08; promotion never implies activation.
- `DomainActivationBinding` is one exact package + CDI digest + Governance Baseline tuple for new-instance creation. Implementation must publish/read it as one non-torn logical binding revision; mixed package/governance tuples are forbidden.
- Runtime Evidence is provenance/evaluation material, not Domain Facts, active CDI, snapshot or replay truth; tenant/privacy scope must not be weakened.
- L4 is shadow/non-mutating by default. Any represented Experimental fallback is exact, never a floating alias.
- AI provider/model orchestration remains outside DomainHarness behind ModelPort / AI Runtime.
- v0.3 does not introduce autonomous Meta Harness runtime, automatic pattern mining, production experiment scheduling/canarying, automatic metric promotion, automatic activation, live mutating L4, generic RAG/memory/knowledge platform, or another workflow engine.

## Canonical commands

Repository-root baseline commands remain:

```text
npm ci
npm run lint
npm run typecheck
npm test
npm pack -w @kaicreator/domain-harness
```

Task packs may define a narrower focused command set, but may not weaken required repository regression for the concern being changed.

## Validation execution profile

Validation is deliberately split so expensive local environments are concentrated rather than repeated across every parallel feature PR.

### Task/PR portable validation

Default for contract/core feature tasks:

- TypeScript compile/typecheck;
- focused deterministic unit/contract tests;
- compiler/static fixtures where applicable;
- portable in-memory/fake-store conformance where sufficient for the task concern;
- exact-SHA review evidence.

A feature task SHALL NOT claim host durability from mocks.

### Dedicated Node / Build Host validation wave

Real Node Build Host truth is grouped into dedicated integration tasks covering, in one environment/session where practical:

- Node SQLite schema/storage migrations;
- Promoted Artifact Registry persistence/retention;
- semantic-cache persistence;
- `DomainActivationBinding` non-torn publication/read;
- `GovernanceExecutionPin` durability;
- recursive snapshot + dynamic-child pin + journal ordering;
- process-kill/reopen crash windows;
- retained package/governance recovery;
- persistent timers/deadlines;
- no duplicate committed AI/query/effect/mutation;
- package/alias/revocation movement during recovery.

### Dedicated Expo / Hermes validation wave

Real React Native / Expo Android using Hermes + `expo-sqlite` is grouped into one dedicated host task covering:

- portable-runtime boundary/no Node built-ins;
- logical persistence parity with Node;
- GovernanceExecutionPin/registry/cache persistence;
- force-stop/relaunch recovery;
- timer/callback/process-data behavior required by the v0.3 product contract;
- no duplicate committed external work.

Node-based Expo mocks are not final truth for host durability.

### Version closure

Cross-host parity, migration/compatibility, critical journeys, full repository regression, packaging and owner-held Hidden Validation are version-closure concerns unless a task pack explicitly requires them earlier.

CI PASS is not Release Qualification PASS.

## CI profile

`minimal-per-task + concentrated-host-validation + version-closure-full`

- Parallel feature PRs prove their local deterministic concern.
- Expensive host validation is concentrated into dedicated Node and Expo waves after central runtime integration reaches a dependency-complete checkpoint.
- A host-validation PASS applies only to the exact validated integration SHA and does not automatically transfer across later runtime changes.
- CI/service unavailability may be recorded through the authorized waiver path, but unavailable CI is never reported as PASS.
- Hidden Validation remains owner-held and separate from visible CI.

## Branch / task execution protocol

- Version integration branch: `v0.3`.
- Task branch: `v0.3_tNNN`.
- Task PR base: `v0.3`, not `main`.
- A task starts only after every declared `Depends On` task is merged into `v0.3`.
- Tasks marked parallel MAY run in separate conversations from the same dependency-complete `v0.3` checkpoint.
- Parallel leaf tasks should avoid central barrels/root runtime assembly/shared exports. Central wiring is deferred to explicit integration tasks to reduce merge conflicts.
- One concern → one task branch → one PR.
- Every execution starts by recording exact base SHA and reading the complete Frozen authority composition above (Frozen PRD + PRD Amendments A1/A2 + Frozen L2 + L2 Amendments A1/A2) + its Task Pack/Issue.
- If implementation evidence reveals a real architecture contradiction, stop that concern and record the contradiction rather than silently expanding scope.

## L3 / evidence order

Tasks marked `L3: REQUIRED` follow:

```text
Tests
→ Contract / Interface
→ Core Implementation
→ Failure Handling
→ Reference
```

Existing architecture research #187/#194/#195/#196/#197/#201/#203/#204/#205 is consumed through frozen L2 authority and is not rerun unless a real contradiction requires it.

## Release boundary

Individual task completion, PR CI or a dedicated host-validation wave does not equal v0.3 release qualification.

The final closure task must reconcile the exact v0.3 candidate against:

- Frozen PRD + PRD Amendment A1 acceptance + PRD Amendment A2 (DAC v0.0.2) acceptance;
- Frozen L2 + L2 Amendment A1 review vectors V1–V12 + L2 Amendment A2 (DAC v0.0.2) acceptance and existing architecture gates;
- Node/Expo host evidence;
- migration/compatibility evidence;
- full repository regression/packaging;
- owner-held Hidden Validation;
- unresolved P0/P1 findings.

`v0.3` merges to `main` only after release qualification/closure evidence is complete.
