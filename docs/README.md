# DomainHarness Documentation

This directory contains the formal product, architecture, implementation, SDK, validation, operations and release evidence for DomainHarness v0.1.

## Authority order

1. `product/DomainHarness_v0.1_PRD_FROZEN.md`, SHA-256 `4f19317dc46ae1eb888ff99bd4f50a21246483895fab16086341d0222a60e440`.
2. `architecture/DomainHarness_v0.1_L2_ARCHITECTURE_EVIDENCE.md`.
3. `implementation/DomainHarness_v0.1_TASK_DAG.md` plus task-specific L3 evidence.
4. Public contracts/tests under `packages/domain-harness/`.
5. Consumer SDK documentation under `sdk/`, derived from the public contracts and current v0.1 implementation.
6. Exact-SHA validation evidence in `validation/` and linked GitHub Issues.
7. `release/DomainHarness_v0.1_CLOSEOUT.md` for the current release decision.

The PRD copy was imported byte-for-byte and checksum-verified via #54/#55; it is the repository-local Product authority and must not be reformatted or rewritten.

## Directory map

- `product/` — exact frozen PRD artifact.
- `architecture/` — frozen L2 architecture evidence and decisions.
- `implementation/` — terminal Task DAG, L3 evidence and historical task handoff material.
- `sdk/` — public SDK reference, short usage entry point and coding-Agent migration guide.
- `operations/` — SQLite/storage/recovery operational contract.
- `validation/` — Critical Journeys, cross-domain evidence, visible validation state and Hidden Validation preparation.
- `release/` — Version Closure / Release Qualification decision record.

`DomainHarness_v0.1_INDEX.md` is the version-specific reading index.

## SDK / downstream project entry point

Start at `sdk/README.md`.

For a coding Agent refactoring another project, provide all of the following from the **same exact DomainHarness SHA**:

1. `sdk/DomainHarness_v0.1_SDK_REFERENCE.md`;
2. `sdk/DomainHarness_v0.1_AGENT_MIGRATION_GUIDE.md`;
3. the downstream project's own PRD/architecture/development standard;
4. one Critical Journey to migrate first.

The downstream project must keep its own domain/business authority. DomainHarness supplies generic durable execution mechanics only.

Until v0.1 is formally release-qualified/tagged, consumers should pin an exact DomainHarness commit/tarball rather than depend on a moving branch.

## Current status

Implementation tasks T-001..T-017 are complete. Post-candidate definition-lock/Script hardening, canonical test-flow hardening, frozen PRD provenance, dual-OS durability, documentation/process closure, minimal Woodpecker configuration and SDK/Agent documentation are complete on the `v0.1` line.

The executable/package tree at `1835f3f31ca483dc7bd997a545391f622d38be63` passed #60 with **117/117 tests, 0 skipped**, package/plain-Node consumer validation, focused recovery/Worker/definition-lock suites and both Tally/City Atlas external runners. Later SDK documentation-only commits have no Runtime/package/test/dependency changes; #60 and #39 record the explicit validation carry-forward based on Git diff/tree equivalence.

The repository is not yet connected to a Woodpecker instance, so actual CI execution/status context is ENV-BLOCKED (#57) and `main` branch protection remains an admin follow-up (#56). These are repository-process items, not Runtime failures.

Owner-held Hidden Validation remains the mandatory Release Qualification gate. #39 tracks the final intended version-line SHA and release decision.

No document should describe v0.1 as `READY` until Hidden Validation passes and the final validated version line is integrated to `main` according to the release-closeout policy.

## Stale evidence policy

Historical prompts/blocker files may describe the state at the time they were created. They do not override the terminal Task DAG, current Validation Report, GitHub Issue state or Release Closeout. One-off blocker/status files retained for audit must be treated as superseded historical evidence when current records disagree.
