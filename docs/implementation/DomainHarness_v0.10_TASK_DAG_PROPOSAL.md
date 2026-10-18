# DomainHarness v0.10 — Proposed Task DAG (NOT ADMITTED)

> **Status:** Product/L1 design seed only; **no formal implementation DAG, Issues or executable task authorizations yet**. Parent [#1139](https://github.com/kaicreator-mm/domain-harness/issues/1139), baseline `main@af069e8319f290093db004a59ad18c572ebc5b26`.
>
> This is not permission to implement before Product/L1 focused review, exact Product Freeze and L2 Architecture Freeze. No old-source, CI or v0.9 evidence is falsely relabeled as v0.10 implementation PASS. One concern per PR; consolidate historical tests rather than create 44 tasks.

## 1. Boundary and sequencing

```mermaid
flowchart TD
  P[Product Freeze] --> A[L2 Package/ABI architecture]
  A --> B[T01 Historical v9 + Tool audit]
  B --> Z[T00 Composable K/S package families]
  A --> K1[K01 Admission Fence integrity]
  A --> K2[K02 Durable Disposition healing]
  Z --> C[T02 Four-source Decision + bounded loop]
  Z --> D[T03 Workflow child / wait / recovery]
  Z --> E[T04 Memory Capability]
  Z --> Q[T10 Precise two-B query P0]
  K1 --> X[C01 External Effect Tool P0]
  K2 --> X
  Z --> X
  C --> F[T05 Context & Agent Workflow]
  D --> F
  E --> F
  C --> G[T06 Decision Evidence + Receipt]
  G --> H[T07 Candidate + Shadow L4]
  H --> I[T08 Governed new-version selection]
  F --> J[T11 Two packed reference consumers]
  I --> J
  Q --> J
  X --> J
  J --> R[Version Closure/Release Qualification]
  H --> L[T09 Meta Feedback P1 optional]
  Q --> M[T10B cross-B queryMany P1 optional]
  L -. if admitted .-> R
  M -. if admitted .-> R
```

- **One authoritative K Primary and one S Primary/entry** plus selected, independently sealed **K extensions and S feature packages** in the proposed v0.10 ABI (v0.9 has exactly 1 physical K/S); independent B1..Bn and selected Capabilities. Standard **logical components** may co-reside inside one S.
- **L2 first** must decide typed Primary/Extension roles, scoped K hooks, deterministic Standard feature dispatch, transitive exact dependencies, ordered init/dispose and unsupported-required-feature typed refusal; then check the exact selected K/S API contract for loops, scope binding, currently permitted Operation/Handler class, host read vs mutation and multi-B identity. Broaden K/BUILD only if actual targeted P/N falsification shows a generic missing primitive.
- All code in current public-v9 selected execution path or selected/package-owned implementation; never import `/v3` private runtime state into new runtime facade as a shortcut.

## 2. Candidate DAG table

| Task | Stage | Concern / minimal deliverable | Dependencies | Targeted P/N acceptance |
|---|---|---|---|---|
| **T01** | P0 | **v0.1–v0.6 → v0.9 44-row capability audit + Tool/Semantic classification** per migrated capability: SEMANTIC, TOOL_READ, TOOL_EFFECT, KERNEL_PROTOCOL, BUILD_OR_LIFECYCLE or SPLIT; exact selected public-v9 reachability (R/S/L/O) | L2 | For each selected row: target package/authority + Tool exposure/effect class + currentness/visibility + actual selected-path positive/negative evidence; no 44 new Issues/full suites |
| **T00** | P0 | **Composable K/S package families**: one K Primary + 0..N bounded K Extensions; one S Primary + 0..N physically separate Standard Feature Packages; BUILD/ABI closure, typed hooks and scoped dispatch. [#1141](https://github.com/kaicreator-mm/domain-harness/issues/1141) | T01 | Two actual packed consumers (minimal 0 extensions vs complex 2K ext + 3S feature), deterministic conflicts/missing/cyclic deps, no duplicate K authority, forbidden-effect/role negatives |
| **T02** | P0 | **Advanced Decision Component**: 4-source resolver + bounded Business Harness/Model↔read-query inner loop, declared semantic decision compiled ABI | T00 | Rule/cache/promoted avoid Model call; LLM optional; maxSteps/timeout; wrong event/capability denied before Effect; one K admission |
| **T03** | P0 | **Generic Workflow extension**: bounded loops/child/WAIT/RESUME/deadline/callback and compiled IR reference reuse | T00 | Child result, suspend/restart, duplicate callback/message, a bounded cycle with exact K state/journal; no new RuntimeV3 |
| **T04** | P0 | **Memory Capability Basic**: scoped put/get/search/delete, CAS revision, TTL and data isolation | T00 | Real selected Host/Storage read-write, cross-B/tenant negative, restart persistence, no Memory Kernel branch |
| **T05** | P0 | **Context Assembly + Agent Workflow** through generic AW and Memory Capability; model optional | T02,T03,T04 | Context source provenance, budget, bounded Agent work, deterministic/no-model mode, no unapproved business mutation |
| **T06** | P0 | **Decision/Evidence Component**: dependency refs, truthful source/model-count, optional DecisionResolutionReceipt and failures | T02 | Origin and `unmeasured` truth, denied/unavailable vs admitted, optional append failure leaves K truth unchanged; forged source rejected |
| **T07** | P0 | **Candidate Validation + Shadow L4** reference as approved Package Components | T06 | Candidate validation, shadow counterexample, 0 production State/Effect writes, exact stable fallback, no floating alias |
| **T08** | P0 | **Governed versioned Pattern/Workflow selection** using existing BUILD/DAC/H approval | T07,T03 | Validated candidate selected only through new sealed approved assembly; revocation/wrong digest/pre-change pin fail-safe; old instance unchanged |
| **T09** | P1 | **Meta Feedback Workflow** over Runtime Evidence → Candidate → Shadow comparison | T07 | Ordinary Business/Meta Workflow, bounded evidence access, no own approval authority; no automatic production activation |
| **K01** | P0 | **#1108 Kernel Primary Admission Fence concurrency integrity**; independent earlier hotfix accepted when already proven | L2 | Two real H processes/true-CAS, non-idempotent Effect in flight, competing same-revision admission: no orphaned unaccounted successful effect or unsupported unsafe success; UNKNOWN/reconcile/fail-closed where remote commit cannot be fenced |
| **K02** | P0 | **#1109 Kernel Primary missing-Disposition self-healing and 17+ history liveness** | L2 | Lost best-effort append AFTER committed State, new message progress after history fills without original resend, safe CAS healing, 0 duplicate Effect, mismatch/host-failure negatives |
| **C01** | P0 | **#1138 Generic sealed Host external effect adapter**: accept/running/terminal/UNKNOWN, idempotency→adapter, callback/query reconciliation; no runx-specific code | T00,K01,K02 | Two different synthetic external adapters through real v10 public K/H, accepted≠terminal, restart/lost response/duplicate callback/outage/revocation; unsafe profile refused before dispatch |
| **T10** | P0 | **Multi-B scoped query + ambiguity refusal (QR01/QR03)** | T00 | Two B same `instanceKey`, explicit target yields correct scoped result; unscoped collision refuses, independent authorization, no first-match leak |
| **T10B** | P1 | **Optional queryMany cross-B aggregation (QR02)** | T10 | Per-target authorized results and partial failure; no cross-B atomicity claim or P0 release dependency |
| **T11** | P0 | **TWO packed consumers**: tiny Basic only + rich 2B/Agent/Shadow/Memory/Host External Effect on qualified Node/SQLite | T05,T08,T10,C01 (and proven K01/K02 through C01); T09/T10B optional | Tiny imports no advanced module. Rich: separate physical K/S feature modules; exact scoped two-B query (no required queryMany), 0 unnecessary Tool calls, denied effect 0 dispatch, real restart/CAS/UNKNOWN and disposition recovery, truthful receipt, Shadow 0 production effects |
| **R01** | Release | One fixed-SHA full/hidden/CJ/security/packaging + release qualification, tag decision | T11 + admitted P1 | Full source + independent release evidence; `PR_PASS != RELEASE_PASS` |

**No progress percentage should be reported from this candidate DAG as if work had begun.** This is a planning count (**16 proposed task seeds including K01/K02/C01/T10B + release**), not 0/16 executable GitHub Issues. Once Product/L2 frozen, synthesize **only actual missing** executable Issues and their necessary dependency edges.

## 3. Task-to-historic proof reuse guidance

- **T00** implement/verify selected BUILD/ABI multi-package closure and protected H→K composition without giving any extension a second State/Journal/Effect authority. Two real packed App cases: Basic-only and rich selected extensions; no monolithic bundle pretending to be modular. If 2 useful K extension mechanisms cannot stay safe/independent, raise a Product feasibility HOLD for that slice rather than relaxing the invariant.
- **T01** additionally classify semantic vs independently invoked Tool/Operation vs K internal control vs BUILD/lifecycle, and split mixed functions. Do not turn DecisionResolver/HarnessMachine/Context/Shadow into Tool merely because they internally call Model/Query; do not export raw K State/Journal/Admission as Tools. Test zero unnecessary Tool dispatch and authorized read-only/effectful invocation. See [crosswalk §1a](../roadmap/DomainHarness_v0.10_HISTORICAL_CAPABILITY_CROSSWALK.md).
- **T01** consult [v0.8 frozen 44](./DomainHarness_v0.8_RETAINED_FUNCTION_MANIFEST.json), [R12 successor ledger](../validation/v0.8/tg1006-44-row-successor-outcome-ledger.md), [v0.8 Release qualification](../validation/v0.8/tg1006-release-qualification.md), [v0.9 qualification](../validation/v0.9/n09-release-qualification.md); source presence != current ABI acceptance.
- **T02** re-use v0.3 `harness-machine.ts`, `decision-resolver/resolver.ts`, `semantic-cache/`, v0.6 `runtime/decision-resolver-binding.ts` at historic `7c367188…`; FR07/FR08/FR12/NF05.
- **T03** re-use FR01/HF18/HF32, v0.5 `compiled-workflow-ir-v3.ts`, `compiled-workflow-runtime-v3.ts`, `compiled-workflow-message-effects-v3.ts`; only preserve semantics, not authority.
- **T04/T05** new portable Memory/Context contract; reuse existing K Effect/Journal and selected physical Store, no general Cairn replacement.
- **T06** FR08 SD1/SD2, HF26, NF06 optional receipt history; no mandatory cross-record durability claim.
- **T07/T08** `runtime-evidence/{capture,shadow,fallback}.ts`, `candidate/`, `promoted-artifact/` and `promoted-child/`; migration to v9 sealed ABI.
- **T09** new Meta Workflow built from L4 proposal seam, not an old shipped autonomous runtime.
- **K01/K02** use current official selected K Primary implementation at `packages/domain-harness-compiler/src/qualified-package/payload/kernel-mechanism-v1.mjs`; fix real two-process fence and 16-entry disposition liveness under actual true-CAS. Do not delegate core safety to a plugin; existing targeted earlier hotfix may qualify as exact reused evidence.
- **C01** #1138 reuse Host Tool binding #1082 and durable callback #1062, add only minimal external Effect Port (no general streaming/PTY/cancel), requires K01/K02 selected safety or explicit non-admission of unsafe profile.
- **T10** P0 v0.9 public `query()` first-match limitation becomes scoped unambiguous two-B lookup; **T10B** optional P1 aggregates per-B reads, never required in P0 fixture.
- **T11/R01** TWO bounded clean-packed consumers: tiny Basic-only and rich two-B/Agent/Shadow/Memory/External Tool scenario. One final version-level full/hidden/CJ/packaging wave; no fixed OS matrix beyond actually supported selected Host profile.

## 4. Definition of Done for Product/L2 planning (before opening task Issues)

1. User-approved Product priority including composable K/S package families (one Primary per family + selected extension/feature packages) and P0/P1 cut, with realistic v0.10 version budget; candidate's potential overruns routed as next-version P1 follow-ups.
2. Exact `main` SHA, v0.9 delivered public-v9 ABI, available selected S roles/capabilities, and gap mapping reviewed.
3. L2 interface for deterministic BUILD package graph/role resolution, K typed extension hooks, **non-Tool Standard Semantic Component dispatch vs separate Tool/Operation contracts (read-only/effectful/visibility)**, plus Loop, SemanticDecision, Model and Tool observations, Memory, Context, evidence, Candidate and Shadow. One Primary K and entry S, physically selected optional extensions/feature packages; no unapproved Agent write Tool.
4. Explicit source of authorization for newly promoted artifacts without mandatory GitHub owner/account identity or falsely automatic model self-approval.
5. Product P0 is fixed at scoped QR01/QR03, KH01/KH02 and EX01–04; P1 queryMany (T10B), recurring Meta Workflow (T09) and rich Tool stream/cancel are **NOT required** for v0.10 P0 Release unless separately admitted via an explicit successor decision.
6. Proposed DAG then split into smallest independent implementation Issues; #1108/#1109 remain independently repairable Kernel issues, and #1138 P0 minimal Host Port is a **separate concern** that depends on their physical selected safety proof. No second scheduler, K Journal or runx-specific implementation.

## 5. Scope protection and test cost

- Delta-focused tests and read-only code review per PR; one version-level full regression + hidden + critical journeys + packaging; reuse prior exact evidence for unchanged immutable artifacts where semantically valid. No automatic dozens of test tasks.
- Agent/Memory/Workflow semantics do not expand **Microkernel**; Kernel change only after documented falsifier proving an irreducible generic primitive, under a separate Product/L2 concern.
- Current authorized Host/Kernel permission is required; LLM/Meta/Memory never mint new execution rights or overwrite in-flight pins.
- No v0.1–v0.7 wire format compatibility, unrelated new operating system test matrix, general distributed transaction engine or automatic Meta promotion in the first version.

**Provisional planned stage = Product/L1 candidate only.** #1141 is a Product intake issue, not an executable implementation Issue. This v0.10 proposal supersedes the single-physical-S default for *future v0.10 only*, while preserving exactly one K authority and one Standard entry.
