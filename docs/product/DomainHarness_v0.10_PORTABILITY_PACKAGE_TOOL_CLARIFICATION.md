# DomainHarness v0.10 — Basic Portability, Fixed Domain App Runtime and Package-Owned Tool Implementation (Product Clarification)

> Status: **additive Product clarification / L2 intake**. The exact-R3-frozen [PRD](DomainHarness_v0.10_PRD_CANDIDATE.md), [Product Freeze checkpoint](DomainHarness_v0.10_PRODUCT_FREEZE.md), and historical crosswalk remain unchanged. This document does **not** approve a new Product feature, amend the PC-05 zero-import rule, qualify a runtime implementation, or admit the proposal Task DAG. Relevant design intake: [#1148](https://github.com/kaicreator-mm/domain-harness/issues/1148).
>
> Baseline: frozen PRD blob `673da42ad90acde5ef942beb8ac63b58836a649f`; crosswalk blob `2832ce0b4269737d934b071a6c2e830deefec629`; informative DAG blob `74898ff80cfeeb9dfd74464a2e5235098003c916`. Current reference deployment may use Node.js + SQLite. No pre-1.0 v0.9 API/store compatibility requirement.

## 1. Portability and responsibility

- **Basic contract portability, implementation freedom**: The Microkernel SDK, public facade and necessary Basic Kernel/Standard **contracts** are Host-independent; one particular implementation does not need to run unchanged on every target. The only currently implemented SDK/Basic cohort is TypeScript compiled to JavaScript on Node.js. Keeping Node APIs/SQLite at coherent internal Host seams is an appropriate *current engineering design choice*, not a demand to introduce an abstraction for every platform API or third-party library, nor a prerequisite for a future separately implemented runtime target. Do not expose implementation-specific objects/types through cross-Package public contracts.
- **Implementation owner owns its environment**: optional Kernel extensions, Standard features, Business and Capability Packages own their private code, dependencies, initialization/disposal and declared target/runtime requirements. A selected implementation may be Node-specific. A Package exposes **named selected semantic/capability/operation contracts**; no concrete Node/SQLite/XState/third-party type, private resource handle, credentials or implementation object crosses that contract.
- **No automatic interface proliferation**: ESM loading, Acorn, Ajv, JSON Schema validation engines, JSONata/YAML and XState are implementation choices unless an actual cross-layer capability is needed. The declared JSON Schema and expression dialect remain semantic contracts where used.
- **Trusted installed closure**: BUILD/Host validates the selected deployment profile, exact provider/operation bindings and required capabilities before activation. Failure to satisfy a required dependency is a typed refusal; an optional Feature/Tool cannot turn into a mandatory Basic import. Keep one K Primary as the only Admission/State/Journal/Effect authority.

## 1a. One closed-world Domain App, ONE selected runtime

**A Domain App is a closed-world executable assembly**, not a collection of Packages each choosing its own interpreter or engine. At App generation/BUILD, select ONE concrete **execution runtime profile** (implementation language/engine, relevant ABI and Host target; the sole v0.10 implementation is TypeScript compiled to JavaScript and executed by Node.js 24), a compatible SDK/Basic implementation, and every required K/S/B/C implementation and dependency. All selected executable implementations MUST explicitly support this profile. Runtime-time Package discovery, alternate engine bootstrapping, npm install, target switching or fallback to an unpinned implementation is not allowed.

- **Shared local execution environment:** all locally executing SDK, Basic, extension, Business and Capability implementations use the same selected App runtime and coherent Host profile (JavaScript on Node.js in v0.10). Package-owned environment means producer-owned source/dependencies during Package generation and scoped configuration, resources and `init/dispose` at runtime; it does **not** mean a separate Node process, VM, QuickJS instance or interpreter per Package. Remote Tool providers may run outside the Domain App via an explicitly selected adapter and do not create a second *local* App runtime.
- **Multiple implementations per logical Package:** a Package may publish runtime-specific variants (for example, `node24` and `browser`) of the same declared interface. A version/tag may identify compatible candidates at Package generation/BUILD, but the selected variant is pinned by exact implementation identity, version, code/dependency digest, supported engine/ABI and, where relevant, OS/architecture/native addon ABI and required Host capabilities. Missing, incompatible, ambiguous or conflicting variants are refused before execution; no floating tag or latest choice at runtime.
- **Environment resolved before App launch:** the Package producer resolves, bundles/builds and declares dependencies for each target during Package generation. Domain App BUILD/installation selects compatible variants, fixes the complete dependency closure, verifies compatibility with the ONE selected App runtime and prepares all local assets before activation. Compatible shared dependencies may be deduplicated; private dependencies do not leak into public contracts or silently override one another. At runtime a Package can open its own handles/connections/caches but cannot change the installed graph, install packages or start a replacement JS runtime.
- **Selection and execution identities are separate:** human-readable version/tag is metadata for compatible candidate selection, while the immutable BUILD-selected implementation digest and the App runtime profile determine the installed executable identity. SDK, Workflow and Tool Calls do not make fresh implementation selections.
- **Existing PC-05 stays frozen:** self-contained, zero-import ESM applies to the selected Package entry. Target-specific native Node implementation assets may be linked as separately sealed and approved **Host-local Tool implementations executing in the same selected Node runtime**, not as unapproved imports in the zero-import Package entry. L2 must define and verify implementation/dependency closure and pre-execution integrity. If direct `node:*`/npm imports from the selected Package entry are required, do not silently reinterpret PC-05: propose a narrowly reviewed Product amendment.

## 1b. Both SDK and Domain Packages may have runtime-specific implementations

- **Two logical multi-target products, one currently implemented target:** the SDK/Microkernel+Basic and each Domain Package may independently publish implementations for different **target runtime profiles** under one stable, appropriate external contract. This describes how implementations *may be produced*; it does not assert that non-Node SDK or Package implementations already exist, nor commit v0.10 to building/testing a second runtime. v0.10 ships the currently implemented **TypeScript → JavaScript → Node.js** target only.
- **No single-source portability obligation:** future runtime support may use a different SDK implementation and separately generated versions/target-tagged Package implementations. Source sharing, adapters and internal abstraction layers are optional software engineering choices guided by maintainability, code quality, performance, cohesion and actual reuse. Multi-runtime support is achieved by matching a **compatible selected SDK + selected Package implementation set** at BUILD, not by forcing every current internal component to be engine-neutral.
- **Interface vs implementation:** portable declarations, capabilities, Workflow/Operation semantics, selected profile compatibility and closed-world binding are the inter-component contracts. Third-party parsers, validators, storage engines, ESM/Node loading mechanics and local utility functions are implementation details unless they cross a real Package/SDK/Host boundary. Avoid speculative `*Port` proliferation.

## 2. Distinguish internal code from a Tool contract

A Package may use ordinary functions, helpers, libraries and internal module organization without turning *every* function into a Tool. An independently addressed ability offered to another Package, Workflow or consumer uses the existing selected `Capability → Tool/Operation → Handler` interface. Standard Rule/Guard/Decision/Workflow/Context semantics continue as **semantic dispatch**, not a general Tool simply because implemented in code.

The already existing reuse points are:
- `src/contracts/tool-component.ts`: portable `operationId`, input/output Schema, declared errors/exposure and effect class (`none | idempotent | non-idempotent`).
- `src/contracts/tool-implementation-binding.ts`: separate Tool definition identity from an exact implementation ID/version/digest and selected binding.
- `src/tool/host-local-contract/index.ts`: host-local `ToolExecutorPort` / `HostLocalDomainToolBinding.execute` with implementation-held native/project resources, input/output validation and no raw Runtime internals.
- `src/tool/remote-contract/index.ts` and v0.9 selected C operation binding: existing remote/selected dispatch reference; do not create a new general Tool runtime.

**Effectful Operations** still go through selected K admission, protected authorization, durable effect identity/Journal and UNKNOWN/reconciliation. An ordinary Tool declaration or Business implementation does not grant raw K store writes, approval/promotion authority or direct Agent mutation access. Read-only Tools must also respect caller scope and currentness.

## 3. How a Package provides a Node-native Tool in v0.10

**Prefer reuse of the already-defined Host-local Tool binding**, not a second script interpreter or generic VM. Two separate implementation locations are allowed conceptually, with L2 required to pin their precise activation/integrity seam:

1. **Selected self-contained Package ESM**: a BUILD-selected Kernel/Standard/Business/Capability *Package entry module* remains subject to frozen **PC-05** (self-contained, zero import, exact bytes checked before evaluation). Pure JS helpers may be bundled into it. It exposes only the selected semantic/operation entrypoints and declared metadata.
2. **Package-owned target-specific Tool implementation**: the same logical Package can deliver private Node-targeted implementation assets for a **selected Host-local Tool binding**. Its implementation may use `import 'node:fs'`, npm libraries or a native driver **inside the private Node Host-side implementation**, with its own package-managed configuration/resources/init/dispose. It is **not** imported by the PC-05-selected zero-import ESM. The selected Node Host installs and binds this implementation **at Domain App BUILD/deployment**, as a named, approved/pinned binding in the **same App runtime**, validates target compatibility and provides only required scoped resources. It invokes the Handler through the existing Tool/Operation contract. An unsupported target refuses rather than silently falling back.

Illustrative distribution (not a new mandatory format):

```text
my-domain-package/
  manifest.json               # public capability/operation contract + target requirements
  domain-entry.mjs            # PC-05 selected, self-contained, zero-import module
  implementations/node/      # private Node-targeted Host-local Tool implementation
    handler.mjs               # may import node:fs and package-owned npm dependencies
    package.json
    package-lock.json
```

**Integrity caveat / PC-05 decision boundary:** The original PC-05 rule is **not relaxed here**. The private Node Tool implementation is a selected **Host-side implementation binding**, not a dynamically imported ESM child of the zero-import Package entry. L2 must concretely specify how exact implementation/dependency assets are included in the approved installed subject, checked for currentness/integrity **before their evaluation**, and disposed; no unapproved transitive dependency or arbitrary path/module resolution is permitted. If a proposed implementation instead requires **direct `node:*`/npm imports from the selected Package entry module itself**, that is a **material PC-05 Product change** and needs a targeted Product amendment/review **before** L2 can permit it. Do not claim that host-side native code is sandboxed merely because the public Tool Call interface is narrow; it is trusted deployed code.

## 4. Execution environment selection

- **v0.10 sole implemented runtime cohort:** TypeScript source, compiled JavaScript and Node.js 24 (plus the selected SQLite true-CAS State Store and private Node Tool implementations). This is an actual supported implementation, not merely one proven member of an already implemented multi-runtime product. A future runtime will require its own compatible SDK and Package implementation variants and separate qualification; SQLite/Node do not become logical public contract requirements.
- **Do not add QuickJS to v0.10**: no second embedded JS engine, no mandatory QuickJS installation, no QuickJS-based cross-language promise. QuickJS is another JavaScript engine, not a general multilingual executor.
- Other languages can later be supplied **by the capability owner** through an externally selected operation adapter (e.g. HTTP/JSON, process service or MCP when separately admitted). No new generic subprocess/MCP/FFI implementation is authorized by this clarification.

## 5. L2 acceptance and scope

In the existing #1148 L2 and formal DAG, **reuse existing Tasks** to make the selected Host-local binding executable and qualify it:

- Basic clean-packed consumer loads/runs without importing Node-only optional implementation dependencies; the sealed assembly records the single App runtime/Host profile and matching SDK/Basic variant.
- The BUILD/manifest selection rules can be checked using declared runtime-tag/compatibility fixtures (including a deliberately incompatible candidate), without implementing a second SDK/runtime or executable non-Node Package; missing, ambiguous or incompatible targets refuse before evaluation, with no runtime fallback.
- A Node-selected Capability implementation uses a real private `node:fs` or installed dependency **in the same selected Node runtime**, exports **only** typed Tool Operation results, and successfully completes required init/dispose. No per-Package Node/QuickJS runtime or runtime-time npm installation.
- BUILD/install refuses missing, mismatched, unapproved or incompatible implementation/dependency/Host profile **before unauthorized code evaluation**; do not convert an unpinned native import into accepted `data:`-ESM package source.
- Same selected caller, scope and K Effect/UNKNOWN/replay rules apply to native and JS-only Tool handlers; negative direct Handler access, cross-B/resource leakage and absent capability have zero unauthorized effects.
- Do not introduce `SQLCasDocumentStore`, `ModuleLoaderPort`, `QuickJSAdapter`, `ParserPort` or new general Tool/Agent runtime only to satisfy this clarification. No OS/engine compatibility matrix beyond the selected Host.

**Stage**: this is a bounded clarification proposal referencing frozen Product. Its physical Tool-implementation packaging/approval seam must be resolved and reviewed with L2; if the needed design contradicts PC-05's exact frozen wording, surface an explicit Product amendment rather than silently editing the frozen artifacts.
