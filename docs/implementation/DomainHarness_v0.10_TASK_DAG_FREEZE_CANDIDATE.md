# DomainHarness v0.10 — Task DAG Freeze Candidate (Stage 2.4)

> **Status: TASK_DAG_FREEZE_CANDIDATE / REVIEW_REQUIRED / NOT_YET_ADMITTED.**
> This is a planning checkpoint proposal to be reviewed and merged before GitHub native Issue Dependency materialization. The old `DomainHarness_v0.10_TASK_DAG_PROPOSAL.md` remains *informative history only*. Frozen L2 exists on main; **v0.10 implementation, packed consumers and release have NOT RUN**.

## 0. Frozen authority and exact identity

```ini
STAGE=2.4_TASK_DAG_FREEZE_CANDIDATE
PARENT_ISSUE=1163
STANDARD=ADS_4.13.1@f35fcdb153ff171aaa0027b6e1b9c7592f28d3cd
INTEGRATION_BASE_AT_PLANNING=1c33bd1d4240a4d535ee1a8e9f26027908ddbbc2
CV_01_TO_12=INHERITED_UNCHANGED
PRODUCT_R3_BLOB=673da42ad90acde5ef942beb8ac63b58836a649f
PRODUCT_A01_REVIEWED_SOURCE_BLOB=ade9c96395501577a1734882074be9975e0fc770
PRODUCT_A01_ACCEPTANCE_BLOB=6777acf013a24229e7aa28b4c5b7768e6070b350
L2_REVIEWED_R3_BLOB=9e58c629b0a2074617ca3d38ac85d9527f284aab
L2_FREEZE_CHECKPOINT_BLOB=b7712055debbd8d36762e0a721cf69ab1a38516e
L2_FREEZE_MERGED_MAIN=1c33bd1d4240a4d535ee1a8e9f26027908ddbbc2
OLD_INFORMATIVE_DAG_BLOB=74898ff80cfeeb9dfd74464a2e5235098003c916
TASKS_PLANNED=16
P0_TASKS=14
P1_OPTIONAL_TASKS=2
RELEASE_NODE=R01
EXECUTION_ISSUES=NOT_MATERIALIZED
GITHUB_NATIVE_DEPENDENCIES=NOT_MATERIALIZED
SOURCE_BUILDER_EXECUTION=NOT_AUTHORIZED_BY_THIS_CANDIDATE
```

Product [R3 Freeze](../product/DomainHarness_v0.10_PRODUCT_FREEZE.md); accepted [A01 checkpoint](../product/DomainHarness_v0.10_PRODUCT_AMENDMENT_A01_ACCEPTANCE.md); actual independently reviewed R3 [L2](../architecture/DomainHarness_v0.10_L2_ARCHITECTURE_R0.md) at the pin above; [L2 Freeze](../architecture/DomainHarness_v0.10_L2_FREEZE.md). [Parent #1163](https://github.com/kaicreator-mm/domain-harness/issues/1163). Planning does not change reviewed Product or L2 bytes.

## 1. Canonical scope and nonnegotiables

1. **Single closed-world App:** BUILD chooses exactly one Node24 target-runtime SDK+Package variant set and qualified external/npm/native dependencies once. Runtime Microkernel only **load/connect/init/execute/dispose**; static Package trust/AST/hash/currentness checks reside upstream, not repeated by SDK. No QuickJS or arbitrary per-Package runtime. Ordinary private Node imports do not require Tool wrappers.
2. **Single K authority:** exactly one K Primary owns durable State/CAS/fence/admission/journal/effect/replay/UNKNOWN. B/S/K-extension/optional C cannot independently dispatch business-meaningful external Effects. K advisory hooks are revalidated, non-authoritative and never block original receipt replay through optional pre-K persistence. Build variant/persona checks must not replace live K Effect authorization.
3. **Real physical target identity:** all K records, including original immutable receipt, use injective tuple `[deployedAppId,tenantId,appId,businessPackageId,workflowId,instanceKey]`. Stable deployedAppId across new versions; separate build revision pin per ongoing instance. Do not rely on a first-match Business lookup or messageId-only observational keys.
4. **K02 includes three linked correctness concerns** #1109 16+ entry disposition liveness, #1110 canonical payload conflict, and exact immutable original receipt persistence (not reconstructed from latest snapshot); independent from K01 #1108 orphaned Effects; external C01 #1138 requires both.
5. **Semantic vs Tool:** S Package/Component owns bounded Rule/reuse/procedure/Workflow semantics. C Capability/Tool operations own bounded Model/Memory/query/external effects as appropriately approved. Memory/Context/Evidence/Shadow/Candidate have no new K Effect authority.
6. **No inflated gates:** delta-focused per-PR validation; actual Node24/SQLite/multi-Host/external Effect witnesses only for owning Tasks; one fixed exact candidate full/hidden/CJ/pack qualification. P1 T09/T10B remain optional, no automatic P0 release gate. No new 44-task audit, generic Host port abstraction, device/OS matrix, compatibility bridge or extra source-only research stage.
7. **Process:** dependency-complete Task Issues + real GitHub `blocked_by` edges, source Task/L3 contract and accepted Builder Claim before source changes. Planning document is immutable checkpoint, not a shared live Issue status lock. One concern/PR, JIT branches, risk-based review, exact HEAD and honest CI.

## 2. Executable DAG task definitions

| Node | Priority | Single concern | blocked_by (planned) | Minimum falsifiable P/N outcome |
|---|---|---|---|---|
| **T01** | P0 | Selected-v9 historical 44-row reachability + Semantic/Tool/K/BUILD classification | — (L2 Frozen) | Source-only family-level R/S/L/O register: every row ties to selected public v9 positive+negative witness or explicit ABSENT; group findings, no 44 separate code PRs; classify Tool READ/EFFECT vs pure semantic; preserve reviewable source SHA. |
| **T00** | P0 | Closed-world Node24 BUILD composes one K/S Primary plus selected K/S features | `T01` | BUILD pins exactly one Node24 SDK+K/S/B/C compatible graph and ordinary npm/native dependencies; known modules load/connect/init/execute/dispose; Basic skips advanced imports; selected 2K advisory + 3S physically separate features; deterministic duplicate/conflict/missing/profile rejection at BUILD, not runtime static attestation; protect K ports; no second engine or dynamic install. |
| **K01** | P0 | K Primary non-idempotent Effect admission-fence integrity (#1108) | — (L2 Frozen) | Two real Node Host processes and SQLite true-CAS at shared target: an in-flight non-idempotent effect cannot be displaced by competing claim before protected dispatch; no orphaned unaccounted effect; fail closed/UNKNOWN if unresolved; role/subject/currentness and live effect profile checks at actual dispatch. |
| **K02** | P0 | K Primary durable immutable original receipt + disposition liveness + changed-input conflict (#1109/#1110) | — (L2 Frozen) | Same-CAS original immutable acknowledged logical receipt persisted with K state/fence, not best-effort disposition; scoped injective tuple [deployedAppId,tenantId,appId,businessPackageId,workflowId,instanceKey], stable across releases with separate pinned-build identity; canonical input digest in turn identity; identical retry original receipt+idempotentReplay/zero new effect, changed input/intent typed conflict; 17+ turns, lost disposition, restart and competing writers never block or lie; stale/unknown legacy digest fail-closed, no pre-1.0 migration. |
| **T02** | P0 | Advanced SemanticDecision and bounded Rule→reuse→procedure→Model/Tool resolver | `T00` | Rule/exact reuse/promoted deterministic procedure avoid Model; optional no-model fast path; bounded inner loop, deadline/steps and declared operations; receipts don't invent measured model calls; forbidden semantic output or Effect cannot mint K permit. |
| **T03** | P0 | Workflow semantic loops, child, WAIT/RESUME, callback and deadline | `T00` | Selected Standard feature performs bounded cycles/child/wait/resume/callback across real K persisted occurrence, restart and dedup; parent/child/turn/callback identity uniquely scoped; no second RuntimeV3/Agent engine; K owns authoritative side effects. |
| **T04** | P0 | Scoped Memory Capability Basic | `T00` | Selected C typed put/get/search/delete with revision/CAS/TTL, real selected Node Host persistence; Business/tenant isolation, restart, denied scope; memory does not substitute K State/Journal and is optional for Tiny. |
| **T05** | P0 | Context Assembly and Agent-as-ordinary-Business-Workflow | `T02`, `T03`, `T04` | Assemble bounded provenance-bearing context with scoped Memory/Tool reads, optional Model; bounded Agent workflow uses same K admission/response, no agent-specific Runtime and no independent governed external mutation. |
| **T06** | P0 | Decision Evidence, dependency receipts and truthful observations | `T02` | DecisionTrace/ObservedDependencySet, actual Rule/reuse/Model source and unmeasured honesty; optional persistence fault cannot veto or forge immutable K receipt; no hidden Tool effect; denied vs admitted outcomes separated. |
| **T07** | P0 | Candidate validation and Shadow L4 evidence, zero production writes | `T06` | Validate version-pinned Rule/Skill/DecisionProcedure/Workflow candidate with counterexamples; shadow comparator cannot write prod State/Journal/Effect/Memory/cache; exact approved fallback only, no model self-activation. |
| **T08** | P0 | Governed new BUILD version selection and immutable in-flight pins | `T07`, `T03`, `K02` | Candidate activation exclusively through externally authorized new BUILD/deployment, not runtime package hot swap; new subject exact version, old occurrence pinned and replayable under stable deployedAppId; revocation/wrong digest/currentness (at BUILD/deploy) and unauthorized activation refused. |
| **T10** | P0 | Multi-B explicit scoped query with authorized-only ambiguity denial | `T00`, `K02` | Two B with identical workflow+instanceKey remain disjoint K State, Journal, effect, original replay; public query selects exact visible B and verifies caller before snapshot; unscoped ambiguity typed without exposing unauthorized B existence; no implicit first-match. |
| **C01** | P0 | Kernel-admitted external Effect C Operation/Node native adapter (#1138) | `T00`, `K01`, `K02` | Selected C adapter and ordinary private Node/npm client remain under K admission+permit+fence+effectId/Journal; accepted/running != terminal; external idempotency, restart, duplicate callback and lost-response UNKNOWN/reconciliation; missing/expired authority causes zero dispatch; do not embed runx/Tally app semantics. Negative: B/S attempting selected credentialed C effect without K-issued live permit typed denied, external calls=0. |
| **T09** | P1 optional | Recurring Meta Feedback Workflow | `T07` | Ordinary bounded Business Workflow consumes evidence/candidate/shadow; produces proposal only; never self-approves/publishes/activates. **Not P0 release prerequisite**. |
| **T10B** | P1 optional | Explicit queryMany cross-B aggregation | `T10` | Each queried target independently authorized, per-target outcomes/partial failure explicit, no spurious transaction or enumeration oracle. **Not P0 release prerequisite**. |
| **T11** | P0 | Two independently installed clean-packed Domain Apps (Tiny + Rich) | `T05`, `T08`, `T10`, `C01` | External clean install Node24+SQLite: Tiny Basic-only with no unused advanced modules; Rich 2B sharing identifiers, 2 separate K advisory and 3 selected S feature packages, Memory, Agent Workflow, Shadow L4, C native external Tool. Assert true K receipt/dedup/restart/UNKNOWN/CAS, two-B query no leaks, Effect bypass typed denied+zero dispatch, Shadow zero production Effects. T09/T10B not required. |
| **R01** | Release | One exact-SHA version closure, hidden/critical journeys and packaging | `T11` | On fixed candidate (not each PR) run required full regression, hidden validation, CJ/security/failure, real qualified Host and packed Tiny/Rich; resolve P0/P1 before release, record exception only when allowed; Release qualification separate from PR CI PASS. T09/T10B only if separately admitted as explicit release scope. |

**Topology:** 17 nodes = 16 implementation (14 P0 + 2 optional P1) + release R01. 24 proposed native dependency edges, no cycles, no missing refs. **First planned P0 ready set after native admission:** `T01`, `K01`, `K02`. This is *not yet a real ready set* until GitHub native dependencies and Issue contracts are verified.

## 3. Dependency set for GitHub native materialization

| Blocker | Blocked | Rationale |
|---|---|---|
| T01 | T00 | T00 requires the accepted T01 contract/evidence |
| T00 | T02 | T02 requires the accepted T00 contract/evidence |
| T00 | T03 | T03 requires the accepted T00 contract/evidence |
| T00 | T04 | T04 requires the accepted T00 contract/evidence |
| T02 | T05 | T05 requires the accepted T02 contract/evidence |
| T03 | T05 | T05 requires the accepted T03 contract/evidence |
| T04 | T05 | T05 requires the accepted T04 contract/evidence |
| T02 | T06 | T06 requires the accepted T02 contract/evidence |
| T06 | T07 | T07 requires the accepted T06 contract/evidence |
| T07 | T08 | T08 requires the accepted T07 contract/evidence |
| T03 | T08 | T08 requires the accepted T03 contract/evidence |
| K02 | T08 | T08 requires the accepted K02 contract/evidence |
| T00 | T10 | T10 requires the accepted T00 contract/evidence |
| K02 | T10 | T10 requires the accepted K02 contract/evidence |
| T00 | C01 | C01 requires the accepted T00 contract/evidence |
| K01 | C01 | C01 requires the accepted K01 contract/evidence |
| K02 | C01 | C01 requires the accepted K02 contract/evidence |
| T07 | T09 | T09 requires the accepted T07 contract/evidence |
| T10 | T10B | T10B requires the accepted T10 contract/evidence |
| T05 | T11 | T11 requires the accepted T05 contract/evidence |
| T08 | T11 | T11 requires the accepted T08 contract/evidence |
| T10 | T11 | T11 requires the accepted T10 contract/evidence |
| C01 | T11 | T11 requires the accepted C01 contract/evidence |
| T11 | R01 | R01 requires the accepted T11 contract/evidence |

T09 and T10B are optional successors and **no edge from either to R01 exists**. R01 requires T11 and all transitive P0 dependencies; conditional version scope decisions may separately admit P1 without changing P0 criteria retroactively.

## 4. Evidence ownership and cost

- **T01:** v0.8 retained 44-row manifest and successor outcome ledger; prove actual selected v0.9 public reachability. Pure source audit, no second v0.9 implementation claim.
- **T00:** exact BUILD composition, selected modules/features/ABI, target profile, production placement of once-only static checks. Reuse E2 #1151 **for K-extension seam design only**; production v0.10 and two-B consumer remain NOT_RUN. T00 fixtures may be internal build smoke; final clean-packed acceptance belongs T11.
- **K01 / K02:** selected K v0.9 source observed; must prove *new* behavior over physical Node Host CAS/fence/disposition. Shared Host means process contention/SQLite required by K01, original immutable receipt/collision/17+ by K02. Do not conflate PR PASS with verified safety.
- **C01:** Host selected C external adapter/provider, actual governed Effect; never trust accepted/running as terminal. Integrate K01+K02 before claiming non-idempotent effect success. Real live-check and permit negative live in C01/T11, not synthetic JavaScript network sandbox.
- **T02..T08 / T09:** all semantic intelligence belongs to selected Component/Capability/Business packages; K holds live authority and pins. Memory Evidence optional append failure never changes immutable receipt.
- **T10:** query authorization must precede existence lookup; hidden B never leaks through an ambiguity oracle. Depends on physically disjoint K02 record identity.
- **T11:** two clean-built external consumer Apps, not research fixture repackaging. P0 requires 2-B Rich, distinct K/S components and real Node24/SQLite/external-effect/UNKNOWN. T09/T10B remain absent where not selected.
- **R01:** one full/hidden/CJ/security/packing closure at fixed integrated SHA, not a fresh full suite for every small Task.

## 5. Planning Freeze → GitHub execution DAG admission

1. Reviewer inspects **this exact candidate source** for source-to-frozen Product/A01/L2 consistency, node closure, transitive edges, P0/P1 optionality and no new SDK trust rechecking. Material P0/P1 changes get bounded delta correction; docs-only required CI evidence is recorded accurately. Product/L2 do NOT reopen.
2. Accept this Task DAG **planning checkpoint** by PR merge, record exact full commit+blob at parent [#1163](https://github.com/kaicreator-mm/domain-harness/issues/1163) after actual readback. This state alone does not launch implementation.
3. Materialize the **16 executable Task Issues + R01** with canonical `type:`, `state:`, `review:`, risk, acceptance P/N, allowed write set, frozen exact inputs and per-concern real-host gates; link each Issue to this checkpoint.
4. Create exactly the 24 **native GitHub Issue Dependency** relationships listed above (`blocked_by`), perform native readback, verify graph acyclicity and no dependency on an unadmitted old issue merely because intake #1108/#1109/#1110/#1138 exists. Historical issues remain source evidence unless explicitly accepted as these new Task Issues.
5. Publish one **execution DAG admitted** checkpoint with task-to-Issue ID mapping and readback; recompute the real initial `READY` set and current integration SHA. No false `state:ready` based on Markdown edges alone. For any connector unable to write native edges, parent #1163 records `BLOCKED_NATIVE_EDGES` and provides pointer-only local handoff.
6. Then per-Task L3, authoritative serialized Claim and one PR/concern. Do not launch source implementation from this frozen plan alone.

## 6. Planning status

`TASK_DAG_FREEZE_CANDIDATE`: 17 nodes / 24 edges source-validated; no implementation Task has yet completed. `EXECUTION_DAG_NATIVE=NOT_MATERIALIZED`, `REAL_TINY_RICH=NOT_RUN`, `VERSION_CLOSURE=NO`, `RELEASE=NO`.
