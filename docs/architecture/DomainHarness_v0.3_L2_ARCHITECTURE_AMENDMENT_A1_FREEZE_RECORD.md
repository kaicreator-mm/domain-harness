# DomainHarness v0.3 L2 Architecture Amendment A1 — Freeze Record

**Project:** DomainHarness  
**Version:** v0.3  
**Freeze date:** 2026-09-20  
**Status:** **FROZEN**

## Frozen normative body

The authoritative Amendment body is preserved exactly as independently reviewed:

```text
docs/architecture/DomainHarness_v0.3_L2_ARCHITECTURE_AMENDMENT_A1.md
```

Reviewed exact candidate commit:

```text
94c87647e505f0a2ed16d9c68b59d4b2eff40945
```

Reviewed normative-body Git blob:

```text
db867fbc4dd64df47cae8cd8afa2d2545d07f045
```

Authority baseline used to create the candidate:

```text
main@466a5196a8b29194b50eb4641d6cf988d38b4da8
```

The normative Amendment body is **not editorially changed after review**. Its retained header may still say `REVIEW CANDIDATE`; this Freeze Record establishes frozen authority while preserving exact reviewed-body identity, following the same exact-body freeze pattern used by PRD Amendment A1.

## Primary external adversarial review evidence

Repository evidence:

```text
docs/architecture/reviews/DomainHarness_v0.3_L2_ARCHITECTURE_AMENDMENT_A1_ADVERSARIAL_REVIEW.md
```

External reviewer: Claude.

Exact review disposition supplied and archived:

```text
FREEZE_OK
P0 = 0
P1 = 0
```

The review also confirmed that the previously frozen PRD Amendment A1 identity remained consistent, including SHA-256 `1aaea27bed59515a10d54101c917ed1db6fadc33434f5fdfefad4a9e9fe1be01`, and that the authority references used by this Amendment matched the prior reviewed PRD/L2 baseline.

No review-provenance waiver is required: the external verdict and detailed blocker/P2/P3 disposition are now archived in the engineering Source of Truth.

A separate fresh exact-HEAD secondary verification is retained as supplemental evidence:

```text
docs/architecture/reviews/DomainHarness_v0.3_L2_ARCHITECTURE_AMENDMENT_A1_SECONDARY_VERIFICATION.md
```

It does not replace or impersonate the primary external review.

## Non-blocking findings carried into implementation

The external review's accepted P2/P3 observations are already absorbed by the Amendment and/or must remain explicit implementation acceptance criteria:

1. governance-critical classification defaults fail-safe: unknown classification is governance-critical unless explicit human/operator governance authority classifies it otherwise;
2. activation authority is tied to concrete target-package and Promoted Artifact Registry activation/selection mechanisms, not a generic automatic-activation exception;
3. Governance Baseline identity is exact and content-addressed, is bound to package/CDI authority, is retained, is execution-pinned, and is reused exactly across crash/recovery;
4. Frozen PRD Non-Goals and L2-deferred scope remain closed;
5. supersession is narrow: only explicitly mapped conflicts are replaced;
6. human/operator promotion remains at least as strict as Frozen L2 ADR-08;
7. Experimental/L4 obligations are conditional on representation, shadow/non-mutating by default, and any stable fallback identity is exact rather than floating;
8. implementation of `DomainActivationBinding` SHALL preserve the already-frozen one-exact-binding semantic as a non-torn immutable/atomic logical publication/read: concurrent package/governance activation must yield either the old complete tuple or the new complete tuple, never a mixed authority tuple.

Items 1–7 are reflected directly in the frozen Amendment body. Item 8 is an implementation atomicity acceptance condition derived from the Amendment's requirement to resolve one exact `DomainActivationBinding` for new-instance creation.

## Frozen authority composition

After this Freeze Record is merged, DomainHarness v0.3 architecture authority is:

```text
Frozen v0.3 PRD
+
Frozen PRD Amendment A1
+
Frozen v0.3 L2 Architecture Evidence
+
Frozen L2 Architecture Amendment A1
```

Specifically:

- `docs/product/DomainHarness_v0.3_PRD_FROZEN.md`
- `docs/product/amendments/DomainHarness_v0.3_PRD_AMENDMENT_A1_ROUND2_REVIEW_CANDIDATE.md`
- `docs/product/amendments/DomainHarness_v0.3_PRD_AMENDMENT_A1_FREEZE_RECORD.md`
- `docs/architecture/DomainHarness_v0.3_L2_ARCHITECTURE_EVIDENCE_FROZEN.md`
- `docs/architecture/DomainHarness_v0.3_L2_ARCHITECTURE_AMENDMENT_A1.md`
- this Freeze Record

Only clauses explicitly superseded by the Amendment are replaced. All unaffected Frozen L2 contracts remain authoritative.

## Preserved architecture contracts

Freeze preserves, without semantic weakening:

- one authoritative Domain Workflow / Domain Machine control flow;
- XState as selected v0.3 engine, not product identity;
- `DurableExecutionStore` ordering domain;
- Durable Control Turn semantics;
- `executionFactRevision` durability fence;
- recursive control snapshot persistence;
- exact package pinning;
- `DynamicChildExecutionPin`;
- AI/query/effect committed-work journals;
- durable effect authority;
- exact semantic cache separate from replay;
- `ObservedDependencySet` two-phase cache eligibility;
- `SemanticRevisionPort` boundary;
- promoted-artifact registry/retention;
- exact content digests;
- Node / Expo logical parity;
- fail-closed recovery;
- provider/model strategy outside DomainHarness.

A1 additionally freezes exact Governance Baseline identity/binding/pinning/recovery, unified executable-Candidate validation, Runtime Evidence provenance separation, pure Guard/Hard-Invariant predicates, human/operator promotion/activation, and shadow-only L4/exact fallback semantics.

## CI disposition

CI is unavailable under the existing operator-directed waiver for this documentation/authority transition.

```text
CI PASS is NOT claimed.
```

The waiver does not waive later implementation or version-closure runtime validation.

## Next authorized steps

This Freeze Record authorizes the planning transition:

1. merge the L2 Amendment freeze branch to `main`;
2. update `.dev-standard/PROJECT_OVERRIDES.md` to v0.3 frozen authority and v0.3 integration-branch protocol;
3. generate the formal DomainHarness v0.3 Task DAG from the complete frozen authority set;
4. maximize implementation parallelism while preserving dependencies and one-concern/one-PR discipline;
5. group Build Host / Node SQLite / process-kill / Expo-Hermes / force-stop validation into a small number of dedicated local-environment validation waves rather than duplicating expensive host validation in every feature task.

No implementation task may reopen frozen product/architecture scope unless a documented contradiction is found.
