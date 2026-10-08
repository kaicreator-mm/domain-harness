# DomainHarness v0.8 PRD — Generated Executable Domain Packages + DomainHarness Engineering App (DRAFT R2)

**R2 STATUS:** User-expanded **reviewable product draft only**, `PRODUCT_FREEZE=BLOCKED`. Controlling product inputs [#942 USER_DIRECTION @6067763173](https://github.com/kaicreator-mm/domain-harness/issues/942#issuecomment-6067763173), [#949 Controller @6067778497](https://github.com/kaicreator-mm/domain-harness/issues/949#issuecomment-6067778497), [#950 R2 Task Pack @6067779945](https://github.com/kaicreator-mm/domain-harness/issues/950#issuecomment-6067779945), [#942 three real Demos @6067870370](https://github.com/kaicreator-mm/domain-harness/issues/942#issuecomment-6067870370). Reviewed R1 [PR #957](https://github.com/kaicreator-mm/domain-harness/pull/957) and fresh [#958 Product Review NEEDS_EVIDENCE](https://github.com/kaicreator-mm/domain-harness/issues/958#issuecomment-6066014024) remain historical and unchanged. **This R2 block overrides conflicting legacy R1 scope/status text retained below for traceability**; R1 acceptance for trust, J1–J3, cross-project boundaries, Product P1 facade-control and real T002/T004 still applies. ADS pinned v4.0.0@1edaee9291e25b6dd99303493bed75132cb54881. Baseline accepted `main@3c71b9138056babfafbc7de1349b5924483f2203` (tree `ee710c577f131d86f42819fc898a66e140de4f11`), historical v0.7 `version/v0.7@86110c616b8cb18c730553e4cdab7ef555214521` with #517 Product and #526 L2 freezes.

## R2-P1 Non-negotiable v0.8 Product outcome

**Definition:** A Domain App is **Domain + executable domain-specific Harness + common embedded DomainHarness Runtime + independently bound Domain UX/Host**. The Harness is an admitted, versioned Component/Capability/Workflow/Rule/Decision/Operation graph and bounded execution profile. It is **not** an Agent prompt chain, a simple CRUD app, a second Runtime, or a mandatory sixth Kind. No LLM call is required for deterministic paths. UX and LLM cannot authorize state/effects.

**REQUIRED physical pipeline:** `machine-readable Domain Definition → single trusted build-time generator → reproducible versioned Package manifests + real runnable module bytes + Kind/Operation declaration + dependency/import/export closure → independent byte/publisher trust attestation → public SDK Load/Link/Seal into immutable Assembly → actual inherited accepted T002/T004 activation/invocation → recorded admitted outcome/receipt → independent test/review`. Each arrow is externally inspectable, not a mock / fixture-only projection. Versioned identities: input definition digest; generator source SHA; output Manifest/Module content digests; selected physical handler ID; sealed Assembly digest; occurrence/old-pin; native receipt and Host run. Generated Package is a distributable executable unit, **not** equivalent to merely hand-writing a manifest or preloading a toy handler table.

**v0.8 MUST:** one usable minimal genuine reproducible Package generator (owned in trusted Host/build tooling, or interoperating with `domain-forge` input); real Unified B Package-first Runtime sharing the single v0.7 admission/effect/replay authority; one generated **non-self Approval (or Learning) Domain App**; one separately generated **DomainHarness Engineering Domain App**; working Package-backed execution for **every in-scope reusable v0.1–v0.7 execution semantics** in L1 Evidence R2.4; current legacy API/digest/replay pin preservation. Zero second business execution engine in the new-app path. Self-dogfood is the **demonstration domain**, not the root of trust. No claim that D1–D3 have already executed.

### R2-P1.1 Ownership boundaries and required packaging

| Owner / layer | Owns / may be packaged | Must never acquire |
| --- | --- | --- |
| **Host trust/bootstrap** | external signer/publisher policy; trusted seed verifier; approved exact native JS bytes and module load restrictions; build-time generator and real Build Host commands/resources | self-attestation by generated Package; untrusted JS isolation by checksum |
| **Minimal Microkernel irreducible** | T002 Assembly/currentness/State, T003 authorized binding, T004 scoped operations/Central Admission/Effect/Journal/Replay/Recovery, occurrence & serialized durable commit | business-specific Rule/Workflow switch, independent LLM/promotion decisions |
| **Kernel Domain Package** | version-pinned Kernel-facing declarations/adapters/profile consumed only after seed verification | mint first trust root; user replaceable State/Effect owner |
| **Standard SDK Domain Package(s)** | versioned Schema, Rule/Expression, Decision/Fast Path, Workflow/child/HarnessMachine, Operation/Tool/Skill/Script adapters, approved read-side Query/Projection/Message semantics; optional bounded Decision→Workflow composition | direct state mutation or parallel Registry/Effect Journal |
| **Business Domain Package(s)** | Approval/Learning or Engineering business rules, guarded workflow, allowed operations, evidence/decision schema, domain-specific Harness definition | authorization to execute arbitrary Host commands or rewrite old occurrence |
| **Legacy Compatibility Facade** | old v0.1–v0.7 public API/family/digest/identity and exact previous selected executable pins; typed old-code unavailable | hidden second runtime for v0.8 new apps or retroactive history rehash |
| **Sibling projects** | Forge candidate definition authoring, Simulator proof, UX rendering/intent, AI Creator app entry, DAC cross-project authoritative boundary | transferred DomainHarness trust/State/Effect/release authority |

**Component B ontology:** one Component with versioned KindRef, body, required semantic contracts, derived Capability bindings and optional typed Operations (none/idempotent/non-idempotent); Schema with zero operations valid and uncallable; Standard Kinds Schema/Rule/Decision/Workflow/Operation are *extensible*, not a hardcoded Kernel enum. Graph/Package DAG, selected authenticated implementation, Assembly and Occurrence are distinct identities. A legacy semantic `family=semantic|tool` may be explicitly projected through a versioned compatibility adapter; its historical hash domain is never mutated. Two-level parent/child Workflow and Rule→current exact result→approved promoted Workflow→bounded reasoning fallback use one inherited authority and one versioned Workflow Kind; no autonomous promotion/Rule synthesis mandate.

### R2-P1.2 Historical semantics must execute from Packages, not inventory-only

The [companion Product Evidence R2.4](./DomainHarness_v0.8_L1_PRODUCT_EVIDENCE.md) names v0.1–v0.7 exact located source paths and target owner for 15 reusable classes. **Deliverable contract PRE07-AUDIT-01**: before final release, a machine-readable source/API inventory maps **every supported exported/reusable semantic** to an exact initial frozen version, current implementation path/API, primary target owner, active new-app Package implementation and Handler ID, Host/resource dependency, old golden inputs/outputs/digests, failed/denied vectors, migration status, priority and independently reviewed evidence. Any missing/unclassified IN-scope item is FAIL. Do not infer “100%” from the 15 representative classes alone.

**PRE07-PKG-03:** physical generated Standard/Business Package implementations execute existing Rule/Expression, DecisionResolver/Fast Path/exact-currentness, parent/child Workflow/HarnessMachine, Tool/Skill/Script/Operation, Message/Query/Projection supported semantics with actual B declarations/Kind/handlers under inherited T002/T004; positive and adversarial golden vectors; old/unknown Kind refusal; no Kernel business-specific switch. **PRE07-AUTH-04** Kernel alone commits State/Effect/Journal/Replay. **PRE07-API-02** frozen public/legacy digests, historical persisted decisions and replay unchanged. **PRE07-APP-05** new version→new sealed Assembly, old pin preserved only while exact retained trusted code is available else typed CLOSED refusal. Delivery of an inventory **without a functioning in-scope Package route is FAIL**. Nonessential physical source moves can be avoided only when a traced supported semantic is nonetheless executed through the one Package-first path; any other omission requires explicit Product OUT + full negative impact review, not automatic deferral to v0.9.

### R2-P2 Three cumulative authentic Demo milestones, prerequisites and stage distinction

| Demo/owner | Precise preconditions | Positive release acceptance | Mandatory denials / external falsifier | Pre-Freeze feasibility vs final version |
| --- | --- | --- | --- | --- |
| **D1 REAL GENERATOR**, Host tooling | machine-readable input Definition schemas + deterministic generator pinned source and Host publisher approval + independent minimal bootstrap. **One** common producer for D2/D3 | On clean Node Host run generator twice, produce real **physical** versioned Package manifest and linked/importable implementation bytes, identical canonical digest/declared closure with exact component/Kind/callable identities; public SDK verifies and seals valid 3/4/diamond graphs | Independent raw-byte/hash recomputation, mutated bytes/signature/owner, duplicate/missing provider/cycle, forged declaration/import and wrong selected actual handler rejected with typed reason prior to SDK-mediated effect | Bounded D1 + link must show feasibility **before Product Freeze if separately authorized**; full generator hardening/packaging post-Freeze. `NOT_RUN` |
| **D2 NON-SELF APPROVAL APP**, reuse D1 | reviewed B1 [#964 PASS_BOUNDED](https://github.com/kaicreator-mm/domain-harness/issues/964#issuecomment-6067721261); independently completed #960 B2 K1/A1; one separately authorized real B→actual accepted v0.7 T002/T004 integration + #949 existing facade comparison | Generated Approval Business Package includes actual Schema/Rule/Decision/Workflow/Operation; same public SDK runs deterministic no-LLM allowed/denied cases and J3 package swap, real T002 seal/activate and T004 authorized invocation/effect journal and receipts, selected physical handler ID, new/old occurrence pins | Independent same-source v0.7+minimum façade **control** vs B **treatment**, real Host T002/T004 verification; forged handler, wrong caller, unknown material Kind, post-seal swap, old bytes unavailable, fake effect authority denied; record actual changed LOC/glue; RETAIN_B/NARROW/REFRAME/STOP | **Thin real D2 + same-source facade counterfactual pre-Freeze only** after explicit separate authorization; **full D2 release acceptance post-Freeze**. `NOT_RUN` |
| **D3 SELF-ENGINEERING APP**, same producer/trust | D1 and full D2 stable; separately generated Engineering Business Package, pre-trusted Host independent seed, approved explicit build/test/qualification tools and fresh outside reviewer | Actually runs J4 real bounded build→validation→test→qualification flow using Workflow/Rule/Decision/Operation, exact Git SHA/tree/package hash/Host test receipt, successful deterministic no-LLM branch, denied branch, authorized WAIT→handoff→RESUME with preserved decision pins; optional bounded child Workflow; emits **release recommendation only** | Independent build/test on real Host with separately implemented byte/oracle validator checks reports; wrong test results, revoked reviewer, unauthorized command/effect, forged receipt/manifest, replay/old pin/UNKNOWN/cancel/crash all handled by typed rejection/recovery; self-issued PASS cannot authorize release | **Post-Freeze L2/formal build + v0.8 Version Closure/Release mandatory; NOT_RUN now**, NOT a pre-Freeze code task |

**Dependencies:** `B1 reviewed → B2 explicit separately claimed & fresh-reviewed → (distinct authorized integrated D1+thin D2 feasibility + #949 same-source control) → fresh Product R2 review/adjudication → #953 potential Product Freeze → L2/task DAG → complete D1/D2/D3 implementation → real regression/Hidden/Windows/ECF/recovery/packaging → independent release qualification`. Product Review of this R2 text can be commissioned **now** and must explicitly leave feasibility blocked until actual evidence; its draft-text review is not pre-Freeze proof. No unrelated Demo duplicates or B1/B2 scope mutation.

**Authentic common test ledger** for D1/D2/D3 must include `inputDefinitionDigest, generatorSHA/tree, approvedPublisher, manifestSHA, moduleByteDigest, declaredKind+Component+HandlerIDs, acceptedAssemblyDigest, occurrencePin, T002ActivationReceipt, T004Invocation+EffectJournalReceipt, cleanHost+toolVersions, testCaseID/negativeVariant, hostLogsDigest, externalOracleID, freshReviewerTerminal`. Missing links means NOT_PROVEN; do not count malicious-witness-green tests as conformance PASS.

### R2-P3 Engineering self-dogfood J4 — executable bounded domain Harness, not self-certificate

Engineering Domain **business** Components must form a sealed Workflow graph on the same Runtime as D2:
1. `BuildPackage` Operation: caller explicitly authorized to run pinned Host build command; capture exit code, stdout/stderr digest, generator hash and built package hashes; read-only simulation alone not accepted.
2. `ValidatePhysicalPackage` Rule/Operation: attest actual bytes/manifest/dependency/import-export/selected handler identity with independent byte oracle and chosen publisher policy; forged/unknown contract DENIED.
3. `AdmitGraphAndBind` Operation: call supported public SDK with actual T002 and selected handler scope. No business package grants itself a new effect permit.
4. `RunTestsAndCollectEvidence` bounded Operation: Host command executes real tests against the sealed candidate; record reproducible test run SHA/tree/runner/positive+negative results, no invented exit code.
5. `EvaluateQualification` Decision: compare typed externally verified test receipts and declared rule predicates; `PASS_RECOMMENDED|FAIL|WAIT_INDEPENDENT_REVIEW|UNKNOWN_RECONCILE`, not auto-merge or product/release PASS. Unsupported/missing independent oracle never means PASS.
6. `ReviewHandoff` Workflow WAIT: a separate authorized reviewer/Host signs independent decision; only authorized RESUME (same occurrence, same pins) proceeds. Failure/UNKNOWN/cancel cannot silently retry non-idempotent operations or repick provider.
7. `RecordReleaseEvidence` Operation: append immutable outcome including package/assembly digest, candidate HEAD/tree, test receipt, independent reviewer reference and decision. **Actual final merge/tag/publish outside app** under existing ADS/human/controller gates; dogfood output is advisory and not a root of trust.

**J4 negatives:** malicious unapproved command, faked successful tests, wrong selected Handler, tampered artifact, P1/Hidden failure, missing reviewer, stale evidence or changed branch, old handler bytes unavailable, concurrent receipt collision, unauthorized UX transition, external effect UNKNOWN; each yields typed refusal/reconciliation and no unauthorized SDK-mediated commit. Independent oracle must *not* import the same self-generated runtime validator as its only judge.

### R2-P4 Testable requirements, SELF acceptance and stage owner

| ID | Observable MUST and independent external negative | Stage / evidence now |
| --- | --- | --- |
| **R13 / SELF01** | Real generator produces reproducible physical manifest+modules from machine-readable Definitions (not hand-written fixtures); two fresh-host runs yield matching canonical bytes/digests; corrupt/tampered and unauthenticated publisher rejected | pre-Freeze D1 feasibility, full release; NOT_RUN |
| **R14 / SELF02** | One unmodified common SDK/trust chain executes **two different generated Business Domain Apps** (Approval and Engineering), both containing complete domain-specific Harness, no Kernel business hardcoding; mismatched Package closure denies | full D2/D3 release; NOT_RUN |
| **R15 / SELF03** | For Schema/Rule/Decision/Workflow/Operation and open Kind, declared selected physical implementation/Callable == byte-verified bound/used Handler; pure Schema uncallable; wrong-but-existing Handler/owner and forged import rejected | pre-Freeze thin D2 then full release; bounded B1 research only |
| **R16 / SELF04** | Actual inherited v0.7 T002/T004 authority, scoped state/effect/journal/UNKNOWN/replay and immutable occurrence pins exercised; fake effect port/post-seal change/old bytes unavailable denied with typed receipt | pre-Freeze real native seam; later real recovery/host closure; NOT_PROVEN |
| **R17 / SELF05** | 100% full in-scope reusable semantics (not just a 15-class inventory) mapped and runnable in versioned Packages + unchanged accepted v0.7 old public API/digest/identity/golden; new apps no unreviewed second legacy business engine | later implementation/regression; NOT_RUN |
| **R18 / SELF06** | J1 no-LLM positive+negative, J2 0/1/N/handoff/replay, J3 3/4/diamond+Kind upgrade and **J4** actual engineering build/validate/test/qualified WAIT/decision all pass; injected bad capability, provider, command and handoff fail safely | D2/D3 release; NOT_RUN |
| **R19 / SELF07** | Independent raw-artifact byte recomputation + clean third-party Build Host logs + v0.7 differential/golden + distinct fresh Product/Architecture/Release reviewers. Self-produced release PASS not sufficient and cannot sign/bootstrap itself | product feasibility + release; NOT_RUN |
| **R20** | No-LLM deterministic route and bounded optional child Workflow; no automatic promotion, generic AgentLoop or unbounded LLM navigation. UX Intent/Observer cannot commit State/effect | D2/D3 regressions; NOT_RUN |
| **R21** | Generator source, Definition SHA, Package exact bytes, Host trust decision, selected Handler, Assembly and Runtime T002/T004+evidence compose a reproducible immutable chain; unavailable code, invalid history/publisher or Host profile typed fail-closed | pre-Freeze thin D1/D2, later full Gate B; NOT_RUN |

R01–R12 and CJ01–CJ03 retained below are **also mandatory** unless explicitly narrowed by fresh Product acceptance; this R2 adds R13–R21/SELF01–07 and CJ04. Every acceptance must carry success **and** failure witnesses, actual source/Host SHA/tree/byte proofs and independent review. No shortcut by counting five kinds in a toy test as functional migration.

### R2-P5 IN/OUT, trust/Host, Product risk and actual stage admission

**IN:** shared embedded Node TypeScript SDK, trusted minimal bootstrap, physical Package generator, Unified B, existing Kernel authoritative T002/T004 + governed Kernel Domain Package/Standard SDK/Business Package, Version-complete reusable semantic routing, J1–J4, 2 generated apps, old public/digest/replay compatibility, Host-controlled real test operations, deterministic/no-LLM, typed negative outcomes and independent Oracle. Resource adapters/UX renderers are external but their scoped interface behavior is tested.

**OUT:** writing natural-language UX/page builder in DomainHarness; owning domain-forge authoring/LLM prompting, domain-simulator, domain-ux, domain-ai-creator, DAC cross-project standards; arbitrary remote/untrusted JS or marketplace; generic autonomous four-stage promotion/LLM→rule compiler/AgentLoop; automatic self-merging/releasing/signer trust; unrelated industry package library; Windows/Android/browser new-B product promise until evidenced. **The minimal actual Package generator is IN, despite R1's older "full Domain App generator" OUT sentence**; the latter applies only to a cross-ecosystem general app factory. Nonessential physical file moves may wait, but missing in-scope **working Package semantics cannot**.

**Host/security:** approved publisher identity and exact bytes are separate gates, not digest-as-authentication. Trusted native JS import-time file/network ambient capabilities require Host restriction/isolation or explicit documented risk; SDK promise protects only SDK-mediated authoritative State/Effect. First root seed must be verified independently of D3. No untrusted module is imported to "test" its permission. Tool/effect/scope/rollback and replay pins use accepted single-owner v0.7 semantics; cancellation never implies remote-effect rollback and UNKNOWN cannot automatically retry.

**Product feasibility blockers:** P1-PROD-01 accepted v0.7 unchanged + minimal immutable facade vs B treatment on identical J1/J3 input is **OPEN / NOT_RUN**. If facade meets scope with less complexity, Product Controller independently decides `RETAIN_B|NARROW_TO_FACADE|REFRAME|STOP` and re-reviews material changes. Tech Gate 1 remains FAIL; #964 B1 R2 is **PASS_BOUNDED only**, #960 B2 explicit separate trigger; real generated D1, thin D2 native T002/T004, owner identity, effect replay, Host trust and independent external reference **NOT_PROVEN**. New R2 Product Review must scrutinize claimed v0.8 scope feasibility especially inherited migration/D3 sequencing, but cannot waive these engineering gates.

**Before a Product Freeze vote**: approved narrow D1 authentic generated-artifact/link proof; thin D2 native B into accepted v0.7 T002/T004 with negative cases and same-source #949 facade-control; P1 technical closures with genuine independent reviews; a truly fresh R2 Product review on exact HEAD/tree/two blobs and owner adjudication of all Product P1. If evidence disproves feasibility, amend R2 and re-review; don't launch L2 to “discover it later.” **Full production D1, D2, D3, older semantic migrations, Windows/ECF full regression, fault/replay/concurrency, Hidden Validation/packaging/Release Qualification are post-Freeze version delivery / release-gate obligations**, not performed or implicitly authorized by this authoring task.

**R1 → R2 normative change ledger:** R1 abstract composition → generated Domain+Harness product; R1 only J1–J3 → J4 bounded real Engineering App; R1 general generator OUT → minimum physical generator IN; R1 old API compatibility → complete working in-scope Package semantic migration + legacy facade; R1 B native proof on hand fixtures → real generated-byte D1 + D2 same-source control native v0.7 and independent raw oracle; R1 no D3 → D3 post-Freeze with actual Host operations and external Review. R1 trust/Host and CJ02 negatives remain unchanged, corrected under #958 historical text verdict.

**CURRENT:** `R2_PRODUCT_REVIEW=NOT_RUN`; `ACTUAL_GENERATED_PACKAGE_EXECUTION=NOT_RUN`; `ENGINEERING_DOGFOOD_EXECUTION=NOT_RUN`; `EXTERNAL_ORACLE=NOT_RUN`; `PRODUCT_P1_PROD_01=OPEN`; `NATIVE_B_TO_V07_T002_T004=NOT_PROVEN`; `TECH_GATE_1=FAIL`; `PRODUCT_FREEZE=BLOCKED`; `L2=NO`; `FORMAL_IMPL=NO`; `MERGE=NO`.

---

## Carried-forward R1 PRD (retained for precise J1–J3/trust/failure/golden acceptance; R2 above wins on conflicts)


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
