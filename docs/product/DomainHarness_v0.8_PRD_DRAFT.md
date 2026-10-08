# DomainHarness v0.8 PRD — Verified Domain Package Composition & Unified Component (DRAFT R0)

**STATUS: PRODUCT DRAFT / NOT FROZEN**. Product/L1 user authorization: #949. Product author task: #950. Companion L1: [DomainHarness v0.8 L1 Product Evidence](./DomainHarness_v0.8_L1_PRODUCT_EVIDENCE.md). Adversarial Product Review: **NOT_RUN**, must be independent.  
**Standard:** `kaicreator-mm/ai-development-standard@1edaee9291e25b6dd99303493bed75132cb54881`, Stage 1, project overrides. Historical accepted product: #517, #526; accepted v0.7 source `version/v0.7@86110c616b8cb18c730553e4cdab7ef555214521`.  
**Research provenance:** #932 (pre-research record), #942 (design/gates), #947 (spec conformance), draft research PRs #940/#944/#945/#948. These experimental PRs are NOT approved production code or merge authority.

## 1. Positioning and precise product change

A **Domain App** remains **DomainHarness embedded SDK/runtime + Domain Definition + separately owned UX**. v0.8 advances from v0.7's existing Component/Definition/Runtime authority to a **verified package-composition product contract**:

> A host can load an explicitly authorized finite, pinned set of Kernel, Standard SDK and Business Domain Packages, admit one versioned Component-based Definition Graph with optional executable operations, bind approved capabilities/Kind implementations to a sealed Assembly, and run a narrow Domain App through the single inherited authoritative v0.7 runtime semantics, with reproducible rejection, versioned upgrades and legacy read/compatibility.

This is **NOT** a standalone service, generic agent/workflow framework, universal plugin host or replacement State/Effect/Replay engine. Do not mistake the abstract Domain Definition for its compiled Package/manifest representation.

**Decision hierarchy:** User-selected terminal model = **B Unified Component Schema**; transition compatibility experiment = A; concrete wire fields, digest domains, runtime adapters, dependency resolver internals and host implementation mechanisms are NOT product-frozen by this draft. v0.7 historical identities/families remain immutable, even if v0.8 successor definitions use a single Component ontology.

## 2. Who uses it and observable jobs

- **SDK consumer / Host integrator:** assemble and run an explicitly pinned Domain App, distinguish unadmitted/misconfigured/unsupported packages, maintain old occurrences on upgrade.
- **Domain Package author:** declare Rule/Decision/Workflow/Operation/Schema and permitted capabilities without patching the Kernel or owning State/Effect authority.
- **Domain App developer / UX integrator:** deliver user intent and observe typed outcomes, including WAIT, DENIED, UNKNOWN and resume, while the embedded Runtime owns every authoritative transition/effect.
- **Indirect end user:** sees a correct bounded domain decision/workflow rather than a general agent/autonomous assistant.

Primary acceptance is a working small-domain SDK consumer, not number of framework abstractions or an invented cost/latency improvement. Inputs and actual-user qualification are in companion L1 evidence; example journeys are **designed verification scenarios**, not purported customer studies.

## 3. Domain/package/Component product model

`Domain Definition = Domain Component Graph`; definitions, compiled Package, sealed Assembly and active Runtime Occurrence are separate objects. Package is the **versioned distribution/activation unit**, not a new root ontology. Composition:

`Host (authorized trust/bootstrap) → minimal irreducible Microkernel → verified Kernel Domain Package + Standard SDK Domain Package(s) → verified Business Domain Package(s) → Domain App`.

The *logical* Kernel/Standard/Business split does not require exactly three **physical** packages: declared finite dependency closures with support/diamond topology are valid when verified. Composition **must not** read arbitrary network registries, allow unauthenticated code, or silently hot-replace active providers.

A Component has versioned identity, exact KindRef and required semantic/capability relationships, a semantic definition body and **optional** declared operations; Tool is a callable **role**, not a separate terminal ontology and not a claim that every Schema/semantic Component is executable. Definitions and implementation modules/Host secrets/occurrence handles are never conflated. Implementations are explicit, version-compatible, host-authorized and immutable at the admitted Assembly identity.

Initial **Standard SDK seed Kinds:** `Schema` (may be pure declarative), `Rule`, `Decision`, `Workflow`, `Operation`. They are not Kernel-owned closed enums. Domain Packages may provide other explicitly versioned Kinds with verified/admitted implementations. Unknown **behaviorally required** Kind/version/contract or unsupported capability fails closed before effect; genuinely non-material extensions may be retained without executable authority.

## 4. Version scope (IN) — bounded MVP

**P0-01 Verified bounded Package composition:** finite declared Package closure, exact dependency/import-export identities, verified actual bytes and executable implementation provenance, deterministic seal/version pins; reject missing, ambiguous, orphan, cyclical, incompatible, mutated or forged inputs before activation/effects. No arbitrary runtime plugin discovery.

**P0-02 Unified Component B and Kind admission:** one successor Component contract, five Standard seed Kinds, optional Operations and explicit required semantics/Capability declarations; only compatible, verified Kind handlers bind; Schema with no operations is valid and uncallable. Historical v0.7 Semantic/Tool identities remain readable with an explicit versioned compatibility bridge and unchanged historical digests.

**P0-03 Graph/capability/operation closure:** collision-free qualified Component identity; stable semantic graph + derived (not second authoritative) Capability view; caller/operation/exposure/effect classifications and failure schemas; selected Provider exactly resolved before activation. Arbitrary caller-supplied executable functions are not a trusted implementation pin.

**P0-04 Single authoritative embedded Runtime:** reuse accepted v0.7 activation/admission/currentness, T002/T004 invocation, State/Effect Journal and Replay as the *only* authority. Kernel stays irreducible: integrity, binding, occurrence, authoritative admissions/effects/recovery; Rule/Decision/Workflow/Operation interpretation comes from admitted versioned SDK/Business components, not Kernel business special cases.

**P0-05 Narrow adaptive Workflow semantics:** for a specifically versioned successor Workflow profile, allow 0/1/N eligible nodes, bounded choice/tie/no-match, WAIT/Handoff, authorized resume and decision evidence. Do not change frozen v0.7 Workflow meaning or let a Decision directly mutate State.

**P0-06 Application versioning and consumer portability:** a Business/Support/SDK package change yields a newly sealed Assembly; old active occurrence and historical replay pins stay associated with old behavior; document supported host/ABI and fail unsupported hosts. One clean consumer install/bootstrap/run/deny smoke and a second distinct narrow-domain substitution smoke, without Kernel edits.

**P1-01 Minimal resources lifecycle (only when resource-owning Components actually need it):** optional activate/dispose with Provider-before-consumer order, fail-safe rollback and idempotent cleanup. Pure Components must not be forced to implement hooks. The precise implementation/configuration is L2-owned; omission is allowed only if L2 demonstrates no affected resource lifecycle obligation, with review acceptance.

**P1-02 Bounded UX intent/observer boundary:** externally generated UX requests enter only through typed admitted SDK surfaces; unauthorized mutate/effect attempts are denied. UX rendering and domain-ux implementation are OUT. A read-only Observer cannot override admission/effect authority. Scope of cancel/timeout/UNKNOWN is explicit in §7 and required Gate B, not hidden.

No generic node auto-planner, LLM router, new Registry server, general overlay migration engine, universal Hook framework or new Journal is authorized by these requirements.

## 5. Three required product journeys / acceptance

**CJ-01 — Deterministic approval without LLM** (L1 J1): host loads a verified narrow approval Business Package; typed amount/role enters Schema+Rule and an authorized Operation. **PASS:** deterministic receipt at same pinned Assembly, no model requirement, no unauthorized effect. **REJECT:** malformed Schema, pure-Schema invocation, unauthorized caller, unknown material Kind, ambiguous/tampered Provider before state/effect. **v0.7 reuse:** Component admission, T002 Assembly/activation, T004 Scoped Invocation, authoritative commit.

**CJ-02 — Conditional learning Workflow** (L1 J2): learner score yields 0/1/N candidates, a typed Decision/Workflow handoff, explicit WAIT and permitted resume; selection receipt remains pinned for old occurrence. **PASS:** correct branch, WAIT/resume semantics, bounded no-progress/loop; replay does not repick a later new Provider. **REJECT:** unknown required semantic profile, unauthorized handoff, provider drift/attempted direct UX state write. **v0.7 reuse:** existing Workflow bridge/decision, Admission and Journal (parity to be proved in Gate B).

**CJ-03 — SDK/Business support package upgrade and new Kind** (L1 J3): pinned old Assembly runs while a new Business or SDK/support Package with an authorized custom Kind composes to a new sealed Assembly. **PASS:** no Kernel source edits; deterministically new Assembly pins/behavior, old running instance can be invoked again unchanged; exact imported handler and Kind semantics verified. **REJECT:** fake Package digest, immutable-handler reassignment, colliding qualified identity, unsafe array canonicalization, unapproved Kind or undeclared cross-package import.

All acceptance cases require source-controlled reproducible fixtures and independent verification as assigned below; positive-only example output does not constitute acceptance. Do not count GREEN *defect witness* tests as PASS of architecture.

## 6. Acceptance requirements and traceability

| ID | Testable product requirement | Acceptance / counterexample | L1 source |
| --- | --- | --- | --- |
| R01 | Host can consume finite 3+4+diamond verified packages | equal inputs→stable pin; missing/ambiguous/cycle/false bytes refuse | E02/J3 |
| R02 | Microkernel independent of Business semantic Kind specifics | valid new Kind works with Kernel unchanged; unknown required Kind refuses | E03/E04/J3 |
| R03 | Unified B Component permits optional operations and pure semantic nodes | Schema-only Graph node valid; invoke denied | E03/J1 |
| R04 | Operation's callable implementation is attested and sealed | post-seal mutation/replacement cannot preserve accepted Assembly behavior | E04/J1 |
| R05 | No secondary Capability authority / Graph / State/Effect engine | unauthorised capability, fake authority or UX transition cannot effect | E01/E04/J2 |
| R06 | Conditional Workflow has bounded 0/1/N, WAIT/Handoff and evidence | deterministic selection or explicit wait/refusal; recovery pin retained | E02/J2 |
| R07 | Legacy v0.7 public/runtime history is not retroactively rehashed | fixed old identity/golden unchanged across converter and upgrade | E01/J3 |
| R08 | Product runs without mandatory LLM and two narrow Domain Apps reuse same SDK | CJ01 deterministic; CJ02/CJ03 reuse SDK without Kernel modifications | E01/E02 |
| R09 | Exact host/ABI support boundary and clean consumer | supported host clean install/smoke; unsupported host typed refusal | E01/J3 |
| R10 | Definition / compiled Package / sealed Assembly / Occurrence identities differ | new app pin doesn't mutate old running/replayed occurrence | E01/J3 |
| R11 | Trust/unknown semantics and record safety fail closed | forged imports, colliding IDs, array getter and unknown required contract denied | E04/J3 |
| R12 | Platform upgrade/recovery/effects promises are verified before release | true native T002/T004 + Gate B and specified host/UNKNOWN tests; no waiver by toy CI | E04/J2/J3 |

Freeze this version's **observable product promises and acceptance**, not file paths, digest algorithms, exact schema field names, class layout or speculative performance targets. R01–R12 may be corrected by independent Product review before freeze. The candidate `U01–U07/P01–P05/L01–L02/X01–X02/W01–W02/E01–E02/V01–V04` research conformance register #942 remains supporting technical evidence, not proof all cases passed.

## 7. Safety, trust, failure semantics

- Package authenticity means **actual verified bytes and a legitimate selected Module/Kind/Component/Operation relationship**, not merely a self-asserted digest string. Publisher trust and Host permissions must be separately modeled in L2; content-addressing alone does not authorize ambient execution.
- All material required semantics, including imported Kind implementation, version, capability, callable operation and authorization scope, must be understood and resolved before affected execution; unknown material requirements fail closed. Unknown explicitly non-behavioral extensions cannot change identity/admission/effect semantics.
- The Runtime—not UI, Agent, Interpreter or external package—owns occurrence transitions, scope-bound mutation/effects, durable receipt and replay. Cancellation does **not** imply rollback of an external effect; UNKNOWN is not permission for blind retry.
- Typed failure classes for missing/ambiguous/cycle/tampered package, incompatible contract/Host, illegal caller/operation, unknown result and stale binding are product-level acceptance. Exact codes/API mapping belong to L2.
- Cold-start activation and partial activation rollback must converge without unauthorized effects; failing startup must not expose a partially authorized runtime.
- Retain accepted v0.7 State/Effect/Replay/Crash principles and protected history. A toy demo with in-memory commit-before-receipt is **not** a valid production implementation.

## 8. Compatibility, packaging and host promises

**Migration posture:** v0.7 frozen `family=semantic|tool` definitions and historical hashes/replay remain valid in their version domain; v0.8 B is a successor schema/version domain, with an explicit compatibility conversion/view and golden oracle. Old active occurrences remain pinned; a changed Business Package **creates** a new Assembly, never silently mutates old authority or requires flag-day data rewrite. Public SDK consumers require documented additive/compatible paths and denied incompatible migrations.

**Host:** portability is intended, not pre-validated. The project's portable TypeScript monorepo, `packages/domain-harness` and host-specific adapters are the existing structure; enumerate exact targeted Node/browser/other-host combinations in L2 by real packaging/Host capability evidence. **No blanket Android/Windows/ECF/browser parity claim in this draft.** The designated Windows/ECF Build Host and clean consumer packaging belong to actual later Validation; unsupported profiles may be explicitly denied rather than silently accepted.

**Performance/cost:** do not promise a numeric latency, memory, bundle size or model-call reduction target without a reproducible benchmark and baseline; record metrics as TBD evaluation, not acceptance PASS. A no-LLM deterministic mode remains first-class.

## 9. Ecosystem boundaries and non-goals

- **domain-ai-creator:** user-facing creation entry and orchestration; does not own DomainHarness runtime authority.
- **domain-forge:** generate/evolve Domain Definition and Package inputs subject to DomainHarness admission; not authorized to mint Runtime permissions.
- **domain-simulator:** simulate/validate with explicit non-production effect authority; cannot publish production effects merely by replacing adapters.
- **domain-ux:** produce/use UI and typed Intent/Observation; no direct Domain state commit or effect authorization.
- **domain-application-contract:** minimum cross-repo exchange, currentness, ownership and compatibility; does not redefine internal Component ontology or runtime.
- **DomainHarness:** package composition, semantic admission, sealed binding, authoritative execution/recovery only.

OUT until separately authorized: implementing sibling projects, UX page generation/renderers, remote plug-in discovery, untrusted guest sandbox/marketplace, generic agent loop, policy-engine replacement for its own sake, second Graph/Journaling stack, multi-industry package suite, major rewrite of v0.7 production pipeline.

## 10. Gate and known P0/P1 backlog (do not conflate Product vs architecture)

**Known Tech Gate:** [#942 R31](https://github.com/kaicreator-mm/domain-harness/issues/942#issuecomment-6063721034) = **FAIL**; [#947 Fresh Review](https://github.com/kaicreator-mm/domain-harness/issues/947#issuecomment-6063756020) = spec pack **NEEDS_REVISION**, existing B architecture **FAIL**; no native verified B→v0.7 T002/T004 path. No documented newly accepted v0.7 production P0; **this is not P0 waiver**.

**Blocking pre-freeze architectural concerns** (owner and exact repair evidence must be recorded in #942/#947 research lineage and independently reviewed; do not use this PRD as Builder authority):
1. **F1:** post-seal executable handler mutation/reassignment changes behavior at same claimed digest → attested immutable selected binding; positive + negative.
2. **F2:** forged Package/Component/handler and undeclared imports/exports → actual verified byte→Component→Kind→handler provenance, dependency closure; positive + negative.
3. **F3:** unknown required semantic contract/material Kind silently accepted → v0.7-compatible must-understand admission; negative + pure Schema positive.
4. **K1:** Business Workflow/Action special cases inside toy Kernel → concrete semantics owned by selected SDK/Business package, Kernel no business-specific branches; new Kind substitution proof.
5. **A1 / authority:** caller-injected fake effect port and potential dual authority in toy → single v0.7-authorized admission/effect seam, not custom Journal.
6. **R2-GRAPH:** non-injective qualified ID key for slash-containing Package/Component IDs → collision-free canonical graph and explicit negative (new #947 P1).
7. **R2-RECORD:** array getter/accessor accepted in purported record-safe canonicalization → reject dangerous descriptors/holes/hidden fields (new #947 P1).
8. P2 from #947: final-evidence SHA/matrix fixture provenance, numeric object key canonical ordering, JSON Schema vs JS validator equivalence; close or explicitly disposition if they affect product identity or frozen acceptance.

Deduplicate prior P1 counts; **no P0/P1 may be silently waived into PRD Freeze**. New #947 P1 currently source-derived and require actual reproduction/correction + new independent exact-SHA review for closure. The priority/order and branch ownership remain research-controller responsibilities (#942 R33), not formal v0.8 implementation authorization.

**Native feasibility:** once the above pre-freeze P1 are corrected, require source/evidence coverage adjudication; if still unproven, at most one separately authorized bounded **verified Package bytes → B Component/Kind → imported/selected handler → sealed Assembly → actual v0.7 T002/T004 invocation** spike, with forged digest/post-seal mutation/unknown Kind negatives and independent review. Existing toy pieces pasted together are not enough. No new Runtime/Journaling engine.

**Gate B after Product Freeze / L2 as applicable:** full v0.7 equivalence (State/Effect/Journal/UNKNOWN/cancel/crash/recovery/replay/concurrency), real designated Windows/ECF Host, clean consumer & unsupported Host, full regression/Hidden Validation/release qualification on exact candidate. These are explicit later release blockers, not pre-PRD PASS claims. If feasibility evidence shows an actual product impossibility, reopen affected PRD scope instead of treating it as harmless P2.

## 11. Product acceptance and Freeze protocol

**Evidence gate:** Product Evidence covers at least three journeys (CJ01–03) and alternatives/counterevidence, states synthetic-vs-observed, measures/failures and provenance. External adopter/buyer research not collected is an explicit outstanding risk; if independent reviewer finds it material, it becomes Product P1 and needs evidence or narrower product promise.

**Draft gate:** R01–R12 have positive and negative observable acceptance, unambiguous MVP IN/OUT, cross-project authority, compatible v0.7 migration, native feasibility P1 disposition, exact artifact identity.

**Independent adversarial review:** a genuinely new Product reviewer (not #950 document author), exact source/PR head/blob/tree, MUST challenge consumer need vs v0.7/Temporal/Dapr/LangGraph/OPA/WIT alternatives, feasibility, semantics, scope, trust, migration and release-gate allocation. Verdict PASS / NEEDS_REVISION / FAIL; each P0/P1 must have corrective candidate and successor fresh reviewer. Self-review is **not** acceptable.

**Freeze controller:** may record `PRODUCT_FREEZE=YES` only after (a) required technical P1 closed with real evidence and fresh reviews, (b) native feasibility disposition satisfies product's fundamental contract, (c) all Material Product P0/P1 fixed/legitimately resolved, (d) independent review **PASS** at unchanged exact reviewed PRD and Product Evidence blobs, (e) checkpoint on designated version Product authority branch with recorded exact SHA/tree/blobs and no drift. If ANY fails, `PRODUCT_FREEZE=BLOCKED`, `L2=NO`, `FORMAL_IMPL=NO`. No automatic release or L2 from a draft.

## 12. Present disposition / next evidence

```ini
PRODUCT_STAGE=L1_AUTHORIZED_DRAFT
EVIDENCE=REVIEWABLE_NOT_FROZEN
PRD_R0=REVIEWABLE_NOT_FROZEN
TECH_GATE_1=FAIL
TECH_GATE_2=NOT_PROVEN
OPEN_ARCHITECTURE_P1=YES
INDEPENDENT_PRODUCT_REVIEW=NOT_RUN
PRODUCT_FREEZE=BLOCKED
L2=FORBIDDEN
FORMAL_IMPLEMENTATION=FORBIDDEN
VERSION_RELEASE=NOT_STARTED
```
