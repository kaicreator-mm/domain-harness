# Task DAG — DomainHarness v0.1

**Status:** ACTIVE  
**Created:** 2026-09-17

## Frozen Inputs

- PRD: Frozen DomainHarness v0.1 PRD, SHA-256 `4f19317dc46ae1eb888ff99bd4f50a21246483895fab16086341d0222a60e440`
- Architecture: `docs/architecture/DomainHarness_v0.1_L2_ARCHITECTURE_EVIDENCE.md`
- Architecture baseline commit: `819e6587a5d4877b69a506f2259a0a35b4c38aff`
- Standard revision: `.dev-standard/VERSION` → `0446f04583f6cf464c835f26e2f657c8b703cb4e`

## Task Table

| Task | Depends On | Parallel | Risk | Input / Reference | Output | Acceptance | Model | Required Validation | Status |
|---|---|---:|---|---|---|---|---|---|---|
| T-001 Workspace + package scaffold | — | NO | M | PRD package/product form; L2 §15 | root workspace, `packages/domain-harness`, TypeScript build/test/lint/typecheck commands, package exports skeleton | clean install/build/typecheck; package name is `@kaicreator/domain-harness`; no server/app/admin modules introduced | High | clean-checkout install + typecheck + build smoke | TODO |
| T-002 Public contracts + normalized error model | T-001 | YES | M | PRD §§30,35,45; L2 §11/13 | public TypeScript contracts for Run, Tool, AI port, errors, JSON value boundaries | no XState types leak; frozen run statuses/error codes represented; Tool effect classification represented | High | contract tests + API type tests | TODO |
| T-003 Harness AST, Loader, static validation, definition hash | T-001,T-002 | YES | H | PRD §§9–12,16,26–29,41; L2 §§3.5,3.6,10 | YAML/Zod loader, AST, Skill sidecar/resources loader, Ajv 2020-12 schema registry, JSONata static checks, canonical definition hash | all frozen static validation rules enforced; unknown schema version fails; cycles/references/fallback rules validated; definition hash deterministic | High | unit + contract fixtures + hash stability tests | TODO |
| T-004 SQLite store + migrations | T-001,T-002 | YES | H | PRD §§37–49; L2 §6 | `runs`/`steps` schema, ordered migrations via `PRAGMA user_version`, WAL/FULL/busy_timeout config, store repository | transactional create/read/update/list operations; unique Step identity enforced; no ORM/storage abstraction | High | SQLite integration tests; crash-safe transaction tests | TODO |
| T-005 XState v5 compiler/control adapter | T-002,T-003 | YES | H | PRD §§8,16–24; L2 §§4,5.1,16 ADR-001/002 | AST→private XState compiler, internal route events, state reconstruction from Runtime control state | flat subset only; no JSONata in guards; no public XState type/snapshot; done/error/event route selection consumes precomputed route index | High | compiler snapshot tests + contract tests | TODO |
| T-006 ExpressionRuntime + deterministic clock | T-001,T-003 | YES | H | PRD §§20–22,29,44; L2 §8 | JSONata 2.x Worker evaluator, forbidden function checks, deterministic `$now/$millis`, strict-boolean route validation, resource/size limits | `$random/$eval` rejected; deterministic time survives replay; timeout terminates Worker; non-boolean `when`→`expression_error` | High | L3 required; worker timeout tests; replay determinism tests; JSONata binding contract tests | TODO |
| T-007 Script Worker executor | T-001,T-002 | YES | M | PRD §§33–34,43–44; L2 §9 | fresh Worker per Script invocation, JSON-only boundary, env `{}`, timeout/cancel/resource limits | timeout/cancel terminate worker; script result JSON-serializable; path cannot escape Harness root | Low | unit + worker integration tests | TODO |
| T-008 Tool Registry + AIOperationPort executors | T-002,T-003 | YES | M | PRD §§11–13,30–32,39,43,45; L2 §§11.1–11.2 | Tool registry/executor, Skill package assembler, AI port adapter, schema validation around I/O | Tool/Skill inputs/outputs validated; idempotency key supplied; credentials never enter journal/assets/AI request unless host Tool itself explicitly handles them; provider-specific dependency absent | High | contract tests with fake Tool/AI port; cancellation/timeout tests | TODO |
| T-009 Step Journal + Runner core | T-004,T-005,T-006,T-007,T-008 | NO | H | PRD §§35–40,45; L2 §§5.3–5.4,6,12 | RunCoordinator, step lifecycle, attempts, step-limit accounting, route execution, output reuse/replay policy | completed never reruns; replay matrix matches PRD; non-idempotent interrupted Tool routes `interrupted`; DB tx never held across external execution | High | L3 required; integration matrix for every Step kind/effect class | TODO |
| T-010 Child Workflow frame stack + recovery | T-003,T-005,T-009 | NO | H | PRD §§15,17.1,19,40; L2 §7 | deterministic `workflowInstanceId`, parent logical Step + child internal journals, frame push/pop/unwind | same-Harness only; isolated child scope; repeated parent visits create distinct children; child resumes completed internals without replay | High | L3 required; nested child crash/recovery tests; cycle/depth tests | TODO |
| T-011 Waiting events + send/wait/cancel/resume lifecycle | T-009,T-010 | NO | H | PRD §§25,35–36,42–44; L2 §§6.3,12,13 | waiting persistence, external event schema validation/routing, `send`, `wait`, `resume`, `cancel`, AbortController integration | rejected send has no mutation; accepted event written to waiting state output; concurrent sends serialized; cancel terminal and late results discarded | High | L3 recommended; concurrency + cancellation integration tests | TODO |
| T-012 Definition-lock + crash recovery reconciliation | T-003,T-004,T-009,T-010,T-011 | NO | H | PRD §§37–41; L2 §§5.4,10 | resume reconciler, definition/engine mismatch rejection, completed-journal/lagging-control repair, interrupted non-idempotent handling | forced termination at each journal boundary produces frozen recovery behavior; incompatible definition/engine refuses resume | High | L3 required; process-kill integration suite | TODO |
| T-013 Public SDK assembly + package exports | T-002,T-003,T-011,T-012 | NO | M | PRD SC-01/SC-08/SC-10; L2 §11/15 | `createDomainHarness`, stable public exports, package build artifact, minimal README usage | host can import and execute all public lifecycle ops; no internal module/XState leakage; package clean-consumer smoke passes | High | package consumer smoke + API contract tests | TODO |
| T-014 v0.1 synthetic Critical Journeys | T-013 | YES | M | PRD SC-02–SC-10 | repository integration harnesses/fixtures covering sequential, Skill, Tool, Expr, Script, wait/resume, child, crash recovery | all frozen success criteria except external second-domain gate demonstrated on exact SHA | Low | Critical Journey suite + clean checkout validation | TODO |
| T-015 Tally-like external domain validation | T-013 | YES | H | PRD SC-11 + §58 Tally | external Harness integration evidence in domain repo; no DomainHarness contract change | at least Skill+Tool+Expr/Script+waiting+child usage; domain semantics stay outside Runtime | High | exact-SHA cross-repo integration evidence | TODO |
| T-016 City Atlas / non-software external domain validation | T-013 | YES | H | PRD SC-11 + §58 City Atlas | second external domain Harness integration evidence | runs without changing DomainHarness public contracts; required five primitive categories present | High | exact-SHA cross-repo integration evidence | TODO |
| T-017 Documentation + validation/closeout preparation | T-014,T-015,T-016 | NO | M | pinned standards; frozen PRD/Architecture | docs index, SDK usage, storage/recovery notes, known limitations, validation report, Hidden Validation pack preparation | docs match exact public contract and persistence semantics; no release claim before mandatory gates | Low | docs verification + validation report review | TODO |

Status values: `TODO / DOING / BLOCKED / DONE / DEFERRED / NOT_APPLICABLE`.

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

## Parallelism Rules

After T-001/T-002 are stable, the following concerns can proceed in parallel with non-overlapping ownership:

```text
T-003 Loader/AST
T-004 SQLite Store
T-005 XState Compiler (after T-003 AST contract)
T-006 ExpressionRuntime
T-007 Script Worker
T-008 Tool/AI executors
```

T-009 is the first major integration join and MUST NOT begin against unstable Store/Compiler/Executor contracts.

External validation tasks T-015 and T-016 may run in parallel after public SDK assembly at T-013.

## L3 Requirements

The following tasks require dedicated L3 Implementation Evidence before implementation or before merging their core concern:

- **T-006** — deterministic JSONata clock control + Worker timeout/resource behavior;
- **T-009** — journal/replay transaction algorithm and effect matrix;
- **T-010** — Child Workflow frame/recovery algorithm;
- **T-012** — crash boundary reconciliation and process-kill validation.

T-011 should receive an L3 pack if implementation uncovers race complexity beyond the frozen RunCoordinator design.

L3 evidence order:

```text
Tests
→ Contract / Interface
→ Core Implementation
→ Failure Handling
→ Reference
```

## Release-impact Notes

- Static Parallel Composition is not represented as a v0.1 Task.
- Generic DAG Execution is not represented as a v0.1 Task.
- No storage abstraction/PostgreSQL adapter Task exists.
- No server/Admin Console/visual designer Task exists.
- No XState v6 migration Task exists.

Adding any of the above to v0.1 requires explicit authority change; implementation agents must not introduce them opportunistically.

## Task DAG Gate

This DAG is executable only against the frozen Architecture baseline or a later explicit architecture checkpoint that preserves the frozen PRD.

A task may be marked `DONE` only when its acceptance criteria and required task-level validation are satisfied.
