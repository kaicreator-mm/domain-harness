# DomainHarness Project Overrides

## Project Identity

- Repository: `kaicreator-mm/domain-harness`
- Product / Service: DomainHarness Domain Application Runtime + Scoped AI Execution
- Standard revision: read `.dev-standard/VERSION` (immutable pin; never a mutable `main`/`latest` reference)

## Repository profile

- Project form: embedded portable TypeScript Runtime SDK + build-time compiler + host bindings; no server or generic admin UI.
- Structure: Git monorepo. Primary portable SDK remains `packages/domain-harness`; compiler and host-specific adapters remain separate workspace packages.
- v0.3 was an incremental productionization of the shipped v0.2 runtime, not a rewrite.
- v0.1 and v0.2 remain historical frozen baselines; v0.3 does not retroactively redefine their persisted behavior.
- Current state: the v0.3 version lane is COMPLETE — release qualification closed and `v0.3` merged to `main` via PR #347 (`main@f2b61cc720a85d3e0fb94c1eed9b68f8ed855e6c`, tree `1e5473e2feab3dea1d92fb2b1590e963e71d2709`). Successor version lanes are declared by their own frozen Task DAG; none is materialized yet.

## Integration / GitHub Execution Profile

- Integration mode: version-branch
- Version integration branch pattern: `vX.Y` per version lane (e.g. `v0.3`, complete; a successor lane declares its branch at planning freeze)
- Issue-based execution DAG: enabled (Frozen Task DAG as planning checkpoint; GitHub Execution Issues as the live execution DAG)
- Task Issue template/profile: canonical
- Stacked PR policy: allowed only for real code-baseline dependency

When Issue-based execution is enabled:

- Frozen Task DAG remains the planning checkpoint.
- GitHub Issue Dependencies are the canonical live execution DAG.
- Sub-issues express hierarchy, not implicit blocking.
- Stacked PR MUST NOT replace Issue Dependency.
- JIT branch rule: task branches are created after dependencies merge, from the current integration exact SHA (exceptions only for real stacked code dependency).

Post-release governance note: after a version lane is merged to `main`, concerns that depend only on the released `main` state (such as this standard-pin migration) branch JIT from exact `main` with PR base `main`.

## Execution Pack / Pull Worker Profile (v3.4, optional)

All optional v3.4 execution-architecture capabilities below are DEFERRED for this repository. They are declared disabled so verifier syntax is satisfied; they are NOT project gates, and enabling any of them requires its own reviewed governance change.

- execution_pack.enabled: false
- execution_pack.path: `.agent/execution/` (reserved default; not materialized while disabled)
- execution_pack.retention: NOT_APPLICABLE while disabled
- execution_pack.package_exclusion: if ever enabled, `.agent/` material must be excluded from shipped package artifacts (packaging gate)
- pull_worker.builder: disabled
- pull_worker.validator: disabled
- pull_worker.reviewer: disabled
- validation_queue.enabled: false
- validation_queue.scope: NOT_APPLICABLE while disabled
- local_first.enabled: true (default local-first loop per pinned `standards/CI_EXECUTION_STANDARD.md` §10a)

Rules:

- Execution Pack is subordinate to Task Pack; it narrows freedom, never redefines authority.
- A version-scoped validation queue is a projection of Validator dispatches, never a second workflow authority.
- Disabling these capabilities does not weaken any required gate.

## Agent / Operator Attribution Profile

GitHub account identity is transport provenance only. Builder, Validator and Reviewer currently write through the same GitHub transport account (`github:kaicreator-mm`) from distinct Web sessions and Local Agent runs, so all new execution/review events use `ai-dev:event:v2` logical operator attribution.

- Event schema for new events: `ai-dev:event:v2`
- Operator ID convention: `kind:project-local-id`
- ChatGPT Web operator examples: `chatgpt-web:web-a`, `chatgpt-web:web-b`
- Local Agent operator examples: `codex:windows-build-01`, `claude-code:windows-01`
- Session reference convention: non-secret alias / run id
- Transport actor convention: `github:kaicreator-mm`
- Role claim policy: `ROLE_CLAIMED` for substantial/concurrent work

Rules:

- Role and operator are separate dimensions; the same operator may perform different roles over time.
- `operator_id`/`session_ref` SHOULD distinguish concurrent ChatGPT Web pages or Local Agent runs even when `transport_actor` is identical.
- Dynamic operator/session IDs are not encoded as GitHub labels; `executor:*` labels are routing hints only.
- Required Independent Review must be attributable to a context independent from the Builder context; the same GitHub transport account is allowed.
- Identity fields MUST NOT contain tokens, cookies, signed URLs, credentials or secrets.
- Historical issue/comment evidence stays in the form it was recorded; it is not rewritten into the new event protocol.

## Independent Review Profile

- Review profile: risk-based
- Default Task Review Policy under `risk-based`: recommended
- `required` triggers: security/auth | public API/schema/migration | cross-service contract | concurrency/data integrity | high-risk/release-blocker | governance-authority changes (standard pin, project overrides, CI authority) | version release closure
- `not-required` examples: docs-only | mechanical/generated | low-risk local change
- Allowed reviewer sources: fresh ChatGPT session | independent Local Agent review context | human
- Exact-SHA re-review policy when review is performed: standard default (review PASS binds only to the current merge-candidate exact SHA)
- Review queue metadata override: canonical

Rules:

- `required` is a real merge gate and requires PASS on the current merge-candidate SHA.
- `recommended` is optional; if skipped, record the decision/rationale. Review Gate may remain `NOT_RUN` without blocking merge.
- `not-required` means no Review Gate for that concern.
- A Task MUST NOT silently downgrade a higher-authority `required` review rule.
- Review is not a substitute for required Validation.

## Validation Execution Profile

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

### Real validation environments

- Windows validation: Windows workstation / Local Agent Build Host (governance verification, local-first deterministic validation)
- Linux validation: NOT_RUN — no independent Linux validation host is established for this repository; repository CI runs on the single local-backend Woodpecker agent host
- macOS validation: NOT_APPLICABLE — no macOS target in the frozen v0.3 product contract
- Other real environment/device: real Android device/emulator (Hermes + `expo-sqlite`) for the dedicated Expo host wave

Required validation tuples, when applicable:

- `windows × Node.js 22+ × governance verification + portable deterministic repository tests`
- `real Android device/emulator × Expo/Hermes × dedicated Expo host-validation wave`

One tuple PASS never implies another tuple PASS. Cross-build is not real platform execution unless the frozen project contract explicitly says otherwise.

## CI Profile

- CI profile: custom
- CI checks (for `custom`): single Woodpecker pipeline `.woodpecker/verify.yaml` — exact-SHA checkout assertion, Node major-version 22+ gate, `npm ci`, `npm run build` (includes committed-dist byte-identity check), `npm run lint`, `npm run typecheck`, `npm test`. Profile semantics remain `minimal-per-task + concentrated-host-validation + version-closure-full`: parallel feature PRs prove their local deterministic concern; expensive host validation is concentrated into dedicated Node and Expo waves; version closure runs full regression.
- Disabled reason (for `disabled`): NOT_APPLICABLE — CI is enabled
- Exact-SHA clean-validation fallback: every CI run fetches and asserts the exact `$CI_COMMIT_SHA` (depth-1) and a new source SHA always requires a fresh run; when Woodpecker CI is unavailable, required validation falls back to exact-SHA clean local execution on the Windows Build Host (clean tracked checkout at the exact SHA plus the full required command set) recorded as local exact-SHA evidence — CI/service unavailability may be recorded through the authorized waiver path, but unavailable CI is never reported as PASS.

## CI Execution Profile

Interpret provider-specific workflow syntax only after declaring the real execution model. Follow `standards/CI_EXECUTION_STANDARD.md` from the pinned standard revision.

- CI provider: woodpecker
- CI backend / execution model: local backend — step commands execute directly on the agent host; `image: bash` is resolved through host PATH and is not a container
- CI runner role: single dedicated local-backend agent host acting as the project Build Host (no hosted or shared runners)
- Workflow config: repository path `.woodpecker/verify.yaml`
- Workflow config source: pr-head for `pull_request` events (exact `$CI_COMMIT_SHA` checkout) and the exact pushed SHA for `push` events on `main`/`v0.2`/`v0.3`
- Execution shell / entrypoint model: host shell; bash step commands with git/bash/node/npm resolved from agent-host PATH (no container entrypoint)
- Runtime source: host-managed (git, bash, Node.js, npm from the agent host; the pipeline itself gates Node major version 22 or higher)
- Clone / checkout model: `skip_clone`; the pipeline runs explicit `git init` + `git fetch --no-tags --depth=1` from the repo clone URL at `$CI_COMMIT_SHA`, then `git checkout --detach FETCH_HEAD`, and asserts `git rev-parse HEAD` equals `$CI_COMMIT_SHA`
- Partial clone policy: disabled beyond the depth-1 shallow fetch; no blob/tree-filter partial clone is used
- Submodule policy: disabled — the repository declares no `.gitmodules`; submodules are out of scope without a governance change
- Git LFS policy: disabled — the repository uses no LFS objects or filters (`.gitattributes` only pins `-text` on committed dist outputs)
- Fresh-run / rerun policy: new exact SHA requires fresh run; rerun only proves its own run subject

Rules:

- Provider/backend semantics are part of the execution contract; do not assume `image`, plugin, service or volume semantics from another backend.
- For host/local backends, verify the host runtime/toolchain before dependency install and tests.
- Hidden Validation remains owner-held and separate from visible CI.

## Required Commands

- Bootstrap: `npm ci`
- Format: NOT_APPLICABLE — no repository auto-format command is defined; style is enforced by lint
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Unit: `npm test` (workspace suites + root deterministic suite)
- Contract: `npm test` (root `tests/conformance` and workspace contract suites run inside the same deterministic command)
- Integration: NOT_APPLICABLE — real-host integration truth is owned by the dedicated Node/Expo host-validation waves, not by a standing repository command
- Critical Journey: NOT_APPLICABLE — Critical Journeys are version-closure concerns executed in dedicated host environments, not a standing repository command
- Hidden Validation: owner-held by design; never a repository/public command
- Production Build / Package: `npm pack -w @kaicreator/domain-harness`

Repository-root baseline command set:

```text
npm ci
npm run lint
npm run typecheck
npm test
npm pack -w @kaicreator/domain-harness
```

Task packs may define a narrower focused command set, but may not weaken required repository regression for the concern being changed.

## Runtime / Platform Requirements

- Supported OS/platform: portable TypeScript Runtime SDK (runtime-platform-neutral core, no mandatory Node built-in dependency); Node.js hosts and Expo/React Native Android (Hermes) as frozen host targets
- Required runtime/toolchain versions: Node.js `>=22` (enforced by `engines` and by the CI pipeline), npm workspaces
- Required services: none for deterministic repository validation
- Required SDK/device: real Android device/emulator with Hermes + `expo-sqlite` only for the dedicated Expo host-validation wave

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

## Branch / task execution protocol

- Version integration branch: `vX.Y` per version lane (`v0.3` lane complete and merged to `main`).
- Task branch: `v0.3_tNNN` for the v0.3 lane (historical and unchanged); successor lanes use the pattern `vX.Y_tNNN`; post-release `main`-dependent concerns use a one-concern JIT branch from exact `main`.
- Task PR base: the lane's integration branch while the lane is open; `main` for post-release `main`-dependent concerns.
- A task starts only after every declared `Depends On` task is merged into the integration branch.
- Tasks marked parallel MAY run in separate conversations from the same dependency-complete integration checkpoint.
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

## Required Release Gates

- Frozen PRD + PRD Amendment A1 acceptance + PRD Amendment A2 (DAC v0.0.2) acceptance — authority: Frozen product composition above
- Frozen L2 + L2 Amendment A1 review vectors V1–V12 + L2 Amendment A2 (DAC v0.0.2) acceptance and existing architecture gates — authority: Frozen architecture composition above
- Node/Expo host evidence — authority: Validation Execution Profile (concentrated host waves)
- Migration/compatibility evidence — authority: version closure
- Full repository regression/packaging — authority: Required Commands
- Owner-held Hidden Validation — authority: Release boundary
- Zero unresolved P0/P1 findings — authority: Release boundary
- Fresh Independent Review on governance-authority changes and release closure — authority: Independent Review Profile

Historical workflows, old scripts or obsolete artifacts do not automatically create mandatory release gates.

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

`v0.3` merges to `main` only after release qualification/closure evidence is complete. (Satisfied: `v0.3` merged to `main` via PR #347.)

## Ownership / Sensitive Areas

- `docs/product/**` and `docs/architecture/**` frozen compositions → reopen only through a documented architecture contradiction; never by implementation convenience
- `.dev-standard/**` → governance authority; any change is a `required` Independent Review trigger (governance-authority)
- `.woodpecker/verify.yaml` → CI authority; any change requires review and a truthful CI Profile update in this file
- `packages/**` public API/schema surfaces → `required` Independent Review trigger (public API/schema)
- Hidden Validation material → owner-held; never committed, published or proxied by agents
