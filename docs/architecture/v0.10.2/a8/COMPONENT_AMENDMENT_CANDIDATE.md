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
