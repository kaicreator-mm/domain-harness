# DomainHarness — Historical Project Overrides Extract (2026-10-18)

> This preserves exact retired/historical passages from `.dev-standard/PROJECT_OVERRIDES.md` at source branch `docs/cross-version-domain-runtime-principles` / HEAD `c6a6e101371300c9a1f5510e3ae4650f91d0a68c`. **Historical evidence only**, not current Product/ADS governance. Each fenced section below reproduces the original passages verbatim. For historical frozen Product obligations use their actual frozen versions and exact SHA, not this extract. No underlying Product/CI/test data has been edited by this docs split.

### Archived extract 1: ADS v4.13.1 adoption evidence

`````markdown
## ADS v4.13.1 adoption checkpoint — effective only after this project pin-change PR is lawfully merged (2026-10-18)

- **Source and release identity:** project effective standard is the exact `.dev-standard/VERSION` tuple `version=4.13.1`, `revision=f35fcdb153ff171aaa0027b6e1b9c7592f28d3cd`. The observed GitHub [v4.13.1 stable Release](https://github.com/kaicreator-mm/ai-development-standard/releases/tag/v4.13.1) was published 2026-10-17; `refs/tags/v4.13.1` dereferenced to **the same 40-char commit** and that commit's `VERSION` bytes are `4.13.1\n`. No `main/latest` fallback, changing SHA at identical semver, pre-release candidate substitution or automatic repository update is allowed.
- **Scope / compatibility decision (standards-only):** compared with the previously effective v4.12.0 pin, there is **no change to DomainHarness SDK source, selected JS/TS runtime ABI, public wire/schema, K/S/B/C physical authority, existing Product/L1 freezes, L2, frozen native Task DAG or already-qualified v0.9 release evidence**. New v4.13.0 organization environment profile and GitHub Task/Claim/Agent-attempt interoperability guidance are *source/reference contracts*, not proof that DomainHarness runs Tally v2, installs a new toolkit or enables a controller.
- **v4.13.1 behavior changes adopted for prospective work:** (a) verify ADS root `AGENTS.md`, `VERSION`, `PROJECT_OVERRIDES.md` at the actual project root, not from a nested fixture; (b) for **materialized implementation Task dependencies**, inspect real GitHub native `blocked_by` source and read-back before dispatch—Markdown `BLOCKED_BY` and Issue open/closed state are insufficient; (c) declare required CI provider/check identity *before* results are considered; Woodpecker `ci/woodpecker/pr/verify` is the existing selected required PR verification context when CI applies. No GitHub Actions runner is newly required. Other observed contexts are **informational** unless an independent project gate requires them. A necessary real test that has not run remains `NOT_RUN/BLOCKED`, not `PASS`. Existing exact-head CI evidence is historical and is not retrospectively reclassified by this field.
- **Effective workflow level stays `A1_MANUAL_PROTOCOL`, `v3.4-bridge`**, with self-declared `ai-dev:event:v2` logical operator/reviewer/session identity, GitHub transport account not authorization, manual source-bound Task/Claim/Review/Validation records, native Issue dependencies, one concern per PR, existing risk-based required independent review and actual-host security/Release truth floor. No new mandatory automation, CLI, reducer, controller, Tally updater, organization policy authority, duplicate reviewer count or CI provider is introduced.
- **Prospective ADS upgrades:** retain `standard_update_preference=TRACK_LATEST_COMPATIBLE_STABLE` as **read-only advisory**. v4.13's prospective-compatible-proposal path is separate from v4.12's strictly conservative safe selector; neither automatically edits project files, overrides in-flight accepted Task pins or grants a merge/activation permit. New project-local pin PRs require source-qualified compatibility and a **pre-merge** check of actual target SHA, native dependencies/accepted Claims, required independent Review and mandatory checks. `.dev-standard/ADOPTION_STATUS.json` is not currently present; no machine updater, successful compatibility checker, or full Tally consumer validation is claimed.
- **In-flight version isolation:** accepted Tasks/Claims and Review/Validation already bound to v4.12.0 or earlier exact revisions **retain their original immutable subject**; new authorized Task dispatch/checkpoints after this PR merge resolve 4.13.1. There is no retroactive rewriting of v0.8/v0.9 Product/L2/DAG/RQ facts or v0.10 pre-freeze review observations. Unknown material active-Claim isolation **blocks actual adoption/merge** until checked, not a reason to silently repin.
- **Validation cost:** this PR touches only the standard pin and adoption/CI policy prose. Use static exact-SHA/source/compatibility + required focused review; no SDK/Host/build/test source is changed and no repeat of the v0.9 Full/Hidden/Critical Journeys campaign is implied. `PR PASS != Release PASS`. A required CI status pending cannot be declared PASS; a waiver cannot overrule a branch rule.
- **Rollback:** if evidence requires, propose a separate source-current, reviewed pin-reversal PR to old `4.12.0@ee8258106547abd2c2d7b9f5e87af9965e430bd2`, preserving historical Task/evidence immutability.
`````

### Archived extract 2: Historical ADS v4.12.0 adoption checkpoint

`````markdown
## Historical ADS v4.12.0 adoption checkpoint — was effective after 2026-10-16 merge (superseded for new dispatches by v4.13.1)

- Historical effective standard at the 2026-10-16 checkpoint: `.dev-standard/VERSION` **4.12.0** pinned to immutable `kaicreator-mm/ai-development-standard@ee8258106547abd2c2d7b9f5e87af9965e430bd2` — [published stable Release `v4.12.0`](https://github.com/kaicreator-mm/ai-development-standard/releases/tag/v4.12.0), source-qualified against exact frozen tree `bf5873b82a30a7b373f1dfea5dea8367d2bc93f8`. `main` / floating `latest` is **never** the effective standard.
- Published-compatible ADS advisory discovery is an **opt-in read-only policy** (not auto-apply, not a Claim/Release gate):

```ini
standard_update_preference=TRACK_LATEST_COMPATIBLE_STABLE
```

  At that v4.12 checkpoint, a then-future compatible published version (such as `4.12.1`) required a separate project-local pin-change PR, exact release/compatibility proof and required independent review; never silently adopt an unreleased `VERSION` on ADS `main`. The v4.12 S05 selector deliberately returns `NO_SAFE_RECOMMENDATION` while this active v0.9 project still has open Issues/PRs or lacks an independently qualified `.dev-standard/ADOPTION_STATUS.json` checkpoint; this opt-in does **not** schedule or authorize automatic updates.
- Retain `v4.adoption_level=A1_MANUAL_PROTOCOL`, `v4.compatibility_mode=v3.4-bridge`, `ai-dev:event:v2`, self-declared logical agent identity, native GitHub Issue Dependencies, manual Controller/Reviewer/Validator, risk-derived `review:required` for trust/contract/governance changes, and the existing actual-Host security, selected runtime and Release assurance floors. A1 is **not** a claim that optional reducers, project-updaters, controllers, automated Scaffold generators or actual cross-project verification are running.
- **Mature v0.9 project adoption:** already-frozen Product/L1 (PR #1048), L2 (PR #1053) and native Task DAG (PR #1054, 11/11 edges) are reused. ADS v4.12 phase-scoped work selection, Source-Scaffold/DAG pair checker, Project Steward, environment planning, Task Learning and risk/value guidance apply prospectively only where material and lawful; do not create retroactive Scaffold/paired-Freeze Gates or artificial Issues for this mature project.
- **Historical in-flight work rule:** #1027 and PR #1111/#1112 were admitted under the earlier **4.0.0** effective pin and retained their exact Task/Claim/Review/Validation subject evidence. At the **v4.12.0 checkpoint**, newly dispatched work then resolved 4.12.0; after lawful merge of the v4.13.1 pin, new eligible work instead resolves 4.13.1 as recorded above. In-flight work never silently rebinds.
- **Compatibility decision (project-local, governance-only):** source/runtime/wire/schema — **NO PRODUCT CHANGE** from this two-file adoption; agent/authority/Claim/Review — preserve accepted canonical durable facts, adopt v4.12 self-declared executor attribution without GitHub-account-as-identity; validation/release/external effects — maintain existing real-evidence and negative/security gates, `PR PASS != RELEASE PASS`. Automated checker execution, cross-project actual-run proof and savings metrics are **NOT_RUN/UNKNOWN**, not PASS. If a required actual consumer compatibility proof becomes material at a future Task, evaluate it then under `standards/INTERFACE_COMPATIBILITY_GOVERNANCE_STANDARD.md`.
- **Rollback:** only through another exact-SHA reviewed pin-change PR restoring prior `4.0.0@1edaee9291e25b6dd99303493bed75132cb54881` when justified; retain both revisions' historical evidence. Do not rewrite the v0.8 release baseline or re-run the entire v0.9 Full/Hidden validation campaign for a governance-only pin change.
`````

### Archived extract 3: historical repository profile/release ledger

`````markdown
## Repository profile

- Project form: embedded portable TypeScript Runtime SDK + build-time compiler + host bindings; no server or generic admin UI.
- Structure: Git monorepo. Primary portable SDK remains `packages/domain-harness`; compiler and host-specific adapters remain separate workspace packages.
- v0.3 was an incremental productionization of the shipped v0.2 runtime, not a rewrite.
- v0.1 and v0.2 remain historical frozen baselines; v0.3 does not retroactively redefine their persisted behavior.
- Current state: `v0.3` through `v0.6` are historical COMPLETE baselines — `v0.3` merged to `main` via PR #347 (`main@f2b61cc720a85d3e0fb94c1eed9b68f8ed855e6c`, tree `1e5473e2feab3dea1d92fb2b1590e963e71d2709`), `v0.4` release qualification closed and merged to `main` via the #419 VC-I1 tree-identical bridge PR #420 (`main@5cf7a8fc623651b8ced8b2152426a5568f75cba3`, tree `0523325e321ed65e4772fcf6c8ef6b44e3c60fb8`), `v0.5` released at `main@a543e15e98c07a8987d5f4f63a1754344a215a80` (tree `c0bf0bbfeb2fb9f439e21ee18092dfdf7f529ccb`), and the post-v0.5 successor released as **`v0.6`** at `main@a88a739d03e3eb3f4cb95756fcb483871943a353` (candidate `v0.6@7c367188d5c8cffa41bc22cd5269672a665c436f`, tree `7d71f84b11a2a4a8d0a193232e7e6c84de7af6f2`): Version Closure PASS (11/11 dimensions, #605 issuecomment-5993043018 — full regression 2192/2192 at the frozen candidate, cross-host lineage byte-identity, byte-identical pack hashes with clean-consumer install smoke, visible P0/P1=0, HIDDEN_VALIDATION=AUTHORIZED_DISPOSITION under the frozen DAG authority), independent closure review CONFIRM (11/11, #605 issuecomment-5994147743), and T011 Release Qualification CONFIRM (#605 issuecomment-5995487578 — freeze currentness verified live, zero-conflict integration feasibility with exactly the 11 #447 CI/build-config files divergent); integration gates PASS on the exact merged tree (validation #605 issuecomment-5997137132 — full suite 2192/2192, build and lint green on the prospective merge result; fresh independent review #605 issuecomment-5996590228 — merge-safe, integration materialized as `main@a88a739d`, tree `22b86c23c1c4460346c8bb387706402b0e777702`; the repo release convention carries no git tags/GitHub release objects for any version, including v0.6). Known limitations carried into the release record: the v0.6 closure chain declares none beyond VISIBLE_P0=0 / VISIBLE_P1=0 — the review terminals record a single non-blocking cosmetic P3 (a dropped hex char in the tree-hash spelling inside closure-review comment #605 issuecomment-5994147743, invalid as an object name; T011 re-stated the correct full tree). The successor line **`v0.7`** closed at candidate `version/v0.7@86110c616b8cb18c730553e4cdab7ef555214521` (tree `dd4e4596d02be7012468a475db8f6fcc6c756542`): T014 Stage-1 Version Closure PASS (#936 issuecomment-6057895202 — candidate identity, full regression parity, clean consumer, 12-entry carried-limits register, visible P0/P1=0), T015 FINAL L2/SDK Closure accepted via PR #941 (`docs/architecture/DomainHarness_v0_7_FINAL_L2_SDK_CLOSURE.md` + contract-assertion companion `packages/domain-harness/tests/t015/`), packed-byte identity quadruple-proven (`kaicreator-domain-harness-0.2.0.tgz` sha256 `f9400728bc99f8516c2f7f69db55cf8589d29e79127a77a36c2fb44f08a2d332`, `kaicreator-domain-harness-node-0.2.0.tgz` sha256 `549262618bc3bc7961f325271d7cd000bc2a6fea9e337d2f1e3fd1222ad83c78`, `kaicreator-domain-harness-compiler-0.2.0.tgz` sha256 `3a254c6288736553afe2a7294172cb41a9aa4563e9345995613bdb816a030480`, `kaicreator-domain-harness-expo-0.2.0.tgz` sha256 `d4c6ef8ae7b9d19b447e3b859607e464814c338553327136e53a9dd72c40bde1`; the repo release convention carries no git tags/GitHub release objects for any version, including v0.7). Known limitations carried into the release record: the 12-entry T014 carried-limits register (1× P2 evidence-label bookkeeping; P3 evidence-citation-precision, host-load-flake, scan-evadability, carried-observation, bookkeeping, environment-naming, toolchain-skew, infra-disclosure classes), the accepted NON_MATERIAL E11 limits (`L-E11-REPRESENTATIVE_SUBSET`, `L-E11-DERIVED_VARIANT`, `L-E11-STABLE_SQLITE_BINARY`), and `MICROKERNEL_SOURCE_DIFF: 0`; visible P0/P1=0. T016 Release Qualification is in execution on #943 and binds the qualified lane tip whose packed bytes are byte-identical to the four digests above; repository integration to `main` proceeds only after the RQ gates accept, per #589 PACK-E and the ADS release standard; the T016 lane also carries the v0.6 planning freeze docs (PRD/L2/DAG) recovered blob-identical from the v0.6 main lane so the integrated state retains the full frozen baseline chain.
`````

### Archived extract 4: historical v3.4→v4 adoption notes

`````markdown
Historical migration truth (v3.4.0 → v4.0.0; retained, **not** the current 4.13.1 pin):

- This adoption (v3.4.0 → v4.0.0 at `A1_MANUAL_PROTOCOL`) changes the governance implementation surface only; Product/PRD/L2/DAC/runtime/package/test semantics are untouched.
- Historical v3.4 A41/VC evidence keeps its original subject identity and status; it is NOT relabeled as newly produced v4 machine-contract evidence.
- Final release evidence after this governance SHA move must be rebound/re-executed according to Version Closure impact rules before #408 Release Qualification.
`````

### Archived extract 5: historical #1013 security-review repair protocol

`````markdown
### Security-review repair protocol (Builder side)

Recorded from the #1013 R1/R2 security review rounds (PR #1016; fresh review #5494026032 / #1013@6129188323):

- **Falsification-first**: when a review demands a reproduction, implement it as a COMMITTED test, run it RED on the exact reviewed HEAD (keep the marker log as evidence), repair, then GREEN. The committed test then doubles as the boundary's regression and documentation (reference: `tests/v08-integration/packed-raw-ports-session-negative.test.ts`; the RED run cost 13 seconds against the packed consumer and fully evidenced both new P1s).
- **Class-surface inventory**: when a boundary pattern is accepted on one seam — or a bypass is demonstrated on one surface — the SAME repair must enumerate every sibling seam of the same class and guard each. Observed: after the R2 gateway-ops session capability (@6122817203), the fresh review immediately found the two uncapped raw getters in the same one-shot channel family (`currentKernelHostPorts` / `currentHostModelPort`) — reviewers frame findings as one class with N callable surfaces, so fixing only the named surface invites another round.
- **No-L2-handoff argument obligation**: changing an internal protected channel's signature is NOT a frozen K/S authority/ABI change when four invariants hold — consumed port shapes unchanged, sole installer unchanged (`bootstrapTrustedHost`), public one-arg `DomainHarness.load` unchanged, K/S ownership unchanged — and the Builder's evidence MUST argue all four explicitly so the independent reviewer verifies the no-handoff claim instead of re-deriving it (the #1013 R2-repair PR comment carries exactly this argument).
`````

### Archived extract 6: historical local full-gate timing / Node & Expo host wave

`````markdown
### Local full-gate composition and timing facts (Windows Build Host)

Recorded from the #1013 R2 repair session (PR #1016@115b71a): the core fix took ~35 minutes while three full local gate rounds took ~2h45m — almost all avoidable time lived in gate composition blind spots and gate-duration planning, not in the repair itself.

- The `packages/domain-harness` `test` script is `build && build:legacy-test && node --import tsx --test "tests/**/*.test.ts" && tsc -p tsconfig.test.json --noEmit`; root `npm run typecheck` (tsconfig.json) covers `src` only, and single-file `node --import tsx --test <file>` bypasses the trailing test-directory typecheck. After changing any internal API signature, run `npx tsc -p tsconfig.test.json --noEmit` (seconds) BEFORE attempting a full gate round. Observed cost of skipping this precheck: 9 call-arity errors discovered only by a full 75-minute gate round.
- With `NPM_REGISTRY` set (e.g. the npmmirror mirror), the packed-consumer journeys genuinely execute (without it they SKIP explicitly — a weaker gate): one full local gate round costs ~50–100 minutes, dominated by the N18 clean packed consumer (~25 min) and the e8a packed journey (~13–28 min; npm-cache warmth moves rounds toward the low end). Treat one full green round as an ~1h asset; every cheap-to-detect failure class (type errors, call arity, lint) must be blocked behind second-scale prechecks before a full round is spent.
- A full-gate failure inside a packed journey with NO failing-test line and NO type/compile error (a silent phase) is environmental until proven otherwise: re-run that single test file standalone (e8a ~28 min) to split code vs environment; when it passes standalone, re-run the full gate. Do not edit code without that evidence. Do not launch other npm-install-heavy work (multi-version gates, separate packed journeys) while a full gate round is running — same-host contention slows every journey and amplifies transient network failures.
- Long npm-chained gate runs buffer their logs through multiple pipes and flush in large chunks: a frozen pass-counter or unchanged `tail` is NOT evidence of a hang. Judge liveness by "did the last output line change" plus "are new child processes still spawning (process StartTime)"; install/network-bound children sitting near 0-CPU are normal. Intervene only when output AND process population are both static well beyond the phase's known duration.
- Packed-consumer attack/falsification tests follow the established template — `npmRegistryReachable` probe, `npm pack` of core+node workspaces, clean-consumer `npm install`, an `attack.mjs` child driven by marker-line assertions, and trusted-side snapshots proving side-effect invariance. Reference implementations: `tests/v08-integration/packed-gateway-session-negative.test.ts` and `tests/v08-integration/packed-raw-ports-session-negative.test.ts`.

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
`````

### Archived extract 7: historical real validation environment and host tuples

`````markdown
### Real validation environments

- Windows validation: Windows workstation / Local Agent Build Host (governance verification, local-first deterministic validation)
- Linux validation: NOT_RUN — no independent Linux validation host is established for this repository; repository CI runs on the ECF elastic local-backend Woodpecker worker VM(s)
- macOS validation: NOT_APPLICABLE — no macOS target in the frozen v0.3 product contract
- Other real environment/device: real Android device/emulator (Hermes + `expo-sqlite`) for the dedicated Expo host wave

Required validation tuples, when applicable:

- `windows × Node.js 22+ × governance verification + portable deterministic repository tests`
- `real Android device/emulator × Expo/Hermes × dedicated Expo host-validation wave`

One tuple PASS never implies another tuple PASS. Cross-build is not real platform execution unless the frozen project contract explicitly says otherwise.
`````

### Archived extract 8: historical HF21/HF29 Woodpecker anti-loop receipts

`````markdown
**Concrete anti-loop receipts:** HF21 [#1089](https://github.com/kaicreator-mm/domain-harness/pull/1089) #1294 SUCCESS (R1), #1297 FAIL (R2 classless gate exposed missing D2 fixture), #1298 SUCCESS (repaired R2) were on **different SHAs**; HF29 [#1087](https://github.com/kaicreator-mm/domain-harness/pull/1087) #1291 SUCCESS and #1299 initially PENDING likewise did not justify a full Local re-run. Stop the **duplicate full local execution**, not exact-head provider evidence. These receipts are historical snapshots, not permanent current CI states.
`````

### Archived extract 9: historical platform requirement

`````markdown
## Runtime / Platform Requirements

- Supported OS/platform: portable TypeScript Runtime SDK (runtime-platform-neutral core, no mandatory Node built-in dependency); Node.js hosts and Expo/React Native Android (Hermes) as frozen host targets
- Required runtime/toolchain versions: Node.js `>=22` (enforced by `engines` and by the CI pipeline), npm workspaces
- Required services: none for deterministic repository validation
- Required SDK/device: real Android device/emulator with Hermes + `expo-sqlite` only for the dedicated Expo host-validation wave
`````

### Archived extract 10: historical v0.3 frozen authority composition

`````markdown
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
`````

### Archived extract 11: historical v0.3 project hard boundaries

`````markdown
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
`````

### Archived extract 12: historical v0.3 task and branch protocol

`````markdown
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
`````

### Archived extract 13: historical v0.3 release-gate list

`````markdown
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
`````

### Archived extract 14: historical v0.3 release closeout

`````markdown
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
`````

### Archived extract 15: historical v0.8 zero-import SDK implementation patterns

`````markdown
## v0.8 Sealed Standard SDK implementation patterns

Scope: implementation guidance for the **approved v0.8 no-import qualified Standard SDK payload contract**, derived from FR02 (#1003, PR #1019, independent R2 source review #5494487610 at `25fef6cc0fda212b4303d011aaebb3a57ca96c83`, CI #1140 PASS). These are not universal development rules, do not reopen frozen L1/L2 semantics, and do **not** declare selected H/K/S integration, historic full-runtime equivalence, or release qualification PASS. Changes to `.dev-standard/**` require fresh independent governance review.

- **Reuse observable semantics within this sealed contract.** The approved v0.8 qualified payload requires zero imports, no dynamic code evaluation, and no second runtime; do not vendor a runtime library (e.g. JSONata) into the selected sealed module. Implement a bounded deterministic subset only where the Product/L2 owner has explicitly accepted the observable coverage and any omissions. Re-prove BUILD closure qualification on the exact changed module bytes; preserving a few example results does not prove the complete historic interface.
- **Deterministic work budget is not a wall-clock timeout.** FR02 intentionally maps an accepted elapsed-time guard to `EXPRESSION_STEPS_PER_MS`, a counted evaluation-operation budget, so replay decisions need no ambient time source. This is a **documented, scope-limited semantic deviation**, not a general rule for converting timeouts. A step budget does not bound elapsed latency, CPU per operation, or memory. Independently bound source bytes, parse nesting, evaluator depth, inputs/outputs and allocations, with typed fail-closed errors; if the product requires a real deadline, enforce it at an authorized Host boundary and obtain explicit Product/L2 agreement. Do not claim equivalent timing semantics or deterministic replay of real elapsed time.
- **Inject logical time for FR02 sealed expressions.** `$now()` and `$millis()` are derived from the declaration's explicit logical-time field, not a process clock. The SDK data-snapshot boundary rejects cycles, accessors, unsafe keys and non-portable numbers before evaluation. This does not require every other Domain Package or runtime to use declaration-injected clocks.
- **Document and independently review adaptations.** For every accepted v0.7 observable whose code, denial type, mechanism, or behavior changes in v0.8, identify the historic pin, the exact changed behavior, the Product/L2 acceptance authority and executable positive/negative evidence in the owning test or decision record. An R2 PR review and green CI are source-level gates only; preserve downstream selected-path and release gates.
`````

