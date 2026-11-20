# DIS v0.2.0 — Core Closure Repair R68 / Normative Gap-to-Source Audit

Status **DESIGN_AND_AUDIT_REPAIR_PENDING_EXACT_CI**; GitHub authority [#1496](https://github.com/kaicreator-mm/domain-harness/issues/1496), master Demo [#1499](https://github.com/kaicreator-mm/domain-harness/issues/1499), Draft [#1497](https://github.com/kaicreator-mm/domain-harness/pull/1497). This is a source-aligned candidate correction, **not an independent owner decision, SAP, merge or Freeze**.

## Why 9/16 stayed constant

The prior B04/R42 source inventory **hardcoded both** `unverified.length===7` and `verifiedCore:9 / partialCore:7`; readiness also demanded `partialCore===7`. This is circular validation: even a genuinely accepted next Core claim would be rejected or misreported, regardless of evidence. R68 changes these to **derive counts from the current Matrix**, keeps the 16 Core / 4 optional / 1 governance cardinality and exact planned missing-requirement set, retains independent semantic/SAP, selected Target and transport scope blockers, and still refuses fake governance. A synthetic 10/16 state in *test-only in-memory clones* proves the auditor itself no longer blocks legitimate progress; no real Matrix Core state is promoted.

## Mandatory obligations and owner boundary (Product/L1 #1496 + DIS R3)

| Open Core | Product/L1 / DIS normative requirement | Already source-qualified scoped evidence | Real residual gate and what is **not** a universal MUST |
|---|---|---|---|
| CORE-002 | DIS R3 §1–2 Element identity/version/description, cohesive multi-Function library and validation | B01, B07, B14–B16 original selected multi-Function and source/validation checks | Normative completeness of each Element Function metadata + original-source independent SAP for domain semantic cohesion; NOT a one-Function-one-Element rule |
| CORE-003 | DIS R3 §2 Public Function unique ID, **description**, typed input/output, outcomes and compatibility + per-Function binding | B01, B19, B20 selected original Tally/Runx/xDownload and DKE typed negatives | Actual `packages/contracts/dis-v020.mjs` function keys still omit **description**, and selected Function categories can omit full `contract`; these are real implementation gaps. Shape-valid returned business data is not independently qualified business truth |
| CORE-005 | DIS R3 §1 semantic relationships/constraints distinct from acyclic static dependency DAG and cross-Function references | B07/B16 source-pinned static/semantic graph and negative impact tests | Independent semantic owner/critic SAP and selected validity are still UNKNOWN; an acyclic relation graph itself cannot sign business constraints |
| CORE-006 | DIS R3 §5 Knowledge Reader/Query, Rule/Stateful owner semantics; SDK has no domain-state authority | B01/B12 exact original Runx PROCESS_LOCAL, Tally Rule, xDownload Knowledge and physical KDP SQLite cross-process test | Verify source-selected Function state ownership/contract and not-SDK authority. **There is no generic mandatory durable State Engine**; a source-defined PROCESS_LOCAL state is valid where the Domain declares it. Do not require physical Runx auto-rehydration without a separate normative contract |
| CORE-008 | DIS R3 §3 target-selected exact Package/Function/Resource/Host identity and source digest | B02/B03/B05 native selected installer Target and real process host rejection | Specify actually supported `target` variants and their source/implementation; **not** Windows+Linux+Android physical qualification for *every* app. Do not confuse manifest target labels with genuine host checks |
| CORE-014 | DIS R3 §5 UI-neutral progressive Interaction/Intent, no implicit Effect | B02/B06 real loopback Form/Chat and B11 OS CLI native selected Interaction, negatives | Source-selected UI-neutral next/clarification/UNKNOWN contract and domain policy acceptance; **not** production three-UI-engine deployment. Interaction itself is optional for Domain Apps that do not select it |
| CORE-016 | DIS R3 §7 versioned positive/negative original-source evidence and complete applicable MUST acceptance | B01–B21 **35/35** scoped native receipt rounds (R67 original #2376/1–3 3/3) | Block until C1–C3 accepted; historical receipt replays cannot substitute producer independent SAP or full Function Contract |

## Fixed execution direction

- **First:** unlock the actual progress counter by deriving it from current Matrix, not the frozen R42 snapshot; tests simulate 10/16 while proving unauthorized SAP/Target/transport promotion remains denied.
- **Second:** prioritize *real* Functional contract gaps (per-Function description and complete applicable I/O/typed outcomes/compatibility, source-owned state), not additional historical round counts.
- **Third:** Product/L1 selected-app applicability decision for Target and UI-neutral Interaction. Independent DKE source owner/semantic reviewer must provide semantic SAP; model-generated critique alone is not approval.
- **Fourth:** source-qualified Core updates may occur only with actually linked exact Git/CI positive/negative receipt, updated Closure Plan and independent gate evidence where required. CORE-016 and GOV-001 are downstream gates.

This correction remains **PROPOSAL/IMPLEMENTATION_REPAIR** until the actual source SHA earns fresh Woodpecker native 3/3 success. Optional 4 profiles NOT_RUN; independent SAP 0; physical Effects not newly qualified; no L2 Freeze/merge/release.
