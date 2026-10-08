# DomainHarness v0.8 PRD — Verified Domain Package Composition & Unified Component (DRAFT R1 / #952 successor)

**STATUS: PRODUCT DRAFT / NOT FROZEN**. Product/L1 user authorization: #949. Product author task: #950. Companion L1: [DomainHarness v0.8 L1 Product Evidence](./DomainHarness_v0.8_L1_PRODUCT_EVIDENCE.md). Historical independent R0 Product Review: [#952 terminal](https://github.com/kaicreator-mm/domain-harness/issues/952#issuecomment-6064502054) = **NEEDS_REVISION** (P0=0, P1=4, P2=3); **fresh R1 independent review NOT_RUN and REQUIRED**.  
**Standard:** `kaicreator-mm/ai-development-standard@1edaee9291e25b6dd99303493bed75132cb54881`, Stage 1, project overrides. Historical accepted product: #517, #526; accepted v0.7 source `version/v0.7@86110c616b8cb18c730553e4cdab7ef555214521`.  
**R1 provenance:** original R0 [Draft PR #951](https://github.com/kaicreator-mm/domain-harness/pull/951) HEAD `744523f923df29dd47324ad902ed6580879b6c3b` and historical Evidence/PRD blobs `7320575e45fe179ccbab8409cfcffb5aab147de2` / `693a0ad14f5e5faa95003c93dabc0e30c60aae7b` remain untouched. This successor is branched from authoritative v0.7 integrated [main@3c71b9138056babfafbc7de1349b5924483f2203](https://github.com/kaicreator-mm/domain-harness/commit/3c71b9138056babfafbc7de1349b5924483f2203), not R0's obsolete v0.6 baseline. **Research provenance:** #932 (pre-research record), #942 (design/gates), #947 (spec conformance), draft research PRs #940/#944/#945/#948. These experimental PRs are NOT approved production code or merge authority.

## 1. Positioning and precise product change

A **Domain App** remains **DomainHarness embedded SDK/runtime + Domain Definition + separately owned UX**. v0.8 advances from v0.7's existing Component/Definition/Runtime authority to a **verified package-composition product contract**:

> A host can load an explicitly authorized finite, pinned set of Kernel, Standard SDK and Business Domain Packages, admit one versioned Component-based Definition Graph with optional executable operations, bind approved capabilities/Kind implementations to a sealed Assembly, and run a narrow Domain App through the single inherited authoritative v0.7 runtime semantics, with reproducible rejection, versioned upgrades and legacy read/compatibility.

This is **NOT** a standalone service, generic agent/workflow framework, universal plugin host or replacement State/Effect/Replay engine. Do not mistake the abstract Domain Definition for its compiled Package/manifest representation.

**Decision hierarchy:** User-selected terminal model = **B Unified Component Schema**, a direction **subject to the required v0.7+minimal-facade counterfactual** (companion Evidence §4.1); **product necessity remains hypothetical and Freeze-blocking until executed/reviewed**. If a minimal facade passes all accepted guarantees without unacceptable extra authority or evidenced material glue, **NARROW/REFRAME** the incremental B product claim rather than mandate a needless reimplementation. User-selected terminal model = **B Unified Component Schema**; transition compatibility experiment = A; concrete wire fields, digest domains, runtime adapters, dependency resolver internals and host implementation mechanisms are NOT product-frozen by this draft. v0.7 historical identities/families remain immutable, even if v0.8 successor definitions use a single Component ontology.

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

**P0-01 Verified bounded Package composition:** finite declared Package closure, exact dependency/import-export identities, Host-authorized publisher/owner + approved exact bytes + canonical declarations and verified executable implementation provenance, deterministic seal/version pins; reject missing, ambiguous, orphan, cyclical, incompatible, unapproved-publisher, mutated or forged inputs before **SDK-mediated activation/invocation/authoritative effects**. JS module evaluation before SDK admission is explicitly a separate Host trust/isolation perimeter (§7), not promised side-effect-free. No arbitrary runtime plugin discovery.

**P0-02 Unified Component B and Kind admission:** one successor Component contract, five Standard seed Kinds, optional Operations and explicit required semantics/Capability declarations; only compatible, verified Kind handlers bind; Schema with no operations is valid and uncallable. Historical v0.7 Semantic/Tool identities remain readable with an explicit versioned compatibility bridge and unchanged historical digests.

**P0-03 Graph/capability/operation closure:** collision-free qualified Component identity; stable semantic graph + derived (not second authoritative) Capability view; caller/operation/exposure/effect classifications and failure schemas; selected Provider exactly resolved before activation. Arbitrary caller-supplied executable functions are not a trusted implementation pin.

**P0-04 Single authoritative embedded Runtime:** reuse accepted v0.7 activation/admission/currentness, T002/T004 invocation, State/Effect Journal and Replay as the *only* authority. Kernel stays irreducible: integrity, binding, occurrence, authoritative admissions/effects/recovery; Rule/Decision/Workflow/Operation interpretation comes from admitted versioned SDK/Business components, not Kernel business special cases.

**P0-05 Narrow adaptive Workflow semantics:** for a specifically versioned successor Workflow profile, allow 0/1/N eligible nodes, bounded choice/tie/no-match, WAIT/Handoff, authorized resume and decision evidence. Do not change frozen v0.7 Workflow meaning or let a Decision directly mutate State.

**P0-06 Application versioning and consumer portability:** a Business/Support/SDK package change yields a newly sealed Assembly; old active occurrence and historical replay pins stay associated with old behavior **while their exact trusted prior executable bytes are retained**; if unavailable, return typed code-unavailable/compatibility refusal (not a silent newer-Handler substitute); document supported host/ABI and fail unsupported hosts. One clean consumer install/bootstrap/run/deny smoke and a second distinct narrow-domain substitution smoke, without Kernel edits.

**P1-01 Minimal resources lifecycle (only when resource-owning Components actually need it):** optional activate/dispose with Provider-before-consumer order, fail-safe rollback and idempotent cleanup. Pure Components must not be forced to implement hooks. The precise implementation/configuration is L2-owned; omission is allowed only if L2 demonstrates no affected resource lifecycle obligation, with review acceptance.

**P1-02 Bounded UX intent/observer boundary:** externally generated UX requests enter only through typed admitted SDK surfaces; unauthorized mutate/effect attempts are denied. UX rendering and domain-ux implementation are OUT. A read-only Observer cannot override admission/effect authority. Scope of cancel/timeout/UNKNOWN is explicit in §7 and required Gate B, not hidden.

No generic node auto-planner, LLM router, new Registry server, general overlay migration engine, universal Hook framework or new Journal is authorized by these requirements.

## 5. Three required product journeys / acceptance

**CJ-01 — Deterministic approval without LLM** (L1 J1): a clean Node TS Host approves publisher/owner and exact Package bytes, loads Schema+Rule+Operation, invokes via real v0.7 admission/T002/T004, and observes a deterministic receipt. **PASS target:** same version pins/role/amount produce identical authorized SDK-mediated result without model calls. **REJECT:** malformed/pure-Schema invocation, wrong scope, unapproved publisher, forged caller hash, bad bytes, fake effect owner, unknown required Kind/ambiguous imported Handler. **Limit:** trusted JS import-time ambient effects are Host-side and not covered by the SDK-effect promise (§7). **Reuse:** existing v0.7 Component admission, Assembly/invocation, State/Effect authority.

**CJ-02 — Conditional learning Workflow** (L1 J2): versioned Workflow/Decision evaluates a pinned learner score and finite eligible candidates. Observable outcome is governed by the following **product-level matrix** (each row requires accepted and denied source-controlled examples; all status words are semantic classes rather than specified API enum identifiers).

| Eligible candidates | Required admitted state | Observable permitted outcome | Required refusal / evidence |
| --- | --- | --- | --- |
| `0` | Terminal invariant satisfied and no outstanding required transition | **COMPLETE** with terminal receipt | Cannot label COMPLETE solely because there are no candidates |
| `0` | Named unmet prerequisite, authorized resumable handoff allowed | **WAIT** with unmet-prerequisite ID, same Occurrence ID, authorization scope and decision receipt | No anonymous WAIT; unknown/unauthorized resumer denied |
| `0` | Unsatisfied required transition, missing required node or no permitted wait | **DENIED/INVALID** typed outcome | No fabricated empty success, hidden fallback or infinite wait |
| `1` | Exactly one authorized eligible transition | **SELECTED** deterministically with selected Provider/Kind/Decision evidence | Forged selected provider, caller or invalid scope denied |
| `N>1` independent | Explicitly declared concurrent, non-conflicting transitions and permissions | **MULTIPLE_SELECTED**, stable declared order/set and receipts | Undeclared concurrency, competing shared mutation or forged selection denied |
| `N>1` exclusive | Explicit deterministic admitted priority/tie policy resolves uniquely | **SELECTED** one, deterministic policy ID/input digest and receipt | Conflicting/tied alternatives without a resolving policy → **CONFLICT/DENIED**; no arbitrary order |

**Cross-row invariants:** No-progress/cycle must terminate with a typed bounded refusal, not silently loop; exact numeric limits and scheduler implementation remain L2 owned. Captured Provider/Decision/candidate-set/policy evidence must be pinned before the affected transition. WAIT→authorized Handoff→RESUME occurs on the **same Occurrence**, with original package/selected handler/Decision receipt and verified resumer; no relaunch/re-pick against latest Provider. UNKNOWN, cancel, timeout and replay **do not** permit blind retry, effect duplication, or re-selection; replay uses authoritative prior receipt. Unauthorized UX mutation, missing material Kind/profile and forged handoff are denied. **v0.7 reuse:** existing Workflow adapter, DecisionResolver, Admission, Journal/Replay (new B-native integration NOT_PROVEN).

**CJ-03 — SDK/Business support package upgrade and new Kind** (L1 J3): approved Node Host closes 3/4/diamond finite Packages and imports one open, versioned Kind into a **new** sealed Assembly without Kernel edits; old Occurrence retains original pins. **PASS target:** authenticated exact bytes→declared imports/exports→approved immutable selected Handler→new Assembly, deterministic new semantics, old Occurrence *re-invocable unchanged while exact trusted old executable code remains available*. **REJECT:** fake hash/publisher, post-seal reassignment, slash-colliding identity, unsafe array descriptor, unknown required Kind, undeclared import, fake effect-port; missing/uninstalled old code returns typed unavailable and **never rebinds to new handler**. Code retention window and recovery policy remain L2/Gate B; no unconditional hot-upgrade availability claim.

All acceptance cases require source-controlled reproducible fixtures and independent verification as assigned below; positive-only example output does not constitute acceptance. Do not count GREEN *defect witness* tests as PASS of architecture.

## 6. Acceptance requirements and traceability

| ID | Testable product requirement | Acceptance / counterexample | L1 source |
| --- | --- | --- | --- |
| R01 | Host can consume finite 3+4+diamond verified packages | equal inputs→stable pin; missing/ambiguous/cycle/false bytes refuse | E02/J3 |
| R02 | Microkernel independent of Business semantic Kind specifics | valid new Kind works with Kernel unchanged; unknown required Kind refuses | E03/E04/J3 |
| R03 | Unified B Component permits optional operations and pure semantic nodes | Schema-only Graph node valid; invoke denied | E03/J1 |
| R04 | Operation's callable implementation is attested and sealed | post-seal mutation/replacement cannot preserve accepted Assembly behavior | E04/J1 |
| R05 | No secondary Capability authority / Graph / State/Effect engine | unauthorised capability, fake authority or UX transition cannot effect | E01/E04/J2 |
| R06 | Conditional Workflow has unambiguous product-level 0/1/N decision outcome matrix | 0 COMPLETE/WAIT/INVALID separated by invariant and prerequisites; 1 unique; N independent concurrency vs deterministic policy vs CONFLICT/DENIED; signed/authorized handoff, same-occurrence resume, no-progress refusal, selected Provider/Decision receipts and replay pin | E02/J2 |
| R07 | Legacy v0.7 public/runtime history is not retroactively rehashed | fixed old identity/golden unchanged across converter and upgrade | E01/J3 |
| R08 | Product runs without mandatory LLM and two narrow Domain Apps reuse same SDK | CJ01 deterministic; CJ02/CJ03 reuse SDK without Kernel modifications | E01/E02 |
| R09 | **Minimum Node.js TypeScript embedded SDK Host** clean consumer contract | install pinned/allowlisted exact packages, bootstrap, authorize and T002/T004 invoke/deny, typed receipts; browser/Expo/Android new B explicitly OUT, preserve historical v0.7; ABI details L2-owned | E01/J3/A08 |
| R10 | Definition / compiled Package / sealed Assembly / Occurrence identities differ | new app pin doesn't mutate old running/replayed occurrence | E01/J3 |
| R11 | Publisher approval, exact bytes/verified imports, trust and unknown semantics fail closed *for SDK-mediated authority* | deny forged bytes/hash, unauthorized publisher, colliding IDs/array getter, unknown required Kind, fake effect; separately observe Host JS import-time side-effect perimeter | E04/J1/J3/A08 |
| R12 | **Pre-freeze native B→actual v0.7 T002/T004 integration proof** and distinct later Gate B | verified Host-authorized bytes→B Component/Kind→import/export→immutable Handler→sealed Assembly→real T002/T004; tampered/post-seal/unknown Kind/fake effect negative; later platform/replay/UNKNOWN release proof remains separate | E04/J1/J2/J3/A10 |

Freeze this version's **observable product promises and acceptance**, not file paths, digest algorithms, exact schema field names, class layout or speculative performance targets. R01–R12 may be corrected by independent Product review before freeze. The candidate `U01–U07/P01–P05/L01–L02/X01–X02/W01–W02/E01–E02/V01–V04` research conformance register #942 remains supporting technical evidence, not proof all cases passed.

## 7. Safety, trust, failure semantics

**Selected minimum Product Host / executable module perimeter (P1-PROD-03, P2-05):**

| Plane | Authorized principal and binding | Positive / negative Product acceptance | What remains unproven |
| --- | --- | --- | --- |
| Host trust and loading | **Host operator** authorizes publisher/owner, immutable approved exact module bytes and canonical manifests via an allowlist/trust store **before loading**; content digest is not signer identity | Approved exact bytes/declarations proceed to admission; caller forged hash, unapproved publisher, tampered/missing bytes and undeclared import/export **refuse SDK execution** | Signature/attestation format, secure loader and end-to-end enforcement NOT_PROVEN |
| Native JS module evaluation | Host-controlled **trusted Node process** imports approved code; native JS **not sandboxed by DomainHarness** | A controlled import-time file/network attempt must be *observed* and assessed: Host real isolation/restrictions block it if promised; otherwise document it as trusted-code/ambient Host risk | Cannot claim import/evaluation side-effect-free or a complete Host file/network security guarantee |
| Runtime Admission/State/Effect | Inherited v0.7 trusted Central Admission and scope-bound effect owner, not user-supplied port or Module | Authorized handler/effect receipts pass; fake authority, unauthorized UX Intent, mutable sealed Handler denied without SDK-mediated authoritative effects | Actual native B→v0.7 integration NOT_PROVEN |
| Node clean consumer | **Node.js + TypeScript**, embedded `packages/domain-harness` with existing Node adapter, no mandatory LLM | Independently install/bootstrap/activate/invoke/deny two narrow Domain Apps, preserve single authority | Exact Node version, distribution/entrypoint/ABI and packaging need L2 evidence |
| Other Hosts | Existing accepted v0.7 browser/Expo profiles preserved as historical compatibility only | No new-B capability claimed or silent Host fallback; unsupported new-B profile typed refusal | Browser/Expo/Android new-B support OUT until separately scoped; designated Windows/ECF Gate B later |

**Interpretation:** “zero unauthorized effects” means **zero unauthorized SDK-mediated authoritative State/Effect mutations** in enumerated negative tests. Do *not* promise an arbitrary imported Node module has zero ambient effects, or treat a checksum as proof of publisher authentication. L2 owns mechanism, not the Product denial and trust perimeter. **A Host lacking pre-load restrictions cannot safely load untrusted native JS**; this MVP requires approved trusted modules, not an untrusted-code sandbox. Rejected module metadata is not to be dynamically imported merely to inspect it.



- Package authorization requires actual verified bytes **plus independent Host-trusted publisher/owner approval** and an authenticated selected Module/Kind/Component/Operation relationship. Digest alone is integrity, not provenance, and neither implies JS sandboxing. Admission/effect claims are restricted to SDK-mediated authority; exact enforcement remains NOT_PROVEN until tested.
- All material required semantics, including imported Kind implementation, version, capability, callable operation and authorization scope, must be understood and resolved before affected execution; unknown material requirements fail closed. Unknown explicitly non-behavioral extensions cannot change identity/admission/effect semantics.
- The Runtime—not UI, Agent, Interpreter or external package—owns occurrence transitions, scope-bound mutation/effects, durable receipt and replay. Cancellation does **not** imply rollback of an external effect; UNKNOWN is not permission for blind retry.
- Typed failure classes for missing/ambiguous/cycle/tampered package, incompatible contract/Host, illegal caller/operation, unknown result and stale binding are product-level acceptance. Exact codes/API mapping belong to L2.
- Cold-start activation and partial activation rollback must converge without unauthorized effects; failing startup must not expose a partially authorized runtime.
- Retain accepted v0.7 State/Effect/Replay/Crash principles and protected history. A toy demo with in-memory commit-before-receipt is **not** a valid production implementation.

## 8. Compatibility, packaging and host promises

**Migration posture:** v0.7 frozen `family=semantic|tool` definitions and historical hashes/replay remain valid in their version domain; v0.8 B is a successor schema/version domain, with an explicit compatibility conversion/view and golden oracle. Old active occurrences remain pinned **only if exact previous trusted executable bytes stay retained/accessible; absence is a typed CLOSED refusal, never implicit newer-code rebinding**; a changed Business Package **creates** a new Assembly, never silently mutates old authority or requires flag-day data rewrite. Public SDK consumers require documented additive/compatible paths and denied incompatible migrations.

**Host:** MVP Product minimum is **clean Node.js TypeScript embedded SDK consumer** using existing `packages/domain-harness` + approved Node Host adapter; Host supplies trust allowlist, verified module loading, authoritative existing v0.7 Runtime ports and typed invoke/deny receipt. Specific Node runtime/ABI/public entrypoint and security implementation shall be finalized and validated in L2/Gate B. Existing v0.7 portable/Expo/browser behavior must be preserved as historical compatibility; **new B on Browser/Expo/Android is OUT**, not silently claimed. Windows/ECF Build Host is a later validation environment, not evidence of a second production Host promise.

**Minimum legacy acceptance oracle matrix (P2-PROD-06):** pin golden vectors to accepted v0.7 release `version/v0.7@86110c616b8cb18c730553e4cdab7ef555214521`, and compare against the now integrated main v0.7 state; no in-place rehash.

| Golden case | Legacy domain preservation | v0.8 successor B action / refusal |
| --- | --- | --- |
| Raw v0.7 compiler/Definition input | historical compiled identity and public read stay unchanged | explicit versioned converter/view may create **new** B identity; no automatic historical rewriting |
| v0.7 Semantic-only Component | original Semantic family/KindRef/digest unchanged, semantic-only still valid | successor pure Schema/Rule can remain non-callable; no retroactive Tool injection |
| v0.7 Tool/effectful Component | historical Tool scope/effect/replay pins unchanged | new callable B operation is separately admitted and versioned, cannot mutate old identity |
| v0.7 Workflow/Decision history and WAIT receipts | exact old replay/selected-provider/occurrence behavior from v0.7 oracle | successor new profile requires new identity; old replay never re-picks new providers |
| Unknown or incompatible required Kind/version | legacy must-understand refusal preserved | typed incompatible/unsupported denial, never downgrade silently |
| Old pinned code missing after upgrade | historical record/identity still readable; execution **not** invented without code | fail closed CODE_UNAVAILABLE; never auto-load new version; supported retention/recovery window TBD at L2/Gate B |

Exact digest bytes, fixture locations and numeric encoding algorithm are owned by L2/validation; Product oracle classes and identity separation are binding now. Preservation-only is not a promise to run unsupported new B on old Expo/browser environments.

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

**Mandatory pre-Product-Freeze native feasibility proof (P1-PROD-04, no evidence-only waiver):** Prior Gate #942 R31 and independent #947 explicitly record `NATIVE_B_TO_REAL_V07_T002_T004=NOT_PROVEN`. **Tech P1 closure + fresh exact-SHA review are prerequisites**, but closure in separate toy contexts or static inspection **cannot replace** one real integrated proof. Before the Product Freeze gate #953 may PASS, require one **bounded, isolated, separately authorized** end-to-end experiment (or pre-existing *exactly equivalent already-executed* independently attested evidence, if demonstrated, not assumed):

1. Host operator approves a real publisher/owner and **actual exact bytes** plus canonical manifests and dependency/import-export closure; reject tampered/caller-forged/unapproved inputs before SDK activation/invocation.
2. Native B Component and open versioned Kind bind the actual imported **immutable selected executable Handler** (not a parallel toy function table), seal 3/4/diamond Assembly/pins, and deny invalid/unknown material semantics.
3. Same admitted candidate performs a **real accepted v0.7 T002 Assembly/activation and T004 scope-bound invocation** through the inherited State/Effect Admission owner, with attributable receipt and a no-LLM deterministic J1 path plus an old/new J3 Kind/Assembly contrast; no second Journal/authority.
4. Explicit negative proof: forged bytes/hash/publisher, unauthorized import, post-seal Handler mutation, unsupported required Kind, slash-colliding qualified graph identity, malicious array descriptor and fake effect authority deny without SDK-mediated unauthorized mutations. Record the controlled JS import-time ambient effect outcome distinctly from SDK Admission. Old missing pinned bytes fail closed.
5. The **narrow unmodified v0.7 + minimal immutable binding facade control vs native B** (Evidence §4.1) must be source-controlled/run here, with actual changed files/LOC and which essential requirements succeed/fail. If facade suffices, Product controller must NARROW/REFRAME the incremental B claim before Freeze.

Attach real build/execute logs, actual Host baseline, exact source/commit/tree/both Product blobs and independently reviewed outcome; positive+negative witnesses must be passing in intended sense, not green tests that **demonstrate remaining vulnerabilities**. This is a Product feasibility discriminator, **not** authorization to implement formal v0.8 Runtime or the full downstream Gate B. `COUNTERFACTUAL_EXECUTION=NOT_RUN`, `TECH_GATE_1=FAIL`, `NATIVE_B_TO_V07=NOT_PROVEN` on this R1 docs-only authoring turn.

**Gate B after Product Freeze / L2 as applicable:** full v0.7 equivalence (State/Effect/Journal/UNKNOWN/cancel/crash/recovery/replay/concurrency), real designated Windows/ECF Host, clean consumer & unsupported Host, full regression/Hidden Validation/release qualification on exact candidate. These are explicit later release blockers, not pre-PRD PASS claims. If feasibility evidence shows an actual product impossibility, reopen affected PRD scope instead of treating it as harmless P2.

## 11. Product acceptance and Freeze protocol

**Evidence gate:** Product Evidence covers at least three journeys (CJ01–03) and alternatives/counterevidence, states synthetic-vs-observed, measures/failures and provenance. External adopter/buyer research not collected is an explicit outstanding risk; if independent reviewer finds it material, it becomes Product P1 and needs evidence or narrower product promise.

**Draft gate:** R01–R12 have positive and negative observable acceptance, unambiguous MVP IN/OUT, cross-project authority, compatible v0.7 migration, native feasibility P1 disposition, exact artifact identity.

**Independent adversarial review:** R0 [#952](https://github.com/kaicreator-mm/domain-harness/issues/952#issuecomment-6064502054) found **four PRODUCT P1 and three P2**; this R1 changes the candidate identity and requires a **new genuinely fresh Product reviewer**, not the R1 author. Product P1-01 remains **DISPOSITION_ONLY/PENDING_EXECUTED_CONTROL**, while P1-02/03 are text-corrected but NOT independently adjudicated, and P1-04 acceptance is corrected but tech evidence missing. Independently reviewed executable proof is required for closure. A genuinely new Product reviewer (not #950 document author), exact source/PR head/blob/tree, MUST challenge consumer need vs v0.7/Temporal/Dapr/LangGraph/OPA/WIT alternatives, feasibility, semantics, scope, trust, migration and release-gate allocation. Verdict PASS / NEEDS_REVISION / FAIL; each P0/P1 must have corrective candidate and successor fresh reviewer. Self-review is **not** acceptable.

**Freeze controller:** must first apply pre-Freeze native exact-path proof and P1-01 counterfactual outcome, not merely call source/evidence coverage sufficient; may record `PRODUCT_FREEZE=YES` only after (a) required technical P1 closed with real evidence and fresh reviews, (b) native feasibility disposition satisfies product's fundamental contract, (c) all Material Product P0/P1 fixed/legitimately resolved, (d) independent review **PASS** at unchanged exact reviewed PRD and Product Evidence blobs, (e) checkpoint on designated version Product authority branch with recorded exact SHA/tree/blobs and no drift. If ANY fails, `PRODUCT_FREEZE=BLOCKED`, `L2=NO`, `FORMAL_IMPL=NO`. No automatic release or L2 from a draft.

## 12. Present disposition / next evidence

```ini
PRODUCT_STAGE=L1_AUTHORIZED_R1_DOCS_ONLY
EVIDENCE=R1_REVIEWABLE_NOT_FROZEN
PRD_R1=R1_REVIEWABLE_NOT_FROZEN
R0_PRODUCT_REVIEW=NEEDS_REVISION_4P1_3P2
R1_PRODUCT_REVIEW=NOT_RUN_REQUIRED
P1_PROD_01=DISPOSITION_ONLY_COUNTERFACTUAL_NOT_RUN
P1_PROD_02=TEXT_CORRECTED_UNREVIEWED
P1_PROD_03=TEXT_CORRECTED_UNREVIEWED
P1_PROD_04=ACCEPTANCE_CORRECTED_TECH_NOT_PROVEN
MIN_HOST=NODE_TYPESCRIPT_CLEAN_CONSUMER_CANDIDATE
COUNTERFACTUAL_EXECUTION=NOT_RUN
TECH_GATE_1=FAIL
TECH_GATE_2=NOT_PROVEN
OPEN_ARCHITECTURE_P1=YES
INDEPENDENT_PRODUCT_REVIEW=R1_NOT_RUN_R0_NEEDS_REVISION
PRODUCT_FREEZE=BLOCKED
L2=FORBIDDEN
FORMAL_IMPLEMENTATION=FORBIDDEN
VERSION_RELEASE=NOT_STARTED
```
