# DomainHarness v0.10 — Historical Intelligence & Advanced Domain Workflow PRD (Product/L1 Candidate)

> **Status:** PRODUCT_L1_CANDIDATE / NOT_FROZEN / L2_NOT_ADMITTED / TASK_DAG_PROPOSAL_ONLY / IMPLEMENTATION_NOT_AUTHORIZED / RELEASE_NO.
> **Parent:** [#1139](https://github.com/kaicreator-mm/domain-harness/issues/1139). **Qualified predecessor:** v0.9.0-rc1, `main@af069e8319f290093db004a59ad18c572ebc5b26` (9/9 R1 split issues closed). Date: 2026-10-18.
> **Authority:** This is a proposed v0.10 successor, NOT a retroactive amendment to the frozen v0.9 Product/L2 or its release qualification. Frozen baseline takes precedence for v0.9 behavior. Product Freeze, L2 and an executable Task DAG require their own future decisions.

## 1. Product statement and objective

Keep **v0.9's small JS/TS Microkernel + physically selected Kernel/Standard/Business/Capability Packages**, while restoring and productizing valuable v0.1–v0.6 Domain Runtime functionality that is not yet proven reachable through the **current selected v0.9 public execution ABI**. DomainHarness remains an embedded Domain Application SDK, NOT a new generic Agent platform.

A Domain Application can:
1. Run deterministic or adaptive **Domain Workflows** using the minimum sufficient, correct decision mechanism (Rule → exact semantic reuse → validated reusable procedure → bounded model/query reasoning).
2. Use **Memory and Context** as independently selected Domain Package capabilities, shared across approved Business and Agent workflows.
3. In **P0**, capture provenance-bound Runtime Evidence and execute non-mutating **L4 Shadow** on a bounded approved Workflow scenario, validating Candidates for future immutable versions. The recurring/automated **Meta Workflow** that analyzes evidence and proposes improvements is **P1**; no autonomous production activation is promised.
4. Execute multiple Business Packages concurrently within one qualified Assembly; **P0** requires precise scoped single-B query and unscoped ambiguity refusal; bounded cross-B aggregate `queryMany` is **P1**.

**No Agent Loop Runtime**: an Agent Loop is a bounded/recoverable Workflow. **No Meta Runtime**: Meta Harness is a workflow role. **No Kernel Memory/LLM/Agent branches.**

## 2. Historical facts that inform scope (do not overclaim regressions)

| Version | Historical content | Proposed v0.10 use |
|---|---|---|
| v0.1/v0.2 | Domain Workflow state/child/WAIT-RESUME, durable message/ACK/dedup, timer/callback, tool effects, query/projection/subscription | Reuse current Kernel/Standard semantics, fill selected-v9 API gaps only |
| v0.3 | Bounded Business HarnessMachine; four-source DecisionResolver; exact semantic cache, observed dependency set; promoted child workflows; candidate validation, Runtime Evidence, Shadow L4 | Package-ize the semantics, **not** legacy runtime or XState internals |
| v0.4 | DAC designation, selection, compatibility, binding and activation verifiers | Preserve in external DAC/BUILD/Host; verifier `!=` issuer/authority |
| v0.5 | Compiled Workflow V3 IR and result routing, business source integrity, ProcessCommand/provisioning | Semantic/test reference, not a second runtime |
| v0.6 | Explicit SemanticDecision declaration→resolver binding, deterministic/no-model fast path, truthful DecisionResolutionReceipt; bounded evidence-aware reuse | Standard decision/receipt components |
| v0.7–v0.9 | Component/Capability architecture → physical Package-owned Kernel → independently usable JS/TS v9 SDK | **Normative current architecture** |

**Important nuance:** v0.3 shipped a bounded Business Harness and Shadow/Runtime Evidence reference implementations. The autonomous, always-running Meta Harness, production experiment scheduler, automatically self-promoted Workflow or live-mutating L4 **were not delivered**; adding a Meta Workflow is new Product work. v0.8 later recorded a **44-entry retained-function scope** and 44/44 bounded P/N functional evidence; that does not itself prove all routes are callable through v0.9 public `load/send/query/subscribe/stop`. Avoid relabeling historic retention as lost code or fully current execution.

Primary sources:
- [v0.2 Frozen PRD](../product/DomainHarness_v0.2_PRD_FROZEN.md);
- [v0.3 Frozen PRD](../product/DomainHarness_v0.3_PRD_FROZEN.md), [A1 Product Amendment](../product/amendments/DomainHarness_v0.3_PRD_AMENDMENT_A1_ROUND2_REVIEW_CANDIDATE.md), [A1 L2](../architecture/DomainHarness_v0.3_L2_ARCHITECTURE_AMENDMENT_A1.md);
- [v0.6 Frozen Product](../product/DomainHarness_v0.6_PRODUCT_FREEZE.md) and [v0.6 frozen PRD content](../product/DomainHarness_v0.6_PRD_REVIEW_CANDIDATE.md);
- [v0.8 44-item register](../implementation/DomainHarness_v0.8_RETAINED_FUNCTION_MANIFEST.json), [successor evidence](../validation/v0.8/tg1006-44-row-successor-outcome-ledger.md);
- [v0.9 release qualification](../validation/v0.9/n09-release-qualification.md).

## 3. Frozen v0.9 boundary retained

- **Microkernel:** minimal `load`, selected immutable package binding and necessary hooks only. It is not a business controller, Agent engine or Memory store.
- **Kernel Package family:** exactly one **Kernel Primary** owns State/Guard/Admission/Effect/Journal/UNKNOWN/Replay authority. v0.10 may BUILD-select zero or more separate **Kernel Extension Packages** through bounded typed extension points; they cannot become independent authorities. Approved Host protects caller identity, actual bytes/currentness and one-shot permits.
- **Standard SDK Package family:** exactly one **Standard Primary/dispatcher** (Basic) plus zero or more separate, BUILD-selected **Standard Feature Packages** (Advanced Workflow/Decision, Context, Evidence/Shadow) with explicit component-provider bindings and conflict rules. v0.9 physically selected one Standard; v0.10 must provide a new selected multi-package ABI to make composition real.
- **Business Packages (B1..Bn):** one-to-one owning Business for each sealed Intent, own policies, Workflow definitions, Agent or ordinary business behavior. Several Business runtimes may make progress in one Assembly.
- **Capability Packages (C):** memory, retrieval, model, tools, semantic-cache provider, Evidence/Artifact store, platform adapters, with declared Operation contracts/handlers and bounded lifecycle. Memory storage is external data, not Kernel journal truth.
- **BUILD/compiler (outside runtime):** package binding, semantic schemas, capability selection, compiled Domain Data/Workflow contracts and qualified immutable new App generations. No arbitrary post-load package discovery, hot code mutation or runtime compile.
- **External ecosystem:** AI Runtime owns model/provider policy, Cairn may own knowledge/retrieval, Forge compiles Domain Data, Simulator evaluates Candidate, domain-ux handles UX, Tally orchestrates engineering, runx owns execution environments. No copying their full products into domain-harness.

A protected Agent/LLM-exposed Tool remains **read-only by default**; effectful business changes are separately authorized K operations. This version **explicitly admits a minimal generic Host external Effect Port (#1138) as P0** under EX-01–04 and Kernel safeguards KH-01/02, while keeping rich streaming, PTY, generic cancel and unbounded remote transports outside v0.10. The external Port is not a general-purpose privileged Agent Tool.

## 4. Product feature groups and acceptance

### P0 — PC: Composable Kernel and Standard Package families ([#1141](https://github.com/kaicreator-mm/domain-harness/issues/1141))

**PC-01** A minimal Domain App MUST build and run with only **Kernel Basic Primary + Standard Basic Primary + its B and required C**. No Agent/Memory/L4 advanced module is forced into the installed closure, evaluated during load or charged to cold start. Selecting a component is explicit BUILD policy, not automatic discovery or runtime dynamic loading.

**PC-02** A complex App MAY BUILD-compose **one authoritative Kernel Primary plus 0..N physically distinct Kernel Extension Packages**, and **one Standard Primary plus 0..N physically distinct Standard Feature Packages**. A Feature Package is independently pinned and loaded—not just a logical namespace inside a monolithic "all features" Standard bundle.

**PC-03** Selected Kernel Primary remains the **only** State/Guard/Admission/Effect/Journal/UNKNOWN/Replay commit authority and the only source of `createOccurrenceRuntime`. Kernel extensions can supply **only named typed preapproved hooks or candidate mechanisms** (e.g. pure recovery advice, read-only observations) that are invoked and revalidated by the Primary. They MUST NOT write raw Kernel State/Journal, mint Effect permission, supplant the commit path or constitute a second Runtime. An invariant whose safe implementation requires shared atomic commit must stay within the Primary instead of being split into a plugin. #1108/#1109 are Primary correctness fixes, not permission to delegate those invariants.

**PC-04** The Standard Primary/dispatcher owns the one selected `interpret`/routing entry surface and delegates a **named, BUILD-bound Component/Kind/Feature** to an exactly identified Standard Feature Package. A Feature Package implements a bounded semantic function, never K admission/mutation. No last-installed-wins provider resolution, silent first match, or floating fallback. Advanced Workflow, Context Assembly and L4 Shadow are valid example feature packages; Memory storage remains a Capability Package.

**PC-05** The v0.10 BUILD/ABI SHALL distinguish Primary and Extension/Feature roles (naming to be chosen at L2), close transitive dependency+version+module-digest graph, detect cycles and duplicate provider identities/hook collisions, and pin explicit dispatch and initialization order. Unknown required behavior, incompatible ABI or missing provider is rejected **before executing any affected Package**. Existing per-package self-contained zero-import ESM + trusted installed-byte checks and closed-world roster remain.

**PC-06** One approved Assembly produces one frozen composition profile/digest covering the whole feature graph. Only selected packages are imported/initialized; reverse-order disposal applies to actually initialized modules on failure. Restart reactivates the same immutable closure with no live Feature hot swap. Runtime may not fabricate capabilities, dynamically resolve unapproved dependencies or allow a model to invent an executable extension.

**PC-07** The public v0.10 facade stays independent of internal package count (App consumes capabilities, not feature module handles); the selected H→K bridge exposes only scoped extension tables and a single authoritative K runtime. This is **not** a relaxation of current caller, revocation, host-scope or one-shot effect permits.

**PC-08** Before any broad rollout, validate **two clean packed consumers**: (A) tiny App selecting only K/S Basic and a B; (B) complex App selecting at least **two independent K extension modules and three independent S feature modules**, two B and selected C, with real selected dispatch and without duplicate K authority. Negative cases: two primaries, same Kind/provider twice, missing/wrong version, cycle, forged extension hook, forbidden K commit access, post-seal drift, partial init and foreign Host scope. Measure exact packaged module set; don't claim reduced resource cost without measurement. If two useful K extension examples cannot be made genuinely independent without granting unsafe authority, report **K_EXTENSION_FEASIBILITY_HOLD** and do not weaken single-K authority; S composition is still independently deliverable.

**Scope note:** v0.9 has exactly one physical K and S by design. Product L1 here selects multi-package families as a v0.10 **P0 candidate**, not an implemented runtime, and requires a versioned BUILD/ABI design at L2. No v0.9 ABI compatibility obligation is added pre-1.0.

### P0 — CT: Semantic/Tool/Kernel contract classification during historical recovery

> This is a **migration decision and L2 contract**, not a new Tool framework or a requirement that every callable function become an Operation. Preserve the [v0.7 Semantic Component vs Tool Component distinction](DomainHarness_v0.7_PRD.md) and separate **Capability contract identity** from its Tool implementation. See [historical classification matrix](../roadmap/DomainHarness_v0.10_HISTORICAL_CAPABILITY_CROSSWALK.md).

**CT-01** For every historical feature chosen for migration, T01 SHALL record the **public behavior + execution shape**: `SEMANTIC` (declarative/pure Rule/Decision/Workflow/Projection), `TOOL_READ` (independent authorized query/model/search/calculation call), `TOOL_EFFECT` (effectful external or memory/artifact write Operation), `KERNEL_PROTOCOL` (State/Admission/Journal/Effect/Replay/UNKNOWN control), `BUILD_OR_LIFECYCLE` (immutable composition/installation/init), or `SPLIT` when a feature contains more than one. The class does **not** automatically determine Package family; S/B/C/K ownership and external authorization must also be specified.

**CT-02** A function's being callable, async, implemented in TS, or exposed to an Agent is **not by itself** grounds for Tool wrapping. Prefer direct named semantic dispatch inside Standard Features for Rule/Guard, DecisionResolver, workflow loop/control, Context Assembly, Shadow comparator and candidate schema validation. These components can **invoke** Tool Operations; they do not themselves become a general Tool API.

**CT-03** A Tool/Operation boundary is appropriate when an independently addressed capability is invoked via a stable input/output/error/permission contract, especially model inference, retrieval/search, external HTTP/Job/Tool, file/device action, Memory get/search/write, cache persistence, or independent compute service. Read-only and pure Tool calls are valid; Tool does **not** imply an Effect. Conversely, a pure internal helper need not be a Tool.

**CT-04** A Tool declared `effectful` requires a BUILD-sealed selected binding, current protected H authorization and the single Kernel Primary's Admission, effect identity/Journal/UNKNOWN/recovery. A model-facing Agent Tool projection remains **read-only by default**. No ordinary Tool may write the raw authoritative Kernel Store or issue independent approval, promotion, activation or mutation authority. The authorized **Business Workflow** may request effects through the K-controlled Operation path; the LLM's output is a proposal, not a permit.

**CT-05** Mixed semantics MUST be **split without creating a second engine**: e.g. cache hit/currentness decision = S Semantic, cache read/write storage = C Operations; Context selection/packing = S Semantic, external retrieval = C read Tool; Shadow comparator = S Semantic, model queries = C Tool; Promotion policy/evidence = governed semantic/BUILD facts, approved deployment side effect = protected H operation **never a freely exposed Agent Tool**; timers/callback/WAIT/RESUME = K/S control semantics while actual notification transport MAY be a capability. Physical callback dispatch must preserve one K turn authority.

**CT-06** Validation must demonstrate **both sides** of representative split components: semantic decision with zero unnecessary Tool calls, valid optional Tool invocation with typed/read-only vs effectful distinction, guard failure with **zero effectful dispatch**, forged capability and prohibited model-owned mutation denied, restart/UNKNOWN truthful, no duplicate State/Journal/Effect. A small App uses no unnecessary Tool adapters; a richer App installs only its selected Tool Capabilities. Do not turn T01's 44 historic records into 44 new Tasks.

### P0 — AW: Advanced Workflow Components

**AW-01** Bounded SemanticDecision (compiled and BUILD-sealed) supports finite allowed outcomes/events, deterministic current guards and structured results. No model drives an internal engine state id or direct mutation.

**AW-02** S DecisionResolver preference: current Rule → exact semantic cache hit under current revision/provenance → applicable approved/pinned reusable Workflow/DecisionProcedure → bounded unresolved-semantics Model/Query fallback. Source miss can fall through; contract/integrity violation fails closed. No hidden resolver retry after guard denial; no cache/journal authority conflation.

**AW-03** Business Harness bounded inner loop: `Observe/Context → Decide (rule or Model) → allowed read/query/tool observation → Decide`, hard max steps/time/budget/cancellation, terminal typed `success/denied/unavailable/failure`. No mutation tool advertised/invoked by model-only query stage. Model capability optional; deterministic-only Workflows fully function.

**AW-04** General Workflow control semantics: state/event/guard/invocation, bounded explicit loops, child Workflow (same K), typed WAIT/RESUME, Deadline/Callback correlation, failure/retry/UNKNOWN/recovery, selected Message→Child delivery. Reuse v0.2/v0.5/v0.8 selected implementations; do not transplant `CompiledWorkflowRuntimeV3` as a second execution authority.

**AW-05** Reusable validated workflow/procedure selection + exact immutable candidate identity and pin. New approved artifacts may be selected only for **new qualified assembly/instance** according to deployment; no live rewrite of active pins.

**AW-06** Truthful `DecisionResolutionReceipt` as read-only observation: source (rule/cache/promoted/model), exact relevant identity, source-fallthrough, model-call count observed or `unmeasured`, cache and promotion disposition, current failure terminal. OPTIONAL observational append failures never rewrite a committed K Journal/Effect nor synthesize a recorded ACK. `DURABLE_MANDATORY` receipts require separately proven coordinated atomicity and are **not** v0.10 P0.

### P0 — MC: Memory and Context as Domain Components

**MC-01** Reusable `memory.put/get/search/delete` selected Capability with explicit scope (`tenant/app/business/agent/thread` as appropriate), reference identity, revision/concurrency, TTL/deletion and provenance; per-operation authorization and transparent currentness. No shared global accidental cross-B recall.

**MC-02** Storage/index/retrieval implementation belongs to selected Capability Packages/Host or Cairn, NOT Kernel. Writes are authorized Effectful Operations where state changes; reads/search are separately scope-authorized read Operations. Journal remains execution truth, Memory remains domain data.

**MC-03** Context Assembly Component builds explicit selected current-state/observations/history/memory references, budget and deterministic metadata. LLM prompt/chat specifics stay in Agent Business Package or provider-facing adapter; include a no-Model mode.

**MC-04** Agent Loop represented as ordinary Workflow definition using AW, Context and Tools, with bounded iterative decisions, suspend/resume/restart, explicit termination. Do not add an AgentRuntime.

### P0 — EV: Workflow Evidence + safe L4 foundation

**EV-01** Provenance-bound Runtime Evidence and DecisionTrace from K-approved transitions, semantic decisions, observed dependencies, failures, fallback and tool outcomes. Append-only Evidence NEVER becomes an Effect completion, Journal or authorization fact.

**EV-02** Candidate types `RuleCandidate/DecisionProcedureCandidate/SkillCandidate/WorkflowCandidate`, separate immutable artifact identities, deterministic schema/allowed-operation/bounded-cycle/authorization validations. Candidate is **proposal data** until qualified.

**EV-03** L4 `shadow-only` evaluation: evaluate alternate decision or candidate with no Domain State transition and **zero durable business effects**; counterexample and metrics written as non-authoritative Evidence; require **exact immutable stable fallback**, no floating `latest/current` fallback.

**EV-04** New-version Promotion/Activation contract: distinct validation, promotion and activation; only independent authorized/build-approved deployment can qualify new immutable selections. LLM/Meta output cannot self-sign permission, alter the running instance, reduce its own checks or rewrite old execution pins. No GitHub-account/owner-identity gate; rely on actual authorized execution evidence and independent Host/DAC truth.

### P0 — KH: Selected Kernel correctness and liveness fixes ([#1108](https://github.com/kaicreator-mm/domain-harness/issues/1108), [#1109](https://github.com/kaicreator-mm/domain-harness/issues/1109))

**KH-01** Correct the official selected Kernel Primary's cross-Host **Admission Fence takeover after external non-idempotent Effect dispatch**. A competing admission at the same state revision MUST NOT silently invalidate a still-executing Effect and admit a conflicting successful second Effect. Define a durable reservation/fencing/reconciliation protocol, not **lease-timeout-only**. In the unavoidable crash/unknown remote outcome, preserve journaled actual Effect/UNKNOWN truth, refuse unsupported non-fenced non-idempotent concurrency profiles or reconcile using independently proven adapter idempotency. Do **not** assert general cross-system exactly-once. Targeted two-actual-Host/CAS interleaving P/N is required. This repair is eligible for independent earlier hotfix; if already merged and independently proven, reuse the exact qualifying evidence without a duplicate feature implementation.

**KH-02** Repair the **16-entry committed control-turn-history eviction liveness defect**: after an admitted message's authoritative same-CAS State write, if its independent best-effort turn-Disposition append fails, later admission MUST NOT require the original client to resend that `messageId` to unblock the instance. Reconstruct a safe minimal disposition from validated authoritative admitted history before eviction using conditional matching write (or equivalent Host-authorized bounded recovery); never invent old payload/results or allow a wrong-identity collision. Transient append failure heals; persistent store unavailability returns honest typed failure; restart, 17+ turns, duplicate message and wrong-identity negative prove no duplicate Effect/State/Journal.

**KH-03** These are **Kernel Primary invariants**, not arbitrary Kernel Extension hooks or optional Agent Tools. Their selected-v0.10 qualification is **P0** regardless of the Advanced/Memory optional extensions; independent K fix PRs may merge as soon as targeted evidence passes, without waiting for all v0.10 features.

### P0 — EX: Generic external Effect Tool Port ([#1138](https://github.com/kaicreator-mm/domain-harness/issues/1138))

**EX-01** Support an approved **BUILD-sealed Capability/Operation identity → protected deployment-owned Host external-effect adapter** so the chosen Kernel Primary may dispatch an authorized effectful external Tool without arbitrary package network imports or Host credential leakage. Existing approved read-only Host Tool binding and v0.9 K effect permits are reused, not duplicated. No runx/Tally/SSH/Agent-specific mechanism is inside DomainHarness.

**EX-02** Exact K `effectId`, occurrence/target/tenant/app, selected binding digest, idempotency key **actually delivered to the adapter**, bounded AttemptRef and ProviderOperationRef/correlation (when available) distinguish `not_dispatched / accepted-running / terminal_success / terminal_failure / UNKNOWN-reconcile`. External accepted/HTTP ACK is **not** terminal business success. One authorized callback or query-reconciliation control turn records genuine terminal evidence and drives any next K transition through current Admission; stale/duplicate/foreign/late callback never bypasses K.

**EX-03** An uncertain remote result, crash or timeout is UNKNOWN until sufficient external observation/remote idempotency proof; no blind retry of irreversible non-idempotent work. Unsupported adapter, missing current approval, weak idempotency, wrong scope/binding, failed permit, wrong schema and competing-writer unsafe profiles refuse before dispatch where provably unsupported. Host owns transport, currentness and credentials; external provider owns its own commit truth. Cancellation request != cancellation proof.

**EX-04** One Tally→runx-shaped **fake/generic** adapter and one unrelated external effect adapter use the same selected contract (no runtime import of Tally or runx), including real selected Node24+SQLite restart, lost accepted response, duplicate callback and missing disposition; #1108/#1109 safeguards are mandatory integration dependencies or explicit fail-closed non-admission for unsupported effectful profiles. Streaming, PTY and comprehensive cancel are deferred to [#1031](https://github.com/kaicreator-mm/domain-harness/issues/1031).

### P1 — ME: Meta Workflow and feedback evolution

**ME-01** Meta Harness role as ordinary scheduled/on-event Workflow in a Business Domain Package: consume allowed Runtime Evidence, detect repeated outcomes/failed decisions, propose scoped Candidates, invoke deterministic validation, dispatch shadow evaluation and publish comparison reports.

**ME-02** L1–L4 maturity vocabulary preserved: L1 current-instance adaptation, L2 reusable decision/pattern, L3 validated stable intelligence, L4 exploratory alternatives in shadow. Levels **do not confer extra runtime authority**.

**ME-03** Optional auto-analysis and candidate proposal; production experiment scheduler/canary/automatic activation, online self-modification, generic goal-first replanning and unrestricted Agent navigation are **out** absent separate Product decision. Promotion is governed and should not require repetitive redundant human review when actual independent authorization is already supplied.

### P0 — QR: Safe multi-B identity and precise single query

**QR-01 (P0)** Scoped `query(instanceKey, businessPackageId)` (or an equivalent explicit target) returns exactly the authorized Business target or typed absence. Unscoped lookup with the same `instanceKey` in multiple Business Packages MUST refuse as **ambiguous**, not silently pick the first B; preserve single-B unscoped behavior when the match is unique. No cross-tenant existence oracle.

**QR-03 (P0)** Two Business/Agent independent workflows and lifecycle in one Assembly, concurrent progress and same-`instanceKey` collisions; K State/Journal/effect identities stay distinct for each target. Closed-world intent ownership and K target scope checked per Business.

### P1 — QR: Optional cross-B aggregation

**QR-02 (P1)** Bounded `queryMany({targets, instanceKey})` (or equivalent) provides independent per-B result with source ID/status, caller/scope checks **for every target**, explicit partial failures and no fabricated cross-B atomic snapshot. No fan-out through unapproved Business targets. **Not** required for v0.10 P0 reference consumer or P0 release qualification.

## 5. Source-anchored legacy semantics to migrate (not copy as old ABI)

Historical register `FR01–FR15`, `HF16–HF34`, `NEW-FUNCTION-01–06`, and four SemanticDecision SD cases is the **discovery universe**, not proof that 44 implementation tasks are required. See companion [v0.10 Historical Capability Crosswalk](../roadmap/DomainHarness_v0.10_HISTORICAL_CAPABILITY_CROSSWALK.md). Distinguish per capability: `current-v9-physical-reachable` / `current-v9-source-only` / `legacy-only` / `new-concept`, with exact file+test witness. Restore only true gaps.

**v0.6 NF05/NF06 high-priority:** compiled SemanticDecision → resolved decision → one K admission; truthful optional receipt after admitted result. The old v0.6 source disappeared from main after v0.7 but v0.8 selected-source test evidence reported retention. Reverify on the **v0.9 ABI**, not by path existence.

## 6. Minimum integrated acceptance — two bounded packed consumers (one tiny + one rich)

**Consumer A (tiny):** BUILD seals one Kernel Basic Primary + one Standard Basic Primary + one Business + only its required Capability dependencies. No advanced feature imports. **Consumer B (rich):** BUILD seals one authoritative Kernel Primary + independent selected K Extensions (PC-08 feasibility), one Standard Primary + independent selected Standard Feature Packages, two Business Packages and selected Model/Memory/Tool/Evidence Capabilities. B1 is deterministic ordinary business, B2 an Agent Workflow. Shadow is a bounded approved B workflow demonstration in P0; recurring autonomous Meta Workflow remains P1. Tests:
1. Both B packages handle disjoint sealed Intents; actual same-instanceKey collision yields typed **unscoped ambiguity** and correct **scoped** reads with current caller permissions. `queryMany` aggregation only when P1 is explicitly admitted.
2. B1 Rule/Exact Cache/Promoted Procedure Model avoidance; B2 fallback with Model/Query limited steps, enforced hard guards and no unapproved model-owned effect.
3. Memory put/restart/read/search scoped to the correct app/tenant/Business/Agent; Context Assembly uses only authorized current memory and respects budget. Prove cross-B/tenant denied cases.
4. WAIT → restart → RESUME; duplicate message/attempt, real competing Kernel writers, timed-out external Tool and UNKNOWN: no false terminal ACK. Physically exercise **KH-01** cross-host fence recovery, **KH-02** lost-Disposition 17+-turn healing and **EX-01–04** approved external accepted→terminal/reconcile; reject profiles where idempotency/fencing cannot be shown.
5. Evidence and source receipts are truthful (including Model-call `unmeasured`); Shadow L4 runs an alternate candidate and records non-authoritative counterevidence with **zero production Business State/Effect/Memory mutations and zero unauthorized external Tool effects**. Only explicitly scoped Evidence output is allowed.
6. Deterministically validated Candidate is proposed for a **new approved sealed version** with exact fallback; running instance remains pinned. No requirement to autonomously deploy/canary in P0.
7. Real Node24/ESM + selected physical SQLite Host is allowed as the initially qualified reference. Do not make broad Windows/Linux/WSL2/QuickJS compatibility a Core P0 burden.
8. Reuse historical P/N oracles; narrow changed-risk checks per PR, one final frozen SHA Full/Hidden/Critical Journeys/packed-clean consumer validation. `PR_PASS != RELEASE_PASS`.

## 7. Scope discipline and staged roadmap

**P0 release target:** composable selected Package families PC-01–08, historical selected-v9 reachability audit + Tool/Non-Tool classification, AW01–06, MC01–04, EV01–04, **KH01–03**, **EX01–04**, **QR01/QR03**, two bounded qualified packed consumers. A K extension requiring Primary commit authority is not a safe extension: L2 MUST report a feasibility HOLD and request explicit Product rescope, not silently claim PC-08 PASS. **P1 (not required for v0.10 P0 release):** ME01–03 full recurring Meta Workflow, QR02 cross-B aggregate and #1031 rich streaming/cancel. P1 can be separately qualified or deferred; no hidden promotion to P0 via examples.

**OUT:** separate Agent/Meta Kernel or Runtime, general memory platform, arbitrary live package installation/hot swap, automatic self-approval, universal scheduler/obligation solver, global default model calls, v0.1–v0.7 API/asset/digest compatibility, full generic system administration, agent model/provider routing policy, direct mutation by Agent's read-only Tool discovery.

**Product/L1 scope dispositions for Freeze review** (these are explicit successor proposals, not statements that the review passed):
- **Shadow/Meta:** EV03 Shadow evidence **P0**; recurring Meta Feedback Workflow **P1**; no automatic production activation.
- **Package composition:** exactly one K Primary and one S Primary plus physically independent optional K Extensions/S Features are **P0**. A privileged commit-capable K Extension is OUT. ABI feasibility is L2's concrete proof task, with explicit rescope request on genuine contradiction—not silent permission to violate single authority.
- **Multi-B:** QR01/QR03 (precise scoped single query + ambiguity refusal + actual two B execution) **P0**; QR02 cross-B aggregate **P1**.
- **Kernel residuals:** #1108/#1109 **P0 correctness** in K Primary; earlier hotfix evidence reusable, not two duplicate long-lived implementations.
- **External effect:** #1138 **P0 minimal bounded sealed Host external Effect Port**; #1031 streaming/PTY/rich cancel remains P1/OUT. Integrate after KH01/KH02 safety demonstration or fail closed for unsupported profiles.
- **Memory:** per-item CAS/scoped operations P0; no general cross-package transaction or global memory platform.
- **Promotion:** future qualified version and external approved current deployment, with no mandatory GitHub-account/human-identity gate and no model self-approval; this successor Product explicitly changes any older human-promotion requirement only for new v0.10 contracts.
- **Validation:** two physically distinct packed consumers (tiny/basic + rich/advanced); one final version-level Full/Hidden/CJ/packaging qualification; no redundant independent OS compatibility matrix.

**Next steps:** Product/L1 focused review → frozen Product decisions → architecture/API seam test → L2 Freeze → admitted bounded DAG → one concern/PR merges → one version-level Release Qualification. See [v0.10 candidate Task DAG](../implementation/DomainHarness_v0.10_TASK_DAG_PROPOSAL.md).
