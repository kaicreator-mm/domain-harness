# DomainHarness Project Overrides

## Repository profile

- Product: Domain Harness Runtime
- Version target: v0.1
- Repository: `kaicreator-mm/domain-harness`
- Project form: embedded TypeScript SDK/runtime; no server or generic admin UI in v0.1.
- Structure: use the minimum necessary monorepo-compatible layout; the publishable runtime/contract SDK belongs under `packages/` when implementation starts.

## Frozen authority

- Product authority: user-supplied frozen artifact `DomainHarness_v0.1_PRD_FROZEN.md`, SHA-256 `4f19317dc46ae1eb888ff99bd4f50a21246483895fab16086341d0222a60e440`. This exact artifact is the v0.1 product authority until it is imported unchanged into `docs/product/`.
- Architecture authority: `docs/architecture/DomainHarness_v0.1_L2_ARCHITECTURE_EVIDENCE.md`.
- Task authority: `docs/implementation/DomainHarness_v0.1_TASK_DAG.md`.
- Frozen product scope and technology choices MUST NOT be reopened by implementation agents unless a documented architecture contradiction is found.

## Project-specific hard boundaries

- Domain semantics stay outside DomainHarness.
- XState v5 is internal implementation detail only; no XState API/type/snapshot leaks into public SDK or domain assets.
- v0.1 is single-process and SQLite-backed; no distributed scheduler, multi-database abstraction, static parallel composition, generic DAG runtime, dynamic spawn, server, or generic admin console.
- Tool is the only host/external I/O and side-effect boundary.
- Script is trusted deterministic extension code, not a hostile-code security sandbox.
- LLM output never owns workflow transition authority.

## Commands

Implementation commands are `NOT_RUN — implementation scaffold does not exist yet` until Task DAG implementation establishes the canonical workspace commands.

## Validation execution profile

- Architecture/document validation: ChatGPT Web + source evidence + GitHub exact-SHA checkpoint.
- Node/SQLite/worker runtime validation: `NOT_RUN — implementation not started`; expected execution environment is a real Node.js host.
- Cross-domain validation: required before v0.1 Contract Finalization / Release Qualification per frozen PRD.

## CI profile

`minimal`

CI MUST remain a low-cost clean-checkout verification layer and MUST NOT be treated as complete Validation or Release Qualification.

## Release gates

Release gates are derived in authority order from Frozen PRD → Frozen Architecture → Task acceptance → pinned standard defaults. No historical or speculative gate may be promoted to mandatory without changing the appropriate frozen authority.
