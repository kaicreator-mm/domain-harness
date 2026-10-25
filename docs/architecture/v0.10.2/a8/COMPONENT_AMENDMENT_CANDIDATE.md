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
