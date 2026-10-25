# v0.10.2 A8 — Component 模型前瞻性修订候选

STATUS: PRODUCT_L2_REVIEW_CANDIDATE / NOT_FROZEN / IMPLEMENTATION_NOT_AUTHORIZED.
Parent: #1361. The existing frozen v0.10.2 Product, L2 and completed Task results remain unchanged.

## Product model

Component public classes: **semantic**, **hook**, **tool**. Keep K/S/B/C as separate Package roles and keep one authoritative K Primary. A Package contains private code/resources and optional public Components. Skill is a semantic Kind, not the top-level class.

- Semantic kinds: skill, rule, workflow, decision, context, validator, schema. A private rule/workflow does not need a public Component. Deterministic rules remain deterministic; durable workflow execution remains in selected S/K/Host; not a single LLM invocation.
- Hook kinds: event, lifecycle, observer and narrowly allowed Kernel advisory hook. Existing kernel-extension hookExport is NOT proof of generic business event support. Every trigger/binding requires authorization. A Hook cannot independently grant a K Effect permit.
- Tool kinds describe **provider placement**: package-operation, system-operation, remote-operation. Each is a named selected Operation, not a private helper or arbitrary npm import. Tool placement is independent of effect classification and caller scope: a remote read may be non-effectful, a local write may be effectful. Current C externalEffect is per selected module, not per handler. Mixed read/effectful operations use two sealed C modules unless separately approved ABI changes.

Private knowledge, prompt, schemas, rules and helper functions remain Package assets where not independently exposed. No new runtime, scheduler or general remote transport is implied.

## Prospective Task DAG: two staged tasks

A8a: early independent additive Component-to-existing-ABI mapping, producer examples and tests. Depends on approved A8 Product/L2 amendment only. Write set: new docs and new isolated producer adapter/test files only; never overlap T04/T03b/T06a/T11/T07b. Mapping only where existing V10ModuleInput supports semantics. Unsupported generic business Hook, per-handler effect differentiation and within-one-ESM arbitrary independent selection must reject rather than pretend support. Node24 scoped tests and independent reviewer.

A8b: bounded integration/refactor after T11 #1327 and A8a, **before T07b #1328** (which owns final manifests, CI and tarball). Own any reviewed prospective Contracts/BUILD/S/Host/Package edits in one serial task; review exact file write set first. No change to K authoritative behavior or existing committed v0.10.2 release evidence. One logical Package should expose mixed kinds using truly selectable sealed module boundaries. Tiny/Rich clean Node24 cases test missing/duplicate component, SHA/ABI closure, no unselected import/init, unauthorized effect, K receipts/UNKNOWN and Tool placement versus effect.

Adopted DAG ONLY AFTER independent A8 freeze: `A8a` runs in parallel with existing T04→T03b/T06a→T06b→T11; then `T11 + A8a → A8b → T07b → T08b → T09 → R01`. Original dependency paths remain; no post-R01 change. Existing 18 closed/open count remains 9/18 until adoption; 2 admitted nodes then make 9/20.

## Admission

Independent Product/L2 exact SHA review must return P0/P1/P2, A8_FREEZE_READY, no overlapping write sets, acyclic DAG, scoped test plan, ABI compatibility. Do not merge candidate document into version branch or begin A8 implementation until gate PASS. No separate v0.10.3 is planned.


## Proposed Package function visibility and ownership (2026-10-25)

**Scope decision:** A Package owns executable functions in two broad sets: (1) **declared, bindable Component entry points** and (2) **ordinary private implementation functions**. Within (2), distinguish **package-shared** and **owner-private**. This is a *visibility/ownership* axis, independent of Semantic/Hook/Tool Component class or the selected K/S/B/C role.

| Scope | Access semantics | BUILD/ABI/manifest |
| --- | --- | --- |
| Declared entry | Selected Component interface, bound by explicit identity: Semantic has semantic/Kind entry, Hook has trigger/handler entry, Tool has Operation ID/handler entry. A Tool Operation's visibility may be package-only vs selected Domain App vs externally exposed if a future selected ABI truly supports this. | Only declared entries participate in provides/requires, exported binding, identity and selected module hash. **Do not turn all Semantic/Hook entries into Tools simply because they are callable.** |
| Package-shared helper | Ordinary function reused by multiple Components/Operations of **the same Package**, not directly exposed to other Packages, Agent or Domain App Tool registry. | Private source/import, no additional Tool/Operation manifest registration; internal dependency can be in BUILD-sealed module bytes or allowed trusted imports. |
| Component-private helper | Ordinary implementation owned by one specific Component or Tool Operation; no sibling Component/Operation import. Within Tool, the owner is the explicit Operation ID. | Prefer lexical closure/unexported binding or owner-local module. If separate files are needed, use structure and scoped compile/lint/static import restrictions; do not invent per-function runtime authorization gates. |

**Names matter:** Package-shared is **internal shared**, *not* external public API. An Operation-private helper is an implementation restriction, not a new Component kind. K/Host still govern real effects; it is not safe to equate JS module visibility with a security sandbox.

**Simple suggested authoring layout** (not a mandated directory hierarchy or new runtime): \`src/shared/*\`, \`src/operations/<operationId>/entry.ts\`, \`src/operations/<operationId>/internal/*\`, \`src/semantics/*\`, \`src/hooks/*\`. Package export/import maps expose only selected declared entries, never \`shared/*\` or \`internal/*\`. For a trusted closed-world Package this prevents accidental API coupling, not hostile source access through absolute paths, reflection or Node capabilities. BUILD/static lint can enforce own source-import boundaries when valuable; it should not enumerate every private function in the manifest.

**Critical distinction:** Declared *Component entry* does not equal a Tool Operation:
- An exposed Semantic entry is selected by semantic/Kind contract; no automatic Tool registration.
- A Hook handler is bound to an event/lifecycle trigger; no automatic Tool registration.
- Only a Tool's explicitly declared Operation becomes a Tool Operation. Calling a private function from any of the above never creates a second Tool call.

### Hook vs Tool — separate contracts, shared ordinary implementation is allowed

Hook is an independently declared Component class because **event/lifecycle-triggered execution** differs from the **explicitly invoked Tool Operation** protocol: trigger, ordering, listener lifetime/unsubscribe, failure isolation and effect constraints have different semantics. A Hook's handler may internally call shared/private ordinary functions without a Tool wrapper. A Hook that needs a governed external/business effect must invoke an already declared, selected Tool Operation on the K-authorized path; the Hook itself must never mint a permit, bypass a K gate or silently claim original receipt completion. A Tool may optionally call the same shared functions; implementations can reuse a thin common dispatcher **without collapsing their contracts**. Current v0.10.2 selected K-extension \`hookExport\` is the only established Hook role and does not authorize arbitrary Business event bus behavior by renaming.

**Alternative rejected:** Reclassifying all Hooks as Tools makes every lifecycle callback a discoverable/invokable Operation, duplicates Tool privileges/binding and confuses listener cancellation/order with request/response success. A generic event handler can *delegate* to Tool but is not *itself* a Tool.

### A8 implementation bounded acceptance

A8a: a docs/producer mapping that recognizes three Component classes, declares entry/shared/owner-private distinction, and maps **only existing** S Feature, K advisory Hook and C Operation ABIs. Reject undeclared Tool, a sibling importing an owner-private helper (when static source files are in scope), and treating shared helpers as publicly selected operations. No new runtime check for private functions.

A8b: implement only the mapping/selection that can be independently tested within approved write sets. Check one Package with two Tool Operations sharing one internal helper, each with one operation-private helper; a Semantic and a supported Hook may reuse package-shared code but cannot import the other Operation's private code. Clean installed Node24 tarball prohibits undeclared exports. Do not claim native per-export component selection within one ESM module, generic Host lifecycle hook, or per-handler effect ABI unless independently frozen and implemented.


## A8 R2 P1 closeout candidate — exact late implementation scope

After the independent A8 R1 P1-01 finding on PR #1362 exact 06214a3a, A8b is **narrowed to a BUILD-only producer adapter**. The previously broad idea of changing Contracts, Standard, Business, Capability, Host, Kernel or Domain Package physical module layouts is **NOT approved within A8b**. Those implementation files are hard prohibited; generic Business lifecycle Hooks, per-handler effect ABI, actual remote transport and two independently selected exports from one ESM module remain typed UNSUPPORTED for v0.10.2.

**Concrete A8b source owner after T11 #1327, before T07b #1328; all paths exactly enumerated:**

| Path | Previous owner | A8b action | Generated counterpart / prohibition |
| --- | --- | --- | --- |
| `tooling/build/src/component-view.ts` | NEW | NEW bounded authoring-to-existing-V10ModuleInput adapter, provider location metadata with effect independent; no runtime authority | `tooling/build/dist/component-view.js` and `tooling/build/dist/component-view.d.ts` NEW, real Node24 tsc only |
| `tooling/build/src/index.ts` | T05 #1323 CLOSED | add one BUILD-only named adapter export; preserve `buildV10App` and existing export names | `tooling/build/dist/index.js` and `tooling/build/dist/index.d.ts`, generated, existing T05 outputs revised |
| `tooling/build/tests/component-view.test.ts` | NEW | NEW scope/refusal/identity and composition tests; one logical package, multi sealed modules | no emitted dist (tests outside src glob) |
| `tooling/build/README.md` | T05 #1323 CLOSED | strictly append public producer example mapping/unsupported matrix, no prior text deletion | docs-only |

**Total exact A8b write set = 8 files**: 3 source/test entries? (src/component-view.ts, src/index.ts, tests/component-view.test.ts), 4 emitted JS/d.ts, 1 README. There are NO globs and **no other files**. Existing T05 is already CLOSED; A8b post-T11 serial write on its previously owned `src/index.ts`, `dist/index.{js,d.ts}`, `README.md` requires independent prospective A8 L2 authorization. T11 owns old Compiler/test roots (not these paths), T07b owns package manifests/lock/.woodpecker/legacy dist deletion (not these BUILD exports), T09 owns `tests/integration/**` and external-producer fixtures (not A8b's tests). No prior approved task is authorized to write the listed eight paths concurrently. Any need to edit `packages/contracts/**`, K/S source bytes, Host, `tooling/build/package.json` or manifests would require an **additional reviewed explicit amendment**, not A8b's blanket authority.

**Conformance target:** a BUILD-only projection from a logical Package's chosen `semantic|hook|tool` declarations to a list of *already selected* sealed `V10ModuleInput`s, each retaining its own `packageId`, role, ABI, digest, dependency and provider identity. Then call existing `buildV10App` unchanged. `semantic` maps only to actual `standard-feature` binding; `hook` maps only to existing K advisory `kernel-extension` `hookExport`; `tool` maps only to selected C capability handler(s). `tool.kind` location labels (`package-operation|system-operation|remote-operation`) are metadata/adapter-provenance, not an assertion of generic remote infrastructure; effect remains module-level `externalEffect` and is never inferred from location. Unselected module never gets passed into BUILD. If a declaration cannot map without new ABI, reject with a stable existing typed BUILD refusal before evaluation. No second manifest authority, dynamic plugin loader, private-helper Tool registration, or runtime mutation. T09 downstream demonstrates real installed consumers; no A8b duplicate whole-app suite.

**A8a exact two NEW implementation files:** `tooling/component-bridge/src/component-view.ts`, `tooling/component-bridge/tests/component-view.test.ts`, plus its existing authorized new `docs/architecture/v0.10.2/a8/**` docs. `tooling/component-bridge/**` is **NOT an npm workspace**: explicitly NO `tooling/component-bridge/package.json`, NO `dist/**`, NO root/package-lock/tsconfig edits; root workspace glob `tooling/*` must not accidentally activate it. Run test using existing Node24 `node --import tsx --test tooling/component-bridge/tests/component-view.test.ts` and normal project typecheck as applicable. A8a independently documents/maps only already supported selected roles; A8b owns the actual published BUILD entry after T11, without moving or rewriting A8a's source as an early merged runtime export.

**Hard refusal boundary:** Private Package Shared or Component/Operation Private helpers are not entries in the selected module list; enforce source visibility via ordinary module/export fences and optional static tests, never runtime per-function permit checks. An asset-only Rule/Workflow is not required to become a callable Semantic Component; a model-facing Skill does not replace deterministic K admission or stateful workflow.

**Gate:** an independent R2 reviewer must check these eight exact A8b paths and the two exact A8a files against the actual frozen/adopted T05/T11/T07b/T09 write sets, CI/source generation and 20-node 24-edge DAG before `A8_FREEZE_READY=YES`. This R2 text is an amendment candidate, **not implementation admission by itself**.
