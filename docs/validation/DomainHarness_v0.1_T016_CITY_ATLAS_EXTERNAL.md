# T-016 — City Atlas External Domain Validation

**Implementation status:** COMPLETE  
**Required exact-SHA execution:** NOT_RUN (environment)  
**External repository:** `kaicreator-mm/city-atlas`  
**External branch:** `domain-harness-v0.1-t16`  
**External candidate SHA:** `c58be0945acff58b02bee07c269cc28c8af61f76`  
**Build Host validation issue:** `kaicreator-mm/city-atlas#23`

## External assets

The City Atlas repository contains a validation-only Harness plus executable `validate.mjs` runner under `docs/validation/domain-harness-v0.1/`.

Primitive coverage:

- Skill: POI/candidate triage proposal
- Tool: host-owned `atlas_check_candidate_policy`
- Expr: deterministic candidate/policy projection
- Child Workflow: privacy-review frame
- Waiting event: explicit accept/reject event with JSON Schema

## Authority boundary

City Atlas remains authoritative for canonical entity state, provenance, privacy rules and Task/API semantics. DomainHarness does not promote candidates, own provider behavior or weaken Atlas privacy boundaries; it only sequences portable execution primitives and waits for an external review event.

## Contract-change check

No DomainHarness public contract change was required to express the City Atlas domain flow. The external runner consumes `createDomainHarness`, injects an `AIOperationPort` and Host Tool, then executes the frozen lifecycle.

## Remaining gate

Build Host must execute City Atlas issue #23 against the same exact DomainHarness candidate used for T-015 and record both repository SHAs, build/test commands and lifecycle output. Until that evidence exists, T-016 MUST NOT be marked validation PASS or release-qualified.
