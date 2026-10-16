# DomainHarness v0.8 — Product/Scope Freeze Checkpoint

> **Frozen Product/Scope, NOT L2/production/Release.**
>
> This is the Stage-1 checkpoint for the v0.8 implementation lane. The complete PRD and L1 Evidence are **copied byte-for-byte** from independently reviewed Product PR #991 into `v0.8`, which started from main `b5d851b568ffc7edec89ddbac0f706cf6301e8fe`. The source blobs were re-fetched after copying and have identical Git blob SHAs. A Product freeze does **not** pass architecture, runtime/CI/Hidden/Release testing or authorize skipping formal stage gates.

## 1. Authority and immutable identities

| Identity | Exact value |
| --- | --- |
| Repository | `kaicreator-mm/domain-harness` |
| ADS pinned standard | `kaicreator-mm/ai-development-standard@1edaee9291e25b6dd99303493bed75132cb54881`, v4.0.0 |
| User Product-scope approval | [#949@6106607603](https://github.com/kaicreator-mm/domain-harness/issues/949#issuecomment-6106607603) — user's verbatim "批准四项 Product 决策" (2026-10-11); **no independent identity/cryptographic signer claimed** |
| Product reviewed candidate | [PR #991](https://github.com/kaicreator-mm/domain-harness/pull/991) `c69ac3d3405f873e6ed628ab9a7112f66463a700`, tree `53066536c7c23911f895730ca8b50a0cd4d92cd1` |
| Source PRD blob | `18aac91c86fdc63a27ffb0d1e8c0e43859d8e068` |
| Source L1 Evidence blob | `c71d48925641ae1d6848dea7791efbe248febb37` |
| Independent exact-candidate Product Review | [#992@6106323783](https://github.com/kaicreator-mm/domain-harness/issues/992#issuecomment-6106323783) — **PASS_BOUNDED_PRODUCT_DOC**, P0=0/P1=0/P2=1 |
| Reviewed candidate Woodpecker | `ci/woodpecker/pr/verify=SUCCESS`, pipeline 1093/1; **same-SHA first pipeline 1091/1 FAILED** N17 SQLite contention; no flake waiver |
| Current version lane | `v0.8`, based on then-current `main@b5d851b568ffc7edec89ddbac0f706cf6301e8fe` |
| Version lane Product PRD blob | `18aac91c86fdc63a27ffb0d1e8c0e43859d8e068` — byte-identical to reviewed PR |
| Version lane L1 Evidence blob | `c71d48925641ae1d6848dea7791efbe248febb37` — byte-identical to reviewed PR |
| Version lane pre-freeze anchor | `v0.8@0e07364f93b21144a92448e9cd8207c78639c60e` containing both exact blobs |
| Freeze authority and dispositive record | [Issue #953](https://github.com/kaicreator-mm/domain-harness/issues/953) Controller and [#949](https://github.com/kaicreator-mm/domain-harness/issues/949) Product owner decision; exact terminal must reference this checkpoint commit SHA |

## 2. User-approved four-part Product boundary (now FROZEN at Product scope)

1. **PF-02 — Scoped trusted readback IN.** H-verifiable issuer/caller bound to tenant, app, instance and operation, Business reader role/workflow and K decision; untrusted raw `journal/query/kernelRuntime/observe` withdrawn or equivalently K-authorized; authorized typed subscribe/observe preserved; write caller assertions H-verifiable.
2. **FR08 — Truthful measured ModelPort counters IN.** Count operations only when witnessed/verified; otherwise explicit `unmeasured|unsupported`. Preserve declaration-level deterministic zero-call semantics. Existing experimental fake `1` is an implementation defect, not accepted telemetry.
3. **NF06 — Optional typed observation and previously delivered durability IN; new cross-record mandatory atomic receipt OUT.** Optional append failure typed; Node qualified durable observe, Journal, UNKNOWN, replay/recovery retained. Unsupported mandatory requests fail before irreversible effect and may not return false durable ACK. If the newly out-of-scope mandatory K/H atomic receipt is later requested, Product/feasibility reauthorization is required.
4. **Package-first B — RETAIN_B_CONDITIONAL.** Thin DomainHarness Microkernel loads approved `package`, physically selected Kernel Domain Package owns authoritative Runtime, Standard/Business Packages own their contract responsibilities. Bounded Package experiments and two business A/B exercises show enough feasibility for **Product direction only**; no full real-D2/D3 production PASS implied.

All previously delivered useful v0.1–v0.7 **functional** capabilities are IN for v0.8 retention/explicit Product disposition; old pre-v1.0 public API, ABI, wire/digest, historical persisted asset and cross-version replay/upgrade compatibility are OUT. Previously verified behavior must be covered by new v0.8 functional and negative evidence.

## 3. Mandatory Product P0/P1 and feasibility disposition (not a waiver)

| Concern | Product Freeze disposition | Still-required downstream gate |
| --- | --- | --- |
| Product contradiction P0/P1 on exact PR #991 | **0 known new** by independent #992 PASS_BOUNDED; approved user scope choices settled. P2-C102-01 residual old `P1-PROD-01=OPEN` wording is explicitly superseded by R6; historical references remain, no fresh re-review gate | Implementation and release must satisfy new stable scope |
| P1-PROD-01 comparative B value | `RETAIN_B_CONDITIONAL` approved based on canonical [#972](https://github.com/kaicreator-mm/domain-harness/issues/972#issuecomment-6098188937) bounded two-domain counterfactual and reviewed #994 selected K proof. This closes **the pre-Freeze choice**, not production proof | Formal L2 and release acceptance for two actual Apps, reusable K1 runtime, secure Effect/Host |
| Tech F1/F2/F3 trusted binding and must-understand | Existing evidence #963 and #978 plus #994 strongly supports bounded feasibility; historical Gate1 FAIL is **not retroactively called PASS**; approved revised v0.8 Product scope is achievable in principle, with exact trusted Byte→Component→Kind→Handler contracts to settle L2 | L2 authoritative ABI/security decision, production negative tests, independent architecture/security review |
| Graph identity and unsafe array descriptor P1 | #948 earlier known defects **not adopted**; [#956](https://github.com/kaicreator-mm/domain-harness/pull/956) `16037896d02fe5ba07159d07d4922375dc8553be` R3 candidate reviewed `PASS_BOUNDED` via #959; not a formal native Gate1 PASS | L2 adopt R3 contract/tests, new production conformance negatives |
| Actual Package-owned new-K1 State/Guard/Effect/Journal | [#994](https://github.com/kaicreator-mm/domain-harness/pull/994) exact `b9ea4d1f42246c61d5382328788c50741cac8e43` and [#993 independent evidence](https://github.com/kaicreator-mm/domain-harness/issues/993#issuecomment-6104775952) = Product **feasibility PASS_BOUNDED**, NOT implementation or release-ready | Formal source adaptation and native exact-version validation, #972 D2 and #973 D3 actual Apps |
| Host authentication / unauthorized read and write, truthful ModelPort count, Host-store journal tamper, crash multi-process, concurrent openInstance | Material unimplemented current-runtime and threat-model limitations acknowledged and allocated to L2/implementation/release; no assertion that they pass | Host/K/UX auth negative suite, counter instrumentation/unknown, strong durability semantics, fault and concurrency tests |
| v0.7 retained useful features, FR08 splits, NF01–06, DAC NEW-FUNCTION-01–06, CJ Journeys | Product contract and acceptance slots preserved by #992 checked delta; **not implemented as v0.8** | Task ownership; full regression + Hidden + critical journeys + package consumer + Release Qualification |
| CI N17/T016 flakes | exact reviewed Product document SHA has 1093 SUCCESS after 1091 FAIL; not product-source change; #953 parallel T016 local repair CLAIM @6106284288 | Infra correction and independent new exact-code SHA tests, without retry masking |

**Approved bounded disposition (not blanket waiver):** architectural/implementation P1s are not hidden or silently downgraded to P2. They remain fail-closed at L2 decision, normal code admission, and release validation; any contradiction showing approved Product infeasible MUST return through explicit Product reopening.

## 4. Stage transition / artifact and concurrency discipline

- **Stage 1 Product Scope:** explicitly user-approved; exact remotely reviewed Product PRD/Evidence blobs mirrored onto stable `v0.8` integration lane; Stage-1 checkpoint is **this file's actual Git commit**. #953 Controller must publish exact commit/tree/status terminal; document content alone is not a fabricated code PASS.
- **Stage 2 Architecture:** after Controller records successful Stage-1 checkpoint, adopt [research reuse PR #997](https://github.com/kaicreator-mm/domain-harness/pull/997) (15 assets, including #956 R3 successor repair). For each existing file/test mark `REUSE | ADAPT | REIMPLEMENT | REJECT`, exact SHA/path, negative/fault reuse and owner; #994 physical Kernel source/tests are primary. No further third A/B or generic demo.
- **Stage 2 output:** one L2 Architecture Evidence remote checkpoint, material unknown dispositions, L2 Freeze, **then** minimal Task DAG with explicit dependencies and write sets. A research PR being green is not permission to blanket merge it.
- **Production/closure:** one concern/one PR with JIT local/WEB lanes; formal actual Node Host executions, two non-trivial Domain Apps (Approval + Engineering dogfood), safety/functional retention, independent review, full regression, Hidden, critical journeys, packaging, candidate and release qualification.
- **No current code implementation authorized solely by this checkpoint.** Existing #953 T016 Test Infrastructure local claim remains isolated on its own branch, must not be duplicated.

### Stage-1 facts for machines

```ini
EVENT=V08_PRODUCT_SCOPE_FREEZE_CHECKPOINT
PINNED_ADS=1edaee9291e25b6dd99303493bed75132cb54881
SOURCE_REVIEWED_PR=#991@c69ac3d3405f873e6ed628ab9a7112f66463a700
REVIEW=#992@6106323783_PASS_BOUNDED
USER_SCOPE_APPROVAL=#949@6106607603_FOUR_APPROVED
PRD_BLOB=18aac91c86fdc63a27ffb0d1e8c0e43859d8e068
L1_EVIDENCE_BLOB=c71d48925641ae1d6848dea7791efbe248febb37
VERSION_BRANCH=v0.8
VERSION_PRE_FREEZE_ANCHOR=0e07364f93b21144a92448e9cd8207c78639c60e
CI_REVIEWED_HEAD=SUCCESS_1093_AFTER_FAILURE_1091_N17_DISCLOSED
TECH_GATE1=APPROVED_BOUNDED_PRODUCT_DISPOSITION_NOT_FORMAL_FULL_GATE1_PASS
TECH_GATE2=PASS_BOUNDED_PHYSICAL_KPK_NOT_FULL_IMPLEMENTATION
PRODUCT_P0_P1=0_KNOWN_AFTER_SCOPE_REVIEW
ARCHITECTURE_AND_IMPLEMENTATION_P1=CARRIED_MANDATORY_NOT_WAIVED
PRODUCT_SCOPE=FROZEN_SUBJECT_TO_ISSUE953_CONTROLLER_TERMINAL
L2=SEPARATE_STAGE_NOT_AUTOMATICALLY_PASSED
TASK_DAG=NOT_FROZEN
FORMAL_IMPLEMENTATION=NOT_PASSED
RELEASE=NOT_PASSED
```
