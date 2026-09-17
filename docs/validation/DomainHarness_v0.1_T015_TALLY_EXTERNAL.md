# T-015 — Tally-like External Domain Validation

**Implementation status:** COMPLETE  
**Required exact-SHA execution:** NOT_RUN (environment)  
**External repository:** `kaicreator-mm/tally`  
**External branch:** `domain-harness-v0.1-t15`  
**External candidate SHA:** `256e3daba951fa6e400c1c73de02221571aafc59`  
**Build Host validation issue:** `kaicreator-mm/tally#54`

## External assets

The Tally repository contains a validation-only Harness plus executable `validate.mjs` runner under `docs/validation/domain-harness-v0.1/`.

Primitive coverage:

- Skill: task-evidence assessment
- Tool: host-owned `tally_verify_completion_contract`
- Expr: deterministic projection
- Child Workflow: authority-check frame
- Waiting event: explicit approve/reject event with JSON Schema

## Authority boundary

This validation does not create a second Tally project-flow authority. Tally remains authoritative for Active TaskDAG state, CompletionContract, verification evidence and human authority. DomainHarness only sequences portable execution primitives and waits for an external authority event.

## Contract-change check

No DomainHarness public contract change was required to express the Tally-like flow. The external runner consumes `createDomainHarness`, injects an `AIOperationPort` and a Host Tool, then executes the frozen lifecycle.

## Remaining gate

Build Host must execute Tally issue #54 against an exact DomainHarness candidate SHA and record both repository SHAs, build/test commands and lifecycle output. Until that evidence exists, T-015 MUST NOT be marked validation PASS or release-qualified.
