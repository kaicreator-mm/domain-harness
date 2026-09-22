# DomainHarness v0.3 Amendment A2 (DAC v0.0.2) — Adoption / Freeze Record

**Project:** DomainHarness
**Version:** v0.3
**Adoption date:** 2026-09-23
**Status:** **FROZEN — ADOPTED INTO v0.3 FROZEN AUTHORITY**
**Adoption issue:** [#304](https://github.com/kaicreator-mm/domain-harness/issues/304) (I-001 of the reviewed #300 A2 Task DAG)
**Adoption base:** `v0.3@9da0b0209058ff006f088ac761241ecd617abe7f` (tree `9b0b101bb4927ebf70ab44254989f28a8ead081f`)

This record adopts the independently reviewed and merged **Amendment A2 — DAC v0.0.2 Cross-Layer Reference Adoption** (one Product amendment + one L2 amendment, authored and reviewed as one candidate unit) into the authoritative `v0.3` implementation baseline. It follows the exact-body freeze pattern of PRD Amendment A1 and L2 Amendment A1: the reviewed bodies are transferred byte-identically, and this record establishes their frozen authority status on `v0.3`.

## Frozen amendment bodies

The authoritative Amendment A2 bodies are the exact reviewed candidates, preserved without editorial change. Their filenames retain the reviewed candidate names, exactly as Amendment A1 did.

Product amendment:

```text
docs/product/amendments/DomainHarness_v0.3_PRD_AMENDMENT_A2_DAC_V002_REVIEW_CANDIDATE.md
```

L2 amendment:

```text
docs/architecture/DomainHarness_v0.3_L2_ARCHITECTURE_AMENDMENT_A2_DAC_V002_REVIEW_CANDIDATE.md
```

Exact-content identity (verified at adoption; SHA-256 over the canonical committed LF bytes — a CRLF-normalizing checkout will hash differently while the git blob stays identical):

```text
PRD A2  git blob: fd9c530ba8c4277ab7c1653f11e5e4661cd76024
PRD A2  SHA-256:  dbe4eee9203effcbc0398977ae99a9970f4e1396aa89dd9a78a97f08c0f56eaa
L2 A2   git blob: 2d119b3440b37576847cdf91c2bdee3358b7784f
L2 A2   SHA-256:  a0c18fdf049bdcc9f41307e4ddef292d04a667c89f77664ffd0a141fa526ba54
```

Both blobs are byte-identical to the blobs at the reviewed candidate HEAD and at the PR #297 merge commit recorded below. Git blob equality is the no-semantic-drift proof for this adoption: no reformatting, no rewording, no content adjustment of any kind.

## Provenance

Candidate authoring commits (branch `issue-296-dac-v002-product-l2-amendment`, base `main@7fdcde2e853382b0ba0fd2baeb6f91af2fdbace6`):

```text
c99cbbe72004aef35609d63a859730c4ac6a5300  docs(product): add DAC v0.0.2 adoption amendment A2 candidate
677056c4978a6379daf28e502842b0b0bb9080c1  docs(architecture): add DAC v0.0.2 L2 amendment A2 candidate
```

Reviewed exact candidate HEAD:

```text
677056c4978a6379daf28e502842b0b0bb9080c1  (tree 9f784605ed2fd192e1734a3edfc630ad8a668c50)
```

Merge identity:

```text
PR #297  merge commit: 2fe688401bd89dbc8ba1a9bd2cd3bffaea8c84d4  (merged to main, 2026-09-22T19:49:17Z)
merge tree: 9f784605ed2fd192e1734a3edfc630ad8a668c50  (identical to the reviewed candidate tree)
```

The A2 files adopted onto `v0.3` by this record were taken from that merge identity with matching blob hashes as recorded above.

## Independent review evidence

Fresh Independent Architecture Review on the exact reviewed HEAD `677056c4978a6379daf28e502842b0b0bb9080c1`, posted on PR #297 ([review 5282944386](https://github.com/kaicreator-mm/domain-harness/pull/297#pullrequestreview-5282944386), 2026-09-22T19:48:59Z):

```text
P0: 0
P1: 0
P2: 2
P3: 0
authority_conflict: 0
verdict: PASS
```

The review confirmed, among other checks: G1–G5 scope bounded to DAC adoption pressure; complete #291 classification present with `AUTHORITY_CONFLICT = 0`; promotion → application selection → compatibility validation → runtime binding → runtime activation remain distinct; DomainHarness remains the authoritative production Runtime/state-machine/execution boundary while promotion/application-selection, Domain UX and external Business SoR authority remain outside it; Application Manifest remains composition metadata; DAC PROVISIONAL/open wire details are not independently frozen.

The two non-blocking P2 follow-ups of that review are resolved by the infrastructure this record belongs to:

1. implementation must bind to the current dependency-complete `v0.3` line and a dedicated baseline-sync concern must run if the amendment is absent — that concern is exactly I-001/#304, satisfied by this record and the accompanying manifest update;
2. packaging #299 is a prerequisite/parallel foundation for external-consumer validation — #299 is DONE, merged as `v0.3@9da0b020…` (PR #303), which is the adoption base of this record.

Supplemental downstream evidence: the `domain-simulator` v0.0.2 review (#68, repair #69) found no authority-transfer contradiction with the A2 direction and independently confirmed lifecycle-stage separation. It is not an approval of A2 and is archived on PR #297.

## External baselines pinned by A2

```text
DAC exact baseline:
kaicreator-mm/domain-application-contract@9c3ef91b8b40d893e4fe2b0370200e765816ec2b  (tree 44086afe53166c9f290d7d06dd757ebfc8c24eb8)

Pinned development standard:
kaicreator-mm/ai-development-standard@0446f04583f6cf464c835f26e2f657c8b703cb4e  (2.0.0)
```

The pinned development standard matches `.dev-standard/VERSION` at the adoption base and is unchanged by this adoption.

## Supersession scope — exact statement

Amendment A2 (Product + L2) **supersedes only its explicitly mapped clauses** in:

- `docs/product/DomainHarness_v0.3_PRD_FROZEN.md`;
- `docs/product/amendments/DomainHarness_v0.3_PRD_AMENDMENT_A1_ROUND2_REVIEW_CANDIDATE.md` (frozen PRD Amendment A1);
- `docs/architecture/DomainHarness_v0.3_L2_ARCHITECTURE_EVIDENCE_FROZEN.md`;
- `docs/architecture/DomainHarness_v0.3_L2_ARCHITECTURE_AMENDMENT_A1.md` (frozen L2 Amendment A1).

Every unaffected Frozen PRD / PRD A1 / L2 / L2 A1 clause remains authoritative. A2 does not redesign DomainHarness, does not reopen the v0.3 product architecture, does not freeze any DAC PROVISIONAL wire encoding, and does not by itself authorize implementation.

## Frozen authority composition after this record

```text
Frozen v0.3 PRD
+ Frozen PRD Amendment A1
+ Frozen v0.3 L2 Architecture Evidence
+ Frozen L2 Architecture Amendment A1
+ Frozen PRD Amendment A2 (DAC v0.0.2)
+ Frozen L2 Amendment A2 (DAC v0.0.2)
```

Specifically:

- `docs/product/DomainHarness_v0.3_PRD_FROZEN.md`
- `docs/product/amendments/DomainHarness_v0.3_PRD_AMENDMENT_A1_ROUND2_REVIEW_CANDIDATE.md` (frozen by `docs/product/amendments/DomainHarness_v0.3_PRD_AMENDMENT_A1_FREEZE_RECORD.md`)
- `docs/architecture/DomainHarness_v0.3_L2_ARCHITECTURE_EVIDENCE_FROZEN.md`
- `docs/architecture/DomainHarness_v0.3_L2_ARCHITECTURE_AMENDMENT_A1.md` (frozen by `docs/architecture/DomainHarness_v0.3_L2_ARCHITECTURE_AMENDMENT_A1_FREEZE_RECORD.md`)
- `docs/product/amendments/DomainHarness_v0.3_PRD_AMENDMENT_A2_DAC_V002_REVIEW_CANDIDATE.md` (frozen by this record)
- `docs/architecture/DomainHarness_v0.3_L2_ARCHITECTURE_AMENDMENT_A2_DAC_V002_REVIEW_CANDIDATE.md` (frozen by this record)
- this Freeze Record

`.dev-standard/PROJECT_OVERRIDES.md` is updated in the same concern to enumerate this composition, so a clean dependency-complete `v0.3` checkout alone is sufficient for any downstream agent to discover A2 as current Product/L2 authority.

## Implementation authorization boundary

1. Implementation of A2 proceeds only through the reviewed #300 A2 Task DAG, materialized as GitHub Execution Issues #304–#311 (I-001…I-008), each branching JIT from a dependency-complete exact `v0.3` SHA.
2. This adoption (I-001) is an authority-adoption-only concern: zero product-source changes. `packages/`, `tests/`, `scripts/`, `examples/` and all runtime/compiler sources are untouched.
3. #301 (durable ordered public event/telemetry stream) and #302 (generic public runtime cancellation/interrupt control) remain separate Product/L2/API-gap concerns outside A2; nothing in this adoption implements or presupposes them.
4. PR/DAG PASS is not release qualification; v0.3 → `main` remains gated by the release boundary in `.dev-standard/PROJECT_OVERRIDES.md`.

## Adoption validation identity

Recorded on #304 at PR HEAD:

- exact-content/identity check: adopted blobs equal the reviewed HEAD / PR #297 merge blobs (values above);
- authority-manifest consistency: every path enumerated by `.dev-standard/PROJECT_OVERRIDES.md` `Frozen authority` resolves in the adopted tree;
- no product-source change: PR write set is limited to the two A2 bodies, this record, and `.dev-standard/PROJECT_OVERRIDES.md`;
- repository baseline gates (build/lint/typecheck/tests) and `git diff --check` / clean worktree at the exact PR HEAD;
- Fresh Independent Review of this adoption on the final exact HEAD — REQUIRED because canonical Product/L2 authority metadata changes; PASS requires P0=0/P1=0.
