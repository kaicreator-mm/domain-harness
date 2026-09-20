# DomainHarness v0.3 L2 Architecture Amendment A1 — Secondary Exact-HEAD Verification

**Project:** DomainHarness  
**Version:** v0.3  
**Artifact:** `docs/architecture/DomainHarness_v0.3_L2_ARCHITECTURE_AMENDMENT_A1.md`  
**Reviewed candidate commit:** `94c87647e505f0a2ed16d9c68b59d4b2eff40945`  
**Reviewed candidate blob:** `db867fbc4dd64df47cae8cd8afa2d2545d07f045`  
**Authority baseline:** `main@466a5196a8b29194b50eb4641d6cf988d38b4da8`  
**Date:** 2026-09-20  
**Verification role:** independent exact-HEAD secondary verifier

## External-review provenance note

The operator reported that the requested Claude targeted adversarial review had completed before this verification. The original Claude transcript/verdict was not retrievable from the current GitHub, Drive, Project-file, or conversation context, so this record does **not** quote, reconstruct, or impersonate that review.

Under the operator instruction to continue, this file records a fresh exact-HEAD secondary architecture verification. The missing external transcript is treated as an explicit process-provenance waiver for this freeze transition, not as a fabricated review artifact.

## Identity check

- branch: `v0.3_l2_amendment_a1`
- exact reviewed HEAD: `94c87647e505f0a2ed16d9c68b59d4b2eff40945`
- parent authority baseline: `466a5196a8b29194b50eb4641d6cf988d38b4da8`
- reviewed normative body blob: `db867fbc4dd64df47cae8cd8afa2d2545d07f045`
- candidate write set at reviewed HEAD: one architecture amendment file only
- no candidate-body edit is made by this review record

## Authority inputs checked

The verification checked the Amendment against:

- Frozen v0.3 PRD;
- Frozen PRD Amendment A1 and its Freeze Record;
- Frozen v0.3 L2 Architecture Evidence;
- the Amendment A1 clause-level preservation/supersession map;
- the existing v0.3 durability, cache, registry, package pin, dynamic-child pin, journal, effect, recovery, Node/Expo parity and fail-closed contracts.

## Verification result

```text
VERDICT: FREEZE_OK
P0: 0
P1: 0
P2: 2
P3: 0
```

No architecture contradiction requiring PRD/L2 reopening was found.

## P2 findings carried into implementation planning

### P2-1 — DomainActivationBinding implementation must be non-torn

The Amendment defines one exact `DomainActivationBinding` tuple and requires the runtime to resolve one exact binding for new-instance creation. Implementation must preserve that semantic by publishing/resolving the package + CDI digest + Governance Baseline identity as one immutable/atomic logical binding revision.

Forbidden implementation:

```text
read active package
→ governance activation changes
→ read active governance
→ synthesize mixed tuple
```

Required implementation acceptance:

- one exact binding read produces the entire tuple;
- a concurrent activation change yields either the old tuple or the new tuple, never a mixed tuple;
- the resulting `GovernanceExecutionPin.bindingDigest` content-addresses the exact tuple that was selected;
- new instance creation fails closed if the selected binding cannot be proven internally consistent.

This is an implementation-atomicity requirement implied by the already-frozen `resolve one exact activation binding` architecture rule. It does not require a normative Amendment-body edit.

### P2-2 — external Claude transcript archival gap

The operator reports completion of the requested Claude review, but the transcript is not present in the current engineering Source of Truth. This is a review-provenance gap only; it does not alter the reviewed architecture semantics. The operator instruction to continue is recorded as the explicit waiver for this archival gap.

Future independent reviews should be archived directly in-repository before the freeze transition when practical.

## Core architecture checks

PASS at architecture-contract level:

1. Domain Facts / Compiled Domain Intelligence / Governance Baseline / Runtime Evidence ownership remains separated.
2. Domain Workflow / Domain Machine remains the product business-control authority; XState remains the selected v0.3 implementation engine without a second runtime.
3. Guard / Hard Invariant predicates remain synchronous, deterministic, side-effect-free and free of LLM/Tool/external I/O.
4. Business Harness remains bounded proposal/reasoning authority and cannot own transition, mutation, promotion, activation or provider-routing authority.
5. Governance Baseline uses immutable content identity and pre-change authority for governance changes.
6. Candidate validation is deterministic, baseline-bound and separate from promotion/activation.
7. Human/operator promotion and activation authority is not weakened relative to Frozen L2 ADR-08.
8. Runtime Evidence remains provenance/evaluation material and never becomes replay or committed-work truth.
9. `GovernanceExecutionPin` is an exact per-instance durable execution-definition fact and recovery never substitutes `current/latest/active` governance.
10. L4 remains shadow/non-mutating by default; Experimental fallback identity is exact.
11. Existing `DurableExecutionStore`, `executionFactRevision`, recursive snapshot, `DynamicChildExecutionPin`, AI/query/effect journals, exact semantic cache, `ObservedDependencySet`, `SemanticRevisionPort`, effect authority, package pin and Node/Expo parity contracts remain preserved.
12. Amendment scope remains narrow; no autonomous Meta Harness, experiment platform, provider routing, generic RAG/memory system or peer workflow runtime is introduced.

## Freeze eligibility

The exact candidate body at blob `db867fbc4dd64df47cae8cd8afa2d2545d07f045` is eligible to be frozen without editorial modification.

The P2 findings above SHALL be carried into the v0.3 Task DAG / task acceptance criteria and do not block freeze.

CI remains unavailable under the existing operator-directed waiver. This verification does not claim CI PASS or executable implementation PASS.
