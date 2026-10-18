# DomainHarness v0.10 — Product Amendment A01 Acceptance Checkpoint

> **Status: ACCEPTED_PRODUCT_AMENDMENT_A01 / SCOPED_NORMATIVE_SUCCESSOR / L2_NOT_YET_FROZEN / RELEASE_NO.**
> Exact historical R3 frozen PRD/Crosswalk/DAG remain byte-identical; this checkpoint authorizes only the specifically listed A01 successors, not a second rewrite of the original Product document.

```ini
EVENT=DH010_PRODUCT_A01_ACCEPTED
ACTOR_ROLE=PROJECT_PRODUCT_CONTROLLER
DECISION=ACCEPT_REVIEWED_DELTA_WITH_NONBLOCKING_P2_CLARIFICATION
STANDARD=4.13.1@f35fcdb153ff171aaa0027b6e1b9c7592f28d3cd
FROZEN_R3_PRD_BLOB=673da42ad90acde5ef942beb8ac63b58836a649f
FROZEN_R3_PRODUCT_FREEZE_BLOB=985833413e3be20b26b95b1ce066ca24e0a34745
FROZEN_CROSSWALK_BLOB=2832ce0b4269737d934b071a6c2e830deefec629
INFORMATIVE_DAG_BLOB=74898ff80cfeeb9dfd74464a2e5235098003c916
A01_SOURCE_PR=1158
A01_INDEPENDENT_REVIEWED_HEAD=35218b02397777a1d8371c3819b989fd8d56006a
A01_INDEPENDENT_REVIEWED_BLOB=ade9c96395501577a1734882074be9975e0fc770
A01_INDEPENDENT_R3_REVIEW=ISSUECOMMENT_6250928697
A01_R3_REVIEW_CONTENT=PASS
A01_R3_P0=0
A01_R3_P1=0
A01_R3_P2=1_NONBLOCKING
A01_SOURCE_MERGED_MAIN=489f53c00c0aacf89d87e24d1562f6345fe028ba
A01_REVIEWED_BLOB_EQUAL_SOURCE_MERGED_MAIN=YES
SOURCE_HEAD_CI=ci/woodpecker/pr/verify:SUCCESS
PRODUCT_AMENDMENT_A01=ACCEPTED
L2=NOT_FROZEN
EXECUTABLE_TASK_DAG=NOT_ADMITTED
IMPLEMENTATION=NOT_PROVEN
RELEASE=NO
```

## 1. Controller disposition and review evidence

Product/L1 controller **accepts A01's reviewed content** based on independently recorded Claude Code [Product A01 R3 PASS](https://github.com/kaicreator-mm/domain-harness/pull/1158#issuecomment-6250928697) on the exact proposed subject HEAD `35218b02397777a1d8371c3819b989fd8d56006a`, containing blob `ade9c96395501577a1734882074be9975e0fc770`, with **P0=0 / P1=0 / P2=1** and no new K Effect bypass. That same blob was merged into main through [PR #1158](https://github.com/kaicreator-mm/domain-harness/pull/1158) at `489f53c00c0aacf89d87e24d1562f6345fe028ba`; the exact source-head Woodpecker required check passed.

The one nonblocking P2 suggested explicitly naming **K Extensions** and **C Packages outside a K-admitted Operation** in the existing universal ban on independent governed Effect dispatch. The editorial follow-through in the accepted Product text **does not change** A01's reviewer-validated `every business-meaningful external effect → K Admission → selected C Operation → effectId/Journal/UNKNOWN` semantics. This checkpoint's accepted status and linked project-principle/override status lines constitute authority/disposition bookkeeping, **not unreviewed changes to Product requirements or a re-performance of the independent R3 content review**.

## 2. Exact precedence of this amendment

A01 replaces **only** the packaging/trust/selected-graph validation mechanism in frozen PC-05; adjacent PC-06/PC-08 static-negative/activation interpretation; frozen Product P2-5 pre-execution check ownership; frozen §3 Kernel-family `actual bytes/currentness` **static** wording; and EX-01 `without arbitrary package network imports` **mechanics** wording. Product A01 explicitly permits BUILD-selected ordinary Node/npm/native imports in trusted Domain Packages and assigns static compatibility/dependency/provenance decisions to Package generation/BUILD, optional distribution integrity to deployment. The runtime SDK then loads known modules, connects, inits, executes and disposes; it is **not** a second Package hash/AST/approval/issuer/compatibility checker.

**Effect authority is not relaxed:** actual caller/B/tenant identity where needed; single K Primary State/CAS/fence/Journal/Effect/Replay/UNKNOWN authority; K pre-effect admission; selected C Operation/adapters; truthful external completion, and Shadow/Evidence isolation all remain. An installed Package is trusted code, but its private npm imports cannot justify bypassing K for payment/device/job/remote business effects governed by CT-04/EX-01–04.

All other v0.10 frozen Product/L1 and seven P2 requirements remain in place with unchanged historical blobs. Runtime implementation, cross-B integration, real SQLite CAS/effect fencing, native packaging and release validation are **not claimed** as proven by this document.

## 3. L2 predecessor handoff

- [L2 #1148](https://github.com/kaicreator-mm/domain-harness/issues/1148) / [PR #1149](https://github.com/kaicreator-mm/domain-harness/pull/1149) may now use **accepted** A01 ordinary Node/npm semantics and shift Package static tests upstream. L2 must still record its own reviewed exact SHA, independently dispose real design P1s and establish an exact L2 Freeze checkpoint before formal Task DAG admission.
- [E2 research #1150](https://github.com/kaicreator-mm/domain-harness/issues/1150) closed at its qualified **single-Business seam-only** scope via [PR #1151](https://github.com/kaicreator-mm/domain-harness/pull/1151); it is not a packed Rich App or multi-B implementation pass.
- The cross-version CV-01..12 baseline is inherited; `AGENTS.md` and `.dev-standard/PROJECT_OVERRIDES.md` now link to this independently accepted Product exception so no stale `A01 PENDING` language is a future ambiguity.

**No new Product requirements, Build-only static security framework, runtime Package attestation or whole SDK test matrix are introduced at acceptance.**
