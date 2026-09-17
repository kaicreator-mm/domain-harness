# DomainHarness Documentation

This directory contains the formal product, architecture, Domain Data, Harness, implementation, SDK, validation, operations and release documentation for DomainHarness v0.1.

## Authority order

1. `product/DomainHarness_v0.1_PRD_FROZEN.md`, SHA-256 `4f19317dc46ae1eb888ff99bd4f50a21246483895fab16086341d0222a60e440`.
2. `architecture/DomainHarness_v0.1_L2_ARCHITECTURE_EVIDENCE.md`.
3. `implementation/DomainHarness_v0.1_TASK_DAG.md` plus task-specific L3 evidence.
4. Public contracts/tests under `packages/domain-harness/`.
5. Descriptive architecture / Domain Data / Harness / SDK documentation derived from those authorities and current implementation.
6. Exact-SHA validation evidence in `validation/` and linked GitHub Issues.
7. `release/DomainHarness_v0.1_CLOSEOUT.md` and Release Closure issue #39 for the release decision.

The frozen PRD was imported byte-for-byte and checksum-verified via #54/#55. Descriptive technical documents do not override the frozen PRD/L2 or executable source/tests.

## Documentation map

- `product/` — exact frozen PRD artifact.
- `architecture/` — frozen L2 evidence plus detailed system architecture and integration model.
- `domain-data/` — Domain Data specification and authoring guide.
- `harness/` — Harness technical specification and authoring guide.
- `implementation/` — terminal Task DAG, L3 evidence and historical task handoff material.
- `sdk/` — public SDK reference, usage entry point and coding-Agent migration guide.
- `operations/` — SQLite/storage/recovery operational contract.
- `validation/` — Critical Journeys, cross-domain evidence, validation state and Hidden Validation preparation.
- `release/` — Version Closure / Release Qualification decision record.

`DomainHarness_v0.1_INDEX.md` is the version-specific reading index.

## Technical documentation — English / 中文

### Architecture / 架构

- English: `architecture/DomainHarness_ARCHITECTURE.md`
- 中文：`architecture/DomainHarness_ARCHITECTURE.zh-CN.md`
- English integration model: `architecture/DOMAINHARNESS_INTEGRATION_MODEL.md`
- 中文集成模型：`architecture/DOMAINHARNESS_INTEGRATION_MODEL.zh-CN.md`

### Domain Data

Start at `domain-data/README.md`.

- English spec: `domain-data/DOMAIN_DATA_SPEC.md`
- 中文规范：`domain-data/DOMAIN_DATA_SPEC.zh-CN.md`
- English authoring guide: `domain-data/DOMAIN_DATA_AUTHORING_GUIDE.md`
- 中文编写指南：`domain-data/DOMAIN_DATA_AUTHORING_GUIDE.zh-CN.md`

### Harness

Start at `harness/README.md`.

- English technical spec: `harness/HARNESS_TECHNICAL_SPEC.md`
- 中文技术规范：`harness/HARNESS_TECHNICAL_SPEC.zh-CN.md`
- English authoring guide: `harness/HARNESS_AUTHORING_GUIDE.md`
- 中文编写指南：`harness/HARNESS_AUTHORING_GUIDE.zh-CN.md`

## Recommended reading paths

### Runtime implementer

```text
Frozen PRD
→ Frozen L2 Architecture Evidence
→ Detailed System Architecture
→ Harness Technical Spec
→ Storage/Recovery Notes
→ source/tests
```

### Downstream application engineer

```text
Detailed System Architecture
→ Integration Model
→ SDK Reference
→ Harness Technical Spec
→ downstream project authority
```

### Coding Agent refactoring another project

```text
Downstream frozen authority
→ Domain Data Spec
→ Domain Data Authoring Guide
→ Integration Model
→ Harness Authoring Guide
→ SDK Agent Migration Guide
→ one Critical Journey
```

The Agent should produce a migration map and Tool effect classification before implementation. It must not infer domain authority from Runtime internals.

## SDK / downstream project entry point

Start at `sdk/README.md`.

Core SDK documents:

1. `sdk/DomainHarness_v0.1_SDK_REFERENCE.md`;
2. `sdk/DomainHarness_v0.1_AGENT_MIGRATION_GUIDE.md`;
3. `sdk/DomainHarness_v0.1_SDK_USAGE.md`.

A downstream project remains authoritative for its domain/business state, API, database, authentication/authorization, credentials, external clients and AI provider/model strategy. DomainHarness provides generic durable execution mechanics only.

Until a formal release/tag is authorized, consumers should pin an exact DomainHarness commit/tarball instead of treating a moving branch as a released dependency.

## Current project state

Implementation tasks T-001..T-017 are complete. Quality hardening, canonical test-flow hardening, frozen PRD provenance, dual-OS durability, SDK documentation and repository documentation closure are complete.

The executable/package tree validated in #60 passed **117/117 tests with 0 skipped**, package/plain-Node consumer validation, focused recovery/Worker/definition-lock suites and Tally + City Atlas external runners. Later documentation-only changes carry that executable/package evidence only when Git diff/tree equivalence proves no Runtime/package/test/dependency change and that disposition is recorded.

The v0.1.0 version line has been integrated to `main` through PR #65. Repository integration does not by itself assert formal Release Qualification.

Repository-process follow-ups remain separate:

- #57 — Woodpecker is connected and the emitted context is known, but execution is infrastructure-blocked because the agent is using a local backend instead of a container backend;
- #56 — `main` branch protection/ruleset is an administrator follow-up after a green Woodpecker run.

Owner-held Hidden Validation remains the outstanding formal Release Qualification gate tracked by #39. It is not a known Runtime defect.

## Stale evidence policy

Historical prompts/blocker files may describe the state at the time they were created. They do not override the frozen authorities, terminal Task DAG, current source/tests, current Validation Report, GitHub Issue state or Release Closure. Retained historical records must be treated as superseded when current evidence disagrees.
