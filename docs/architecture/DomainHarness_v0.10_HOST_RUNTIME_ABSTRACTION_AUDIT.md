# DomainHarness v0.10 — Host Abstraction & Runtime Independence Focused Audit

> **Disposition:** DESIGN_BOUNDARY_CLARIFIED / NO_GENERAL_HOST_REFACTOR / TWO_TARGETED_L2_SEAMS / IMPLEMENTATION_NOT_QUALIFIED.
>
> Source baseline: `main@24718e4660b7bdb15b6b39703aa438a40af5e27e` (2026-10-18). L2 owner [#1148](https://github.com/kaicreator-mm/domain-harness/issues/1148), L2 R0 PR [#1149](https://github.com/kaicreator-mm/domain-harness/pull/1149) still a review candidate. Product PRD blob `673da42ad90acde5ef942beb8ac63b58836a649f`, frozen Product checkpoint unchanged. Latest additive [Product Clarification](../product/DomainHarness_v0.10_PORTABILITY_PACKAGE_TOOL_CLARIFICATION.md) blob `2a4d82ccec4f59ae9c1863d30d44c690398b3cc3`. This is a source/architecture audit, **not** executable v0.10 acceptance, L2 Freeze, Product amendment or release PASS.

## 1. Controlling interpretation

> **SDK and Domain Packages implement a target Runtime; BUILD selects, assembles and seals a mutually compatible set; execution is one determined closed-world Domain App. Internal abstractions are ordinary software design choices.**

- **SDK AND each Domain Package** may in future offer separate target-specific implementations. Today only TypeScript → JavaScript → **Node.js** is actually implemented. No v0.10 QuickJS, Browser, alternative language engine or OS support matrix is demanded.
- **A deployed Domain App picks ONE local execution runtime/Host profile at BUILD.** Its selected SDK, Basic K/S, optional K/S, B and C implementations are compatible with that profile. Version/tag helps select at BUILD, but an immutable exact code/dependency digest and runtime/Host ABI identify what executes. After seal: no floating implementation selection, npm installs, Package discovery, ad hoc import substitution or second private JS engine.
- **Package producer owns implementation and dependencies**, resolves them during Package generation and App BUILD/installation, and uses `init/dispose` for scoped live resources only. Package external-facing contract exposes selected semantic/Operation/Tool interfaces, not implementation resources/classes/libraries. Trusted installed Package does not need an OS sandbox merely to satisfy this rule.
- **Host is the concrete selected execution/integration environment**, not a generic framework for every JS primitive. Build/installation/currentness, authenticated caller facts and protected Effect permission must remain non-forgeable through B/C/LLM inputs. One Kernel Primary remains authoritative for Admission/State/Journal/Effect/UNKNOWN.
- A language-neutral/public data or capability **contract** does not require identical executable SDK sources on all runtimes. No speculative `NodePort`, `CryptoPort`, `ModuleLoaderPort`, `ParserPort`, `ValidatorPort`, `ExpressionEnginePort`, `QuickJSAdapter` or SQL ORM is required merely to satisfy multi-runtime extensibility.

## 2. Source-based dependency and abstraction findings

| Seam | Actual source evidence at baseline | Audit verdict / v0.10 action |
| --- | --- | --- |
| SDK public API / Node context | `packages/domain-harness/src/public-v9/index.ts` publishes only facade; `public-v9/runtime-channel.ts` imports `node:async_hooks`; `public-v9/operation-bridge.ts` imports `node:crypto` | **ACCEPT current Node implementation**. Prior proposed mandatory relocation of *all* Node APIs from SDK is **withdrawn**. Do not export Host/verifier/store/raw principal through public Package/Domain facade; Node internals may remain. |
| Selected Host governance | `host-v9/registry.ts`, `approval.ts`, `effect-permit.ts` bind actual installed bytes, approval/currentness, caller scope and effect permits; `public-v9/contracts.ts` is contract-only | **KEEP REAL AUTHORITY BOUNDARY**. Not an optional generic Host plugin; preserve pre-evaluation install/currentness and K protected channel. |
| BUILD / runtime identity | `packages/domain-harness-compiler/src/qualified-package/v09build/build.ts` seals `runtimeAbi`, `hostAbi`, Package SHA and route/handler records; `v09/selected-abi.mjs` consumes selected physical K/S/B/C | **REUSE** for one concrete Node target. v0.10 L2 supplies selected profile/ABI binding for target variants, compatibility checks and exact dependency closure. **No** multi-engine resolver is required in v0.10. |
| ESM and code dependencies | `v09build/import-closure.ts` and `host-v9/ast-gate.ts` reject all selected Package imports (`imports: []`), `import()`, `require`; Node implementation uses `data:` ESM import | **This is a packaging/integrity policy, NOT multi-runtime abstraction.** Keep unless a scoped PC-05 Product amendment authorizes a verified static import graph; do not classify `node:fs` in an internal implementation as platform-abstraction P1. |
| State Storage / SQLite | `host-v9/store-port.ts` defines `get/put(create|cas)/close`; `domain-harness-node/src/v09/physical-cas.ts` also exposes `remove/transact/list`; `sqlite-physical-cas.ts` implements physical true CAS via `better-sqlite3` | **KEEP one necessary CAS seam**, not `SQLCasDocumentStore`. Some adjacent contract duplication exists; consolidate only when v0.10 actual K/H transaction needs are known. Do not delete multi-record atomicity if correctness uses it. SQLite is selected Node implementation, not a forbidden SDK dependency. |
| Tool implementation | `contracts/tool-component.ts` declares portable Operation I/O, effect class; `contracts/tool-implementation-binding.ts` separates exact implementation; `tool/host-local-contract/index.ts` supports host-local native/resource-owning handler; selected-v9 `selected-abi.mjs` binds C operation→handler | **REUSE existing contract**, no new Tool runtime. But full **v0.10 selected-package-to-native-Node-Handler integrity/activation seam remains UNPROVEN**; existence of older Host-local code does not establish a selected v10 packed consumer. |
| Workflow/XState | `workflow/contract.ts` exposes domain-specific workflow definition; `workflow/internal/xstate-adapter.ts` contains XState mapping. v0.9 selected K/S physical modules are independent of this historical adapter | **KEEP existing semantic boundary**; no new StateMachine Port, no forced rewrite. Prune obsolete dependency only if actual selected v0.10 import graph makes removal safe. |
| Acorn, Ajv, JSON Schema, JSONata, YAML | `host-v9/ast-gate.ts` uses internal Acorn AST guard; schema validation / legacy loader and compiler use corresponding libraries | **INTERNAL implementation**. Public JSON Schema/expression dialect remains a declarative semantic contract where exposed; validators/parsers need no additional replacement interface. |
| Historical Node/SQLite implementations inside SDK repo | `src/loader/load-harness.ts` imports Node fs/path + Ajv/JSONata/YAML; `src/script/script-executor.ts` uses Node workers; `src/persistence/sqlite-store.ts` uses `better-sqlite3` | **Not a portability violation per se**. Distinguish historical source and public selected v0.10 import reachability. Remove/reshape only for actual selected ABI, dead-code maintenance or real module boundary leakage, not to eliminate Node syntax. |

### Hard abstraction vs optional implementation organization

**Required semantic/system contracts**: selected Package/Capability/Operation identity + input/output/error/effect class; one App runtime profile + sealed dependency closure; Kernel authoritative storage CAS where physical persistence crosses components; authenticated/current Host binding; lifecycle/typed failure; public facade.

**Not automatically contracts**: Node async context/crypto/fs, actual SQLite driver, Acorn, Ajv, JSONata, YAML, XState, ESM byte-loader, compiler internals. Abstract these only if a *real* independent collaborator, test seam or code-quality need justifies it.

## 3. Only two v0.10 Host/runtime items require targeted L2 closure

### R1 — Single-runtime BUILD binding and complete target dependency closure

- Use the existing selected `runtimeAbi/hostAbi` and BUILD binding as a basis. **One pinned target runtime** for one generated Domain App: Node.js 24 cohort with the actual required ABI/capabilities and native addon compatibility where used.
- Select matching SDK + K/S/B/C implementation artifacts, pin exact implementation and *transitive dependency bytes / installed assets* (not a floating version/tag), plus expected Host capabilities. Do it **before any selected code import/evaluation** and before protected Host recovery. Missing, wrong ABI, duplicate/ambiguous provider, tamper or missing byte must fail typed with no unintended code execution.
- Package generation/build prepares and bundles dependencies; `init/dispose` handles runtime resources without installing code or creating another local JS runtime.
- Do **not** implement a second executable SDK/runtime just to test runtime tags: a declared incompatible candidate fixture proves rejection; an actual Node packed consumer proves the selected path.

### R2 — Package-owned native Tool implementation vs frozen PC-05

- v0.9 first-cohort **PC-05 zero-import Package-entry ESM** is normative for v0.10 while Product unchanged. A direct `import 'node:fs'` or npm import in that selected ESM entry is **currently prohibited**, even when the whole App runs on Node. This is **not** evidence of a mandatory `ModuleLoaderPort` nor an intrinsic requirement of closed-world execution.
- **Minimal non-amendment option (preferred for lowest near-term code churn):** keep entry ESM zero-import (bundle normal JS internals at generation); implement native file/driver use inside a **separately selected, pre-pinned Host-local Tool implementation** owned by the Package and executed in the **same Node runtime**. The complete implementation and npm/native dependency closure still must be admitted/checked before code evaluation, without arbitrary dynamic resolver fallback. Not every helper is a Tool: only externally addressable capabilities cross the Operation boundary.
- **Alternative, only if an actual selected consumer proves necessary/simpler:** change PC-05 through a narrowly reviewed Product amendment from `zero import` to **BUILD-fixed, preverified static import graph** including allowed `node:` built-ins bound by the exact Node target and sealed npm/native dependency assets. This may reduce split binding overhead but is a **material loader/integrity design change**, requiring full-graph pre-evaluation verification and tests; never silently waive PC-05 in L2.
- Do not add a universal Host plugin framework, separate Node VM per Package, QuickJS engine or new programming-language support to solve Tool implementation.

## 4. Work classification for L2 / Task DAG

| Previously proposed action | Disposition | Reason |
| --- | --- | --- |
| Move every `node:*` / `Buffer` out of SDK/Core | **REMOVE as mandatory task** | Node is the currently selected SDK implementation runtime. Keep public contract boundaries; refactor only actual leakage/quality defects. |
| Extract `SQLCasDocumentStore` / generic SQL storage framework | **REJECT** | Existing CAS contract fits K truth; SQLite is a valid Node physical implementation. |
| Add `ModuleLoaderPort`, `ParserPort`, `ValidatorPort`, `XStatePort`, QuickJS | **REJECT** | Internal code or hypothetical runtime variability is not a cross-component dependency. |
| Enforce single selected Runtime Profile and SDK/Package compatibility | **REUSE/SMALL L2 ADDITION** | Current `runtimeAbi/hostAbi` already exists; v0.10 selected composition needs exact target & closure requirements. |
| Native Node Package Tool + dependency pin + K Effect admission | **TARGETED L2 GAP, REAL SELECTED PROOF NEEDED** | Older local-binding code exists but selected-v0.10 adapter and provenance/integrity aren't qualified. |
| Resolve PC-05 zero-import vs sealed static dependency graph | **L2 DESIGN DECISION; Product amendment ONLY IF CHANGING PC-05** | Avoid confusing package integrity with platform neutrality. |
| Unify duplicate state CAS faces, remove truly dead code | **OPPORTUNISTIC ENGINEERING CLEANUP** | No universal storage abstraction project or v0.9 compatibility requirement. |

**DAG placement:** R1 lives with v0.10 T00 selected composition/BUILD, R2 with existing T00/C01 Tool integration, and qualification with T11 two packed consumers. No new independent general Host abstraction Issue; K01/K02/C01 correctness/effect constraints remain unchanged.

## 5. Bounded proof requirements (not yet executed)

1. **Node24 Basic packed App:** selected SDK+K/S+B+required C only, one runtime, no Advanced imports, public send/query/stop. Node API inside implementation is *allowed*. Wrong declared runtime/ABI profile must refuse before ESM evaluation (side-effect sentinel remains zero).
2. **Node Tool packed App:** selected Package-owned target-specific implementation calls a real `node:fs` API or installed native dependency **within the same App Node runtime**, via named C/Tool handler. Check input/output contracts, scoped resources, init/dispose, no raw private implementation leaked. Missing/changed/unpinned implementation or transitive dependency refuses before evaluation.
3. **Effect and State correctness unchanged:** effectful Tool requires K admission/permit/journal/UNKNOWN reconciliation; wrong caller, revoked selection, duplicate/unsafe dispatch fail closed. SQLite true-CAS two-writer fence and revision conflict still qualify separately under K01/K02; do not substitute mocks for the physical cross-process case.
4. **No unnecessary cross-runtime qualification:** only one real execution target (Node24), plus metadata-only incompatible-tag fixture if helpful. No Browser/QuickJS actual build, universal OS matrix, or migration of v0.9 persisted assets.

## 6. Decision summary

`HOST_ABSTRACTION_MISSING=NO` (no general Host framework is needed).

`MANDATORY_CORE_NODE_REMOVAL=NO` (rescinded; not a defect on this Node-targeted SDK).

`REAL_SHARED_CONTRACTS=PACKAGE_OPERATION + BUILD_RUNTIME_PROFILE + KERNEL_CAS + PROTECTED_HOST_AUTHORITY`.

`V010_TARGETED_L2_ITEMS=R1_RUNTIME_BUILD_CLOSURE,R2_NATIVE_TOOL_PC05_SEAM`.

`V010_ADDITIONAL_RUNTIME_IMPLEMENTATION=NO`, `L2_FREEZE=NOT_PROVEN`, `IMPLEMENTATION_PASS=NOT_CLAIMED`.
