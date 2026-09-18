# Task DAG — DomainHarness v0.2

**Status:** FROZEN EXECUTION PLAN — DONE  
**Created:** 2026-09-18  
**Integration branch:** `v0.2`  
**Task branch convention:** `v0.2_tNNN`

> This DAG is intentionally decomposed for multi-conversation execution. T-001 freezes/scaffolds shared contracts; after T-001 merges, most core concerns can be implemented in parallel with isolated write sets. Task PRs target `v0.2`. Version closure, not individual PR PASS, determines release qualification.

## Frozen Inputs

- PRD: `docs/product/DomainHarness_v0.2_PRD_FROZEN.md`, SHA-256 `e95534773b0879a7e4892ba995ca90928d6029730f0de1e70c2915aa56679d9b`
- Architecture: `docs/architecture/DomainHarness_v0.2_L2_ARCHITECTURE_EVIDENCE.md`
- Repository baseline before v0.2 planning: `main@2a41b3401950a2550a063616a572a86f3b44e733`
- Standard revision: `.dev-standard/VERSION` → `0446f04583f6cf464c835f26e2f657c8b703cb4e`
- Detailed task instructions: `docs/implementation/v0.2/task-packs/`

## Task Table

| Task | Depends On | Parallel | Risk | Input / Reference | Output | Acceptance | Model | Required Validation | Status |
|---|---|---:|---|---|---|---|---|---|---|
| T-001 v0.2 workspace scaffold + frozen contract foundation | — | NO | H | Frozen PRD + L2 + task pack | four workspace package manifests and build/typecheck/test scripts | `@kaicreator/domain-harness` has no Node built-in/driver dependency | High | dependency inspection | DONE |
| T-002 build-time compiler + Target Compiled Package generation | T-001 | YES | H | Frozen PRD + L2 + task pack | Raw Package loader migrated from v0.1 runtime code | missing required capability fails compilation | High | G1/G2 compiler fixtures | DONE |
| T-003 Node SQLite RuntimeStore adapter | T-001 | YES | M | Frozen PRD + L2 + task pack | dh_v2_* migrations | shared RuntimeStore conformance suite passes | High | G5 store conformance | DONE |
| T-004 Expo SQLite RuntimeStore adapter | T-001 | YES | H | Frozen PRD + L2 + task pack | Expo RuntimeStore adapter | same store conformance contract as Node | High | G4/G5 host-store subset | DONE |
| T-005 compiled package validation + registry + pin retention | T-001 | YES | H | Frozen PRD + L2 + task pack | compiled manifest validator | malformed/incompatible package fails before execution | High | G27/G28/G29 unit + integration fixtures | DONE |
| T-006 portable Expression Tool + deterministic expression runtime | T-001 | YES | M | Frozen PRD + L2 + task pack | portable JSONata executor | no node: imports/Buffer requirement in portable path | High | G6 expression CJ subset | DONE |
| T-007 target-compiled Script Tool bindings for Node + Expo | T-001 | YES | H | Frozen PRD + L2 + task pack | script bundling pipeline | runtime never compiles TypeScript | High | G7 on Node | DONE |
| T-008 Remote Tool HTTP/JSON binding | T-001 | YES | M | Frozen PRD + L2 + task pack | HTTP/JSON transport binding contract | compiled package contains logical binding only | High | G8 Remote Tool CJ | DONE |
| T-009 durable effect journal + Tool recovery semantics | T-001 | YES | H | Frozen PRD + L2 + task pack | effectId derivation | Tool result commits before dependent state transition | High | G9/G10 | DONE |
| T-010 persistent Workflow Instance engine + per-instance serialized lane | T-001 | YES | H | Frozen PRD + L2 + task pack | WorkflowAddress resolver | same instance continues after runtime restart | High | G3 instance subset | DONE |
| T-011 durable mailbox acceptance + ACK/dedup/ordering | T-001 | YES | H | Frozen PRD + L2 + task pack | message validation service | ACK only after durable store acceptance | High | G12/G13/G14/G15/G16/G19/G21 acceptance-level tests | DONE |
| T-012 workflow-to-workflow journaled Domain Message effect | T-011 | YES | H | Frozen PRD + L2 + task pack | SendDomainMessageEffect executor | crash after target acceptance does not duplicate target transition | High | G20 | DONE |
| T-013 poison-message recovery + terminal disposition closure | T-009, T-010, T-011 | YES | H | Frozen PRD + L2 + task pack | recovery_required transition | later messages never pass unresolved failed message | High | G17/G18 | DONE |
| T-014 Query + multi-workflow Projection + authoritative snapshot boundary | T-001 | YES | H | Frozen PRD + L2 + task pack | bounded DomainQuery dispatcher | Query is read-only | High | G22 query subset | DONE |
| T-015 Subscription + coalescing + business invalidation | T-001 | YES | M | Frozen PRD + L2 + task pack | portable listener registry | no durable subscriber log | High | G22/G23 | DONE |
| T-016 portable Runtime assembly + public v0.2 API | T-002, T-003, T-004, T-005, T-006, T-007, T-008, T-009, T-010, T-011, T-012, T-013, T-014, T-015 | NO | H | Frozen PRD + L2 + task pack | createDomainRuntime portable assembly | Runtime startup uses compiled package + resources only | High | G3/G4/G11 smoke | DONE |
| T-017 shared deterministic runtime conformance suite | T-016 | YES | M | Frozen PRD + L2 + task pack | host harness contract | suite asserts only product-level observable behavior, not row IDs/timestamps/internal engine state | High | G30 suite self-test | DONE |
| T-018 Node host Critical Journeys + process-kill recovery | T-016, T-017 | YES | M | Frozen PRD + L2 + task pack | Node conformance runner | Node passes shared conformance | High | G3/G6-G20 relevant Node gates | DONE |
| T-019 Expo Android/Hermes conformance + restart Critical Journeys | T-016, T-017 | YES | H | Frozen PRD + L2 + task pack | minimal Expo conformance app | real Hermes runtime executes without Node built-ins | High | G4/G30 + PRD AC-42 | DONE |
| T-020 v0.1 expr → Expression Domain Tool migration equivalence | T-016 | YES | M | Frozen PRD + L2 + task pack | legacy expr translation | non-trivial branch/output scenario matches frozen equivalence definition | High | G31 / AC-43 | DONE |
| T-021 v0.1 script → Script Domain Tool migration equivalence | T-016 | YES | M | Frozen PRD + L2 + task pack | legacy script translation | observable outputs/transitions match | High | G32 / AC-44 | DONE |
| T-022 package upgrade + pin retention + cross-version compatibility validation | T-016 | YES | H | Frozen PRD + L2 + task pack | package A/B fixtures | old instance stays on A while new instance uses B | High | G21/G27/G28/G29 | DONE |
| T-023 SDK docs + v0.1→v0.2 migration + host integration guides | T-016 | YES | M | Frozen PRD + L2 + task pack | compiler usage | examples use compiled package at startup, never Raw Package root | Low | docs review | DONE |
| T-024 v0.2 visible closure + gate matrix + Hidden Validation handoff | T-018, T-019, T-020, T-021, T-022, T-023 | NO | H | Frozen PRD + L2 + task pack | gate evidence matrix | every required gate has PASS/BLOCKED with evidence identity | High | G1-G34 reconciliation | DONE |

Status values: `TODO / DOING / BLOCKED / DONE / DEFERRED / NOT_APPLICABLE`.

## Dependency Shape

```text
T-001  Contract + workspace foundation
  │
  ├────────────── Parallel Core Wave ──────────────────────────────┐
  │   T-002 Compiler                                               │
  │   T-003 Node RuntimeStore                                      │
  │   T-004 Expo RuntimeStore                                      │
  │   T-005 Package Registry/Pinning                               │
  │   T-006 Expression Tool                                        │
  │   T-007 Script Tool bindings                                   │
  │   T-008 Remote Tool                                            │
  │   T-009 Effect Journal                                         │
  │   T-010 Instance Engine                                        │
  │   T-011 Message Acceptance                                     │
  │   T-014 Query/Projection                                       │
  │   T-015 Subscription                                           │
  │                                                                │
  │        T-011 ───────────────→ T-012 Workflow→Workflow send     │
  │        T-009 + T-010 + T-011 → T-013 Recovery/Terminal        │
  └───────────────────────────────┬────────────────────────────────┘
                                  ▼
                            T-016 Runtime Assembly
                                  │
                                  ├──────── Parallel Validation ────────┐
                                  │  T-017 Conformance Suite            │
                                  │      ├→ T-018 Node CJ               │
                                  │      └→ T-019 Expo/Hermes CJ        │
                                  │  T-020 v0.1 Expr Migration          │
                                  │  T-021 v0.1 Script Migration        │
                                  │  T-022 Package Upgrade/Pinning      │
                                  │  T-023 Docs/Migration               │
                                  └──────────────────┬───────────────────┘
                                                     ▼
                                                  T-024
                                            Visible Closure / HV handoff
```

## Parallel Execution Rule

A task marked `Parallel=YES` may start in a separate conversation only when every declared dependency is already merged into `v0.2`.

For the large post-T-001 wave, branches SHOULD all fork from the same dependency-complete `v0.2` checkpoint. Their task packs deliberately assign mostly disjoint write sets. Agents MUST NOT opportunistically edit central barrels/root configuration; T-016 owns final assembly/shared exports unless the task pack explicitly says otherwise.

## Branch / Review Protocol

```text
version branch: v0.2
Task T-NNN branch: v0.2_tNNN
PR base: v0.2
one concern → one task branch → one PR
```

Before coding, each execution conversation must:

1. read Frozen PRD + Frozen L2 + its task pack;
2. verify dependency tasks are merged in `v0.2`;
3. record the exact base SHA;
4. create/reuse only its named task branch;
5. avoid write-set expansion; if architecture contradiction is discovered, report it instead of silently changing scope.

## L3 Rule

Task packs marked `L3: REQUIRED` embed a task-specific L3 reference section in the required evidence order:

```text
Tests
→ Contract / Interface
→ Core Implementation
→ Failure Handling
→ Reference
```

No separate research round is needed unless implementation evidence contradicts the frozen L2 assumptions.

## Release Boundary

T-001..T-023 implementation/validation completion does not equal release PASS. T-024 reconciles the exact candidate against PRD G1–G34 and AC1–AC45, then hands off owner-held Hidden Validation. Only the release authority may mark v0.2 READY/taggable.
