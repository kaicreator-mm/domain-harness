# DomainHarness v0.9 × ADS v4.12 — Shadow Dogfood R0 (mature-project fixture)

```ini
RECORD=DH09_ADS_V412_SHADOW_DOGFOOD_R0
SUBJECT_PROJECT=kaicreator-mm/domain-harness
SUBJECT_VERSION=v0.9_ONLY
SUBJECT_MAIN_BEFORE_PILOT=e64cd8ba23be8a39d18613cd97af0e156b812e83
APPROVED_STANDARD_AUTHORITY=kaicreator-mm/ai-development-standard@main:b9461d48d902a2c7c00adff6746afc7a02a0ac3e
PROPOSED_STANDARD=ADS_v4.12_PR1101@46a5ee29c47b57267aec7ef33c543123a2cd59c2
ADS_V412_PRODUCT_FROZEN_PRD_BLOB=0bfbf782c8859e79df52c9b57904ad80bcd718e9
ADS_V412_PRODUCT_FREEZE_CHECKPOINT=5820542ad1c092e09fa268f7e77a6db3421297b
ADS_V412_L2_R2_BLOB=9dd12912550bbd0db30d1f391084ae058eae56db
ADS_V412_L2_FREEZE=NO_AS_OF_PILOT
ADS_V412_NORMATIVE_ADOPTION=NO
SHADOW_MODE=READ_ONLY_ADVISORY_NO_NEW_GATE
PROJECT_PRODUCT=PR1048_FROZEN
PROJECT_L2=PR1053_FROZEN
PROJECT_DAG_PLANNING=PR1054_FROZEN
PROJECT_NATIVE_DEPENDENCIES=11_OF_11_VERIFIED
PROJECT_CORE_IMPLEMENTATION=0_OF_6
UPSTREAM_QUALIFICATION=#1006_OPEN_READ_ONLY
PROJECT_READY_SOURCE_TASKS=NONE
PROJECT_SOURCE_SCAFFOLD=NOT_CREATED
PROJECT_RELEASE=NOT_RUN
RUNTIME_OR_CI_PROOF_FROM_THIS_RECORD=NONE
```

## 1. Authorization, scope, and stop rule

This is a **real-project, GitHub-sourced shadow application** of the developing ADS v4.12 Product/L2 proposal to the existing **mature** domain-harness v0.9. It is *not* an adoption of unfinished v4.12 standards, a new Controller/Steward, a second Task DAG, a new Issue, a source-code Scaffold, or an approval to reopen already frozen v0.9 Product/L2/Task DAG. **Current merged/pinned approved ADS owners remain authoritative** for real Claims, Review, work-item changes, native Issue dependencies and Release. A v4.12 proposed rule is evaluated only as an optional falsifiable advisory and can be rejected without blocking legitimate v0.9 work.

User directions preserved: this conversation **only advances v0.9**; v0.8 #1006 is read **only** to establish the inherited real release dependency. Intermediate PR CI waiting may be skipped by user direction, but this neither creates a green CI status nor removes the selected real Node24/SQLite Host, independent security/Full/Hidden/packed external consumer or release truth floors.

ADS candidate identity: [v4.12 PR #1101](https://github.com/kaicreator-mm/ai-development-standard/pull/1101) **Draft, unmerged**, exact Git HEAD `46a5ee29c47b57267aec7ef33c543123a2cd59c2`; Product R3 actually has an explicit [exact-source Freeze record](https://github.com/kaicreator-mm/ai-development-standard/blob/planning/v4.12-cross-stage-contracts-20261014/docs/product/PRODUCT-FREEZE-v4.12.0-R3.md), blob `bca75b1cdba94153918e927651e99cacc028a7e6`. L2 [source-first R2](https://github.com/kaicreator-mm/ai-development-standard/blob/planning/v4.12-cross-stage-contracts-20261014/docs/architecture/V412_L2_ARCHITECTURE_EVIDENCE_R0.md) is explicitly **NOT FROZEN**; so the v4.12 Scaffold/DAG Pair method is a *hypothesis*, not a mandatory v0.9 predecessor or official normative gate.

### Source-backed v0.9 actual snapshot

- [Product PR #1048](https://github.com/kaicreator-mm/domain-harness/pull/1048) defines frozen JS/TS Core, not a universal OS test matrix; [L2 Freeze PR #1053](https://github.com/kaicreator-mm/domain-harness/pull/1053) is anchored to independently reviewed exact architecture blob `4b127f22473c231f7fad8bbf8332260d2f4a6918`.
- [Task DAG Freeze PR #1054](https://github.com/kaicreator-mm/domain-harness/pull/1054), source blob `65d8eca86bb11d2dbb84333fb09554d0e558aba6`, was already legitimately frozen BEFORE this v4.12 pilot. Its six native execution concerns: #1027, #1032, #1035, #1028, #1036, #1037.
- GitHub native REST `blocked_by` **read back in this pilot**: `1027←1006`; `1032←1027`; `1035←1027`; `1028←1027`; `1036←1032,1035,1028`; `1037←1032,1035,1028,1036`: **11 actual edges**, no guessed textual substitute.
- [N01 L3 planning PR #1058](https://github.com/kaicreator-mm/domain-harness/pull/1058) merged `e64cd8ba23be8a39d18613cd97af0e156b812e83`, byte-real [N01 test/contract handoff](../v0.9/N01_KS_C_WORKFLOW_ROUTER_L3_PREP.md), blob `e0ac56ffc83a27b37fca2de461c04a05642341a0`. It is **planning**, not source implementation.
- #1006 is **OPEN**, so #1027 is **not** eligible for new source work; all six v0.9 core implementation Issues are OPEN. No legal `/v9` source implementation, approved Scaffold source-writing Claim, or release PASS is inferred.

## 2. v4.12 W1–W5 shadow decision table (not official Gate results)

| Proposed v4.12 predicate / read | Actual v0.9 observation | Shadow decision and practical value | Evidence class |
| --- | --- | --- | --- |
| **W1 / FR-01** per-stage `INLINE/BOUNDED_WORKLIST/EXPLICIT_DAG` | Product/L1 and Architecture/L2 are already frozen; six Implementation Issues have 11 true native edges | **SUPPORTED** for this mature project: retrospective L1/L2 are bounded research/worklists; Implementation is an explicit existing native DAG. Never mint new DAG-P/DAG-A issues or rerun frozen stages to satisfy a proposal | LIVE_GITHUB |
| **W1 / FR-03** prospective Scaffold before full DAG only for eligible claimed work | Repository already mature; frozen v0.9 DAG exists, source code remains gated | **NO_SCAFFOLD_NEEDED**: retain valid existing repo, frozen DAG and normal post-release source authorization. The PRD's *new project* Scaffold-before-DAG path is **UNTESTED** by this mature-project pilot | BOUNDED_APPLICABILITY |
| **W1 / FR-04** one Task↔Source anchor/writer map and paired Freeze | Real files exist for L2/DAG/L3 docs; N01 K/S/C v0.9 implementation paths do **not** yet exist or have an accepted source-writing Claim | **PARTIAL**: document high-level owned concerns (#1027 K/S/C, #1032 H/BUILD, #1035 public API, #1028 selected physical adapter, #1036 integration, #1037 evidence). Do **not** invent concrete Scaffold paths, SF checksum, auto-generated map or paired Freeze PASS. Re-evaluate only when real v0.9 source anchors are legally written | SOURCE_READBACK + UNKNOWN |
| **W2 / Steward** adviser must distinguish real blocking authority vs stagnation | Native edge `#1027 blocked_by #1006`, no READY implementation, all downstream blocked | **SUPPORTED**: this is dependency wait, not an orphan/stalled Builder; no duplicate Task or synthetic unblocking. Controller may prepare non-authoritative handoffs, not claim readiness | LIVE_NATIVE_DAG |
| **W3 / Environment** prepare only selected real environment when task requires it | v0.9 Core is JS/TS; first selected actual reference profile Node24 ESM + protected H/SQLite, after downstream N02/N06 admission | **SUPPORTED**: WEB owns planning; actual Node24/real SQLite physical cases require appropriate Build Host *when ready*. No universal Windows/Linux/WSL2 matrix, no environment PASS from this document | FROZEN_PRODUCT_AND_L2 |
| **W4 / Task Outcome & Learning** reuse one result and bounded factual metadata | #1058 is a merged source-independent L3 preparation; source implementation and actual tests are not run | **SUPPORTED** outcome `PREPARED_ONLY`, learning: useful exact source-inventory/negative matrix, blocked release gate, no fabricated cost/agent performance or new learning DB; quantitative savings = UNKNOWN | VERIFIED_ARTIFACT + UNKNOWN_COST |
| **W5 / Research/Reuse/Quality** reuse first, constrain additional demos/review | Frozen exact K/S/C reuse candidate observed from prior branch, not a release-qualified source; independent L2 accepted already | **SUPPORTED_WITH_SCOPE** reuse precise contract and existing tests; do not carry old SHA/source-only PASS into new release. Stop duplicate design rounds until actual high-impact contradictory evidence | SOURCE_AND_REVIEW |
| **Risk-Bounded Value First / Validation economy** | Only #1027 is first critical predecessor; no extra v0.9 optional provider/OS scope; release securities are material | **SUPPORTED** avoid new P0 optional packages, extra demos, 44-like repeated suites; **DENY** omission of trust/permission/real effect/UNKNOWN, selected Host and final full/hidden/pack gates | SCOPE_BOUND |

These are **8 documentary application checks**, not 8 automated executable tests or proof of ADS v4.12 implementation correctness. No time/token/compute savings measured.

## 3. Falsification: what must fail under this proposed policy

| Negative counterexample | Expected shadow disposition | Reason |
| --- | --- | --- |
| F01: a developing ADS v4.12 draft `SHOULD` is treated as higher authority than approved v0.9 Product/L2 or merged current ADS standards | **DENY** | candidate cannot silently re-freeze existing project or alter authority |
| F02: #1027 is marked READY / a source Scaffold file is written solely because v4.12 Product R3 is Frozen or N01 planning doc merged | **DENY** | #1006 native blocked-by still OPEN; v4.12 Product Freeze does not provide #1027 Claim |
| F03: a task↔Scaffold mapping invents `src/v9/*` files and marks them real, or a generated index is accepted without exact source verification | **DENY** | physical source identity/current writer evidence absent |
| F04: Node24/SQLite first-reference profile is expanded into mandatory universal Windows/Linux/WSL2/QuickJS test matrix | **DENY** | contradicts frozen v0.9 JS/TS Product scope |
| F05: old v0.8 selected source bytes or historical CI results are promoted to v0.9 executable/Release PASS | **DENY** | exact subject, runtime, environment and release-gate mismatch |
| F06: skipped routine PR CI is reported as green/full/hidden/packed/security test pass | **DENY** | omission of execution evidence never proves assurance |
| F07: Steward opens more Issues/demos merely because the implementation count is 0/6 while all tasks have real blocked-by parents | **DENY** | real critical-path dependency is not inactivity/claim liveness failure |
| F08: cost-saving rationale drops effect authorization, revocation, CAS/UNKNOWN or independent release assurance | **DENY** | core/material security and external-effect floors cannot be waived for ROI |

**Current execution evidence:** these are **source-backed negative specifications**, not actual executed ADS checker results. `PASS_REAL_CHECKER=NOT_RUN`. Do not mark `NOT_APPLICABLE` for a material future source map without verifying genuine absence of a required source anchor.

## 4. Prospective next checkpoints — only once actual project work advances

- **N01 start** (requires #1006 actual Release qualified and native dependency resolved): read back accepted Claim, actual source Task write set and permitted owner, map K/S/C source anchors **then** check against v4.12 FR-04 *in shadow*; collect actual `writer vs consumer`, `file existence`, `shared-export collision` and `source-vs-Task drift` negatives. Neither scaffold nor Task graph needs to be recreated.
- **N06/N07/N02 concurrency** (only after N01): test whether proposed single writer per shared module accurately prevents a real collision; record a counterexample if two Tasks claim the same central barrel, ABI export or Host registry path. Use actual accepted claims, never invented actors.
- **N08 / N09 closeout**: shadow-classify actual H→K/Effect/sensitive-subscribe security currentness, selected Node24 evidence identity, independent review and final hidden/packaged consumer; count actual duplicated executions only when logs exist. Report cost as `UNKNOWN` without matched baselines.
- **Feedback to ADS v4.12**: label each observation `SUPPORTED | FAIL_CASE | UNKNOWN` with exact Git/Issue source, whether a concrete v4.12 normative/source change is needed, and affected owner W1–W5. Only a real executable contradiction warrants new research/task split. **Do not modify ADS standard from a domain-harness trial**; ADS #1096/PR #1101 remains owner of candidate adoption.

```ini
PILOT_TERMINAL=SHADOW_APPLICABILITY_APPLIED_TO_REAL_MATURE_V09
REAL_NATIVE_DAG=11_OF_11
SCHEMA_OR_CHECKER_EXECUTION=NOT_RUN
SCAFFOLD_SOURCE=NONE
PAIRED_SCAFFOLD_DAG_FREEZE=NOT_APPLICABLE_TO_THIS_RETROACTIVE_SNAPSHOT
IMPLEMENTATION_PERMISSIONS=UNCHANGED
NEXT_MATERIAL_TRIGGER=ACTUAL_V08_#1006_RELEASE_AND_V09_N01_AUTHORIZED_SOURCE_CLAIM
```
