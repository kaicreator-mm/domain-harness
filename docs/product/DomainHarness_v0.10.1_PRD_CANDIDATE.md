# DomainHarness v0.10.1 — Agent Improvement SDK Suite PRD (CANDIDATE)

**Status:** `L1_PRODUCT_CANDIDATE / PRODUCT_FREEZE_NOT_RUN / L2_NOT_FROZEN / TASK_DAG_NOT_FROZEN`.
**Ownership:** Parent [#1274](https://github.com/kaicreator-mm/domain-harness/issues/1274).
**Target branch:** `v0.10.1`, created from `main@65a1b5d68bc59695c6cff7ee2ec9d861c5a6ee10`; branch creation is **not** a Release qualification. v0.10 R01 release evidence qualified exact SHA `936749c4f7e334376d600383d8635986d48882f0`, distinct from post-release main. Existing `v0.10` ref is 206 commits behind creation base.
**ADS pin:** `4.13.1@f35fcdb153ff171aaa0027b6e1b9c7592f28d3cd` at inherited `.dev-standard/VERSION`—do not replace it with floating ADS v4.17 research.
**Architecture:** CV-01..CV-12 inherited unchanged; v0.10 closed-world selected K/S/B/C composition preserved. This PRD does **not** change a Kernel ABI, admission policy, runtime trust, lifecycle or version pin.

## 1. Product problem
v0.10 already provides a selected Standard Primary, Advanced SemanticDecision, Workflow, Context, Memory, DecisionEvidence, Candidate/Shadow and Effect-admitted C Operations, but not a publicly packaged, re-usable, application-neutral **Agent evaluation/diagnosis** feature set. Agent applications (e.g. Tally) need reusable source-qualified analysis primitives without copying their business policy into the Kernel or treating an unverified report as a Task PASS.

The suite should enable consumers to **BUILD-select independent optional Standard Feature Packages** rather than installing all features into a monolith. Core `Tiny` App must continue to run with zero new Feature imports.

## 2. Deliverable scope — separable Package concerns

| Concern | ID/featureExport | Contract / actual value | Consumer separation |
| --- | --- | --- | --- |
| C01 #1275 Agent Diagnostics | `standard:agent-diagnostics/1` / `analyzeAgentRun` | observed first failure, ambiguities, distinct event and verifier refs, duplicate refusal, repeated same-class failure *candidate* | MAST/TraceML taxonomies and root-cause policies remain Business/task-meta |
| C02 #1276 Candidate Evaluation | `standard:candidate-evaluation/1` / `evaluateCandidateEvidence` | source-pinned matched cohort, positive/negative oracle requirements, hidden visibility and conservative comparison/inconclusive | real grader/benchmark/Shadow runner belongs Host/C, promotion belongs Business governance |
| C03 #1277 Experience Reuse | `standard:experience-reuse/1` / `assessExperienceApplicability` | match current project/task/rule/source, stale/conflict/counterexample detection, advisory candidate refs | C Memory owns storage; Tally chooses adoption |
| C04 #1278 Bounded Experiment | `standard:bounded-experiment/1` / `planBoundedExperiment` | bounded proposal, budget and isolation prerequisites, no production effects, explicit NOT_RUN | K admission/Shadow is actual enforcement, Host is runner, Business selects probe |
| C05 #1279 Adaptive Workflow — reuse decision only (default `NO_NEW_PACKAGE`) | existing `standard:semantic-decision/1` + `standard:workflow-control/1` primarily | prove reuse first; no new package if generic semantics already suffice | Tally Engineering B owns `CONTINUE/PIVOT/REVISIT` policy |

Feature IDs are **candidate identifiers**, not stable released package identities until BUILD and Product/L2 qualification. User authorization permits source prototypes, not source Review PASS.

### Exact optional closure (P1-2 disposition)

**Four candidate feature packages, plus one reuse decision C05.** C01, C02, C03 and C04 each declare **`role: standard-feature`, `abiVersion: dh.v10.standard-feature/1`, `dependencies: []`, `requires: []`, and `externalImports: {node: [], npm: [], native: []}`**. They do **not** require any other new S Feature at BUILD; each may be selected separately or in **any subset of the four (16 combinations including none)**. Package-local read-only functions accept caller-supplied evidence **as data**, and do not import/invoke T06 DecisionEvidence, T07 Shadow, C Memory or T08 BUILD version helpers as runtime dependencies. References to these established owners mean **conceptual data-source reuse**, not a selected BUILD dependency or runtime entry point.

| Feature | Declared BUILD `requires` | Declared package `dependencies` | Additional required Capability / Business Package | Dependency meaning |
| --- | --- | --- | --- | --- |
| C01 `standard:agent-diagnostics/1` | `[]` | `[]` | None | T06 supplies normalized source-qualified **data**, not an import; C01 projects event→diagnosis only |
| C02 `standard:candidate-evaluation/1` | `[]` | `[]` | None | External verifier/Shadow results are supplied as data; no embedded grader or Shadow runner |
| C03 `standard:experience-reuse/1` | `[]` | `[]` | None | C Memory/Context may supply data, but its store is not linked or loaded by this feature |
| C04 `standard:bounded-experiment/1` | `[]` | `[]` | None | Existing Shadow/Workflow are conceptual downstream consumers, not a required Feature import |

The **Domain App itself** still needs exactly one K Primary, one S Primary, >=1 B and whatever C packages its real application behavior demands; “no feature-owned required B/C” never makes a Package a standalone Domain App. FR07 missing-`requires` negative uses a **synthetic Standard Feature** declaring an unavailable `standard:missing/1`, not a fake dependency on C01–C04. If a future implementation adds any nonempty `requires`/imports, it must return to the Product/L2 Owner for explicit closure/compatibility review rather than silently weakening optionality.

## 3. User-visible success and acceptance criteria
**FR01:** With K Primary + S Primary + >=1 B and its app-required C closure, a consumer can choose **any one of C01–C04, any subset, all four, or none**, and only those physically selected modules exist in the sealed install/import closure. Zero optional features preserves the Tiny baseline. All four are independent (`requires: []`); no feature changes v0.10 K commit semantics.

**FR02:** C01 distinguishes observed failure and potential repeated-failure signature from causality; duplicated attempt events do not double count; ambiguous parallel ordering stays ambiguous; missing verifier is not PASS.

**FR03:** C02 only makes provisional comparative diagnoses on exact pinned, semantically comparable verifier evidence. An incomplete/contaminated held-out evaluator, stale subject or invalid negative oracle yields `INCONCLUSIVE` or `INVALID_EVALUATION` (never a comparable winner); **promotion remains solely with the Business/ADS governance Owner**, and no S Feature can mark an ADS Gate PASS.

**FR04:** C03 may suggest only source-qualified applicable experience candidates for downstream review; conflicting rules, mismatched project/task audience, failed evidence and stale code without an independently checked compatibility reference are refused or marked uncertain.

**FR05:** C04 produces a bounded experiment *proposal* only. **All four C01–C04 are pure advisory packages** by producer contract and selected BUILD import policy: `externalImports: {node: [], npm: [], native: []}`, and no declared tool/operation/effect provider, remote access, dynamic-import/require/eval side path. The ordinary sealed BUILD import checker rejects modules importing `node:fs`, `node:net`, `node:child_process` or another undeclared external dependency **before their source is imported**. Independently, the Host **must provide data-only `trustedDependencies`** to `invokeSelectedStandardFeature`: bounded plain JSON-like data and immutable evidence refs only, with **no callable capability handler, effector, Kernel handle, store connection, Host secret or authorization token**. App/Host integration must verify denial/not-reached with an injected effector and forbidden-import fixture **for each feature**. Existing selected packages are trusted approved code (CV-01); the generic facade **does not independently sandbox or prove side-effect freedom**, so this property is an explicit producer + BUILD + Host calling contract, tested at its owners. C04 cannot independently prove physical zero production writes; real Shadow isolation is Host-owned and K Admission still controls effectful operations. High-risk/production effects require a separate lawful Owner and are not enabled by this Suite.

**FR06:** A composed Rich App selects C01–C04 and existing v0.10 Decision/Context/Shadow as **independent optional features**. All four use the existing **CT-02 read/evaluation named semantic direct Facade** `invokeSelectedStandardFeature`, with data-only `trustedDependencies` and independent physically selected modules. They **must not** become state-changing S Primary `interpret` routes or bind a caller-supplied decision as the admitted event. Only state-changing T02/T03 semantics route S Primary → K Admission; #1267 remains the exclusive repair owner. If #1267 updates the facade contract, this Suite must adapt its selected CT-02 usage without forked entrypoint. C01 consumes already normalized T06 DecisionEvidence **data only**, not a replacement for T06's normalization responsibilities.

**FR07:** Reuse existing v10 BUILD checks for closure/cycles, duplicate S provider, wrong role ABI, undeclared/forbidden imports, missing `requires` (synthetic fixture) and tampered module digests **before import**. A missing/non-callable declared `featureExport` is detected **at the earliest selected import/init/invocation point** and must fail typed before it can count as a successful invocation; do not falsely attribute runtime-export inspection to byte-only BUILD. Restart sees the same pinned closure.

**FR08:** v0.10 Tiny/old Rich behavior and K permission/Effector/Journal remain unchanged; physical cross-version regression must use a qualified current source pin. Source-only artifact or V8 probe does **not** count as actual Node24 BUILD/install, independent Review or Release qualification.

## 4. Adversarial acceptance matrix (minimum)
- C01: 2 failures same family but true causal root unknown; same commit tested twice; duplicate event id; 2 parallel failures same sequence; wrong SHA; getter/prototype smuggling; partial/unknown verifier.
- C02: baseline/candidate matched source and all oracles PASS; one negative oracle FAIL; hidden grader leaked; cohort mismatch; code under verifier SHA differs; independent grader missing; original successful Task regressed.
- C03: exact qualified compatible positive; historical candidate with known negative; plausible same-topic wrong tenant; stale Rule; missing compatibility evidence; repeated candidate ID.
- C04: low-risk isolated complete proposal; production environment named SHADOW without evidence; over-budget; no verifier; proposal with external Effect flag; aborted run/unknown actual state cannot produce 'success'.
- ABI: Tiny no optional imports and unchanged existing v0.10 behaviour; single-feature C01/C02/C03/C04 and all subsets of C01–C04; Rich four physically selected features, duplicate provider/unsafe K extension denial, source pin immutable on restart.
- ABI negative cases: selected `featureExport` missing or not callable (typed failure at selected load/invocation); wrong `dh.v10.standard-feature/1` ABI; synthetic required `standard:missing/1` closure failure; `V10_DIGEST_MISMATCH` on altered module bytes; duplicate `provides` collision and malformed `externalImports`.
- Purity P/N per C01–C04: a module with undeclared `node:fs`/`node:net` import fails sealed BUILD before import; a Host-supplied callable effector/Kernel handle is rejected at integration data-only dependency boundary or demonstrably never reachable; pure input remains valid. No source-only mock test may claim physical K/Host zero-write evidence.
- Regression FR08: execute the **unchanged prior Tiny and Rich v0.10 journeys** under qualified exact baseline and compare Task/critical journeys, including CAS/Admission/Journal/Effect/restart; separately test v0.10.1 optional features.
- Cross feature: diagnostic result never minted as PASS, comparison result never auto-promotion, experience similarity never K authority, experiment plan never an Effect permit.

## 5. Explicit non-goals
No trainable optimizer/model, hidden-CoT collection, task-meta raw Trace, Tally scheduler/Agent manager, duplicate Memory store, reimplemented Shadow/Kernel, autonomous code modification, new K Extension solely to label Agent failures, dynamic runtime Package download, new v0.10 ABI, new always-on Gate, new universal Host/OS matrix or automatically replayed irreversible effects.

## 6. Integration / governance
- **Source prototypes:** four draft PRs #1280–#1283, each targeting `v0.10.1` with physically separate `dh.v10.standard-feature/1` modules. Prototypes are not admitted production Tasks and may be amended or rejected after Product/L2 Review.
- **Current owner overlap:** #1267 S Primary→K admission routing in active repair; do not conflict. #1270 atomic genesis outstanding; integrated concurrency tests must cover it but the current v0.10.1 suite does not assume it was fixed.
- **L2 next:** after independently accepting Product Freeze, validate actual ABI/feature dispatch reachability and selected BUILD/Host data-only dependency enforcement, decide C05 reuse (default `NO_NEW_PACKAGE`), freeze L2, admit Task DAG and qualified Builder Claim, *then* mature drafts for independent exact-SHA review.
- **Validation:** `Node24` repo tests, v10 BUILD, physically separate clean install using packed tarballs and SQLite Host, optionality and adversarial negatives, integrated full version/Hidden/critical journeys. Physical validation: `NOT_RUN`.
- **Publication:** one concern/one PR to version branch; no merge to main before full integrated v0.10.1 qualification; no historical frozen v0.10 edits.

## 7. Sources
[Research synthesis #287](https://github.com/kaicreator-mm/harness-research/issues/287), [NeurIPS 2025 #289](https://github.com/kaicreator-mm/harness-research/issues/289), [ADS v4.17 intake ai-development-standard#1279](https://github.com/kaicreator-mm/ai-development-standard/issues/1279), [v0.10 composition #1141](https://github.com/kaicreator-mm/domain-harness/issues/1141), [Strategy reuse #1273](https://github.com/kaicreator-mm/domain-harness/issues/1273). Upstream research outcomes are advisory design evidence, not actual SDK runtime validation.
