# DomainHarness v0.10.1 — Agent Improvement SDK Suite PRD (CANDIDATE)

**Status:** \`L1_PRODUCT_CANDIDATE / PRODUCT_FREEZE_NOT_RUN / L2_NOT_FROZEN / TASK_DAG_NOT_FROZEN\`.
**Ownership:** Parent [#1274](https://github.com/kaicreator-mm/domain-harness/issues/1274).
**Target branch:** \`v0.10.1\`, created from \`main@65a1b5d68bc59695c6cff7ee2ec9d861c5a6ee10\`; branch creation is **not** a Release qualification. v0.10 R01 release evidence qualified exact SHA \`936749c4f7e334376d600383d8635986d48882f0\`, distinct from post-release main. Existing \`v0.10\` ref is 206 commits behind creation base.
**ADS pin:** \`4.13.1@f35fcdb153ff171aaa0027b6e1b9c7592f28d3cd\` at inherited \`.dev-standard/VERSION\`—do not replace it with floating ADS v4.17 research.
**Architecture:** CV-01..CV-12 inherited unchanged; v0.10 closed-world selected K/S/B/C composition preserved. This PRD does **not** change a Kernel ABI, admission policy, runtime trust, lifecycle or version pin.

## 1. Product problem
v0.10 already provides a selected Standard Primary, Advanced SemanticDecision, Workflow, Context, Memory, DecisionEvidence, Candidate/Shadow and Effect-admitted C Operations, but not a publicly packaged, re-usable, application-neutral **Agent evaluation/diagnosis** feature set. Agent applications (e.g. Tally) need reusable source-qualified analysis primitives without copying their business policy into the Kernel or treating an unverified report as a Task PASS.

The suite should enable consumers to **BUILD-select independent optional Standard Feature Packages** rather than installing all features into a monolith. Core \`Tiny\` App must continue to run with zero new Feature imports.

## 2. Deliverable scope — separable Package concerns

| Concern | ID/featureExport | Contract / actual value | Consumer separation |
| --- | --- | --- | --- |
| C01 #1275 Agent Diagnostics | \`standard:agent-diagnostics/1\` / \`analyzeAgentRun\` | observed first failure, ambiguities, distinct event and verifier refs, duplicate refusal, repeated same-class failure *candidate* | MAST/TraceML taxonomies and root-cause policies remain Business/task-meta |
| C02 #1276 Candidate Evaluation | \`standard:candidate-evaluation/1\` / \`evaluateCandidateEvidence\` | source-pinned matched cohort, positive/negative oracle requirements, hidden visibility and conservative comparison/inconclusive | real grader/benchmark/Shadow runner belongs Host/C, promotion belongs Business governance |
| C03 #1277 Experience Reuse | \`standard:experience-reuse/1\` / \`assessExperienceApplicability\` | match current project/task/rule/source, stale/conflict/counterexample detection, advisory candidate refs | C Memory owns storage; Tally chooses adoption |
| C04 #1278 Bounded Experiment | \`standard:bounded-experiment/1\` / \`planBoundedExperiment\` | bounded proposal, budget and isolation prerequisites, no production effects, explicit NOT_RUN | K admission/Shadow is actual enforcement, Host is runner, Business selects probe |
| C05 #1279 Adaptive Workflow | existing \`standard:semantic-decision/1\` + \`standard:workflow-control/1\` primarily | prove reuse first; no new package if generic semantics already suffice | Tally Engineering B owns \`CONTINUE/PIVOT/REVISIT\` policy |

Feature IDs are **candidate identifiers**, not stable released package identities until BUILD and Product/L2 qualification. User authorization permits source prototypes, not source Review PASS.

## 3. User-visible success and acceptance criteria
**FR01:** A consumer may select C01 only, with S Basic + one K Primary + its Business/Capability closure; unselected C02–C04 are absent from the install/import set. No feature changes v0.10 K commit semantics.

**FR02:** C01 distinguishes observed failure and potential repeated-failure signature from causality; duplicated attempt events do not double count; ambiguous parallel ordering stays ambiguous; missing verifier is not PASS.

**FR03:** C02 only makes provisional comparative diagnoses on exact pinned, semantically comparable verifier evidence. An incomplete/contaminated held-out evaluator, stale subject or invalid negative oracle blocks comparative promotion; no S Feature can mark an ADS Gate PASS.

**FR04:** C03 may suggest only source-qualified applicable experience candidates for downstream review; conflicting rules, mismatched project/task audience, failed evidence and stale code without an independently checked compatibility reference are refused or marked uncertain.

**FR05:** C04 produces a bounded experiment *proposal* only. It cannot run physical Tools or independently prove zero production writes. High-risk and production effects require a separately admitted effective owner, with no implicit permission escalation.

**FR06:** A composed Rich App selects C01–C04 and existing v0.10 Decision/Context/Shadow; all four can be invoked via lawful named S Feature read-only entry, isolated in their physical modules. The Standard Primary owns any state-changing semantic decision route to K—#1267 remains exclusive repair owner.

**FR07:** v10 BUILD verifies dependency closure, duplicate S provider, wrong ABI, malformed exports, missing dependencies and tampered module digests before import. Restart sees the same pinned closure.

**FR08:** v0.10 Tiny/old Rich behavior and K permission/Effector/Journal remain unchanged. Source-only artifact or V8 probe does **not** count as actual Node24 BUILD/install, independent Review or Release qualification.

## 4. Adversarial acceptance matrix (minimum)
- C01: 2 failures same family but true causal root unknown; same commit tested twice; duplicate event id; 2 parallel failures same sequence; wrong SHA; getter/prototype smuggling; partial/unknown verifier.
- C02: baseline/candidate matched source and all oracles PASS; one negative oracle FAIL; hidden grader leaked; cohort mismatch; code under verifier SHA differs; independent grader missing; original successful Task regressed.
- C03: exact qualified compatible positive; historical candidate with known negative; plausible same-topic wrong tenant; stale Rule; missing compatibility evidence; repeated candidate ID.
- C04: low-risk isolated complete proposal; production environment named SHADOW without evidence; over-budget; no verifier; proposal with external Effect flag; aborted run/unknown actual state cannot produce 'success'.
- ABI: Tiny no optional imports, Rich four physically selected features, duplicate provider/unsafe K extension denial, source pin immutable on restart.
- Cross feature: diagnostic result never minted as PASS, comparison result never auto-promotion, experience similarity never K authority, experiment plan never an Effect permit.

## 5. Explicit non-goals
No trainable optimizer/model, hidden-CoT collection, task-meta raw Trace, Tally scheduler/Agent manager, duplicate Memory store, reimplemented Shadow/Kernel, autonomous code modification, new K Extension solely to label Agent failures, dynamic runtime Package download, new v0.10 ABI, new always-on Gate, new universal Host/OS matrix or automatically replayed irreversible effects.

## 6. Integration / governance
- **Source prototypes:** four draft PRs #1280–#1283, each targeting \`v0.10.1\` with physically separate \`dh.v10.standard-feature/1\` modules. Prototypes are not admitted production Tasks and may be amended or rejected after Product/L2 Review.
- **Current owner overlap:** #1267 S Primary→K admission routing in active repair; do not conflict. #1270 atomic genesis outstanding; integrated concurrency tests must cover it but the current v0.10.1 suite does not assume it was fixed.
- **L2 next:** independently validate actual ABI/feature dispatch reachability and selected BUILD/Host test wiring, decide reuse/admit C05, then freeze Product/L2, admit dependency graph and qualified Builder Claim, *then* mature drafts for independent exact-SHA review.
- **Validation:** \`Node24\` repo tests, v10 BUILD, physically separate clean install using packed tarballs and SQLite Host, optionality and adversarial negatives, integrated full version/Hidden/critical journeys. Physical validation: \`NOT_RUN\`.
- **Publication:** one concern/one PR to version branch; no merge to main before full integrated v0.10.1 qualification; no historical frozen v0.10 edits.

## 7. Sources
[Research synthesis #287](https://github.com/kaicreator-mm/harness-research/issues/287), [NeurIPS 2025 #289](https://github.com/kaicreator-mm/harness-research/issues/289), [ADS #1279](https://github.com/kaicreator-mm/ai-development-standard/issues/1279), [v0.10 composition #1141](https://github.com/kaicreator-mm/domain-harness/issues/1141), [Strategy reuse #1273](https://github.com/kaicreator-mm/domain-harness/issues/1273). Upstream research outcomes are advisory design evidence, not actual SDK runtime validation.
