# DomainHarness Project Overrides

## Repository profile

- Product: Domain Harness Runtime
- Version target: v0.1
- Repository: `kaicreator-mm/domain-harness`
- Project form: embedded TypeScript SDK/runtime; no server or generic admin UI in v0.1.
- Structure: minimum monorepo-compatible layout; publishable runtime/contract SDK is `packages/domain-harness`.

## Frozen authority

- Product authority: `docs/product/DomainHarness_v0.1_PRD_FROZEN.md`, SHA-256 `4f19317dc46ae1eb888ff99bd4f50a21246483895fab16086341d0222a60e440`. This file was imported byte-for-byte via #54/#55 and MUST NOT be reformatted or rewritten.
- Architecture authority: `docs/architecture/DomainHarness_v0.1_L2_ARCHITECTURE_EVIDENCE.md`.
- Task authority / historical execution plan: `docs/implementation/DomainHarness_v0.1_TASK_DAG.md`.
- Release/validation authority: `docs/validation/DomainHarness_v0.1_VALIDATION_REPORT.md` plus exact-SHA GitHub Issue evidence.
- Frozen product scope and technology choices MUST NOT be reopened by implementation agents unless a documented architecture contradiction is found.

## Project-specific hard boundaries

- Domain semantics stay outside DomainHarness.
- XState v5 is internal implementation detail only; no XState API/type/snapshot leaks into public SDK or domain assets.
- v0.1 is single-process and SQLite-backed; no distributed scheduler, multi-database abstraction, static parallel composition, generic DAG runtime, dynamic spawn, server, or generic admin console.
- Tool is the only host/external I/O and side-effect boundary.
- Script is trusted deterministic extension code, not a hostile-code security sandbox.
- LLM output never owns workflow transition authority.

## Canonical commands

From repository root:

```text
npm ci
npm run lint
npm run typecheck
npm test
npm pack -w @kaicreator/domain-harness
```

`npm test` is the canonical package regression command and now builds first, so the plain-ESM host regression executes on a clean checkout rather than being silently skipped.

## Validation execution profile

- Architecture/document review: GitHub exact-SHA evidence + repository documents.
- Node/SQLite/worker/runtime validation: real Node Build Host required for final truth.
- Tally + City Atlas cross-domain visible gates PASSed on historical visible candidate `edbe2b53c936107ba4dfbb4eef7aef5408c26b39`; a successor Runtime candidate must rerun materially affected gates.
- Supplemental public validation is tracked in #41–#48. #42 remains incomplete until its Linux/ext4 leg is recorded; the other recorded supplemental cases are PASS.
- Hidden Validation remains owner-held and must not be replaced by public supplemental tests.

## CI profile

`minimal`

Minimal CI runs only clean-checkout install/lint/typecheck/canonical tests on pull requests and stable-branch pushes. Expensive cross-platform, crash, soak, Critical Journey, cross-domain and Hidden Validation suites remain outside per-PR CI.

Repository Woodpecker configuration is tracked by #59/#63; actual workflow execution/status-context verification is #57. CI PASS is independent evidence and MUST NOT be treated as complete Validation or Release Qualification.

## Release gates

Release gates are derived in authority order from Frozen PRD → Frozen Architecture → Task acceptance → pinned standard defaults.

Current release rule:

1. merge only validated concern PRs into the version line;
2. merge documentation/process closure concerns;
3. freeze one exact successor candidate SHA;
4. rerun materially affected visible exact-SHA release gates;
5. execute owner-held Hidden Validation on that exact candidate;
6. verify no unresolved P0/P1 blocker;
7. only then record `READY` and create any tag/release baseline.

No historical or speculative gate may be promoted to mandatory without changing the appropriate frozen authority.
