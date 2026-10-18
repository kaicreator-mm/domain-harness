# DomainHarness v0.10 — Historical Functional Capability → Current Package / v9 Reachability Audit

> **Status:** L1 EVIDENCE CANDIDATE (source-location map, not a v9 executable audit); **Parent:** [#1139](https://github.com/kaicreator-mm/domain-harness/issues/1139). **Baseline:** `main@af069e8319f290093db004a59ad18c572ebc5b26`, qualified v0.9.0-rc1. Created 2026-10-18.
> Do not change [v0.8's frozen 44-entry retained-function manifest](../implementation/DomainHarness_v0.8_RETAINED_FUNCTION_MANIFEST.json) or re-label exact old evidence. This successor is **functional reuse**, not legacy artifact/ABI compatibility.
> Companion: [v0.10 PRD Candidate](../product/DomainHarness_v0.10_PRD_CANDIDATE.md) and [candidate DAG](../implementation/DomainHarness_v0.10_TASK_DAG_PROPOSAL.md).

## 1. Precise testable question

A v0.8 test passing or an old source file still existing on main does **not** prove that its functionality executes using today's `@kaicreator/domain-harness/v9` public path with a **physically selected approved Kernel, Standard, Business, Capability and Host binding**.

Audit columns below are **target ownership**, not proven actual current ownership. Each legacy function must eventually be classified:
- **R — REACHED**: demonstrated from packed clean v9 public consumer through sealed real selected K/S/B/H, including a focused relevant negative.
- **S — SOURCE_ONLY**: selected current source suggests behavior but no qualified selected public P/N witness is mapped.
- **L — LEGACY_ONLY**: behavior only in prior v3/old ABI; current v9 route unavailable.
- **O — OUT / SUPERSEDED**: old ABI representation or platform obligation no longer relevant; useful semantic has explicit replacement.
- **N — NEW**: planned v0.10 mechanism not previously delivered.

**Initial per-row v9 reachability: `AUDIT_PENDING` (not "missing").** v0.8 already had 44/44 bounded functional proof in its own frozen candidate and a real qualification; don't conflate the two. The v0.9 baseline has 9/9 split Issue closure and qualified Full/Hidden/packed consumer evidence; however that does not automatically prove full four-source decision/Meta/Memory routes.

## 1a. Required migration classification: Semantic vs Tool/Operation vs Kernel

**Decision rule:** Determine **what this feature does and who owns its runtime authority**, before deciding whether it is an independently callable Tool. The v0.7 PRD already distinguishes **Semantic Component** from **Tool Component** and says Agent Tool is only an optional projection of a Tool, not a separate ontology. v0.10's composable Package Families must retain this boundary. This section is a **candidate assignment**, not proof of selected-v9 implementation.

- `SEMANTIC`: declaration/interpretation/rule/decision/workflow/control/evaluation; explicit S Feature or B component, **not necessarily a Tool** even if implemented by callable TypeScript.
- `TOOL_READ`: independently addressable capability call, e.g. model inference, document lookup, external retrieval/search or independently callable calculation. It may be pure and has no automatic effect privileges.
- `TOOL_EFFECT`: selected operation that writes external Domain data, Memory, files or remote work; caller/currentness and K Effect identity/Journal/UNKNOWN control remain mandatory.
- `KERNEL_PROTOCOL`: authoritative State/Admission/Journal/Effect/replay/fence/Disposition, query current-instance view and verified control turns; **internal K mechanism**, not an ordinary Tool.
- `BUILD_OR_LIFECYCLE`: immutable component qualification, dependency resolution, approved install/activation and Package init/dispose; not an ordinary runtime business Tool.
- `SPLIT`: separate semantic logic, tool IO and/or K protocol instead of classifying the whole feature in one bucket.

| Historic candidate | Migration classification | Tool boundary decision | Authority / failure rule |
|---|---|---|---|
| Rule, Guard, portable expression, WorkflowRouter | SEMANTIC | No separate Tool; Standard interpreted function or declared component | Guard failure before effect; no extra Tool invocation |
| DecisionResolver four-source precedence (v0.3) | SEMANTIC + SPLIT | Resolver is NOT a Tool; cache/model/procedure services may be separate calls | S selects, current K admission still decides |
| HarnessMachine, bounded Model↔Query/Tool loop | SEMANTIC + SPLIT | Loop is a Workflow; each approved model/query is an independent Tool Operation | max-step/budget, model no direct mutation |
| Compiled Workflow V3 IR, child, WAIT/RESUME | SEMANTIC + KERNEL_PROTOCOL | Workflow transitions are not Tool Calls; remote notification adapter may be | K-owned durable control turn/recovery |
| Exact Semantic Cache | SPLIT | cache currentness/key/eligibility = SEMANTIC; scoped physical read/write = Capability Operation | a cache hit never counts as Journal/Effect replay |
| ObservedDependencySet / Context Assembly | SEMANTIC + SPLIT | dependency/packing = non Tool; external source retrieval = TOOL_READ | dependency version/currentness and scope |
| Memory get/search vs put/delete | TOOL_READ / TOOL_EFFECT | yes, independently callable Memory Capability Operations | read scope; write authorized effect and revision; no K Journal reinterpretation |
| LLM inference / search / external calculations | TOOL_READ | yes, where independently addressable via Model/Search/Compute Capability | no ModelPort policy duplication, no implicit Effect |
| Runtime Evidence, DecisionResolutionReceipt | SEMANTIC + KERNEL_PROTOCOL | provenance projection not Tool; durable recording through K/Host observation path | observational append cannot rewrite committed truth |
| Shadow L4 comparison, candidate scoring | SEMANTIC + SPLIT | comparator is not a Tool; model/evaluation service call may be TOOL_READ | shadow yields zero production State/Effect writes |
| Candidate validation | SEMANTIC + optional TOOL_READ | local deterministic validation not Tool; remote simulator optional bounded Capability | Candidate has no execution rights |
| Promotion / selection / activation | BUILD_OR_LIFECYCLE + SEMANTIC | non Tool policy/proposal; protected BUILD/deployment action, NOT free Agent Tool | distinct external authorization, future pinned version only |
| External HTTP/Job effect and #1138 | TOOL_EFFECT | yes, selected sealed C + Host adapter | K Admission/Journal/UNKNOWN; no false remote-complete ACK |
| Timer / callback / DomainMessage | KERNEL_PROTOCOL + SPLIT | K control-turn primitives not Tools; external transport may be TOOL_EFFECT | dedup, recovery, caller/target binding |
| #1108 Admission Fence / #1109 Disposition recovery | KERNEL_PROTOCOL | NEVER make independently privileged effectful Tool or optional plugin | one Kernel Primary owns CAS/fence/state safety |
| Pure DAC verifier, BUILD graph, Package lifecycle | BUILD_OR_LIFECYCLE | no runtime business Tool by default | verifies externally supplied facts; never issues own authority |

**T01 output rule per selected legacy row:** record `historic-id → target-owner → migration-class → exposed-as-tool? → operation effect-class → caller/visibility → data/schema identity → current public-v9 reachability → selected-v10 test witness`. A `SPLIT` row may produce multiple component and Tool bindings **without** creating multiple independent Kernel control loops. Do not create 44 separate Issue/PRs for 44 rows. Model-facing Agent Tool projection is independently opt-in and read-only by default; a Capability Operation is not automatically visible to an Agent.

## 2. All frozen v0.8 historic slots (44/44 mapped to v0.10 review owner)

Historical source paths and row IDs are from the 44-entry JSON manifest. The `v0.10 disposition` is a candidate: **REUSE** existing current behavior; **ADV** richer selected-v9 semantics; **MIGRATE** older functionality to current Package ABI if reachability fails; **NO LEGACY ABI** do not preserve old artifacts.

| ID | Frozen historic functional outcome | Current logical home | v0.10 disposition / verification target |
|---|---|---|---|
| FR01 | Workflow state/child/WAIT-RESUME | K + S | REUSE; ADV generic bounded loop; prove parent/child on selected K |
| FR02 | Portable expression, Rule, safe script | S / Tool C | REUSE; no second script engine |
| FR03 | Durable Tool/Operation effect | K + C/H | REUSE; exact idempotence/UNKNOWN |
| FR04 | DomainMessage admission/ACK/dedup | K | REUSE; typed duplicate/refusal |
| FR05 | Query / multi-source projection | S + K read | REUSE; ADV explicit B scope/aggregate |
| FR06 | Compiled root load/integrity | BUILD + Microkernel/H | REUSE; no legacy format |
| FR07 | Bounded Harness/child execution | S + Agent B | ADV: bounded Model↔Query child, public selected path |
| FR08 | Rule/cache/promotion/model decision resolver | S + Cache C/Model C | ADV: full 4-source resolution currentness through K |
| FR09 | Governed child-workflow selection | S + BUILD/H | ADV: exact pin, validation, no hot swap |
| FR10 | UX intent/DAC role-safe bridge | UX + H/K | REUSE; external UX authority never State owner |
| FR11 | Typed compiled Domain Data | Forge/BUILD + S | REUSE; accepted compiled descriptors |
| FR12 | No-fresh-LLM evidence-gated fast path | S + Evidence C | ADV: deterministic/no-model, safe currentness |
| FR13 | Component/Kind/binding | BUILD + S/C | REUSE; sealed actual bindings |
| FR14 | One Assembly Effect/Journal authority | K | REUSE; no duplicate K |
| FR15 | Typed UX/Agent tool/resource bridge | UX + S/C/H | REUSE; Agent read-only default |
| HF16 | Poison recovery and queue drain | K | REUSE; preserve failure handling |
| HF17 | Subscribe reconnect/coalesce | S + K/H read | REUSE; no false durable cursor |
| HF18 | Durable deadline and callback | K + Workflow S | REUSE; ADV explicit loop sleep/wake |
| HF19 | Atomic ProcessCommand terminal outcome | K | REUSE; correct refusals |
| HF20 | Ordered observation cursor and restart | K + S | REUSE; no observation as replay truth |
| HF21 | SIM vs PROD authority isolation | K/H | REUSE; Shadow never gains PROD effect |
| HF22 | Transitive capability closure | BUILD | REUSE; no dynamic provider resolution |
| HF23 | Agent-safe Operation exposure | S + H | REUSE; read-only discovery default |
| HF24 | Deterministic Business Source projection | BUILD + S | REUSE; selected context/source data |
| HF25 | Typed App-contract codegen | BUILD/Forge | REUSE; no Runtime compiler |
| HF26 | Decision provenance / denial evidence | K + Evidence C | ADV: EV provenance + source-aware feedback |
| HF27 | Per-instance serialized concurrent lane | K | REUSE; tests for multi-B isolation |
| HF28 | Node / Expo portable consumer | H / selected profile | REUSE selected Node; Expo only separately qualified |
| HF29 | Approved local/HTTP Tool Host binding | H + Tool C | REUSE read-only; external effect follow-up #1138 separate |
| HF30 | External DAC designation/delegation verifier | BUILD/H/DAC | REUSE pure verifier, not issuer |
| HF31 | Canonical record/accessor safety | BUILD + boundary | REUSE fail-closed |
| HF32 | Durable child-send result routing | K + S | ADV nested workflow result/recovery |
| HF33 | Same-occurrence resource currentness pin | H/K | REUSE exact permitted resources |
| HF34 | Definition graph snapshot/digest | BUILD | REUSE immutable graph |
| NEW-FUNCTION-01 | DAC compatibility TWO-VIEW verifier | BUILD/H/DAC | REUSE pure verifier |
| NEW-FUNCTION-02 | DAC Selection→Manifest coverage/refusal | BUILD/H/DAC | REUSE pure verifier |
| NEW-FUNCTION-03 | DAC Runtime Binding fact verification | BUILD/H/DAC | REUSE pure verifier; binding != activation |
| NEW-FUNCTION-04 | DAC Runtime Activation fact verification | BUILD/H/DAC | REUSE pure verifier; do not mint it |
| FR08-P-SD1 | Declared SemanticDecision usable | S + BUILD/K | ADV v9 sealed declaration valid |
| FR08-N-SD1 | Model unavailable typed result | S + B | ADV no fabricated model success |
| FR08-P-SD2 | Declared DomainEvent through one K Admission | S + K | ADV valid event not direct mutation |
| FR08-N-SD2 | Illegal event denied before effect | S + K | ADV typed denial / no K write |
| NEW-FUNCTION-05 | v0.6 SemanticDecision compiled binding | BUILD + S + K | **HIGH:** historical v0.6 source absent from current main; verify equivalent v9 physical path, MIGRATE if lacking |
| NEW-FUNCTION-06 | v0.6 DecisionResolutionReceipt | S + K/H Observation | **HIGH:** historical v0.6 source absent from current main; verify equivalent truthful readback on v9, MIGRATE if lacking |

Every row is **initially AUDIT_PENDING for public-v9 reachability**. A grouped v9 integration witness may cover multiple rows; do not issue 44 separate full runs/tasks. Where v0.8 P/N proof is current and equivalent, reuse it as differential oracle; add only changed ABI integration checks.

## 3. High-value historical v0.3–v0.6 capabilities outside a one-row legacy mapping

| Concern | Historical source anchor | Proposed package | Candidate delta / authority |
|---|---|---|---|
| Bounded Business inner loop | `packages/domain-harness/src/harness/harness-machine.ts` | S + Agent B, Model/Tool C | Contract adaptation to selected v9; LLM proposes data only |
| Four-source DecisionResolver | `src/decision-resolver/resolver.ts` | S | Rule→Cache→Promoted→Bounded fallback; current Guard not bypassed |
| Exact Semantic Cache + dependency currentness | `src/semantic-cache/exact-semantic-cache.ts` | Cache C + S logic | Dependency revisions, isolation, schema check, no Journal replay substitution |
| ObservedDependencySet | `src/harness/execution-journal.ts`; `src/contracts/runtime-evidence.ts` | Evidence/Context C | Dependency references for reuse invalidation / Context |
| Candidate validation and artifact selection | `src/candidate/`, `src/promoted-child/`, `src/promoted-artifact/` | S + BUILD/H | New immutable approved version, not live self-edit |
| Runtime Evidence and DecisionTrace | `src/runtime-evidence/capture.ts`, `src/harness/contract.ts` | Evidence C + S | Provenance only, not execution authority |
| L4 Shadow and exact stable fallback | `src/runtime-evidence/shadow.ts`, `fallback.ts` | Evolution C + Meta B | Existing shadow-only reference to v9; 0 production effects |
| v0.5 compiled Workflow V3 semantics | `src/runtime/compiled-workflow-{ir,runtime,message-effects}-v3.ts` | S | Take IR/behavior, NOT second RuntimeV3 controller |
| v0.5 Source/Schema/Profile | `src/package/domain-data-integrity.ts`, `src/projection/compiled-business-source.ts` | BUILD | Unify with current sealed selected package verification |
| v0.6 semantic binding | v0.6 commit `7c367188d5c8cffa41bc22cd5269672a665c436f`: `src/runtime/decision-resolver-binding.ts` | BUILD + S | Explicit invocation contract and one K Admission |
| v0.6 optional decision receipt | same v0.6 commit: `src/observation/decision-receipt.ts` | S + H/K | Optional append vs mandatory distinction, measured ModelPort count |
| v0.4 DAC A41 verifier chain | `src/dac-v0041/*/verifier.ts` | BUILD/H/DAC | Read/verify proofs only, never issue delegated authority |

Historical source anchors are indicative; for an exact diff use `git show <historic SHA>:<path>`. The v0.5 source introduced `compiled-workflow-runtime-v3.ts` and related messaging; the v0.6 source introduced SemanticDecision binding/receipt; neither should create a peer Kernel.

## 4. New v0.10 Package composition prerequisite: actual multi-K/S modules ([#1141](https://github.com/kaicreator-mm/domain-harness/issues/1141))

**v0.9 actual state:** BUILD `roleCounts(kernel)=1`, `roleCounts(standard-sdk)=1`, v09 selected ABI retains exactly one K/S, and `operation-bridge.ts` forwards one `createOccurrenceRuntime` and one `interpret`. Historical Domain Components are not therefore automatically physically independent Standard Packages.

**v0.10 proposed targeted delta:** select **exactly one authority-bearing K Primary + 0..N physically sealed K Extension Packages**, exactly **one Standard Primary entry + 0..N independently sealed Standard Feature Packages**, and multiple approved B/C Packages as already supported. Kernel extensions may only provide **named typed bounded hooks/proposals** consumed by Primary; they cannot mint another State/Effect/Journal authority or bypass H. S modules contribute declared Kind/Decision/Workflow/Context/Evolution semantic handlers; explicit BUILD-bound dispatcher selects each by identity without silent first provider.

The 44 rows remain audit input. For each `S` row whose semantics are to be independent, audit selected v0.10 Feature Package `providerId → exported hook/handler → selected dispatcher → one K` reachability. For true `K` invariant rows, preserve Primary ownership rather than pretending the safety fix is pluggable (notably #1108/#1109). Closure requires deterministic dependency graphs, conflicting-provider/cycle refusal, actual no-extension minimal App, rich App with nontrivial multi-K/S feature modules, trusted install/restart and exact byte pins. **Product feasibility condition:** if a proposed K Extension must own primary commit state or journal to work, it is not a safe independent K Extension and requires Product/L2 revision.

### v0.10 Product Freeze candidate disposition of inherited live Issues

These are distinct from generic historical recovery (and all require new selected-v0.10 proof if not already satisfied by exact reusable safety evidence):

| Issue | v0.10 admission | Correct owner and scope |
|---|---|---|
| [#1108](https://github.com/kaicreator-mm/domain-harness/issues/1108) | **P0, K01** | Real cross-Host admission-fence takeover during external non-idempotent Effect; repair **Kernel Primary** with valid fencing/reconcile/fail-closed unsupported profile, not a K Extension or Tool |
| [#1109](https://github.com/kaicreator-mm/domain-harness/issues/1109) | **P0, K02** | Heal absent Disposition from durable same-CAS turn history before 17+-turn eviction; never require old `messageId` resend; not a general Agent Tool |
| [#1138](https://github.com/kaicreator-mm/domain-harness/issues/1138) | **P0 minimal, C01** | Independently selected Host external Effect Tool adapter for approved K Operation, accepted/terminal/UNKNOWN and correlation; depends on K01/K02 safety proof or denies unsafe profiles, no runx/Tally/PTY/streaming inside K |
| [#1031](https://github.com/kaicreator-mm/domain-harness/issues/1031) | **P1 / deferred** | Rich streaming/cancel/remote tool enhancements are not an implied P0 requirement |
| Multi-B query | **P0 QR01/QR03**, **P1 QR02** | Explicit single-B target and typed unscoped collision refusal required; `queryMany` optional and never a P0 critical journey |

**Release acceptance split:** tiny packed App (no extension imports) and rich packed App (nontrivial K/S extensions, Agent/Memory/Evidence, two B, minimal external effect) are **two** bounded consumers. P0 does not require recurring autonomous Meta Feedback Workflow (P1), only one approved bounded Shadow L4 scenario, nor automatic production activation.

## 5. Architecture conversion map: logical roles, no Kernel growth

```text
Approved v0.10 Assembly (BUILD-sealed immutable)
  Microkernel: load + necessary package lifecycle/binding hooks ONLY
  Kernel Primary Package: State/Admission/Effect/Journal/UNKNOWN/Replay
  0..N Kernel Extension Packages: declared bounded recovery/observation hooks ONLY
  Standard Primary Package: one interpret/router dispatch entry
  0..N Standard Feature Packages:
    - Advanced Workflow / SemanticDecision / DecisionResolver
    - Context Assembly / Evidence and Candidate semantics
  Business Packages:
    - B1 deterministic workflow
    - B2 Agent workflow (same Workflow protocol)
    - Meta feedback workflow as selected B component or independent B
  selected Capabilities: Memory Store, Retrieval, Semantic Cache, ModelPort, Tool, Evidence, Artifact
  Host/BUILD: physical authority, approved adapters, exact selected install/activation
```

The diagram is a **v0.10 candidate target**, NOT proof of v0.9 support. v0.10 explicitly proposes multiple **physical** S Feature and K Extension Package modules with a new versioned BUILD/ABI; do not fallback silently to a monolithic Standard bundle as if the independent Package composition requirement passed. Similarly, memory retrieval and tool invocation cannot bypass protected H→K caller and operation scope.

## 6. Audit algorithm and exit evidence

1. Fix one **exact v9 SHA and selected host**. List real public `load/send/query/subscribe/stop` paths, sealed interpreter and selected bindings from actual code.
2. For all 44 rows, map **one or more** existing v0.8 release oracles to an actual v9 selected K/S/B/H positive/negative witness (or state explicit `S/L/O`).
3. Select **only real gaps** for implementation; group by ABI seam and behavioral concern rather than opening 44 tasks. Determine which gaps belong to Standard Package, Capability Package, Business Package, BUILD, or approved Host; Kernel only for demonstrated necessary generic correctness.
4. A new component passes when public v9 consumer can exercise it without deep imports and with one K State/Effect/Journal authority. Track truthful model calls (real zero vs unmeasured), cache currentness and failed permission negatives.
5. Repeat one integrated scenario across **two active Business Packages** with overlapping `instanceKey` + one Agent workflow + Meta Shadow. No arbitrary claim of cross-B read atomicity.
6. One final frozen candidate Full/Hidden/critical journey/packed-consumer once; PR delta tests/reviews before merge, Woodpecker unavailability alone should not block with recorded waiver. Do not manufacture PASS from historic test source existence.

## 7. Explicitly outside the recovery effort

- Restoring v0.1–v0.7 API/ABI, old compiled assets or rolling replay format compatibility.
- Retrofitting XState as a Kernel-required product ontology; old v0.3 selected engine is an implementation detail.
- Restoring forbidden v0.3 `Meta Harness` automatic self-promotion or production experiment scheduling as if it had once shipped.
- Loading dynamically generated executable code into an already-running closed-world Assembly.
- Adding a generic goal planner/obligation solver/Agent Runtime and duplicating AI Runtime/Tally/Cairn or runx.

## 8. Known current selected-v9 paths to inspect first

- `packages/domain-harness/src/public-v9/operation-bridge.ts`: protected public-v9 H→K send/read path, `routeWorkflowIntent`, single selected S, B-to-intent binding, first-match read ambiguity.
- `packages/domain-harness-compiler/src/qualified-package/v09/selected-abi.mjs`: sealed ABI, selected Standard and Business binding.
- `packages/domain-harness/src/host-v9/store-port.ts`: persisted selected store.
- `packages/domain-harness-compiler/tests/v09-selected-abi-n01.test.ts`: two-B selected ABI coverage (not full v9 multi-B concurrent lifecycle).
- `packages/domain-harness/tests/v09-operation-bridge.test.ts`: selected public bridge tests.
- `docs/validation/v0.9/n09-release-qualification.md`: exact qualified baseline and supported cohort.

**Initial output state:** `SOURCE_DISCOVERY_COMPLETE / V9_44_ROW_REACHABILITY_AUDIT_PENDING / NO_NEW_RUNTIME_FEATURE_IMPLEMENTED`.
