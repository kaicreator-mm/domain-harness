# DomainHarness Project Overrides

## Project-level architecture source of truth (cross-version)

- **Product architecture (not ADS process config):** follow [`docs/architecture/DOMAIN_APP_CROSS_VERSION_PRINCIPLES.md`](../docs/architecture/DOMAIN_APP_CROSS_VERSION_PRINCIPLES.md) CV-01..12, as linked by root `AGENTS.md`. This file only locates that source; do not duplicate its normative clauses here.
- **New version intake:** record `CV-01..12: INHERITED_UNCHANGED` in the new PRD/L2, or cite a focused architecture/Product amendment for specific deviations. A project-wide principle never silently supersedes a version freeze: v0.10's explicitly scoped PC-05 successor now derives from [accepted A01 Product checkpoint](../docs/product/DomainHarness_v0.10_PRODUCT_AMENDMENT_A01_ACCEPTANCE.md), not CV text alone.
- **Historical version boundary:** v0.3/v0.8 legacy environment requirements, frozen Product lists, implementation-specific no-import and release-gate text are retained in [`docs/governance/archive/PROJECT_OVERRIDES_HISTORICAL_20261018.md`](../docs/governance/archive/PROJECT_OVERRIDES_HISTORICAL_20261018.md), not in the active execution profile. Old acceptance remains valid for its own version, never an implicit constraint on v0.10 or a successor; the selected version's actual frozen Product/L2 still governs.

## Project Identity

- Repository: `kaicreator-mm/domain-harness`
- Product / Service: DomainHarness Domain Application Runtime + Scoped AI Execution
- Standard revision: read `.dev-standard/VERSION` (immutable pin; never a mutable `main`/`latest` reference)

## Effective ADS selection

- **Effective pinned standard:** resolve the exact repository/version/revision from `.dev-standard/VERSION` (currently ADS 4.13.1@`f35fcdb153ff171aaa0027b6e1b9c7592f28d3cd`). Do not resolve effective governance through floating `main`, `latest` or a historic checkpoint paragraph.
- **Current execution model:** `A1_MANUAL_PROTOCOL`, `v3.4-bridge`, self-declared logical `ai-dev:event:v2` actor/session; GitHub account identifies the transport, not the executor. Native Issue Dependencies are the live DAG; required review, Woodpecker verification and genuine Release/Host evidence continue to apply per actual Task/version applicability. No automated reducer, controller or updater is enabled by this pin.
- **ADS upgrade policy:** `TRACK_LATEST_COMPATIBLE_STABLE` is read-only advisory. Adopt a new qualified ADS version only in its own reviewed project pin PR with exact SHA and compatibility/current-Claim consideration. Accepted in-flight Task/Review evidence stays bound to its original standard.
- **Historical adoption receipts:** preserved verbatim in [the legacy overrides snapshot](../docs/governance/archive/PROJECT_OVERRIDES_HISTORICAL_20261018.md). These are evidence, not active duplicated constraints.

## Repository profile

- Repository: TypeScript/JavaScript SDK, compiler/build tooling, selected Domain Packages and target-specific implementations; monorepo. Current v0.10 target is Node.js 24, with ordinary Node/npm implementations selected by BUILD **under accepted v0.10 Product A01**. Do not infer that every SDK module must be source-portable to Expo/Browser/QuickJS.
- Delivery is an embedded Domain App runtime/SDK, not a new server, Admin UI, Agent platform or model gateway. Product behavior and boundaries live in [cross-version principles](../docs/architecture/DOMAIN_APP_CROSS_VERSION_PRINCIPLES.md) and the *owning version* frozen Product/L2.
- Previously frozen v0.1–v0.9 claims/host-target evidence remain historical and available in version Freeze/Release documentation, not as implicit new v0.10 gates. Prior long release ledger preserved verbatim in [historical overrides](../docs/governance/archive/PROJECT_OVERRIDES_HISTORICAL_20261018.md).

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

## v4 Adoption / Compatibility Profile

Adoption level controls how much v4 implementation machinery this project uses. It does **not** reduce the mandatory truth/authority floor.

Canonical project fields:

- `v4.adoption_level`: `A1_MANUAL_PROTOCOL`
- `v4.compatibility_mode`: `v3.4-bridge` — migrated from pinned v3.4.0 (`418d244f23a6bf724acf5d4c4eff4ea292f1c4db`); durable authority, GitHub Issue Dependencies live execution DAG, exact-SHA Validation, `ai-dev:event:v2` attribution and all required gates continue unchanged under the v4 pin
- `v4.assurance.default`: `manual-minimum` — default Assurance remains the Independent Review Profile above (risk-based `required` triggers, Builder-vs-Reviewer context independence); this default applies only where no stronger authority-derived requirement exists
- `v4.model_diversity.default_basis`: `none` — no project-wide multi-model review requirement exists; per-task required reviews keep their authority-defined independence rules (fresh ChatGPT Web session, independent Local Agent review context, or human), and provider diversity occurring incidentally is not claimed as a diversity program
- `v4.interchange`: `disabled` — no Interchange transport is enabled; if ever enabled, authority semantics MUST remain `CORRELATION_ONLY_NON_AUTHORITATIVE`
- `v4.reducer`: `disabled` — every required gate retains a truthful manual path through GitHub durable facts
- `v4.controllers`: `disabled` — no automated dispatch/routing controllers run; dispatch/handoff/review/closure stay manual per the pinned workflow standards
- `v4.fast_path`: `canonical` — canonical v4 Fast Path disqualifiers apply unchanged; this project's required-Review triggers, release gates and owner-held Hidden Validation are independent of Fast Path eligibility and are not weakened by it

Level rationale: this repository already executes GitHub durable facts, exact-SHA Validation, manual dispatch/handoff/review/closure and owner-held Hidden Validation, but does not yet truthfully operate v4 machine-contract reducers/controllers or full orchestration as project runtime automation. `A1_MANUAL_PROTOCOL` is therefore the truthful adoption level; `A2_MACHINE_CONTRACTS`+ are not claimed merely because the standard repository ships those schemas/controllers.

Non-weakening rules:

- These fields select implementation surface only; they MUST NOT weaken any higher-authority required Review, Validation tuple, Candidate Freeze, Release Qualification or Repository Integration requirement.
- Candidate PREPARED != FROZEN; PR PASS != Release PASS; Release READY != Repository Integration complete at every adoption level.
- Model/reviewer agreement never becomes executable Validation truth.
- `NOT_RUN`, `BLOCKED` and `NOT_APPLICABLE` retain their standard meanings; an unavailable required gate is never rewritten as `NOT_APPLICABLE`.
- Disabling reducer/controllers is valid at A1 because every required gate retains its truthful manual execution path recorded in this file.

Historical v3.4→v4 migration receipts remain in [the legacy overrides snapshot](../docs/governance/archive/PROJECT_OVERRIDES_HISTORICAL_20261018.md); `.dev-standard/VERSION` is the active pin.

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

### Security review / repair practice

For material security/caller/Effect-boundary fixes, use the actual concern's falsifiable positive/negative witness and review all materially identical sibling surfaces; do not run redundant whole-repository suites after each small fix. Historical #1013 incident-specific repair receipts and prior signature assumptions live in [the archived notes](../docs/governance/archive/PROJECT_OVERRIDES_HISTORICAL_20261018.md), not as general product-architecture law.

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

### Joint Local Agent / Woodpecker validation budget (v0.8 T-G practice; successor versions inherit)

This is a **placement and execution-dedup rule**, not a new Gate state, a waiver, or a change to frozen acceptance. The project-local Woodpecker `verify` workflow now applies bounded automatic PR/push smoke, with full workspace regression only on an explicitly triggered immutable release candidate; the Task-specific security/physical proof and final Release gates remain independently required. Canonical real evidence: [T-G #1006](https://github.com/kaicreator-mm/domain-harness/issues/1006#issuecomment-6209459331), [HF21 PR #1089](https://github.com/kaicreator-mm/domain-harness/pull/1089), [HF29 PR #1087](https://github.com/kaicreator-mm/domain-harness/pull/1087), [ADS #1111](https://github.com/kaicreator-mm/ai-development-standard/issues/1111).

Before any Local Builder/Validator invokes a nontrivial test command, identify **the concern's validation impact and the actual execution channel**: (1) passing unchanged assertion IDs reused as scoped evidence, (2) changed-risk real P/N requiring local Host/SQLite/packaging, (3) cheap compile/test-typecheck/committed-dist and focused test commands needed before a push, (4) checks the automatically triggered clean Woodpecker PR pipeline will actually execute, (5) tests owned **once** by final exact-candidate Release Qualification. Issue comment / PR receipt suffices; no parallel spreadsheet/registry or new gate.

- **Local-first != local-full-every-commit.** For a small P1/P2 fix, run one narrow RED→GREEN or equivalent affected positive/negative plus adjacent impacted tests, required build/dist and relevant typecheck/lint. Do NOT reflexively run `tools/task-check.sh`, `npm test --workspaces`, all packed journeys or a second full test matrix merely because the Builder made an R2/R3 change, a Reviewer inspected it, or Woodpecker already covers a root regression. A task-authorized physical E3/real SQLite or clean packed-consumer witness remains REQUIRED when its observable cannot be covered by CI.
- **Push once when the scoped concern is coherent.** A PR push auto-starts Woodpecker `.woodpecker/verify.yaml` on its exact SHA: `npm ci → build (incl. committed-dist) → lint → typecheck → bounded v0.9 Host/identity/BUILD smoke`. It does **not** run `npm test` across all workspaces. The full root `npm test` step runs only when this workflow is **manually triggered on the pinned release-candidate ref** for #1037; the separate owner-held Hidden/CJ/physical-host gates are not silently satisfied by it. Do not manually trigger redundant CI runs or execute a concurrent full local suite as a second ritual. Multiple CI pipelines on **different** actual HEAD commits are not by themselves same-SHA duplicates; avoid avoidable serial commits by detecting cheap fixture/type defects before pushing.
- **CI `PENDING` is not `FAIL`.** No retry, empty corrective commit, additional `task-check`, speculative source edit or manual re-dispatch because a provider pipeline has not finished. On an actually terminal `FAIL`, inspect the real failing step, rerun the *failed* command/affected tests, classify concrete code/fixture/environment cause, and push one deliberate repair. A transient failure may justify bounded failed-test isolation but does not automatically justify repeating the full root gate.
- **Immutable evidence attribution.** Exact-head CI PASS applies only to that tested SHA/profile; subsequent K/S/Host/toolchain/test/fixture modifications invalidate affected predicates. Rebase/merge onto a moving version branch triggers a source/ABI/test-impact decision; changed-risk physical gates are rechecked narrowly, without re-running unrelated historical full suites. Never claim unexecuted gates PASS or mark required hardware/native validation `NOT_APPLICABLE` to save time.
- **Closure only once on the dependency-complete candidate.** Full regression and required Critical Journeys/Hidden/packaging/platform checks are arranged as one exact integrated-candidate closure, reusing distinct actually executed assertions. A material candidate change gets the necessary affected real gate re-established; it does not mechanically launch another full sequence per gate name. `PR PASS != Release PASS` remains unchanged.

**Prior T-G CI anti-loop examples** are preserved in [historical overrides](../docs/governance/archive/PROJECT_OVERRIDES_HISTORICAL_20261018.md); the forward rule above is to avoid redundant same-concern full reruns, not to discard exact-SHA checks.


### Real-host validation — version-scoped

Choose the physical Node, native database, device/OS, restart/process-kill or external-Effect scenarios actually required by the current version's **frozen Product/L2 and Task**. Group expensive real-host tests in the version-level closure when safe; do not require historic v0.3 Expo/Hermes and Windows/Node22 tuples for a Node24-only v0.10 App. A mock-only run never proves a physical integration claim. The former v0.3 Node/Expo host waves and old Windows timing figures are archived, not silently deleted.

### Version closure

Cross-host parity, migration/compatibility, critical journeys, full repository regression, packaging and owner-held Hidden Validation are version-closure concerns unless a task pack explicitly requires them earlier.

CI PASS is not Release Qualification PASS.

### Current real-host proof policy

Execution evidence identifies the **actual** OS/runtime/engine/device and exact code SHA. The requested version's host target controls required tuples; an unsupported or missing real run remains `NOT_RUN/BLOCKED`, not PASS or an invented platform. Windows/Expo/Hermes validation tuples from v0.3 are historical only. The selected v0.10 target is Node.js 24, and real Node/SQLite/effect evidence is owned by its admitted Tasks/Version Closure, not this ADS configuration file.

## CI Profile

- CI profile: custom
- Required CI checks: ci/woodpecker/pr/verify (predeclared Woodpecker PR verify status; informational nonselected statuses do not override it; full manual release-candidate suite is independently governed, not an automatic PR check)
- CI checks (for `custom`): single stable-status Woodpecker workflow `.woodpecker/verify.yaml` — **automatic on PR and selected main/legacy pushes:** exact-SHA checkout assertion, Node major-version 22+ gate, `npm ci`, `npm run build` (includes committed-dist byte-identity check), `npm run lint`, `npm run typecheck`, and three bounded v0.9 Host/private-principal/BUILD test files. **Manual event only on a frozen #1037 release-candidate SHA:** the same preflight plus `npm test` (all workspaces/root). Profile semantics are `minimal-per-task + concentrated-host-validation + version-closure-full`: Task-specific changed-risk P/N, real physical Node24/SQLite/security tests and independent review remain necessary when intrinsic; the auto-smoke is not a replacement. Full/Hidden/Critical Journeys are version-closure concerns; Hidden validation remains separate from the CI job. Never claim the manual full job ran from the PR green check.
- Disabled reason (for `disabled`): NOT_APPLICABLE — CI is enabled
- Exact-SHA clean-validation fallback: every CI run checks out the event's exact `$CI_COMMIT_SHA` via the provider-managed clone and the verify step explicitly asserts `git rev-parse HEAD` equals it, and a new source SHA always requires a fresh run; when Woodpecker CI is unavailable, the **applicable** scoped PR/Task or release-candidate validation profile may fall back to equivalent exact-SHA clean local execution (clean tracked checkout at the exact SHA plus the actual required commands, not automatically the full root `npm test`) recorded as local exact-SHA evidence — CI/service unavailability may be recorded through the authorized waiver path, but unavailable CI is never reported as PASS.

## CI Execution Profile

Interpret provider-specific workflow syntax only after declaring the real execution model. Follow `standards/CI_EXECUTION_STANDARD.md` from the pinned standard revision.

- CI provider: woodpecker
- CI backend / execution model: local backend — ECF elastic worker VM(s) run the agent with `labels.backend: local` (VM-is-the-sandbox); step commands execute directly on the worker VM host (Alpine with node24 + git preinstalled); `image: bash` is resolved through worker-VM host PATH and is not a container
- CI runner role: ECF elastic local-backend worker VM(s) acting as the project CI Build Host (no hosted or shared public runners)
- Workflow config: repository path `.woodpecker/verify.yaml`
- Workflow config source: PR HEAD for `pull_request` events (exact `$CI_COMMIT_SHA` checkout), exact pushed SHA for `push` events on `main`/`v0.2`/`v0.3`/`v0.4`, and a user-selected **manual** event against the frozen candidate ref for complete root regression; in every case assert checked-out HEAD = `$CI_COMMIT_SHA`
- Execution shell / entrypoint model: worker-VM host shell; bash step commands with git/bash/node/npm resolved from worker-VM host PATH (no container entrypoint)
- Runtime source: worker-VM host-managed (git, bash, Node.js, npm from the ECF elastic worker VM host; the pipeline itself gates Node major version 22 or higher)
- Clone / checkout model: provider-managed checkout (default clone step; no `skip_clone` manual `git init`/`git fetch`); the verify step explicitly asserts `git rev-parse HEAD` equals `$CI_COMMIT_SHA`
- Partial clone policy: disabled — no blob/tree-filter partial clone is used; clone depth is provider-managed by the default clone step
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

- **Repository development/CI:** Node.js `>=22` remains the existing workspace/CI toolchain floor; see actual `engines` and `.woodpecker/verify.yaml` for executable enforcement. This is **not** a claim of every Runtime target being supported.
- **Selected v0.10 Domain App execution target:** TS→JS on **Node.js 24**; BUILD selects compatible SDK+Package implementations and dependencies. Future runtimes use their own implementations only when a specific Product version admits them. The selected App is trusted prebuilt code; SDK startup is not an AST/hash/dependency certification phase. **v0.10 A01 is ACCEPTED** as the scoped successor to historical frozen PC-05/related Host mechanism, via [Product acceptance checkpoint](../docs/product/DomainHarness_v0.10_PRODUCT_AMENDMENT_A01_ACCEPTANCE.md); the untouched original Product snapshot still governs unmodified requirements.
- **Historical targets:** Expo/Hermes/Android and mandatory Node-built-in-neutral Core belong to the owning v0.3 and other frozen legacy Product/L2/host-test subjects, **not** to v0.10 by inheritance. Required services/real devices always follow the current Task/accepted Product scope, not a permanent universal matrix.

## Frozen authority

- **Current version authority:** use the exact Product/L1, scoped accepted amendments, L2 Freeze and admitted Task DAG of the specific version/Task being executed. Historical v0.1–v0.9 frozen contracts remain authoritative **for their own versions** but are not a new-version requirements union.
- **Project-wide product/architecture decisions:** [CV-01..12](../docs/architecture/DOMAIN_APP_CROSS_VERSION_PRINCIPLES.md); new Product/L2 records inheritance or an explicitly reviewed scoped divergence. Accepted Product A01 is independently recorded in the [v0.10 A01 acceptance checkpoint](../docs/product/DomainHarness_v0.10_PRODUCT_AMENDMENT_A01_ACCEPTANCE.md), not inferred from the CV reference.
- v0.3 frozen-composition registry, exact evidence lineage and release subject details are preserved in [historical overrides](../docs/governance/archive/PROJECT_OVERRIDES_HISTORICAL_20261018.md) and their original freeze files.

## Project-specific hard boundaries

- The **current** DomainHarness boundaries are in [CV-01..12](../docs/architecture/DOMAIN_APP_CROSS_VERSION_PRINCIPLES.md) and each version's accepted Product/L2. These include trusted BUILD-prepared App composition, minimal SDK and single K Primary's actual runtime State/CAS/Journal/Effect ownership.
- Historical v0.3 rules such as `Runtime Core remains portable TypeScript with no mandatory Node built-in dependency`, XState as that version's chosen implementation and its historical governance/activation details are preserved **only for their owning frozen version**, not automatically extended to a new target runtime or v0.10.
- Do not elevate a superseded implementation-specific constraint into a universal project rule. A new version deviating from CV principles needs an explicit scoped decision, not a hidden implementation rewrite.

## Branch / task execution protocol

- Issue/Task DAG dependencies are authoritative when executable work items are materialized. Follow the current version's integration branch and actual dependency-complete base SHA; post-release concerns use main. Branch/PR per concern; stack only on genuine code-baseline dependency.
- New Tasks read the **owning version's** actual Product/L2/DAG/Issue and project [CV-01..12](../docs/architecture/DOMAIN_APP_CROSS_VERSION_PRINCIPLES.md), not a hard-coded v0.3 artifact list. Preserve accepted in-flight SHA evidence.
- Historical v0.3 task-branch naming, version lane and old Product/L2 Task-Packs are kept in [archived overrides](../docs/governance/archive/PROJECT_OVERRIDES_HISTORICAL_20261018.md).

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

- Use only gates materially required by the **target version's** accepted Product/L2/DAG, the pinned ADS standard, this repository's current CI/Review profile and real changed-risk validation. No old v0.3 device wave or v0.8 zero-import gate is inherited merely from history.
- Candidate/version closure ordinarily reconciles needed actual host/SQLite/effect tests, appropriate regression and packed journeys, Review, required Hidden Validation (when applicable), packaging and unresolved P0/P1. `PR PASS != RELEASE PASS`; unavailable required evidence remains `NOT_RUN/BLOCKED`, not fake PASS.
- Original v0.3-specific A1/A2 acceptance and V1–V12 gates are preserved in [archived overrides](../docs/governance/archive/PROJECT_OVERRIDES_HISTORICAL_20261018.md).

## Release boundary

- The exact version-level Product/L2/Task DAG and applicable mandatory Test/Review/Host/CI evidence govern release. Task merge, PR CI or partial host wave alone does not qualify a release. Material candidate changes get **focused changed-risk** reproving; unchanged proof is reused when allowed.
- The v0.3-specific release closeout text is preserved in [archived overrides](../docs/governance/archive/PROJECT_OVERRIDES_HISTORICAL_20261018.md).

## Ownership / Sensitive Areas

- `docs/product/**` and `docs/architecture/**` frozen compositions → reopen only through a documented architecture contradiction; never by implementation convenience
- `.dev-standard/**` → governance authority; any change is a `required` Independent Review trigger (governance-authority)
- `.woodpecker/verify.yaml` → CI authority; any change requires review and a truthful CI Profile update in this file
- `packages/**` public API/schema surfaces → `required` Independent Review trigger (public API/schema)
- Hidden Validation material → owner-held; never committed, published or proxied by agents
