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

- All **publicly callable executable capabilities** use a consistent OperationCall/ToolCall envelope and result/error semantics; LLM, Workflow, application code and Kernel may be different callers of the same contract.
- Pure Schema with **zero callable Operations** is valid. Pure Rule/Decision semantics do not have to become physical Tools; an exposed callable can be declared explicitly.
- At minimum: scoped Component/Capability and Operation identity, version, input/output schema, typed error, effect class `none | idempotent | non-idempotent`, and fixed Handler binding. Streaming/cancellation/general multi-process dispatch are **not v0.8 ABI obligations** unless required by a frozen functional acceptance.
- **Mandatory invocation routing:** Every `effectClass != none` Operation and every state mutation—regardless of whether the caller is an LLM, Workflow, app, or another Package—requires the deployment-provisioned **authentic caller context**, selected Business/Capability exposure-policy projection, and the selected K's unbypassable `Admission → Journal → Effect/UNKNOWN` path; it must not expose the privileged Handler directly. `none` operations still require declared visibility, scope and typed input/output validation and must be physically read-only. Handler identity and scopes are BUILD-bound; declaration of an Operation grants no caller permission. Unauthenticated/direct unauthorized ToolCall must return a typed refusal with **zero Effect and zero Journal mutation**. Preserve caller revocation/currentness and agent-safe HF23/FR10/FR15 negatives.
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
  → Minimal Microkernel.load(selected built root)
       load/link → Package.init → established app facade → Package.dispose
  → per-request Identity Capability verifies caller; K/B authorize requests and effects
```

- **Independent deployment verifier** is an operation of the external deploy/installation environment **before** Microkernel and before any Package module executes. It is not a general `host-node` Domain Package, does not execute State/Effect policy and never returns a mutable list of providers to `load()`. The external issuer/approval authority remains designated by DAC, **not** created by the app.
- Accepted immutable App bytes, root/build identity, all selected module bytes/ABI/dependencies, approval/selection/currentness and target profile must be bound by the **same independently checked subject digest**, and installed from an immutable/read-only or otherwise integrity-protected location. A mutable `moduleSource` argument cannot be an untrusted substitution after verification. A broken artifact must be refused before executable JS import. No assertion of a new OS sandbox or tamper-resistance against fully privileged local adversaries without separate evidence.
- **For current v0.8 implementation**, the existing `trust.ts`, `installer.ts`, `load.ts` and `host-v8/bootstrap.ts` pre-import checks **remain intact** until that deploy-time invariant is implemented and independently proven on clean packaged consumers. Those checks currently run in the loader, which is a **temporary architecture mismatch**, not permission to claim the target minimal Microkernel is already achieved.
- If the environment cannot independently install/verify a fixed immutable artifact prior to `load()`, or loses a frozen Product negative, then **`PRODUCT_DECISION_REQUIRED`** for a bounded user-authorized Product successor. Do not delete old safety tests or relabel the weaker behavior an equivalent L2 refactor.

### Runtime identity is different from Package membership

Runtime **caller authenticity and currentness are dynamic inputs**, not revalidation of a Package's membership. The **Identity Capability Package** owns verification semantics of actual issuer signature, tenant/app/instance audience, expiry, revocation/currentness and issuance of a scoped verified caller fact. The deployment/installation environment owns the provisioning of the verifier's independent issuer keys, protected secrets, and transport binding; an untrusted Business/LLM/UX claim cannot provide or override these facts. The **Kernel Package** authorizes admission/readback/effects against the verified caller, and the Business Package supplies reader/workflow/operation policies. For v0.8, reuse existing `host-v8/{bootstrap,identity,kernel-gateway}.ts` as physical implementation of this boundary **until** an evidence-based capability-owned split can replace it. PF-02 requires both authorized *read and write* and revocation/re-subscribe denials. Avoid a second Kernel/Host domain rules engine.

### H responsibility ledger — retain named owners and exact negatives

`H` is a **Product-side deployment/environment assurance and platform-binding role**, **not** a mandatory independent physical Domain Package or an additional Domain Runtime. Package capability ownership and H assurance may therefore coexist without a catch-all `host-node`. Existing physical files are not deleted until all listed gates pass.

| Frozen row | One primary accountable owner for v0.8 acceptance | Capability implementation / partner | Retained positive and negative evidence |
| --- | --- | --- | --- |
| FR06, NF03, NF04 | **H external deploy/install verification** for pre-import actual bytes; BUILD for I/C/B; **M** for physical `load(package)` | Reuse qualified BUILD, existing protected load/installer until replacement | `V08-FR06-P/N`, `V08-NF03-P/N`, `V08-NF04-P/N`: approved exact identity loaded; wrong signer/bytes, missing selected handler, stale binding/activation denied before import |
| PF-02 / FR10 / FR15 | **Identity Capability** on actual caller authenticity/currentness | H deployment provisions verifier/secrets; K authorizes; B reader/workflow; UX typed transport | PF02 trusted readback P/N; `V08-FR10-P/N`, `V08-FR15-P/N`: forged role, revoked tenant/app/instance caller, unauthenticated send/read/subscribe, raw Journal bypass denied |
| HF28 | **H target-qualified execution** | Node physical capability implementation + M/K/S/B | `V08-HF28-P/N`: clean current Node consumer works; unsupported Host capabilities fail typed; no Expo parity claimed without real approval/tests |
| HF29 | **Tool/Resource Capability Package** | H environment binds only approved local/HTTP adapters selected at BUILD; K authorizes effectful requests | `V08-HF29-P/N`: approved local/HTTP JSON call vs missing/wrong capability/binding digest, no unauthorized effect |
| HF33 | **Resource Capability Package** | H deployment resource identity binding + Kernel occurrence currentness | `V08-HF33-P/N`: exact pinned current resource vs missing identity, stale/secret leakage and wrong pinned resource |
| FR08 + SD1/SD2 | **Standard Decision/Model Capability** | H-provisioned **instrumented actual ModelPort**, K admitted result; evidence provenance not inferred from declaration | `V08-FR08-P/N`, `FR08-P/N-SD1/SD2`: true same-occurrence measured counts; otherwise `unmeasured|unsupported`, zero-call deterministic source, no self-attested fake count |
| NF06 | **Kernel + Observation Capability** for append/Journals | H qualified physical CAS/durable store; U typed observation | `V08-NF06-P/N`: optional append failure typed, no false durable ACK, unsupported mandatory failure *before* irreversible effect, crash/replay/UNKNOWN preserved |
| HF23 / OperationCall | **Standard callable/exposure semantics** | Identity Capability + **Kernel mandatory Admission** + Business scope and build-selected Handler | `V08-HF23-P/N`, `V08-FR10-N`, `V08-FR15-N`: unauthorized LLM/UX effectful invocation typed-denied, zero Effect, zero Journal write |

### Exact existing-check → target-boundary disposition (no implicit waiver)

| Existing guard / source | Target stage and accountable owner | Negative retained |
| --- | --- | --- |
| Unknown, missing, forged issuer; approval HMAC mismatch; stale delegation/currentness (`trust.ts`) | Independent **deployment installer** validates external issuer+subject approval and currentness before executable import; BUILD supplies nonauthoritative evidence | FR06-N, NF03-N, NF04-N, U01 |
| Whole closure/module digest mismatch; substitution after check; missing dependency (`installer.ts`) | Immutable packaged artifact + **deployment installer** verifies actual installed executable bytes atomically against approved root; run lifetime immutable | FR06-N, V08-ABI-A01-N1/N2/N4 |
| Wrong ABI/Kind, wrong handler/endpoint, duplicate binding (`contracts.ts`, `qualify.ts`) | BUILD selects/fixes graph; deployment checks exact approved artifact version/identity, M only needs module-load structural handling | V08-ABI-A01-N3/N5, NF03-N |
| Dangerous JS getters/descriptor and malformed root (`contracts.ts`) | BUILD safe canonical input; deployment rejects malicious artifact/metadata; M may retain minimal format guard if it accepts a serialized external root | V08-ABI-A01-N5, HF31-N |
| Protected one-shot session cap and host-port injection (`kernel-host.ts`, `microkernel.ts`) | Deployment binds preselected capability handles and issuer-protected Identity Capability; no caller-settable ports or late provider | V08-ABI-B01-N4/N8, FR15-N, PF02 |
| HostIdentityVerifier invalid issuer/audience/expired/revoked caller (`host-v8/identity.ts`) | **Identity Capability at every request**, using H-provisioned independent verifier material; K admission receives verified fact only | PF02-RB, FR10-N, FR15-N |
| Fake ModelPort/counters (`model-port.ts`, `host-v8/bootstrap.ts`) | **Instrumented Model Capability operation port** provisioned by H/deployment; no self-attested count | FR08-N, FR08-N-SD1/SD2 |
| Wrong tenant/app/role, raw instance/query/subscribe or effectful Tool direct call | Identity Capability → B exposure policy → K authorized read/admission/Journal/effect; typed denial before effects | PF02-RB, HF23-N, FR10-N, FR15-N |
| CAS conflict, crash/UNKNOWN replay, optional observation append failure | Kernel/Observation/Storage owning capabilities; physically atomic Node primitive reused | V08-ABI-C01-N*, NF06-N, FR14-N |

All these are **future v0.8 implementation/test obligations**, not PASS from this document. The Product/Host `H` observables and actual negative tests stay in T-F/T-G until proven at a changed exact SHA.

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
