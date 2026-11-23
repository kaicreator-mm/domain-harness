# DomainHarness 0.11.2 · R16：Intent 双 Workflow + 合并 Authorized Action 的两层 Domain Intelligence 方案

```ini
OUTPUT_LABEL=DH_V0112_R16_TWO_WORKFLOWS_KNOWLEDGE_ACTION_SCOPE_CONSOLIDATION
REPO=kaicreator-mm/domain-harness
VERSION_ISSUE=#1612
PRODUCT_PR=#1702
ORIGINAL_AUTHORIZED_ACTION_ISSUE=#1614
MODEL=KNOWLEDGE_SEMANTIC_LAYER_PLUS_WORKFLOW_BEHAVIOR_LAYER
WORKFLOW_MODES=INTENT_RECOGNITION_AND_INTENT_HANDLING
RECOMMENDATION=MERGE_ALL_AUTHORIZED_ACTION_SCOPE_INTO_V0112
VERSION_CHANGE=PROPOSED_NOT_CONFIRMED
L1=OWNER_FINAL_REVIEW_PENDING
L2=NOT_STARTED
SOURCE_CODE=NOT_STARTED
CI=NOT_RUN_DOC_ONLY
```

> 根据 Owner 新提问，**建议合并** v0.11.4 原定 Authorized Action 到 v0.11.2，使 Domain Intelligence 在一个内部阶段同时具备领域理解/确定性决策和真实受权行动。**本文件是架构与版本调整建议，尚不是 Owner 对合并的最终授权，也不改写已确认的权威版本 Roadmap。** 不先启动 L2 或代码。R15 两层模型延续，R14 四层 Semantic Port/Graph 方案保持 superseded。

## 1. 最简单的两层模型 + 两类 Workflow

```text
Request/Input
  → Intent Recognition Workflow (Recognizer + Validator, both consult Knowledge)
  → ValidatedIntent | ASK | UNKNOWN | REJECT | FAILED
       └─ only ValidatedIntent selects statically available Business Workflow
          → Intent Handling Workflow (knowledge/rules, state, decision, authorization, tool, effect)
          → WorkflowOutcome + Evidence + observed real Host result

KNOWLEDGE SEMANTIC LAYER
  Domain/Concept/Entity/Relation/Fact/Rule/Applicability/Intent-definition
  Business-State definition/Transition rules, Capability/Tool descriptors,
  Source/Version/Snapshot/Evidence, Query/Expression support

WORKFLOW BEHAVIOR LAYER
  Intent Recognition Workflow and Intent Handling Workflow
  using EXISTING StandardWorkflowSession / XState + Business Functions / Elements
```

**Important**: “Recognition Workflow” and “Handling Workflow” are roles of already existing Workflow capabilities; no two new Runtime classes, no universal Intent Engine, no mandatory subclass. Recognizer and Validator remain ordinary reusable functions/classes invoked inside the first Workflow. Other domains can provide a prevalidated trusted structured Intent via explicit contract; no mandatory NLP or LLM. Full NL Goal→Intent and multi-turn UI remain v0.11.3 #1613.

## 2. Small formal outcome and binding

**Conceptual candidate only; never claim as existing SDK exports:**

```ts
type KnowledgeSelection = { domainId: string; version: string; snapshotId: string; asOf: string };
type IntentCandidate<A> = { intentId: string; args: A; domainId: string };
type ValidatedIntent<A> = IntentCandidate<A> & { selection: KnowledgeSelection };

// Both workflows are normal TS functions/classes using the same Standard Workflow API.
// RecognitionWorkflow: Request -> WorkflowOutcome<ValidatedIntent<A>>
// HandlingWorkflow:   ValidatedIntent<A> -> WorkflowOutcome<BusinessResult>

// Consumer-written binding, statically selected during generation/installation:
// const handlers = { 'domain.operation': runBusinessHandlingWorkflow } as const;
```

- Recognition Workflow's `COMPLETE.value` must be a **ValidatedIntent**, not a candidate, confidence score, text explanation, or unverified LLM proposal.
- `ASK/UNKNOWN/REJECT/FAILED` at recognition must **not** select a handling workflow. Unknown/missing/ambiguous keys cannot fall back to the first handler.
- Handling Workflow must preserve all non-success outcomes; existing `root.invoke` **always wraps ordinary values in COMPLETE**; use `invokeOutcome` or `leaf` for business results after explicit mapping, as validated in `native-workflow-composition.ts`.
- Only static TS imports/explicit binding choose handlers; Knowledge may store intended Intent/Operation identifiers and schemas for the recognizer to consult, but may not select arbitrary executable code by user-provided name.

## 3. Moving v0.11.4 Business State + Capability + Tool + Effect into the two layers

| Original v0.11.4 mechanism | Knowledge layer | Workflow / execution use | Trust/authority boundary |
|---|---|---|---|
| Business State | State concept, schema, allowed transitions, Guard rules, applicability | Load actual state, verify version/CAS, request transitions | Authoritative state store/actual external system |
| Capability | Static capability/operation description and constraints | Query/authorize against actual caller, subject, target, current grant | Trusted Host/capability authority, never Knowledge declaration itself |
| Tool | Description, typed input/output, effect classification, applicable intent | Statically imported/selected Business Tool Function/Element | Allowed resource/Host integration, not a dynamic registry |
| Effect | Conditions, expected changes, desired outcome semantics | Explicit action call and observable result; no speculative success | Real Host or resource provider; errors/UNKNOWN retained |
| Journal/Receipt | Schema, correlation ID, expected evidence shape, permissible records | Bounded journal/attempt/ACK/readback and no blind replay | Transaction boundary / authoritative Host result |

**Business State values are not just Knowledge facts.** Knowledge can reference and snapshot observed values and allowed transition semantics; the current authoritative state and version must come from the real DB/state owner/Host. An outdated Knowledge snapshot cannot authorize a CAS transition.

**Capability semantic description is not a permission grant.** True authorization must check caller identity, domain/tenant/resource, allowed operation, policy and expiry at the trusted capability/Host boundary immediately before committing action. Workflow may request/check permission but cannot forge the authority. If separate process or remote system performs Tool execution, that executor must enforce effective authorization, not trust a boolean the Workflow computed earlier.

**KDP conflict review:** Existing `docs/specs/domain-harness/core.md` CORE-01/07 and `architecture.md` ARCH-05 make KDP a minimum lifecycle/error fallback; old v0.11.4 text calls it “KDP Permit/Host/Effect” central executor. The merge must not silently restore removed FunctionRef/Target/Lock/central dispatcher or make every business effect traverse KDP. L2 must reconcile this explicitly: use composable Standard authorization/Host/Effect Elements/Functions with real provider-owned authority; KDP retains lifecycle/uncaught-error ownership. An application may choose KDP-linked trusted host resources only where concretely justified, without declaring a new KDP universal permit ABI.

## 4. Handling Workflow: exact action order, not a new engine

```text
ValidatedIntent
   → load current authoritative Business State (version/tenant)
   → consult Knowledge rules + applicability + selected evidence
   → decide/guard whether proposed transition/action allowed
   → verify trusted Capability for actual caller + resource + operation
   → reserve idempotency/attempt identity and effect-intent record (when needed)
   → execute authorized Tool through trusted provider
   → observe Receipt / Readback / source-of-truth state
   → classify COMPLETE / REJECT / UNKNOWN / FAILED
   → update local business projection only with supported CAS / verified result
```

- **No Effect on ASK/UNKNOWN/REJECT or missing actual capability**.
- Denied permission `REJECT` is a business/authorization rejection, not automatically `FAILED`. Technology failures `FAILED`; uncertain external completion `UNKNOWN` until authentic readback.
- Side effects can be external/nontransactional: SQLite transaction cannot atomically commit another system's effect. No success or state projection update before real receipt/readback; journal/attempt records must be durable enough for **this version's minimum idempotency contract**, not imply full TaskRun checkpoint persistence.
- Idempotency key + input digest, duplicate same request and changed-payload same key, rejected permission, lost ACK, retry after UNKNOWN are **minimum negative tests**. Do not blindly re-execute a previously submitted effect on uncertain status.
- v0.11.6 still owns **cross-process TaskRun pause/resume/cancel/checkpoint and conservative restart orchestration**, not basic same-operation effect identity/receipt.
- DB Element + SQL/Text/Vector/Graph query Elements from R10/R13 serve Knowledge and can provide SQLite state/journal storage; DB abstraction cannot pretend ordinary SQLite transaction ensures external Host Effect atomicity.
- Every Resource/Host action must respect generation-time static trusted dependencies and runtime business authorization; the SDK does not become a malicious untrusted Package sandbox.

## 5. One version, two independently reviewable feature slices

Recommend fold all v0.11.4 scoped products into v0.11.2, **but make implementation slices finite**:

**Slice A · Knowledge/Intent:** generic Knowledge/Concept/Relation/Rule/Applicability/Source, SQLite/YAML/JSON-LD, SQL/Text/Vector/Graph, Expression, Intent Recognition Workflow, validated Intent and static matching to one Business Handling Workflow.

**Slice B · Authorized Handling:** state schemas/guards, state store CAS, capability declaration + trusted authorization, typed Tool/Effect provider, minimal durable attempt/receipt/readback and UNKNOWN/idempotency handling, action-oriented Handling Workflow; demonstrate real Host side effect without LLM or UI.

Independent scoped review after each complete slice + final composed external SDK-only Consumer showing read-only and authorized effect operations in two distinct Business domains. Do not “pass” just because Mock Host or docs look correct. Slice B cannot claim COMPLETE if authentic Host receipt is unavailable. **If scope is too large for one PR, split Task/PR within #1612, not into another 0.11.x product stage.**

## 6. Proposed v0.11.x version routing, not yet authoritative

| Version | Proposed after R16 |
|---|---|
| **0.11.2 #1612** | **Complete Domain Intelligence**: Knowledge + two Workflow roles + deterministic decisions + basic authorized business actions, real effects, data/state/receipt persistence. |
| **0.11.3 #1613** | Semantic Interaction: NL/multiturn intent refinement, forms/UI, explicit user confirmation; reuses Recognition Workflow without granting Host permission. |
| **0.11.4 #1614** | **Original scope fully absorbed into 0.11.2; mark historical superseded, no second Authorized Action implementation.** Preserve issue as traceability/acceptance crosswalk. Keep stage number reserved, do not renumber 0.11.5–0.11.9 automatically. |
| **0.11.5 #1615** | Bounded LLM reasoning: selected existing Knowledge+Workflow+authorized Tool capability, typed proposal; no independently granted model authority. Dependency effectively 0.11.2 capabilities + 0.11.3 Interaction. |
| **0.11.6 #1616** | Durable Execution: TaskRun lifecycle/checkpoint/advanced cross-process restart and conservative effect recovery; reuse 0.11.2 Journal/provider. |
| 0.11.7–0.11.9 | Execution Evidence / Experience / Evolution: reuse 0.11.2 Domain Knowledge + action observation, stay distinct. |

Before accepting R16: owner decision should explicitly update `docs/product/DomainHarness_v0.11.x_VERSION_ROADMAP.md`, #1612, #1614, #1613 and #1615 cross-references. Until then leave those confirmed roadmap scopes intact and note proposal in comments. Do not create an empty independent v0.11.4 implementation merely to preserve stage number.

## 7. Proposed L1 acceptance amendments (new, NOT_RUN)

| ID | Observable test |
|---|---|
| DI-AC35 | Same StandardWorkflowSession/XState mechanisms implement Intent Recognition and Intent Handling roles; candidate/ambiguous/invalid Intent cannot trigger handling |
| DI-AC36 | Recognition Query + Validator use selected Knowledge/rules/Applicability, emits valid typed intent; unknown/ASK/reject paths fully preserved |
| DI-AC37 | Selected Business Handling Workflow performs real read-only decisions and separately a real authorized Tool/Effect with correct current-state/CAS, genuine Host receipt/readback, no speculative COMPLETE |
| DI-AC38 | Knowledge Capability/Tool descriptions alone never grant action permission; wrong caller, tenant, resource, operation, revoked/expired grant fail closed before effect |
| DI-AC39 | Lost ACK, double submit, same identity with changed input digest, unknown outcome and readback inability do not duplicate effect or turn UNKNOWN into COMPLETE |
| DI-AC40 | Entire original v0.11.4 #1614 products/ACs covered by #1612 traceability and external SDK Consumer with real Host; #1614 stays open historical/superseded until owner confirms schedule update |
| DI-AC41 | SDK remains domain agnostic; two distinct Business Packages generated by Skill can use both workflow roles and action capabilities without editing SDK or introducing second runtime |

## 8. Owner choice

**Recommendation: YES**, two Workflow responsibilities, **YES** merge v0.11.4 into v0.11.2. Product still has two abstraction layers only, **but not two trust levels**: Knowledge definitions/claims do not grant capabilities, and Workflow may orchestrate actions only via permission-checked actual Host/owner resources. A release-grade action result cannot rely on simulated receipts. Keep #1614 traceable, avoid a duplicate implementation stage, and preserve v0.11.6 advanced TaskRun recovery boundary.

Current status `PROPOSED_OWNER_L1_REVIEW_PENDING`. No SDK code, no L2, no CI, no merge or formal roadmap override in this candidate.
