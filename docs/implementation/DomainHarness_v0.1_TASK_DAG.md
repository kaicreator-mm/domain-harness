# Task DAG — DomainHarness v0.1

**Status:** CLOSED — IMPLEMENTATION TASKS T-001..T-017 COMPLETE  
**Created:** 2026-09-17  
**Terminal status reconciled:** 2026-09-17

> This document remains the frozen v0.1 execution plan and dependency record. Its status table has been reconciled with the completed GitHub Task/PR/validation history. Release Qualification is a separate gate: task completion does not imply a release is READY.

## Frozen Inputs

- PRD: Frozen DomainHarness v0.1 PRD, SHA-256 `4f19317dc46ae1eb888ff99bd4f50a21246483895fab16086341d0222a60e440`
- Architecture: `docs/architecture/DomainHarness_v0.1_L2_ARCHITECTURE_EVIDENCE.md`
- Architecture baseline commit: `819e6587a5d4877b69a506f2259a0a35b4c38aff`
- Standard revision: `.dev-standard/VERSION` → `0446f04583f6cf464c835f26e2f657c8b703cb4e`

## Terminal Task Table

| Task | Depends On | Parallel | Risk | Input / Reference | Output | Acceptance | Model | Required Validation | Status |
|---|---|---:|---|---|---|---|---|---|---|
| T-001 Workspace + package scaffold | — | NO | M | PRD package/product form; L2 §15 | root workspace, `packages/domain-harness`, TypeScript build/test/lint/typecheck commands, package exports skeleton | clean install/build/typecheck; package name is `@kaicreator/domain-harness`; no server/app/admin modules introduced | High | clean-checkout install + typecheck + build smoke | DONE |
| T-002 Public contracts + normalized error model | T-001 | YES | M | PRD §§30,35,45; L2 §11/13 | public TypeScript contracts for Run, Tool, AI port, errors, JSON value boundaries | no XState types leak; frozen run statuses/error codes represented; Tool effect classification represented | High | contract tests + API type tests | DONE |
| T-003 Harness AST, Loader, static validation, definition hash | T-001,T-002 | YES | H | PRD §§9–12,16,26–29,41; L2 §§3.5,3.6,10 | YAML/Zod loader, AST, Skill sidecar/resources loader, Ajv 2020-12 schema registry, JSONata static checks, canonical definition hash | all frozen static validation rules enforced; unknown schema version fails; cycles/references/fallback rules validated; definition hash deterministic | High | unit + contract fixtures + hash stability tests | DONE |
| T-004 SQLite store + migrations | T-001,T-002 | YES | H | PRD §§37–49; L2 §6 | `runs`/`steps` schema, ordered migrations via `PRAGMA user_version`, WAL/FULL/busy_timeout config, store repository | transactional create/read/update/list operations; unique Step identity enforced; no ORM/storage abstraction | High | SQLite integration tests; crash-safe transaction tests | DONE |
| T-005 XState v5 compiler/control adapter | T-002,T-003 | YES | H | PRD §§8,16–24; L2 §§4,5.1,16 ADR-001/002 | AST→private XState compiler, internal route events, state reconstruction from Runtime control state | flat subset only; no JSONata in guards; no public XState type/snapshot; done/error/event route selection consumes precomputed route index | High | compiler snapshot tests + contract tests | DONE |
| T-006 ExpressionRuntime + deterministic clock | T-001,T-003 | YES | H | PRD §§20–22,29,44; L2 §8 | JSONata 2.x Worker evaluator, forbidden function checks, deterministic `$now/$millis`, strict-boolean route validation, resource/size limits | `$random/$eval` rejected; deterministic time survives replay; timeout terminates Worker; non-boolean `when`→`expression_error` | High | L3 required; worker timeout tests; replay determinism tests; JSONata binding contract tests | DONE |
| T-007 Script Worker executor | T-001,T-002 | YES | M | PRD §§33–34,43–44; L2 §9 | fresh Worker per Script invocation, JSON-only boundary, env `{}`, timeout/cancel/resource limits | timeout/cancel terminate worker; script result JSON-serializable; path cannot escape Harness root | Low | unit + worker integration tests | DONE |
| T-008 Tool Registry + AIOperationPort executors | T-002,T-003 | YES | M | PRD §§11–13,30–32,39,43,45; L2 §§11.1–11.2 | Tool registry/executor, Skill package assembler, AI port adapter, schema validation around I/O | Tool/Skill inputs/outputs validated; idempotency key supplied; credentials never enter journal/assets/AI request unless host Tool itself explicitly handles them; provider-specific dependency absent | High | contract tests with fake Tool/AI port; cancellation/timeout tests | DONE |
| T-009 Step Journal + Runner core | T-004,T-005,T-006,T-007,T-008 | NO | H | PRD §§35–40,45; L2 §§5.3–5.4,6,12 | RunCoordinator, step lifecycle, attempts, step-limit accounting, route execution, output reuse/replay policy | completed never reruns; replay matrix matches PRD; non-idempotent interrupted Tool routes `interrupted`; DB tx never held across external execution | High | L3 required; integration matrix for every Step kind/effect class | DONE |
| T-010 Child Workflow frame stack + recovery | T-003,T-005,T-009 | NO | H | PRD §§15,17.1,19,40; L2 §7 | deterministic `workflowInstanceId`, parent logical Step + child internal journals, frame push/pop/unwind | same-Harness only; isolated child scope; repeated parent visits create distinct children; child resumes completed internals without replay | High | L3 required; nested child crash/recovery tests; cycle/depth tests | DONE |
| T-011 Waiting events + send/wait/cancel/resume lifecycle | T-009,T-010 | NO | H | PRD §§25,35–36,42–44; L2 §§6.3,12,13 | waiting persistence, external event schema validation/routing, `send`, `wait`, `resume`, `cancel`, AbortController integration | rejected send has no mutation; accepted event written to waiting state output; concurrent sends serialized; cancel terminal and late results discarded | High | concurrency + cancellation integration tests | DONE |
| T-012 Definition-lock + crash recovery reconciliation | T-003,T-004,T-009,T-010,T-011 | NO | H | PRD §§37–41; L2 §§5.4,10 | resume reconciler, definition/engine mismatch rejection, completed-journal/lagging-control repair, interrupted non-idempotent handling | forced termination at each journal boundary produces frozen recovery behavior; incompatible definition/engine refuses resume | High | L3 required; process-kill integration suite | DONE |
| T-013 Public SDK assembly + package exports | T-002,T-003,T-011,T-012 | NO | M | PRD SC-01/SC-08/SC-10; L2 §11/15 | `createDomainHarness`, stable public exports, package build artifact, minimal README usage | host can import and execute all public lifecycle ops; no internal module/XState leakage; package clean-consumer smoke passes | High | package consumer smoke + API contract tests | DONE |
| T-014 v0.1 synthetic Critical Journeys | T-013 | YES | M | PRD SC-02–SC-10 | repository integration harnesses/fixtures covering sequential, Skill, Tool, Expr, Script, wait/resume, child, crash recovery | frozen success criteria demonstrated in synthetic CJ/process-kill suites | Low | Critical Journey suite + clean checkout validation | DONE |
| T-015 Tally-like external domain validation | T-013 | YES | H | PRD SC-11 + §58 Tally | external Harness integration evidence in domain repo; no DomainHarness contract change | Skill + Tool + Expr + waiting + child path executes and Tally authority remains external | High | exact-SHA cross-repo integration evidence | DONE |
| T-016 City Atlas / non-software external domain validation | T-013 | YES | H | PRD SC-11 + §58 City Atlas | second external domain Harness integration evidence | required primitives execute without changing public contracts; City Atlas authority remains external | High | exact-SHA cross-repo integration evidence | DONE |
| T-017 Documentation + validation/closeout preparation | T-014,T-015,T-016 | NO | M | pinned standards; frozen PRD/Architecture | docs index, SDK usage, storage/recovery notes, known limitations, validation report, Hidden Validation pack preparation | docs match public contract/persistence semantics; no release claim before mandatory gates | Low | docs verification + validation report review | DONE |

Status values: `TODO / DOING / BLOCKED / DONE / DEFERRED / NOT_APPLICABLE`.

## Completion Evidence Summary

- T-001..T-012 implementation and required L3/Build Host follow-ups were completed through their Task branches, PRs and validation Issues.
- T-013 clean package/consumer evidence: Issue #30 PASS.
- T-014 synthetic Critical Journey/process-kill evidence: Issue #32 PASS.
- T-015 Tally runner: external `kaicreator-mm/tally#54` PASS on visible candidate `edbe2b53c936107ba4dfbb4eef7aef5408c26b39`.
- T-016 City Atlas runner: external `kaicreator-mm/city-atlas#23` PASS on the same visible candidate.
- Final visible exact-SHA regression/package gate also PASSed on `edbe2b53c936107ba4dfbb4eef7aef5408c26b39`.
- Owner-held Hidden Validation is deliberately outside this Task DAG and remains a Release Qualification gate.
- Post-candidate quality review opened #49/#50/#51 and test-flow PR #52/#53. Those are successor-candidate hardening concerns, not unfinished T-001..T-017 scope.

## Dependency Shape

```text
T-001
├─ T-002 ─┬─ T-003 ─┬─ T-005 ───────────────┐
│         │          ├─ T-006 ───────────────┤
│         │          └─ T-008 ───────────────┤
│         ├─ T-004 ──────────────────────────┤
│         └─ T-007 ──────────────────────────┤
│                                            ▼
│                                          T-009
│                                            ▼
│                                          T-010
│                                            ▼
│                                          T-011
│                                            ▼
│                                          T-012
│                                            ▼
│                                          T-013
│                                       ┌────┼────┐
│                                       ▼    ▼    ▼
│                                     T-014 T-015 T-016
│                                       └────┼────┘
│                                            ▼
└────────────────────────────────────────── T-017
```

## L3 Evidence

Dedicated L3 Implementation Evidence was required for T-006, T-009, T-010 and T-012; T-011 also received lifecycle/race evidence as implementation complexity warranted. The required evidence order remained:

```text
Tests
→ Contract / Interface
→ Core Implementation
→ Failure Handling
→ Reference
```

## Release-impact Notes

The following remain outside v0.1 and were not introduced during implementation or closeout:

- Static Parallel Composition;
- Generic DAG Execution;
- storage abstraction/PostgreSQL adapter;
- server/Admin Console/visual designer;
- XState v6 migration.

Adding any of these to v0.1 requires explicit authority change; quality/closure work must not introduce them opportunistically.

## Task DAG Gate — Closed

The Task DAG execution gate is closed for T-001..T-017. Future v0.1 work before release is limited to defect/quality/test/documentation/process concerns discovered by validation or review and must use small concern branches/PRs with exact-SHA validation where required.
