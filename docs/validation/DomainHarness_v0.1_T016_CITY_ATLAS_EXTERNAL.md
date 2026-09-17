# T-016 — City Atlas External Domain Validation

**Implementation status:** COMPLETE  
**Required exact-SHA execution:** PASS  
**External repository:** `kaicreator-mm/city-atlas`  
**External branch:** `domain-harness-v0.1-t16`  
**External candidate SHA:** `c58be0945acff58b02bee07c269cc28c8af61f76`  
**Validation evidence:** `kaicreator-mm/city-atlas#23`

## External assets

The City Atlas repository contains a validation-only Harness plus executable `validate.mjs` runner under `docs/validation/domain-harness-v0.1/`.

Primitive coverage:

- Skill: POI/candidate triage proposal
- Tool: host-owned `atlas_check_candidate_policy`
- Expr: deterministic candidate/policy projection
- Child Workflow: privacy-review frame
- Waiting event: explicit accept/reject event with JSON Schema

## Validation result

On DomainHarness candidate `edbe2b53c936107ba4dfbb4eef7aef5408c26b39`, the external runner exited 0 and proved `start → waiting → accept → completed`; fake AI and Tool were each invoked exactly once for the validation run.

## Authority boundary

City Atlas remains authoritative for canonical entity state, provenance, privacy rules and Task/API semantics. DomainHarness does not promote candidates, own provider behavior or weaken Atlas privacy boundaries.

## Contract-change check

No DomainHarness public contract change was required to express the City Atlas flow.

This PASS is candidate-specific historical evidence. Any successor candidate that materially changes Runtime behavior must rerun the affected cross-domain gate before release qualification.
