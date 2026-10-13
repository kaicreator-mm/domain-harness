# DomainHarness v0.8 — Package-first Closed-World L2 Successor Delta

> **Status: REVIEW_REQUIRED / NOT FROZEN / NOT AN IMPLEMENTATION OR VALIDATION PASS.**
> Owner: [#1023](https://github.com/kaicreator-mm/domain-harness/issues/1023). Design record: [#942](https://github.com/kaicreator-mm/domain-harness/issues/942). Baseline observed: `v0.8@93f4cc911afc373815b948dc6c38a1ed72bee524` (2026-10-13). This **additive proposal** does not edit, invalidate, or silently supersede the frozen [Product/L1](https://github.com/kaicreator-mm/domain-harness/issues/953), [L2 Freeze](./DomainHarness_v0.8_L2_FREEZE.md) or reviewed [L2 evidence](./DomainHarness_v0.8_L2_ARCHITECTURE_EVIDENCE.md). Affected L2 ownership/assurance changes require bounded Product-equivalence adjudication and independent review before being normative.

## 1. Product identity and preserved acceptance (equivalence review pending)

- The `domain-harness` **repository develops and delivers an embeddable DomainHarness SDK**, its minimal Microkernel, official Kernel/Standard Domain Packages and package ABI. A loaded DomainHarness Runtime is the SDK + selected Package(s), not the SDK alone.
- A Domain App is a **closed-world executable output** of the ecosystem's build, selection, qualification, composition and packaging process. The public entry is `DomainHarness.load(package)`, where `package` is the **already assembled and selected root**, not an unprocessed `compiledApp`, an unbound manifest, or a dynamic plugin marketplace.
- Initial Genesis Business Packages may be hand authored and built using the same producer-neutral ABI; working Forge/Creator/Simulator cross-repository production integration is **not** a v0.8 Release prerequisite. `domain-forge` presently authors Domain Data candidates, and cannot silently acquire cross-project approval/promotion/runtime authority.
- Preserve one selected Kernel authority, all meaningful FR01–FR15/HF16–HF34, NEW-FUNCTION01–06 (**NF05/NF06 are the fifth/sixth entries, not additional duplicates**), FR08 SD1/SD2, PF-02 scoped readback, actual physical CAS/UNKNOWN/Replay, typed UX and two independent Approval/Engineering executable Domain Apps using the same exact K/S cohort. Product-equivalence of the proposed BUILD/deployment responsibility shift is **NOT YET PROVED**, even though the Product definition is not being intentionally respecified.

## 2. Ownership, not an artificial Host layer

| Concern | Owner / required contract | NOT the owner |
| --- | --- | --- |
| Domain App creation/orchestration | `domain-ai-creator` coordinated external actors | Runtime Microkernel |
| Business candidate/data and future Business Package generation | `domain-forge` authoring, with external Simulator/DAC responsibilities intact | Runtime Microkernel |
| Generic qualified Package BUILD/seal/target selection/handler binding | Toolchain consuming Harness ABI and external authority decisions | Microkernel, Forge-only compiler |
| Package loader, selected closure/module wiring, minimal lifecycle hooks | **Microkernel SDK** (after independently admitted immutable deployment artifact) | Kernel rules, provider qualification, publisher verification |
| State/Guard/Admission/Transition/Effect/Journal/UNKNOWN/Replay | Physically executed **Kernel Package** | Microkernel, generic Host |
| Schema/Rule/Decision/Workflow/Operation Kind semantics and reusable callable API | **Standard Package** and named owning capabilities | Microkernel fixed Kind switch |
| Domain rules/policies/operation handlers | **Business Package(s)** | Host or Microkernel |
| Storage, file, network, model, process or device capability and its target-specific handler | **The owning capability Package**, including Node implementation and `init/dispose`; runtime-verified caller identity and resource provenance retain a named environment assurance owner | One catch-all `host-node` Domain Package |
| OS/JS engine module loading and primitive APIs | Language/OS execution environment, bound by BUILD-selected package implementations | New runtime authorization framework |

**Capability ownership**, not target OS, determines source/module/package boundaries. Shared physical implementations MAY be extracted into a genuine reusable capability module only for demonstrated reuse; that does not create a universal Host authority. Existing `host-v8` and `domain-harness-node` sources are reuse assets until verified migration; no mandatory large file move in v0.8.

## 3. Minimal Microkernel and Package lifecycle

Microkernel target: `load → connect preselected modules/operations → invoke optional init hooks in fixed dependency order → expose app surface → invoke stop/dispose in reverse order`. It should NOT perform domain runtime admission, business policy, Effect or Journal mutations, Runtime Kind implementation or runtime provider discovery.

Minimal proposed Package-facing contract (illustrative, **NOT** frozen exact TS ABI):

```ts
interface PackageModule {
  // Already selected by BUILD. No dynamic load, discovery or authority grant.
  init?(ctx: PackageContext): void | Promise<void>;
  dispose?(ctx: PackageContext): void | Promise<void>;
  // Callables described through standard, build-bound Component/Operation metadata.
}
```

- `init` may validate **own runtime configuration/resources**, attach owned handlers and initialize local resources. This does **not** mean revalidating Package membership, publisher/issuer or compatibility.
- Lifecycle failures must fail cleanly; initialized predecessors disposed in reverse order. No later Package's `init` may start after a failure. A module's top-level code may have been evaluated during import; lifecycle cannot retrospectively undo that code. BUILD/packaging constrains top-level behavior and the failure gate guarantees only no *Microkernel-orchestrated later activation*, with typed best-effort cleanup.
- Existing K/S factory entry points (e.g. `createOccurrenceRuntime`, `interpret`) are reusable; implement only an **absent minimal lifecycle seam**, never a second state machine or a general init-script VM.
- `load(package)` remains one argument. A separately bound runtime context may exist as a **BUILD-selected, deployment-provisioned, capability-limited** implementation detail, but no public caller-supplied Host verifier or mutable provider options. `init(ctx)` gets only immutable per-Package config, build-bound capability handles and lifecycle scope; it cannot issue caller identity, install new providers, change the active K or invoke state/effects before K admission. `dispose(ctx)` is idempotent best-effort cleanup of owned resources (reverse order, typed aggregate errors), not a rollback of committed external effects. Do not expose a partially initialized app facade.

## 4. Unified Component and callable Operation ABI

The existing v0.8 Component/Kind/Operation design remains the starting point, and original [#942](https://github.com/kaicreator-mm/domain-harness/issues/942) explicitly rejects `Semantic == Tool`.

```text
Domain Package
  → Component [semantic Kind + optional provided/required Capability]
      → optional Operation [input/output/error/effect contract]
          → BUILD-selected Handler [portable JS / target-specific implementation]
```

- All **publicly callable executable capabilities** use a consistent OperationCall/ToolCall envelope and result/error semantics, with **caller classes separately authorized**. Workflow/application/Kernel may invoke their BUILD-exposed operations under corresponding scope; an LLM/agent receives only the frozen **read-only/projection-safe** callable surface in v0.8 (`effectClass === 'none'`). Do **not** enable LLM-initiated effects, state mutation or direct privileged Handler calls by this ABI proposal; the existing `SDK_AGENT_MUTATION_REFUSED` denial remains binding. A future effectful LLM tool workflow requires a separate Product successor authorization.
- Pure Schema with **zero callable Operations** is valid. Pure Rule/Decision semantics do not have to become physical Tools; an exposed callable can be declared explicitly.
- At minimum: scoped Component/Capability and Operation identity, version, input/output schema, typed error, effect class `none | idempotent | non-idempotent`, and fixed Handler binding. Streaming/cancellation/general multi-process dispatch are **not v0.8 ABI obligations** unless required by a frozen functional acceptance.
- **Mandatory invocation routing:** Every `effectClass != none` Operation and every state mutation—regardless of whether the **authorized non-agent** caller is a Workflow, app or another Package—requires the deployment-provisioned **authentic caller context**, selected Business/Capability exposure-policy projection, and the selected K's unbypassable `Admission → Journal → Effect/UNKNOWN` path; it must not expose the privileged Handler directly. `none` operations still require declared visibility, scope and typed input/output validation and must be physically read-only. Handler identity and scopes are BUILD-bound; declaration of an Operation grants no caller permission. Unauthenticated/direct unauthorized ToolCall must return a typed refusal with **zero Effect and zero Journal mutation**. Preserve caller revocation/currentness and agent-safe HF23/FR10/FR15 negatives.
- Effect class vocabulary is the pre-existing `none | idempotent | non-idempotent` declaration family; exact ABI spelling must be checked against the v0.8 code before normative freeze, not silently invented in this proposal.

## 5. Closed-world BUILD + independently verified deployment, **not** Microkernel Package admission

**Target from user:** BUILD selects/validates the *complete* fixed Domain App closure and target implementations; the installed executable Domain App is a closed world. `DomainHarness.load(package)` merely loads/links already admitted modules and calls lifecycle hooks. It does **not** discover a provider, decide publisher trust, mint Package authority, requalify dependencies or re-approve Package membership.

**Product-equivalence constraint from frozen Product/L2:** Original FR06-N, NF03-P/N, NF04-P/N, PF-02 and frozen L2 #999 specifically require **independent** approval plus refusal of unapproved/tampered actual imported bytes *before the first module execution*. BUILD's own self-attested root and own hashes do not meet that condition. The requirement must not disappear just because qualification is moved out of the Microkernel.

### Proposed equivalence-preserving execution sequence — option A, still REVIEW_REQUIRED

```text
Creator/Forge/etc. authored input + external DAC authorization
  → qualified BUILD (static I/C/B, exact K/S/B/Capability closure, target, operation→handler)
  → immutable executable Domain App artifact (manifest + actual executable module bytes + digests)
  → INDEPENDENT deployment/installation acceptance:
       verify externally issued subject approval + publisher,
       verify target, entire installed bytes/dependencies and exact root,
       reject stale, altered, missing or unauthorized artifacts BEFORE execution
  → protect accepted immutable artifact from code substitution for its run lifetime
  → CREATE build-bound, prelinked Package handle for that SAME accepted artifact
  → Minimal Microkernel.load(package)  // `package` is that closed immutable handle
       load/link ONLY verified prelinked exports → Package.init → app facade → dispose
  → per-request Identity Capability verifies caller; K/B authorize requests and effects
```

- **Independent deployment verifier** is an operation of the external deploy/installation environment **before** Microkernel and before any Package module executes. It is not a general `host-node` Domain Package, does not execute State/Effect policy and never returns a mutable list of providers to `load()`. The external issuer/approval authority remains designated by DAC, **not** created by the app.
- Accepted immutable App bytes, root/build identity, all selected module bytes/ABI/dependencies, approval/selection/currentness and target profile must be bound by the **same independently checked subject digest**, installed from an immutable/read-only or otherwise integrity-protected location. A broken artifact must be refused before executable JS import. No assertion of OS sandbox or tamper-resistance against fully privileged local adversaries without separate evidence.
- **P1-TRUST-02 closure — SELECTED option A(a), static/prelinked-only entry:** BUILD produces a **single executable app artifact** whose generated entry imports/links *only* immutable module URLs/exports contained in the **accepted verified artifact**. The environment installs that artifact and freezes its import-resolution map **before any app module evaluation**. The `package` argument passed to `DomainHarness.load(package)` is an **opaque, prelinked handle** referencing only those immutable packaged modules and their closed manifest. It is **not** an attacker-supplied serialized root, `moduleSource` string or mutable resolver. SDK's loader cannot import another module by reading executable bytes, URLs or providers from that handle; no alternate `data:` source import or late root substitution is reachable. This is a *structural binding to deployed bytes*, **not** a runtime issuer reapproval, and must be independently proven on the final real App artifact, not claimed by documentation.
- **Mandatory negative witness:** independent deploy accepts Artifact A and seals its static import map; a caller subsequently supplies a forged root/modified `moduleSource`/shadow package handle to `load()`; the Microkernel's module import path **cannot address** that unselected code and rejects the unrecognized handle **before any unauthorized module evaluation or Effect/Journal mutation**. This is a format/closed-handle refusal, not Package membership requalification. Tests also cover symlink/path/manifest substitution after installation, failed/missing source, and loader restart of accepted Artifact A.
- **Alternative only with separate approval:** a protected deployment-attested subject-digest binding at loader import is another possible design, but it is **not** the selected option A(a) for this successor and would add a runtime verification seam. If static location-only admission cannot be proven, retain current gates and explicitly request Product adjudication. Do not state option A is already implemented.
- **For current v0.8 implementation**, the existing `trust.ts`, `installer.ts`, `load.ts` and `host-v8/bootstrap.ts` pre-import checks **remain intact** until the static/prelinked-only invariant is implemented and independently proven on clean packaged consumers. The current loader still imports root-carried `moduleSource` bytes, which is **NOT** the selected static target. Existing gates may be reused behind an adapter in the interim but may not be silently removed. No code/Product PASS is inferred from this design.
- If the environment cannot independently install/verify a fixed immutable artifact prior to `load()`, or loses a frozen Product negative, then **`PRODUCT_DECISION_REQUIRED`** for a bounded user-authorized Product successor. Do not delete old safety tests or relabel the weaker behavior an equivalent L2 refactor.

### Runtime identity is different from Package membership

Runtime **caller authenticity and currentness are dynamic inputs**, not revalidation of a Package's membership. The **single BUILD-selected, non-shadowable Identity Capability** owns verification semantics of actual issuer signature, tenant/app/instance audience, expiry, revocation/currentness. Its independent deployment-provisioned verifier is the **only** source of an authenticated, scoped caller fact; Business/other Capability Packages cannot provide, wrap, forge or replace that verifier or caller fact. K consumes verified facts **only through the protected deployment-bound H→K gateway/session channel**, never as caller/Package JSON and never through a raw tool argument. Negative: a Business Package fabricates `verifiedCaller`, `principal` or another Identity provider → K refuses with no existence leak, no Effect/Journal. This preserves PF-02 and B01-N1/N2/N6/N8. The deployment/installation environment owns the provisioning of the verifier's independent issuer keys, protected secrets, and transport binding; an untrusted Business/LLM/UX claim cannot provide or override these facts. The **Kernel Package** authorizes admission/readback/effects against the verified caller, and the Business Package supplies reader/workflow/operation policies. For v0.8, reuse existing `host-v8/{bootstrap,identity,kernel-gateway}.ts` as physical implementation of this boundary **until** an evidence-based capability-owned split can replace it. PF-02 requires both authorized *read and write* and revocation/re-subscribe denials. Avoid a second Kernel/Host domain rules engine.

### H realization ledger — **frozen L1 primary owner retained verbatim**

`H` means the **existing Product assurance/platform-binding role**, not a requirement for an independent `host-node` Domain Package. Source/implementation ownership can be gradually moved to capability packages **without changing the frozen Product primary owner**. The adjacent capability/assurance field is NOT a replacement primary. Frozen Product/L1 source stays unchanged. Any later primary-owner reassignment MUST be separately declared in a bounded Product successor and accepted by Product controller; this document proposes **zero** such reassignment in v0.8.

| Frozen row | **Frozen single primary owner (unchanged)** | Current H assurance / potential capability-owned implementation (NOT reownership) | Required positive/negative witness |
| --- | --- | --- | --- |
| FR06 | **M** | BUILD static I/C/B; H independent accepted-byte/deploy refusal; M actual load/lifecycle only after accepted artifact | `V08-FR06-P/N`: correct selected module loads; tampered/unapproved/missing byte refuses before import |
| NF03, NF04 | **BUILD** | H independent physical install/activation attestation; M activates only after pre-execution acceptance | `V08-NF03-P/N`, `V08-NF04-P/N`: wrong binding/currentness/publisher or actual installed bytes denied |
| PF-02 | **Preserve frozen Product PF-02 composite H-verifiable caller + K/B policy** (not a new L1 FR/HF primary) | H deployment verifier/Identity Capability implements credential authenticity; K state/read authorization; B reader rules | PF02-RB: read/write/subscribe real caller origin + revocation/cross-tenant denials |
| FR10, FR15 | **U** | UX remains product owner; H-backed Identity Capability verifies caller, B supplies scope, K authorizes | `V08-FR10-P/N`, `V08-FR15-P/N`: forged role/identity, direct raw Kernel/tool mutation refused |
| HF28 | **H** | Node implementation retained; optional other qualified target only if admitted | `V08-HF28-P/N`: clean Node selected K/S/B; unsupported capabilities denied; no inferred Expo parity |
| HF29 | **H** | H owns accepted local/HTTP bindings; Tool/Resource Capability may maintain Node handler as an *implementation* | `V08-HF29-P/N`: allowed local/HTTP JSON tool vs missing/wrong capability/digest |
| HF33 | **H** | H owns occurrence resource currentness assertion; Resource Capability may implement platform API, K requires correct occurrence scope | `V08-HF33-P/N`: pinned actual resource vs stale/missing/wrong/secret leakage |
| FR08 + SD1/SD2 | **S** | S resolver/source owner; H provides actual instrumented ModelPort, K alone admits; never fabricated numeric count | `V08-FR08-P/N`, `FR08-P/N-SD1/SD2`: actual measured counts or `unmeasured/unsupported` |
| NF06 (NEW-FUNCTION-06) | **S** | S owns typed observation semantics; K owns Journal, H qualified physical append/CAS, U transport | `V08-NF06-P/N`: optional typed append failure, durable observe and no false ACK |
| HF23 | **S** | S owns **read-only** agent projection/exposure; H verified caller, B scoped projection, K admits mutations on non-agent routes | `V08-HF23-P/N`, `V08-FR15-N`, `SDK_AGENT_MUTATION_REFUSED`: agent effectful projection unavailable; direct mutation gets zero Effect/Journal |

**Proposed future Product owner changes (NOT authorized for v0.8):** if a later version wants to change H-primary `HF29/HF33` to capability owners, or any `FR06/NF03/NF04/FR10/FR15/NF06` primary, open a separately reviewed Product delta. This successor only describes **implementation and assurance realization**, not new normative primary owners.

### Exact existing-check → target-boundary disposition (no implicit waiver)

| Existing guard / source | Target stage and accountable owner | Negative retained |
| --- | --- | --- |
| Unknown, missing, forged issuer; approval HMAC mismatch; stale delegation/currentness (`trust.ts`) | Independent **deployment installer** validates external issuer+subject approval and currentness before executable import; BUILD supplies nonauthoritative evidence | FR06-N, NF03-N, NF04-N, U01; A01-N1 approval replay (test title :228), A01-N2 forged producer (:250) |
| Whole closure/module digest mismatch; substitution after check; missing dependency (`installer.ts`) | Immutable packaged artifact + **deployment installer** verifies actual installed executable bytes atomically against approved root; run lifetime immutable | FR06-N; A01-N3a (TOCTOU, `tests/v08-abi/v08-abi-a01.test.ts:266`); A01-N6 (MODULE_IDENTITY_MISMATCH, :348); static-A+forged-root-after-install (NEW / NOT_RUN) |
| Wrong ABI/Kind, wrong handler/endpoint, duplicate binding (`contracts.ts`, `qualify.ts`) | BUILD selects/fixes graph; deployment checks exact approved artifact version/identity, M only needs module-load structural handling | A01-N5 (duplicate intent, `v08-abi-a01.test.ts:331`); A01-N6 (module identity, :348); A01-N7 (wrong-kind/dangling binding, :360); NF03-N |
| Dangerous JS getters/descriptor and malformed root (`contracts.ts`) | BUILD safe canonical input; deployment rejects malicious artifact/metadata; M accepts only BUILD-prelinked opaque handle, with basic handle/format refusal; no serialized root or caller-supplied executable source | A01-N4 (hostile accessor, `v08-abi-a01.test.ts:290`); HF31-N; A01 header N5 is *not* test-title N5 |
| Protected one-shot session cap and host-port injection (`kernel-host.ts`, `microkernel.ts`) | Deployment binds preselected capability handles and issuer-protected Identity Capability; no caller-settable ports or late provider | B01-N8(post) one-shot (see `tests/v08-host/v08-host-b01.test.ts:523`), B01-N4 injected port; FR15-N; PF02 |
| HostIdentityVerifier invalid issuer/audience/expired/revoked caller (`host-v8/identity.ts`) | **Identity Capability at every request**, using H-provisioned independent verifier material; K admission receives verified fact only | PF02-RB, FR10-N, FR15-N |
| Fake ModelPort/counters (`model-port.ts`, `host-v8/bootstrap.ts`) | **Instrumented Model Capability operation port** provisioned by H/deployment; no self-attested count | FR08-N, FR08-N-SD1/SD2 |
| Wrong tenant/app/role, raw instance/query/subscribe or effectful Tool direct call | Identity Capability → B exposure policy → K authorized read/admission/Journal/effect; typed denial before effects | PF02-RB, HF23-N, FR10-N, FR15-N; `SDK_AGENT_MUTATION_REFUSED` |
| CAS conflict, crash/UNKNOWN replay, optional observation append failure | Kernel/Observation/Storage owning capabilities; physically atomic Node primitive reused | V08-ABI-C01-N*, NF06-N, FR14-N |

The A01 test **file header** labels TOCTOU N4, hostile accessors N5 and ambiguous provider N6, but executable **test titles** identify them as N3a (:266), N4 (:290) and N5 (:331). This matrix cites executable title+file:line, with N6 failed-activation (:348), N7 wrong-kind (:360), and B01-N8(post) one-shot (:523) individually rather than relying on mismatched header numbers. These are **future v0.8 implementation/test obligations**, not PASS from this document. The Product/Host `H` observables and actual negative tests stay in T-F/T-G until proven at a changed exact SHA.

## 6. Portable JavaScript / QuickJS boundary (successor, not v0.8 implementation)

- Build `TypeScript source → JavaScript module`; portable JS Package semantics do not depend on the TypeScript runtime.
- Future Rust/Go/C Microkernel implementations may embed **QuickJS**, but QuickJS is NOT Node.js; module resolution, async Promise jobs/event loop, FFI/native binding, data/error marshalling, resource ownership and OS functions require per-target implementation.
- Native External Functions are **owned and maintained by the corresponding capability Package**, with BUILD pinning their target implementation; Portable JS business logic can stay unchanged when target adapters satisfy the ABI.
- v0.8 may describe portability restrictions and build exclusions but **MUST NOT require** a QuickJS runtime, second Microkernel, broad FFI abstraction, several target drivers or cross-language release validation.

## 7. Bounded acceptance and review

A. On the *same existing* v0.8 BUILD/K/S/Node assets, show one **additional callable capability** whose selected Handler loads without adding a role/Kind special case inside Microkernel. Current `QualifiedPackageKind = kernel|standard-sdk|business` and `V8_QUALIFIED_ABI` require an extensibility proof or a minimal repair.

B. Demonstrate package-owned optional `init/dispose` (or strictly equivalent existing lifecycle) with ordered success, failed init and reverse cleanup; preserve K/S factories.

C. Demonstrate one pure and one effectful OperationCall via the same declared contract and fixed Handler selection, without weakening K-owned Effect/Journal/CAS and typed denial.

D. Existing Approval and Engineering apps continue using the **same exact K/S**; actual FR/HF/NF and real Host tests stay in current T-D/T-F/T-G, **not** a new duplicate demo wave.

E. No additional functional Package kinds, generic registry, dynamic host discovery, full source-tree repackaging, Forge mandatory compilation, QuickJS, or custom native multi-language harness as new v0.8 prerequisites.

**L2 status remains REVIEW_REQUIRED.** Only a fresh independent exact-SHA Product/L2 ownership and test-equivalence review may make this successor normative. Maintain original freeze SHA/blobs unmodified; then implement any confirmed gap through one bounded PR with disjoint write sets and re-run impacted real tests.
