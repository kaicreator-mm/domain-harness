# DomainHarness Documentation

This directory contains the formal product, architecture, implementation, validation, operations and release evidence for DomainHarness v0.1.

## Authority order

1. `product/DomainHarness_v0.1_PRD_FROZEN.md`, SHA-256 `4f19317dc46ae1eb888ff99bd4f50a21246483895fab16086341d0222a60e440`.
2. `architecture/DomainHarness_v0.1_L2_ARCHITECTURE_EVIDENCE.md`.
3. `implementation/DomainHarness_v0.1_TASK_DAG.md` plus task-specific L3 evidence.
4. Public contracts/tests under `packages/domain-harness/`.
5. Exact-SHA validation evidence in `validation/` and linked GitHub Issues.
6. `release/DomainHarness_v0.1_CLOSEOUT.md` for the current release decision.

The PRD copy was imported byte-for-byte and checksum-verified via #54/#55; it is the repository-local Product authority and must not be reformatted or rewritten.

## Directory map

- `product/` — exact frozen PRD artifact.
- `architecture/` — frozen L2 architecture evidence and decisions.
- `implementation/` — Task DAG, L3 evidence and historical task handoff material.
- `operations/` — SQLite/storage/recovery operational contract.
- `sdk/` — public SDK usage and embedding guidance.
- `validation/` — Critical Journeys, cross-domain evidence, visible validation state and Hidden Validation preparation.
- `release/` — Version Closure / Release Qualification decision record.

`DomainHarness_v0.1_INDEX.md` is the version-specific reading index.

## Current status

Implementation tasks T-001..T-017 are complete. Historical visible candidate `edbe2b53c936107ba4dfbb4eef7aef5408c26b39` passed Tally, City Atlas and final visible exact-SHA/package gates. Post-candidate definition-lock/Script hardening (#49/#50/#51), canonical test-flow hardening (#52/#53) and PRD provenance (#54/#55) are complete and merged into the version line.

Documentation/CI process closure and successor exact-SHA validation remain in progress. Owner-held Hidden Validation remains NOT_RUN. No document should describe v0.1 as `READY` until the final successor SHA passes its required visible gates and Hidden Validation.

## Stale evidence policy

Historical prompts/blocker files may describe the state at the time they were created. They must not override the current Task DAG, Validation Report, GitHub Issue state or Release Closeout. Obsolete one-off blocker/status files must be removed or clearly marked superseded.
