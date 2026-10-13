# DomainHarness v0.8 — Package-first Closed-World L2 Successor Delta

> **Status: REVIEW_REQUIRED / NOT FROZEN / NOT AN IMPLEMENTATION OR VALIDATION PASS.**
> Owner: [#1023](https://github.com/kaicreator-mm/domain-harness/issues/1023). Design record: [#942](https://github.com/kaicreator-mm/domain-harness/issues/942). Baseline observed: `v0.8@93f4cc911afc373815b948dc6c38a1ed72bee524` (2026-10-13). This **additive proposal** does not edit, invalidate, or silently supersede the frozen [Product/L1](https://github.com/kaicreator-mm/domain-harness/issues/953), [L2 Freeze](./DomainHarness_v0.8_L2_FREEZE.md) or reviewed [L2 evidence](./DomainHarness_v0.8_L2_ARCHITECTURE_EVIDENCE.md). Affected L2 ownership/assurance changes require bounded Product-equivalence adjudication and independent review before being normative.

## 1. Product identity is unchanged

- The `domain-harness` **repository develops and delivers an embeddable DomainHarness SDK**, its minimal Microkernel, official Kernel/Standard Domain Packages and package ABI. A loaded DomainHarness Runtime is the SDK + selected Package(s), not the SDK alone.
- A Domain App is a **closed-world executable output** of the ecosystem's build, selection, qualification, composition and packaging process. The public entry is `DomainHarness.load(package)`, where `package` is the **already assembled and selected root**, not an unprocessed `compiledApp`, an unbound manifest, or a dynamic plugin marketplace.
- Initial Genesis Business Packages may be hand authored and built using the same producer-neutral ABI; working Forge/Creator/Simulator cross-repository production integration is **not** a v0.8 Release prerequisite. `domain-forge` presently authors Domain Data candidates, and cannot silently acquire cross-project approval/promotion/runtime authority.
- Preserve one selected Kernel authority, all meaningful FR01–FR15/HF16–HF34 + NEW-FUNCTION01–06 + FR08/NF05/NF06 behavior, actual physical CAS/UNKNOWN/Replay, typed UX and two independent Approval/Engineering executable Domain Apps using the same exact K/S cohort.

## 2. Ownership, not an artificial Host layer

| Concern | Owner / required contract | NOT the owner |
| --- | --- | --- |
| Domain App creation/orchestration | `domain-ai-creator` coordinated external actors | Runtime Microkernel |
| Business candidate/data and future Business Package generation | `domain-forge` authoring, with external Simulator/DAC responsibilities intact | Runtime Microkernel |
| Generic qualified Package BUILD/seal/target selection/handler binding | Toolchain consuming Harness ABI and external authority decisions | Microkernel, Forge-only compiler |
| Package loader, selected closure/module wiring, minimal lifecycle hooks | **Microkernel SDK** | Kernel rules, host service provider |
| State/Guard/Admission/Transition/Effect/Journal/UNKNOWN/Replay | Physically executed **Kernel Package** | Microkernel, generic Host |
| Schema/Rule/Decision/Workflow/Operation Kind semantics and reusable callable API | **Standard Package** and named owning capabilities | Microkernel fixed Kind switch |
| Domain rules/policies/operation handlers | **Business Package(s)** | Host or Microkernel |
| Storage, file, network, model, process or device capability and its target-specific handler | **The owning capability Package**, including Node implementation and `init/dispose` | One catch-all `host-node` Domain Package |
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
- Lifecycle failures must fail cleanly; initialized predecessors disposed in reverse order. No implicit side effects from later packages after an init failure.
- Existing K/S factory entry points (e.g. `createOccurrenceRuntime`, `interpret`) are reusable; implement only an **absent minimal lifecycle seam**, never a second state machine or a general init-script VM.
- `load(package)` remains one argument. A separately bound runtime context may exist as prelinked implementation detail, but no public caller-supplied Host verifier or mutable runtime provider options.

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
- The selected Kernel remains responsible for current authorized state/effect transition and durable failure semantics. A ToolCall is neither authority delegation nor a bypass.

## 5. BUILD vs Runtime and **material frozen-L2 conflict**

**User-directed target:** Package admission/compatibility/selection/implementation choice is complete at BUILD/deployment of the closed-world App. Once packaged, Microkernel *loads*; it may check basic structural format needed to load, and Packages may check own startup requirements. Package membership is not approved twice.

**Existing frozen L2:** `DomainHarness_v0.8_L2_FREEZE.md` §Frozen facts 3, U01/U02, and existing code `public-v8/{contracts,load,installer,trust,microkernel}.ts` + `host-v8/bootstrap.ts` require additional pre-import authorized issuer/immutable-byte verification and protected Host attestation.

These statements are **not automatically equivalent**. Do NOT remove loader/Host guards by implementation fiat or report the old tests as newly passed. [#1023](https://github.com/kaicreator-mm/domain-harness/issues/1023) must first map each check to a surviving actor and demonstrate unchanged Product-observable safety:

| Existing check | Proposed owner after closed-world build | Release evidence to retain |
| --- | --- | --- |
| Publisher/Package identity, dependency closure, module digest and handler selection | Build/pack/distribution verification before producing/installing the executable App | Deterministic bytes, negative malformed/substitution evidence, no unapproved Handler |
| Platform implementation and dependencies | Build-selected target profile + capability owner's module | No late resolution; unavailable implementation fails before shipping |
| Package startup configuration/resources | Package's own `init` | Typed failure + cleanup, no unintended effect |
| Caller/app/tenant/operation authorization | Kernel/Business/owning capability on **actual runtime requests**, with caller-context source addressed by the assembly | Unauthorized read/mutation, scoped subscriptions and currentness remain denied |
| State/Effect/Journal/UNKNOWN/Replay + CAS | Kernel/owning physical capability | Real durable ordering, typed conflict, no false ACK |
| Raw external input validation, exceptions/faults | Capability/Kernel/Business as appropriate | Existing FR/HF/NF negatives unchanged |

If this cannot preserve existing frozen Product acceptance, record `PRODUCT_DECISION_REQUIRED` and obtain a **bounded Product successor approval**. Until then, the frozen original checks remain binding on implementation and Release Qualification; this proposal is not permission to relax them.

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
