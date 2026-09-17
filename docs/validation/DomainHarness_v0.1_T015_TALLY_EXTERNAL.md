# T-015 — Tally-like External Domain Validation

**Implementation status:** COMPLETE  
**Required exact-SHA execution:** PASS  
**External repository:** `kaicreator-mm/tally`  
**External branch:** `domain-harness-v0.1-t15`  
**External candidate SHA:** `256e3daba951fa6e400c1c73de02221571aafc59`  
**Validation evidence:** `kaicreator-mm/tally#54`

## External assets

The Tally repository contains a validation-only Harness plus executable `validate.mjs` runner under `docs/validation/domain-harness-v0.1/`.

Primitive coverage:

- Skill: task-evidence assessment
- Tool: host-owned `tally_verify_completion_contract`
- Expr: deterministic projection
- Child Workflow: authority-check frame
- Waiting event: explicit approve/reject event with JSON Schema

## Validation result

On DomainHarness candidate `edbe2b53c936107ba4dfbb4eef7aef5408c26b39`, the external runner exited 0 and proved `start → waiting → approve → completed`; fake AI and Tool were each invoked exactly once for the validation run.

## Authority boundary

Tally remains authoritative for Active TaskDAG state, CompletionContract, verification evidence and human authority. DomainHarness only sequences portable execution primitives and waits for an external authority event.

## Contract-change check

No DomainHarness public contract change was required to express the Tally-like flow.

This PASS is candidate-specific historical evidence. Any successor candidate that materially changes Runtime behavior must rerun the affected cross-domain gate before release qualification.
