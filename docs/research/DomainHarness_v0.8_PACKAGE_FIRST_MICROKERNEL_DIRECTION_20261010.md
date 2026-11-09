# DomainHarness v0.8 — Package-first Minimal Microkernel / Domain App Composition Direction

> RECORD_ID: V08-DESIGN-20261010-PACKAGE-FIRST-FULL-DIRECTION  
> Status: **USER_DIRECTION RECORDED / ARCHITECTURE REVISION CANDIDATE / NOT NORMATIVE OR FROZEN**  
> Date: 2026-10-10  
> Owner register: [domain-harness #942](https://github.com/kaicreator-mm/domain-harness/issues/942)  
> Product controller: [#949](https://github.com/kaicreator-mm/domain-harness/issues/949)  
> Product freeze: [#953](https://github.com/kaicreator-mm/domain-harness/issues/953) — **BLOCKED** at time of authoring  
> Baseline: immutable v0.7; repository main at authoring: 3c71b9138056babfafbc7de1349b5924483f2203  
> Scope: research/design direction, future PRD/L1-L2 correction and acceptance planning, **NOT L2 authorization, implementation authority, new release promise or merge permission**.

This document consolidates the **explicit user corrections** made in the 2026-10-10 architecture discussion. It is intended to prevent future research, PRD edits, architecture reviews, code migrations and agents from falling back to the older, overgrown "Runtime engine inside Microkernel" interpretation. Existing accepted v0.7 semantics, frozen sources, exact digests and version closure remain unchanged. This document is **not** a successor freeze and cannot override existing formal Product/L2 authority by itself.

## 0. Decision ledger and precedence

| Ref | Status | Decision / observation |
|---|---|---|
| UD-01 | **USER_DIRECTION** | DomainHarness is a **domain harness / Domain App kernel and package execution environment**, not an application engine whose object is a previously complete Domain App. |
| UD-02 | **USER_DIRECTION** | The conceptual public entry is **DomainHarness.load(package)**, **not DomainHarness.load(compiledApp)**. The object loaded is a Domain Package/root package, potentially carrying trusted build-produced module/index/binding data. |
| UD-03 | **USER_DIRECTION** | Domain runtime capabilities (state-machine/transition, effect handling, persistence, journal, replay/recovery) are provided by **Domain Packages**, chiefly Kernel Domain Package plus Standard/Business/support Packages, **not permanently embedded in the irreducible Microkernel**. |
| UD-04 | **USER_DIRECTION** | All supported production Domain Packages originate from **domain-forge or controlled system-defined producers**; the Runtime SDK does not operate a generic third-party plugin marketplace. |
| UD-05 | **USER_DIRECTION** | **domain-simulator** owns deep Domain Package semantic/behavioral validation; **domain-ai-creator** orchestrates Domain App creation, selection, compatibility, identity and binding decisions in its build workflow using designated services/tools, before Runtime load. |
| UD-06 | **USER_DIRECTION** | DomainHarness assumes an already valid/reliable/runnable controlled Package, providing the execution environment, package lifecycle/loading and UX interaction surfaces, **not duplicating static security/legality/quality checks**. |
| UD-07 | **USER_DIRECTION** | A Domain App emerges from **DomainHarness + loaded Domain Packages + independently owned Domain UX**, not from a "compiled App" object consumed as the fundamental Runtime subject. |
| AD-01 | **CANDIDATE DETAIL** | Manifest-first build-produced package index with optional package/component lifecycle, no mandatory arbitrary executable init script. Specific wire/API shape is open for L2. |
| AD-02 | **CANDIDATE DETAIL** | Build-time component/Kind/Capability/handler resolution is consumed as an already-fixed package view; no in-Runtime deep graph search or per-invoke whole-package file hashing when Host provides actual immutable executable bytes. |
| AD-03 | **CANDIDATE DETAIL** | Small Microkernel offers bootstrapping, generic loader/module instantiation, host resource ports, lifecycle, endpoint wiring and UX transport; exact irreducible host/occurrence mechanisms to be defined by L2. |
| FV-01 | **REQUIRED PRESERVATION**, not an approved new design | v0.7 authoritative execution, T002/T003/T004 currentness, effect admission, journal, UNKNOWN, cancellation and replay semantics must continue to hold. Their *implementation owner may migrate to Kernel Package*, but observable guarantees must not disappear. |
| O-01 | **OPEN** | Exact Manifest/index, root package closure representation, init/register/activate/dispose ABI and lazy loading are not frozen. |
| O-02 | **OPEN** | Split of Kernel Package, host resource adapters and optional dedicated persistence/effect packages; minimum unavoidable Host responsibilities and atomic commit protocol require real evidence. |

**Precedence:** explicit latest user corrections supersede conflicting **research recommendations** in [#942@6084586613](https://github.com/kaicreator-mm/domain-harness/issues/942#issuecomment-6084586613), [#942@6084838279](https://github.com/kaicreator-mm/domain-harness/issues/942#issuecomment-6084838279), [#942@6085104497](https://github.com/kaicreator-mm/domain-harness/issues/942#issuecomment-6085104497), [#942@6085153125](https://github.com/kaicreator-mm/domain-harness/issues/942#issuecomment-6085153125), and especially [#942@6085266436](https://github.com/kaicreator-mm/domain-harness/issues/942#issuecomment-6085266436). Latest correction: [#942@6085394543](https://github.com/kaicreator-mm/domain-harness/issues/942#issuecomment-6085394543). Such corrections are **user-directed Product candidates**, not retroactive amendments to v0.7 or independent approval to pass #953.

## 1. Product definition and non-goals

**Canonical direction (Chinese)**:

> DomainHarness 是 Domain App 的通用、可嵌入 Harness Microkernel SDK。它为受控 Domain Packages 提供加载、生命周期、Host 资源与运行环境、UX 交互通道。通用领域执行机制由 Kernel Domain Package 提供；Standard SDK 与 Business Domain Packages 提供标准与领域能力。Domain App 在这些 Package 加载并与 Domain UX 连接后形成。Package 的生成、深度验证及应用组合/构建发生在 SDK 之外。

**Canonical direction (English)**:

> DomainHarness is the embeddable minimal kernel/execution environment for a Domain App. It loads controlled Domain Packages and exposes package-provided execution capabilities to Domain UX. The Kernel Domain Package supplies generic domain runtime mechanisms; Standard SDK and Business Packages supply additional semantic and domain behavior. A Domain App is the resulting composition of Harness + Packages + UX, not a pre-built app object that the Harness loads.

Non-goals for the irreducible Microkernel:
- **No** embedded full business workflow, rule engine, state-machine product, effect-policy engine, journal/replay service, LLM agent loop or industry-specific behavior.
- **No** independent, competing authoritative Runtime hidden in Host glue or bootstrap in parallel to package-provided execution.
- **No** Forge generator, Simulator testing engine, Creator app composer, release approval workflow or DAC authority registry inside the SDK.
- **No** arbitrary user-uploaded JS/plugin marketplace, mandatory sandbox for all external plugins, mutable provider registry or live network provider discovery in the initial controlled-producer model.
- **No** runtime recompilation of raw definitions, deep semantic validation or choosing a different provider on each request.
- **No** mandatory LLM invocation for deterministic Domain App flows.

A "minimal kernel" does **not** mean eliminating the behavior that makes a domain harness: the loaded package set must still provide actual guarded state transitions, effects, journaling, replay, durable outcomes and observability where the target app requires them.

## 2. Objects that MUST remain distinct

| Object | Meaning | Authority or owner |
|---|---|---|
| Domain Definition / Domain Data | Abstract semantic domain model and constraints; NOT necessarily a file, module or package | Generated by Forge/system; governed under DAC role boundaries |
| Domain Package | Versioned load/distribution unit containing or referencing Components, implementations and dependencies; it may have build-resolved indexes and module bytes | Forge/system-owned producer; Simulator validation; controlled governance |
| Kernel Domain Package | A specially selected, versioned package providing **generic runtime execution mechanisms** | System-defined Package owner; package execution establishes the single Runtime constitution |
| Standard SDK Domain Packages | Versioned standard Kind/Component interpreters and reusable execution support | System-defined packages |
| Business Domain Packages | Domain-specific definitions, state rules, guards, workflow/operations, optional new Kind/capability adapters | Forge-produced or controlled system packages |
| Assembly / pre-resolved bindings | Selected package closure and resolved dependency/handler/capability/Kind relationships; may be a **build-produced representation within/alongside the root Package** | App build flow and designated binding authorities; not a second business runtime |
| Runtime occurrence / state | Dynamic execution instance, authorized transitions, attempts, results and recovery | **One authority furnished by loaded package runtime mechanisms** |
| Domain UX | Independently generated domain interaction semantics and UI, Intent + Observation/Projection | domain-ux; no direct state/effect authority |
| Domain App | End result: embedded Harness + executing Packages + Domain UX | Application selection/activation follows DAC-designated roles, not solely Creator suggestions |

Thus **Domain Package != Domain Definition != Runtime Occurrence != Domain App**. A build-produced compiled representation **can** exist, but must not redefine the public loading abstraction as "load a completed App".

## 3. Target architecture

~~~text
             [User / Domain UX]
                Intent ⇅ Observe
                       │
      ┌────────────────────────────────┐
      │ DomainHarness Microkernel SDK  │
      │ - load(packages) / lifecycle   │
      │ - package execution environment│
      │ - Host resource interfaces     │
      │ - UX endpoint transport/wiring │
      │ - tiny deterministic bootstrap │
      ├────────────────────────────────┤
      │ Kernel Domain Package          │
      │ - state/transition machinery   │
      │ - execution/admission routing  │
      │ - Effect/Journal/Replay engine │
      ├────────────────────────────────┤
      │ Standard SDK Domain Packages   │
      │ - Schema / Rule / Decision     │
      │ - Workflow / Operation Kinds   │
      ├────────────────────────────────┤
      │ Business Domain Packages       │
      │ - domain semantics and guards  │
      │ - transitions, workflow, tools │
      │ - projections, domain policies │
      └────────────────────────────────┘
                       │
             [Host/OS/LLM/Storage]
             only infrastructure ports
~~~

The picture shows **responsibility**, not compulsory deployment topology, exact physical package count or ABI. The Kernel/Standard/Business layering is logical. A root package may reference an already-built fixed closure of multiple physical packages; do not hardcode "exactly three packages".

### 3.1 Irreducible Microkernel / SDK (target, not frozen L2)

Own:
- initialize the minimum portable host execution environment;
- load an explicitly selected controlled Package root/closure, materialize modules/endpoints and manage lifecycle;
- provide generic Host I/O, storage, time, scheduling and cancellation **ports** (not domain execution policy);
- expose a stable transport/dispatch plumbing seam to Domain UX, handing intents to package-provided handlers and returning observations;
- report operational failures such as absent module, unavailable platform port or failed startup; clean up resource ownership safely;
- delegate generic runtime authority to the **one configured Kernel Domain Package**, never mint a second independent state/effect authority.

Must not own:
- full Workflow/Rule/Decision/Operation interpretation;
- concrete transition eligibility, business Guard/Invariant or effect policy;
- independent Journal/state-machine/replay algorithm;
- static package provenance/security/semantic verification and cross-package capability resolution as business functionality.

L2 still must distinguish **inescapable loader/host implementation facts** (e.g. memory/module handles, OS resources, startup failure) from **policy and execution algorithms that belong in Kernel Package**.

### 3.2 Kernel Domain Package (generic execution, versioned)

The Kernel Domain Package should provide, directly or through explicitly bound support Packages:
- authoritative runtime state/transition processing and occurrence coordination;
- invocation/admission/Guard evaluation scheduling and scoped authorized transition/effect orchestration;
- effect attempt/result/UNKNOWN lifecycle, idempotency/reconciliation mechanism, journal and replay/recovery;
- deterministic capability execution routing using **already resolved** bindings;
- runtime lifecycle, durable outcomes and observations as package-provided mechanisms.

**One active authoritative runtime graph** remains mandatory. Business Packages cannot mint a second state/effect authority; the Microkernel must not secretly import an independent authoritative engine while claiming the Kernel Package owns it. Kernel Package mechanism may call Host-owned durable storage I/O through provided ports. Exact atomicity/commit control across ports must be specified and evidenced, not assumed by documentation.

### 3.3 Standard SDK Domain Packages

Supply reusable semantic Kinds/Components and executable implementations, with the research seed:
- Schema
- Rule
- Decision
- Workflow
- Operation

They are **not** closed enums hardcoded in Microkernel. Different Kind versions or additional domain-specific Kinds come through controlled Packages. Whether an individual Component exposes a callable Operation is optional. Pure Schema/definition Components must not be forced to supply execution hooks.

### 3.4 Business Domain Packages

Own:
- concrete business state structures, transitions and invariants;
- domain Guard rules, choices, workflow definitions and operation implementations;
- domain effect intent and authorized execution contracts;
- domain capability/Kind extensions, reference data, domain projections and user-facing domain meaning.

Example: an automotive-parts sales package defines "insufficient stock blocks shipment", selects/order-checks parts, quotes and fulfillment actions. The Kernel Package provides generic Guard/transition/effect processing; the Host exposes database/HTTP resource ports. Neither the Microkernel nor the Kernel Package hardcodes "parts stock" business semantics.

### 3.5 Host and Domain UX

The Host provides physical resources, execution platform and process-level isolation if needed. **Providing storage or a network client does not make Host the domain decision authority.**

Domain UX supplies interaction semantics, events, intent and observation rendering. Its request/observation channel is mediated by the Harness, but actual transition/effect decisions are made by loaded package mechanisms according to domain rules. UX intent **is not** a privileged state mutation.

## 4. Cross-project owner matrix and production lifecycle

| Phase | Primary owner / coordinator | Required output / authority limit |
|---|---|---|
| Author | domain-forge or system package producers | Versioned Domain Definition and Domain Package candidate |
| Validate | domain-simulator | Exact-candidate scenario/constraint/behavior/failure evidence; **ValidationPass != PromotionDecision** |
| Select/compose/build | domain-ai-creator coordinates tooling, including DomainHarness compiler where applicable | Explicitly selected, compatible, bound **Package** and UX; provenance/build evidence; Creator is **not** automatic issuer of all DAC production authorities |
| Promote/release | DAC-designated governance/release/selection actors | Allowed Package/application-selection identities, not invented by SDK |
| Deploy | Host / installer | Controlled immutable package bytes and runtime dependencies available to loader; platform resource configuration |
| Load/run | DomainHarness SDK + loaded Kernel/Standard/Business Packages | Package-backed authoritative domain harness, exposed via UX-facing API |
| Present | domain-ux + Host UI | Actual user interaction and observations, not a second authoritative Runtime |

**Important existing contract:** [domain-ai-creator v0.1 frozen L2 §11](https://github.com/kaicreator-mm/domain-ai-creator/blob/main/docs/versions/v0.1/L2_ARCHITECTURE.md) already has the build-time pipeline "Raw Domain Package + Target Host Profile -> DomainHarness Compiler -> Target Compiled Domain Package" and explicitly says runtime startup must not compile/discover raw packages. The compiled target **remains a Package representation** for the intended Harness API, not an already-complete Domain App. Creator v0.1's **preview** authority does not include production Manifest/Promotion/ApplicationSelection/RuntimeBinding/Activation; do not silently enlarge it.

**Important existing DAC:** [domain-application-contract v0.0.4.1](https://github.com/kaicreator-mm/domain-application-contract) distinguishes PromotionDecision, ApplicationSelection and TechnicalActivation, and forbids UX intent from becoming transition authority. New cross-project compiled-Package exchange fields require appropriate DAC successor/adoption review.

**Important simulator current boundary:** [domain-simulator README](https://github.com/kaicreator-mm/domain-simulator/blob/main/README.md) owns Domain Data simulation/evolution; claiming exact executable Package conformance additionally requires evidence binding the tested candidate to **the exact resulting implementation bytes or an attested reproducible build**. Do not mark a Data-only simulation PASS as blanket executable-code safety or invent Simulator promotion authority.

## 5. Canonical SDK abstraction

Intended, *illustrative* API:

~~~typescript
// The load subject is a controlled Domain Package, NOT a completed App.
const runtime = await DomainHarness.load(package);

// Conceptual UX/runtime operations; exact names remain API design candidates.
const occurrence = await runtime.openInstance();
await occurrence.send(intent);
const observation = await occurrence.query();
~~~

The expression DomainHarness.load(package) is the **user-selected concept**, not a claim that exactly this TypeScript signature is already exported or v0.8 ABI-frozen. The parameter can be a root Package that internally references a fixed, built and already selected package closure (or a corresponding declared package set); do not require that every dependency is physically bundled into one file.

Avoid the wrong conceptual signature:

~~~typescript
const runtime = await DomainHarness.load(compiledApp); // REJECTED abstraction
~~~

A Package may be compiled/target-specific without being renamed "App". The *Domain App* emerges when the loaded harness is integrated with the independently owned UX.

## 6. Build-time validation vs SDK load-time behavior

### 6.1 Static correctness is NOT a Runtime SDK responsibility

The following belong in the Domain App build/qualification workflow, coordinated by Creator but implemented by their designated producers/compiler/simulator/governance owners:
- Package provenance/identity/promotion and target selection;
- dependency closure, import/export/Kind/Capability/Operation compatibility;
- provider and handler selection, static graph/binding ambiguity and version profiles;
- Domain Definition semantics, workflow correctness, business invariants, exception/fault scenarios and regression evidence;
- source-to-compiled-artifact identity mapping and reproducibility.

The runtime must **not** redo semantic validation, provider search, package legality checks or full simulated execution at load time. It assumes a prequalified controlled Package.

### 6.2 Load is small and practical

The loader may still fail immediately and clearly if it cannot physically instantiate the selected Package (missing file/module, unavailable native Host resource, unsupported binary format, failed component activation). This is **normal loader error handling**, **not** a second deep Identity/Compatibility/Binding validation authority. Host or installer must ensure that bytes executed match the qualified artifact; a JS object freeze is not evidence that a mutable filesystem/module source is immutable.

Do not require:
- full graph re-validation on each invocation;
- full physical-package rehash before every business Operation **when Host guarantees immutable accepted executable bytes**;
- arbitrary plugin PKI or signing chain for same-trust-environment built-ins;
- a universal malicious-plugin sandbox as the baseline product target.

If the target Host cannot guarantee immutable code or trusted installation, its deployment pipeline must address that gap; do not silently claim equivalence by dropping safety while loading mutable unknown bytes.

### 6.3 Runtime semantics remain real, but Package-owned

Live facts are different from static Package correctness. A business state may change between intents. Loaded Kernel + Business Packages still enforce actual transition eligibility, caller-scoped authority, effect/UNKNOWN/idempotency, durability and recovery **during execution**. Simulator cannot precompute the final outcome for every runtime occurrence. This **does not** mean those mechanisms must reside in the irreducible SDK.

## 7. Loading, initialization, lifecycle and the current open design

### 7.1 Desired semantic phases

~~~text
Host selects a trusted, build-qualified Package root
  -> DomainHarness minimal bootstrap
  -> load Kernel Domain Package and declared dependencies
  -> instantiate Standard/Business Package implementation endpoints
  -> connect already-built bindings to Kernel Package runtime mechanisms
  -> initialize optional resource-owning package components
  -> expose runtime/UX interaction surface
  -> process intents and produce observations through package-owned runtime
  -> dispose/stop cleanly
~~~

At **build time**, complex identity, compatibility, binding and correctness are finished. At **runtime**, loader must not become the place where full admission and semantic graph composition are recomputed.

### 7.2 Package init: deliberately NOT frozen

Original question: "Should Microkernel call each Package's init script to load its own contents?" The conversation **did not** freeze a mandatory init script. The preferred candidate is a build-produced self-describing Package Manifest/content index and optional bounded lifecycle (e.g. activate/dispose) when a Package truly owns stateful resources. A pure declarative Package can load without hooks.

However, **Package self-initialization may be reasonable** within the closed-producer model if it merely materializes its own already-built internal executable endpoints and does not re-run Creator/Simulator validation, discover new providers or mint external authority. The exact choice — Manifest-only, optional package init, Kind-specific loader, per-resource lifecycle, eager vs lazy module instantiation — is **L2_OPEN** and must be resolved with code/evidence, not represented as a final user mandate.

### 7.3 Bootstrap and kernel ownership

There is a real self-bootstrap problem: the Kernel Domain Package cannot load itself before any loader exists. The Microkernel therefore retains the **smallest workable physical bootstrap/Host runtime primitives**, but package runtime mechanisms should live behind the Kernel Package. Distinguish:
- physical library/module load / resource port attachment = irreducible loader;
- graph- and business-level state-transition/effect/journal algorithms = Package-provided runtime.

An implementation may reuse prior v0.7 source through an adapter, but must prove the **actual selected Kernel Package provides/invokes these mechanisms**, rather than attributing Host-imported v0.7 code to a trivial Kernel package whose only callable is "link".

## 8. v0.7 preservation and migration contract

v0.7 historical Product/L2 and exact accepted public/runtime semantics remain authoritative **for v0.7** and must not be silently rewritten. v0.8 proposes a new **implementation ownership** but needs to maintain acceptance semantics. Record an exact-source migration inventory before implementation:

| Existing mechanism / source lane | Proposed v0.8 implementation owner | Required proof |
|---|---|---|
| T002 Assembly/activation/occurrence and currentness | Kernel Package execution mechanism + irreducible Microkernel handles as demonstrated in L2 | Old pins, occurrence IDs, currentness, selected identity and replay unchanged on legacy path |
| T003 implementation selection/binding | **Static** compatibility/selection precomputed in Creator-orchestrated build; loader instantiates selected Package endpoints; package execution uses bound handles | No runtime ambiguous provider search or self-authorization; exactly intended callable executes |
| T004 Central Admission/scoped invocation | Kernel Package, with Business-specific Guard/permission rules defined by Business Package | Same authoritative acceptance/denial, caller scope, no Host/UX bypass |
| Effect/Journal/durable attempt/UNKNOWN/replay | Kernel Package and/or selected support Package mechanisms, Host supplies durable resource ports | Original journal/UNKNOWN/no-blind-retry/side-effect ordering and replay semantics demonstrably preserved |
| Rule/Decision/Workflow/Operation interpreters | Standard SDK Package or Business Kind implementations | Tested old golden vectors and actual new-package execution, no hardcoded Business logic in Microkernel |
| Host/node/expo/compiler APIs | Tiny SDK+host adapters and separate build-time compiler, as appropriate | Portability and API compatibility with explicit versioned successor, no retroactive historical hash changes |

Do **not** claim moving files or adding delegation wrappers is sufficient. Require a source-to-selected-package-handler trace, actual package-provided implementation execution, old golden negative vectors and one authoritative runtime.

The original accepted v0.7 behavior is an **oracle**; do not break it in the name of minimalism. If the new Product contract intentionally differs for v0.8, mark that as a successor and require proper Product/L2 decision.

## 9. Exact current v0.8 research gap / stale PRD

Current Product draft [PR #967](https://github.com/kaicreator-mm/domain-harness/pull/967) at HEAD af93236e105c3ac49d87e75ed359ea0e19fa8341, PRD blob 7c88d05e7b9cc17c2de726c4908beb5ecf818ff0 (R2, unmerged), **conflicts materially with UD-01/UD-03**:
- R2-P1.1 currently assigns T002/T003/T004, State, Central Admission, Effect/Journal/Replay/Recovery to "**Minimal Microkernel irreducible**" and limits Kernel Domain Package mostly to declarations/adapters, expressly forbidding user-replaceable state/effect owner.
- R2 still puts significant Package verifier/link/seal work in the SDK load path and expects full provenance/Host trusted runtime validation there.
- Future Product/L1 draft must reflect **Kernel Package as mechanism owner** and move static package qualification to Simulator/Creator-orchestrated build, while preserving true execution-time authority and existing v0.7 contract guarantees.
- R2 useful commitments to real executable generated packages, real non-self Domain App, DomainHarness self-dogfood App, full v0.1–v0.7 reusable semantics inventory, negative evidence, no fake runtime and no arbitrary Provider discovery must **not** be thrown away.

Current research code [D1 PR #978](https://github.com/kaicreator-mm/domain-harness/pull/978) physically loads manifests, hashes modules and links via a Kernel Package. [K1 PR #986](https://github.com/kaicreator-mm/domain-harness/pull/986) demonstrates a four-package Assembly plus old v0.7 Host-mediated effects, but the physical D1 Kernel implementation predominantly provides "kernel.link"; much T002/T004/Journal behavior still resides in trusted Host glue/imported v0.7 runtime sources. These proofs are useful **but not complete evidence that the Kernel Domain Package owns runtime machinery**. Current research PRs are **draft / DO NOT MERGE**, and #953 remains blocked pending independent gates.

Do not retroactively reinterpret green spike tests as a verification of this revised architecture. Keep exact SHA/review provenance and log the new gap as new Product/L2 amendment input; **do not arbitrarily invalidate old scoped test results**.

## 10. Required falsifiable v0.8 demonstration plan (proposed)

| ID | Test | Positive / negative acceptance |
|---|---|---|
| D-01 | Minimal SDK public entry | A controlled root Package loads via the conceptual DomainHarness.load(package); no "compiledApp" argument or package provenance semantic validator required. Missing implementation cleanly fails startup. |
| D-02 | True Kernel Package runtime ownership | Actual state-transition/admission/effect/journal behavior is provided by physically selected Kernel/support Package code, not merely a kernel.link wrapper while Host secretly owns an independent engine. Trace module identities. |
| D-03 | Standard Kind composition | Schema/Rule/Decision/Workflow/Operation available as Standard Package Kinds without Microkernel industry switch; a pure Schema has no mandatory callable operation. |
| D-04 | Business substitution | With exact unchanged Microkernel and Kernel/Standard Packages, substitute an Approval domain with an unrelated small domain (e.g. parts sales or engineering workflow); correct domain-specific behavior changes, no Microkernel patch. |
| D-05 | UX round trip | UX submits an intent through the loaded Harness and receives a real query/observation/WAIT/outcome; UX cannot become effect or state authority. |
| D-06 | Simulator → Creator → Load handoff | Simulator validation and Creator-orchestrated compatibility/binding/selection complete before load; Package identity/compile lineage carried into loaded modules without re-running simulation in SDK. |
| D-07 | Runtime fast path | Once loaded, requests use already fixed handlers. No repeated whole-package rehash/semantic graph rebuild in ordinary invoke path given Host immutable bytes. Invalid runtime intent still denied by package-defined rules. |
| D-08 | Kernel-driven state and effects | Business Guard refuses an illegal transition, allows a legal transition; Kernel mechanism commits/records one authorized outcome and rejects duplicate/non-idempotent unsafe replay. |
| D-09 | Crash/UNKNOWN/recovery | Preserve original v0.7 cancellation/UNKNOWN/Journaling/external-effect uncertainty and idempotent reconciliation under real Host fault injection. No forged green receipts. |
| D-10 | Version/upgrade isolation | New Package or Kernel implementation version creates a new selected package/occurrence context, no silent hot-rebind of an active old occurrence, old durable replay uses retained matching mechanism. |
| D-11 | No duplicate authority | There is one owner of committed production State/Effect results; Host/UX/LLM or Business plugin cannot mint a parallel producer; all policy/effect mediation routes through the one loaded Kernel mechanism. |
| D-12 | v0.7 compatibility/goldens | Original exact v0.7 API, frozen identity/digest and required transition/effect/replay negatives still match, subject to separately approved successor migration scope. |
| D-13 | Package initialization choice | Compare manifest-only, optional lifecycle and potential init entry on the same small Package set; justify smallest protocol in measured size/complexity/cold start, not hypothetical plugin attacks. |
| D-14 | Compilation/build vs load | Demonstrate static Binding/Compatibility failure stops Creator/build step, not discovered via Runtime graph search; a successfully built controlled Package loads without a second SDK audit. |
| D-15 | Kernel replacement | If claimed supported: replace selected Kernel Package with a compatible versioned successor **without changing Microkernel**, preserving a single authority and migration/currentness rules. If not supported in v0.8, explicitly define non-goal rather than pretend all Kernel Packages are hot-swappable. |
| D-16 | Real app delivery | At least one genuine executable non-self Domain Harness App + distinct DomainHarness Engineering self-dogfood Domain App, with actual loaded Domain Packages and real UX interactions (not a CRUD shell or simple LLM API wrapper). |

The tests are **proposed target acceptance**, not all currently passed. D1–D3 historical research IDs (#971/#972 and related) must not be conflated with the table's D-01…D-16 identifiers.

## 11. Architecture review questions for formal Product/L2 successor

Before Product Freeze and L2, resolve:
1. What exact subset is irreducible Bootstrap/Host code, and what concrete state/effect/journal implementation **moves to Kernel Package**? Produce file/function ownership map.
2. Does DomainHarness.load(package) accept a root Package object, filesystem handle, URL-resolved trusted blob or in-memory module bundle? Which forms are actually required for Node/Expo? Public ABI not yet frozen.
3. What is the executable Kernel Package bootstrap interface if the Kernel Package cannot self-load? How is its versioned implementation provided without creating a second hidden engine?
4. Which exact constraints/ABI belong in a build-produced Package index, and how does Host guarantee the executable bytes and resolved handlers are truly the ones qualified by Creator/Simulator?
5. What is the stable UX ↔ Harness intent/query/observe/cancel/resume interface, and which part is loaded Package provided vs portable transport glue?
6. Which execution engines/services from v0.1–v0.7 are migrated to Kernel/Standard Packages and which remain ordinary Host adapters? What is the totality/coverage inventory?
7. Is Package-level init necessary or are Manifest + optional resource lifecycle sufficient for generator-controlled content? Where do loader failures, cleanup and retries live?
8. How does package-owned Journal/Effect mechanism preserve original atomic commit/UNKNOWN/replay when physical storage is a Host port?
9. Are Kernel Package upgrades allowed while active instances run? Distinguish concurrent versions from in-place replacement.
10. What belongs in v0.8 Product scope versus an explicitly deferred version without invalidating the required real Domain App proof?

## 12. Anti-regression reviewer checklist

A future author/reviewer must reject a design that:
- describes DomainHarness chiefly as a "Runtime that loads compiledApp", rather than a microkernel that loads **package**;
- assigns the real generic state-machine/Journal/Effect implementation permanently to Microkernel while making Kernel Domain Package a thin decorative manifest/link shim;
- moves critical state/effect execution to Creator, Simulator, UX, arbitrary Business Package bypass or Host's second authority;
- deletes original v0.7 durable/UNKNOWN/recovery protections just to make SDK smaller;
- adds a mandatory package-wide init or framework plugin discovery without testable need;
- puts static Package identity/compatibility/selection/binding semantic audits back into Runtime SDK;
- claims Simulator automatically performs executable-module qualification beyond evidence actually implemented;
- assumes Creator v0.1 has production Manifest/Promotion/Activation authority;
- calls a green isolated research spike a formal Product/L2 Freeze or silently merges Draft research PRs;
- declares "self-dogfood" without a genuine second Domain App running actual selected Package capabilities.

## 13. Mandatory change-control and downstream handoff

**Already settled at direction level:** UD-01…UD-07.  
**Needs Product/L1 revision:** R2 PRD Kernel-vs-Microkernel owner table, load object, runtime-vs-build checks, UX interaction promise, real-app journeys and acceptance matrix.  
**Needs L2 design/proof:** Kernel Package runtime migration, loader/lifecycle contract, compiler-to-Package interface, host resource/atomic durability, negative tests and exact migration coverage.  
**Needs DAC/Creator/Simulator follow-through:** cross-project package provenance/evidence exchange; Creator orchestration vs designated production authorities; Simulator exact executable Package evidence. Those adjacent projects have their own frozen authorities and must not be silently modified by this one research note.  
**Preserve:** all v0.7 immutable baselines/legacy pins; unrelated local-agent worktrees and current Draft research PR heads; original independent reviews.

**Do not** merge this research draft into main, rewrite PR #967 or #951, claim #953 PASS, dispatch formal v0.8 implementation, or create blocking DAG entries solely because this document exists. First obtain updated Product/L1 and independent review, then follow ADS Product Freeze → L2 → Task DAG → bounded implementation → real validation → version closure.

## 14. Source ledger

- [Design Chronicle #942](https://github.com/kaicreator-mm/domain-harness/issues/942), especially [latest user-direction correction #942@6085394543](https://github.com/kaicreator-mm/domain-harness/issues/942#issuecomment-6085394543).
- [Technical pre-research #932](https://github.com/kaicreator-mm/domain-harness/issues/932).
- [Product controller #949](https://github.com/kaicreator-mm/domain-harness/issues/949); [Product Freeze #953](https://github.com/kaicreator-mm/domain-harness/issues/953).
- [R2 PRD draft PR #967](https://github.com/kaicreator-mm/domain-harness/pull/967), HEAD af93236e105c3ac49d87e75ed359ea0e19fa8341, PRD blob 7c88d05e7b9cc17c2de726c4908beb5ecf818ff0.
- [Physical Genesis D1 PR #978](https://github.com/kaicreator-mm/domain-harness/pull/978), HEAD f87cfdfcf9fd252cc757c02e77d155afa5572303.
- [Physical K1 PR #986](https://github.com/kaicreator-mm/domain-harness/pull/986), HEAD 3fde560baaf36da89a9de9cd1327be3a88a77570; [R4 integration #987](https://github.com/kaicreator-mm/domain-harness/issues/987).
- [domain-ai-creator frozen v0.1 L2](https://github.com/kaicreator-mm/domain-ai-creator/blob/main/docs/versions/v0.1/L2_ARCHITECTURE.md), build-time compiler / runtime boundary §11.
- [domain-simulator README](https://github.com/kaicreator-mm/domain-simulator/blob/main/README.md); [domain-application-contract README](https://github.com/kaicreator-mm/domain-application-contract/blob/main/README.md).
- [v0.7 L2 Architecture Freeze #526](https://github.com/kaicreator-mm/domain-harness/issues/526), accepted immutable historical authority.
