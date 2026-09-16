# DomainHarness v0.1 — L2 Architecture Evidence

**Project:** DomainHarness  
**Product:** Domain Harness Runtime  
**Target Version:** v0.1  
**Status:** **FROZEN**  
**Date:** 2026-09-17  
**Standard:** `kaicreator-mm/ai-development-standard` v2.0.0  
**Standard Revision:** `0446f04583f6cf464c835f26e2f657c8b703cb4e`  
**Frozen PRD Input SHA-256:** `4f19317dc46ae1eb888ff99bd4f50a21246483895fab16086341d0222a60e440`  
**Architecture Contradiction:** **NONE FOUND**

> This document starts from the frozen v0.1 PRD. It does not reopen product scope or frozen technology choices. Decisions below only make the frozen product contract implementable, recoverable and testable.

---

## 1. Architecture Drivers

### AD-01 — Embedded runtime, not a service platform

DomainHarness v0.1 is an embedded TypeScript SDK/runtime. There is no server, distributed scheduler, generic admin product, multi-process execution model or storage abstraction.

### AD-02 — Durable recovery without exactly-once claims

The runtime must survive process termination using:

```text
at-least-once execution
+
step-journal deduplication
```

Completed steps must not rerun. Interrupted non-idempotent Tools must never be replayed automatically.

### AD-03 — XState must remain private

XState v5 is required internally, but XState types/configuration/snapshots must not enter public SDK contracts, Harness assets, Tool contracts or domain code.

### AD-04 — Side-effect recovery is more authoritative than machine snapshot recovery

A state-machine snapshot cannot prove whether an external side effect happened before a crash. The Step Journal therefore owns replay/dedup decisions for executable steps.

### AD-05 — Child Workflow is sequential but independently recoverable

The parent sees a Child Workflow as one logical Step. Internally, the child has its own `workflowInstanceId`, visits and journal entries and must resume without replaying already completed child steps.

### AD-06 — Deterministic routing must stay outside LLM authority

JSONata / Script / Tool / Skill results may influence routing only through validated output and Runtime-controlled ordered route evaluation. XState consumes only the precomputed route decision.

### AD-07 — SQLite is the single persistence boundary

v0.1 uses one SQLite file actively driven by one DomainHarness process. Run lifecycle state and journal state must be transactionally consistent.

### AD-08 — Runtime remains domain-agnostic

No TaskDAG semantics, trade semantics, knowledge promotion semantics, creative-quality semantics or other domain authority may enter Runtime contracts.

---

## 2. Current-state Findings

The GitHub repository was empty when Stage 2 started. There is therefore no legacy code migration constraint and no existing implementation to preserve.

This is a greenfield implementation constrained by the frozen PRD and the pinned development standard. The architecture should minimize irreversible internal coupling while keeping public v0.1 contracts small.

No architecture contradiction was found between the frozen product scope and the required technology baseline.

---

## 3. External Evidence

### 3.1 XState v5 persistence

Official XState v5 persistence documentation states that actors can be restored from persisted snapshots, that deep persistence restores invoked/spawned actors recursively, and that **invocations are restarted on restoration**.

Evidence:

- https://stately.ai/docs/persistence
- https://stately.ai/docs/invoke
- https://stately.ai/docs/actors

Implication for DomainHarness:

> Tool / Skill / Script / Child Workflow execution MUST NOT depend on XState invocation restart semantics for durable recovery.

If a non-idempotent Tool were represented as an XState invocation and the process crashed after the side effect but before durable completion, restoration could restart that invocation, violating the frozen PRD recovery rule.

### 3.2 SQLite WAL + FULL durability

SQLite documents that WAL mode supports concurrent readers with a serialized writer, and that `synchronous=FULL` in WAL mode provides ACID durability across power loss. WAL is same-host oriented, which is compatible with the frozen single-process/single-host scope.

Evidence:

- https://www.sqlite.org/wal.html
- https://sqlite.org/pragma.html
- https://www.sqlite.org/isolation.html
- https://www.sqlite.org/transactional.html

Implication:

```text
journal_mode=WAL
synchronous=FULL
busy_timeout=<configured>
```

is consistent with the frozen reliability profile.

### 3.3 better-sqlite3 transaction model

`better-sqlite3` exposes synchronous database operations and transaction helpers. Short synchronous metadata transactions are suitable for this embedded single-process runtime and avoid introducing an additional asynchronous storage scheduler.

Evidence:

- https://github.com/WiseLibs/better-sqlite3
- https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md

### 3.4 worker_threads isolation limits

Node Worker Threads support termination and V8 resource limits. Node documentation also makes clear that `resourceLimits` constrain the Worker JS engine but are not a complete hostile-code sandbox.

Evidence:

- https://nodejs.org/api/worker_threads.html

Implication:

- Script Worker timeout/cancel can be enforced with `worker.terminate()`.
- `env: {}` prevents inheriting Host credentials through environment variables.
- Worker memory/resource limits are defense-in-depth, not a security sandbox.
- The frozen PRD statement that Scripts are trusted deterministic extensions remains necessary.

### 3.5 JSONata embedding and deterministic time

JSONata provides compiled expressions, evaluation bindings and function registration. `$now()` / `$millis()` otherwise use evaluation time. `$eval()` exists and can dynamically parse/evaluate expressions.

Evidence:

- https://docs.jsonata.org/embedding-extending
- https://docs.jsonata.org/date-time-functions
- https://docs.jsonata.org/string-functions

Implication:

- `$eval` must be rejected by static validation.
- Runtime-owned evaluation bindings must supply the deterministic clock contract for `$now` / `$millis`.
- Contract tests MUST prove the selected JSONata 2.x integration shadows/controls these functions exactly as intended before implementation is considered complete.

### 3.6 Ajv Draft 2020-12

Ajv supports JSON Schema Draft 2020-12 through its 2020-specific export and provides strict-mode checks for ambiguous/ignored schema constructs.

Evidence:

- https://ajv.js.org/
- https://ajv.js.org/json-schema
- https://ajv.js.org/strict-mode

Decision:

Use the Draft 2020-12 Ajv implementation and compile all portable domain schemas at Harness load time.

---

## 4. Candidate Patterns and Decision Matrix

| Concern | Candidate | Decision | Reason |
|---|---|---|---|
| Durable workflow execution | XState invocation + persisted deep snapshot | REJECT | Restored invocations restart; unsafe for non-idempotent side effects. |
| Durable workflow execution | XState control-flow machine + Runtime Runner + Step Journal | **ADOPT** | Preserves XState requirement while making replay authority explicit. |
| Runtime engine | Custom state-machine engine | REJECT | Contradicts frozen XState v5 baseline and increases custom engine scope. |
| Persistence authority | Raw XState snapshot as durable truth | REJECT | Snapshot cannot prove external side-effect completion. |
| Persistence authority | Portable Runtime control state + Step Journal | **ADOPT** | Keeps XState private and supports controlled recovery. |
| Child workflow | XState nested durable actor | REJECT for v0.1 persistence | Couples recovery to XState child actor invocation semantics. |
| Child workflow | Runner-managed workflow frame stack | **ADOPT** | Keeps parent logical Step boundary and child journal identity explicit. |
| Expression execution | Main-thread JSONata only | REJECT | Cannot enforce hard CPU timeout for pathological deterministic expressions. |
| Expression execution | Internal Expression Worker with termination/resource limits | **ADOPT** | Satisfies expression resource protection without adding a new language. |
| Script execution | VM-style hostile-code sandbox | REJECT | Explicitly outside v0.1 product scope. |
| Script execution | Trusted Worker per invocation | **ADOPT** | Matches frozen Script contract. |
| Storage | ORM/storage abstraction | REJECT | Explicitly excluded from v0.1. |
| Storage | Direct better-sqlite3 store | **ADOPT** | Minimal, explicit transaction model. |

---

## 5. Recommended Architecture

```text
Host Domain Product
        │
        │ createDomainHarness(...)
        ▼
┌───────────────────────────────────────────────────────┐
│ DomainHarness                                         │
│                                                       │
│  Loader                                               │
│   ├─ YAML + Zod                                       │
│   ├─ Skill/Resource Loader                            │
│   ├─ Ajv 2020-12 Schema Registry                      │
│   ├─ JSONata static compile/inspection                │
│   └─ Definition Hash Builder                          │
│                                                       │
│  Compiler                                             │
│   └─ Harness AST → private XState v5 control machine  │
│                                                       │
│  Runner / RunCoordinator                              │
│   ├─ per-Run serialized lifecycle mutations           │
│   ├─ Workflow Frame Stack                             │
│   ├─ Route Evaluator                                  │
│   ├─ cancellation / timeout                           │
│   └─ recovery reconciliation                          │
│                                                       │
│  Step Executor                                        │
│   ├─ skill    → AIOperationPort                       │
│   ├─ tool     → Host Tool Registry                    │
│   ├─ script   → Script Worker                         │
│   ├─ expr     → Expression Worker                     │
│   └─ workflow → Child Workflow Frame                  │
│                                                       │
│  SQLite Store                                         │
│   ├─ runs                                             │
│   └─ steps                                            │
└───────────────────────────────────────────────────────┘
```

### 5.1 XState role

XState is a **control-flow reducer**, not the durable side-effect executor.

The compiler emits private XState states and private route events. JSONata is never evaluated inside an XState Guard.

Conceptual sequence:

```text
current state
→ Runner evaluates invoke.input
→ Step Journal reconciliation
→ Step execution / persisted reuse
→ output validation
→ ordered route evaluation
→ route index selected
→ send private route event to XState
→ persist new Runtime control state
```

The private event may conceptually identify:

```text
source state
route class: done | error | external event
route index
```

The actual internal event encoding is not public contract.

### 5.2 Persisted control state

v0.1 MUST NOT persist raw XState snapshots as the canonical recovery contract.

`runs` stores a Runtime-owned, JSON-serializable control state. Because v0.1 execution is sequential, the active execution shape is a stack of workflow frames:

```ts
interface RuntimeControlState {
  schemaVersion: 1;
  frames: WorkflowFrame[];
}

interface WorkflowFrame {
  workflowId: string;
  workflowInstanceId: string;
  stateId: string;
  visits: Record<string, number>;
  lastDecisionAt: string;
}
```

XState actors are reconstructed internally from the compiled machine plus the current flat state id. No public or domain code sees this reconstruction.

`executionEngineMajor` remains persisted and must match on resume because compiled control semantics are engine-major-bound even though the raw engine snapshot is not the persistence contract.

### 5.3 Step Journal is replay authority

For a Step identity:

```text
(runId, workflowInstanceId, stateId, visit)
```

recovery rules are exactly the frozen PRD rules:

- `completed` → reuse persisted normalized output;
- started Expr / Script / Skill / Tool(effect=none) → may rerun;
- started idempotent Tool → rerun with same idempotency key;
- started non-idempotent Tool → do not rerun; materialize `interrupted` and follow error routing.

XState control state never overrides a completed journal record.

### 5.4 Recovery reconciliation invariant

A crash can occur after Step completion is known to the external system but before the Runtime stores completion. Exactly-once is therefore not claimed.

A crash can also occur after `steps.completed` commits but before the next control state commits. On resume:

```text
journal says completed
+
control state still points at source state
→ reuse output
→ recompute deterministic route using persisted evaluation time
→ advance XState control state
→ persist control state
```

No side effect reruns in this case.

---

## 6. SQLite Logical Schema and Transaction Boundaries

The frozen two-table logical model is retained.

### 6.1 `runs`

Minimum internal columns:

```text
run_id                   TEXT PRIMARY KEY
harness_id               TEXT NOT NULL
root_workflow_id         TEXT NOT NULL
status                   TEXT NOT NULL
input_json               TEXT NOT NULL
output_json              TEXT NULL
error_json               TEXT NULL
definition_hash          TEXT NOT NULL
execution_engine_major   INTEGER NOT NULL
control_state_json       TEXT NOT NULL
created_at               TEXT NOT NULL
updated_at               TEXT NOT NULL
```

### 6.2 `steps`

Minimum internal columns:

```text
run_id                   TEXT NOT NULL
workflow_instance_id     TEXT NOT NULL
state_id                 TEXT NOT NULL
visit                    INTEGER NOT NULL
kind                     TEXT NOT NULL
status                   TEXT NOT NULL
attempt                   INTEGER NOT NULL
started_at               TEXT NOT NULL
completed_at             TEXT NULL
input_json               TEXT NULL
output_json              TEXT NULL
error_json               TEXT NULL
idempotency_key          TEXT NOT NULL
PRIMARY KEY (run_id, workflow_instance_id, state_id, visit)
```

Waiting-event acceptance uses the same journal identity model so the accepted payload can be reconstructed as `steps.<waitingStateId>`.

### 6.3 Transaction rules

Never hold a SQLite transaction open while waiting for Tool / AI / Worker execution.

Required phases:

```text
TX A: create/observe started journal entry
COMMIT

external or worker execution

TX B: persist completed/error result + route/control transition
COMMIT
```

This intentional gap is why Tool effect classification exists.

`send()` performs validation/route selection before mutation, then atomically persists accepted event output plus the transition out of `waiting`. Rejected sends do not mutate the Run.

Cancellation/status mutations and step completion commits are serialized per Run and must re-check current Run status before committing.

---

## 7. Workflow Instance and Child Workflow Architecture

### 7.1 Identity

Root instance:

```text
root
```

Child instance format is frozen as:

```text
<parentWorkflowInstanceId>/<parentStateId>#<parentVisit>
```

This produces identities such as:

```text
root/creative#1
root/creative#2
root/creative#1/quality#1
```

### 7.2 Child execution algorithm

```text
parent workflow Step journal = started
→ push deterministic child WorkflowFrame
→ execute/resume child frames and child step journals
→ child successful final
→ evaluate child workflow.output
→ atomically mark parent workflow Step completed with child output
→ pop child frame
→ route parent
```

For child failure final:

```text
child reaches failed
→ parent logical Step error = child_workflow_error
→ parent on.error
```

A crash while inside the child restores the frame stack and resumes from child journal/control state. The child is not restarted from its beginning.

---

## 8. Deterministic Expression Architecture

### 8.1 ExpressionRuntime

All JSONata use goes through internal `ExpressionRuntime`.

Static load checks:

- parse/compile every expression;
- reject `$random`;
- reject `$eval`;
- reject unsupported extension functions;
- no external I/O registration.

### 8.2 Deterministic clock

Each logical Step visit has a persisted `started_at`. That timestamp is the evaluation clock for:

- `invoke.input`;
- `invoke.expr`;
- `on.done[].when`;
- `on.error[].when` for that Step result.

An accepted waiting event uses its persisted acceptance timestamp as the route-evaluation clock.

Workflow output uses the frame's persisted `lastDecisionAt`, falling back to Run creation time for an initially-final workflow.

Thus recovery re-evaluates `$now` / `$millis` against the same logical time instead of wall clock time.

### 8.3 Resource protection

Expression evaluation runs in an internal Worker boundary with:

- timeout;
- termination;
- V8 `resourceLimits`;
- JSON-only input/output;
- bounded serialized input/output sizes.

No Worker Pool is required for v0.1.

---

## 9. Script Worker Architecture

Each Script invocation receives a fresh Worker as required by the PRD.

Runtime enforcement:

```text
env: {}
JSON-only workerData / result
timeout
AbortSignal → terminate
resourceLimits
script path constrained inside Harness root
```

Security invariant:

> A Script Worker is not a hostile-code sandbox.

The no-external-I/O Script rule is a trusted-code contract enforced through repository review/tests and Runtime path/environment controls, not a claim that Worker Threads can prevent a malicious script from importing Node APIs.

---

## 10. Definition Lock

`definitionHash` uses SHA-256 over a canonical manifest of Runtime-relevant assets.

Include at least:

- normalized `harness.yaml` Runtime fields;
- normalized Workflow ASTs;
- derived Child Workflow dependency graph;
- normalized Skill sidecars;
- `SKILL.md` content for invokable Skills;
- declared Skill resources/assets used by the invocation package;
- normalized referenced JSON Schemas;
- referenced Script source bytes.

Tool implementation code is Host-owned and is not hashable by DomainHarness v0.1. Therefore a Host MUST preserve behaviorally compatible Tool implementations for active runs or drain/cancel those runs before deploying an incompatible Tool implementation.

Canonicalization should avoid hash churn from semantically irrelevant YAML/JSON key order while preserving meaningful text/script/resource bytes.

Resume rule:

```text
stored definitionHash != loaded definitionHash
OR
stored executionEngineMajor != current engine major
→ reject resume
```

No v0.1 definition migration path exists.

---

## 11. Public Runtime Contract

XState types are prohibited from every type below.

```ts
export type RunStatus =
  | "running"
  | "waiting"
  | "completed"
  | "failed"
  | "cancelled";

export interface StartRunRequest {
  workflowId: string;
  input: unknown;
}

export interface ExternalEvent {
  type: string;
  payload?: unknown;
}

export interface WaitOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface ListRunsQuery {
  status?: RunStatus;
  limit?: number;
}

export interface HarnessRun {
  runId: string;
  harnessId: string;
  workflowId: string;
  status: RunStatus;
  input: unknown;
  output?: unknown;
  error?: HarnessError;
  definitionHash: string;
  executionEngineMajor: number;
  createdAt: string;
  updatedAt: string;
}

export interface DomainHarness {
  start(request: StartRunRequest): Promise<HarnessRun>;
  send(runId: string, event: ExternalEvent): Promise<HarnessRun>;
  wait(runId: string, options?: WaitOptions): Promise<HarnessRun>;
  resume(runId: string): Promise<HarnessRun>;
  cancel(runId: string): Promise<HarnessRun>;
  get(runId: string): Promise<HarnessRun | null>;
  listRuns(query?: ListRunsQuery): Promise<HarnessRun[]>;
}
```

`start()` persists the new `running` Run before returning and schedules execution under the in-process RunCoordinator.

`resume()` is recovery for a persisted `running` Run that has no active in-process execution. It rejects terminal Runs and does not substitute for `send()` on a waiting Run.

`wait()` resolves when status becomes `waiting`, `completed`, `failed` or `cancelled`.

### 11.1 Tool idempotency key

The key is opaque to Host Tools but stable for one Step identity.

Required derivation input:

```text
runId
workflowInstanceId
stateId
visit
```

Use a versioned SHA-256 derivation so retries keep the same key while future formats remain distinguishable.

### 11.2 AIOperationPort boundary

The port is provider-neutral. DomainHarness passes Skill instructions/resources, validated input, output schema/profile metadata, AbortSignal and generic execution identity. Provider/model routing, critic/judge/consensus and provider retry/fallback remain owned by AI Runtime.

---

## 12. RunCoordinator and Concurrency

v0.1 has one process owner per SQLite file.

Use a per-Run coordinator/mutex for short lifecycle mutations, but do **not** hold the mutex for the entire duration of an external step.

Execution pattern:

```text
lock
→ inspect + journal start
→ unlock
→ await Step execution
→ lock
→ status re-check + commit result/route
→ unlock
```

Cancellation can therefore acquire the Run, mark it `cancelled`, signal the active AbortController, and cause any late Step result to be discarded rather than advancing a terminal Run.

Concurrent `send()` calls are serialized; after the first accepted event leaves the waiting state, subsequent sends observe non-waiting status and are rejected without mutation.

---

## 13. Error and Failure Model

The frozen minimum error codes are preserved:

```text
timeout
cancelled
interrupted
step_limit_exceeded
invalid_input
invalid_output
expression_error
script_error
tool_error
ai_error
child_workflow_error
```

No generic automatic domain retry engine is introduced.

Crash replay permitted by the PRD is a recovery mechanism, not a workflow retry policy.

An external waiting-event route expression failure rejects that `send()` and leaves the Run waiting because the event has not been accepted/persisted.

---

## 14. Limits

`maxSteps` is Run-wide.

A step count increments only when a new journal identity `(workflowInstanceId, stateId, visit)` is created. Recovery attempts for the same identity do not increment it.

The count includes:

- Skill / Tool / Script / Expr step visits;
- parent Child-Workflow logical Step visits;
- accepted waiting-state event visits;
- child internal Step visits.

The runtime also enforces:

- per-step timeout;
- expression timeout/resource limits;
- Script Worker limits;
- child-workflow depth limit;
- JSON serialization size limits at Worker/port boundaries.

---

## 15. Package / Repository Structure

Implementation should use a minimal monorepo-compatible layout without inventing extra products:

```text
domain-harness/
├── .dev-standard/
├── docs/
│   ├── product/
│   ├── architecture/
│   ├── implementation/
│   └── validation/
├── packages/
│   └── domain-harness/
│       ├── package.json       # @kaicreator/domain-harness
│       └── src/
│           ├── public/
│           ├── contracts/
│           ├── loader/
│           ├── compiler/
│           ├── runner/
│           ├── executor/
│           ├── expression/
│           ├── script/
│           └── persistence/
├── tests/
│   ├── integration/
│   ├── critical-journeys/
│   └── fixtures/
├── AGENTS.md
└── README.md
```

There is one publishable v0.1 package: `@kaicreator/domain-harness`. Contract SDK exports remain part of that package; no second package is introduced without evidence.

---

## 16. Key ADRs / Invariants

### ADR-001 — XState is control flow, not durable effect execution

**Status:** Accepted  
**Decision:** XState v5 compiles/executes workflow state transitions, while Runner + Step Journal own actual Step execution and recovery.  
**Alternative rejected:** representing durable Steps directly as XState invocations.  
**Consequence:** more Runtime orchestration code, but correct non-idempotent recovery and cleaner engine isolation.

### ADR-002 — Runtime-owned control state, not raw XState snapshot contract

**Status:** Accepted  
**Decision:** Persist portable workflow frame state in `runs.control_state_json`; reconstruct private XState actors.  
**Consequence:** future XState migration surface is smaller; Step Journal remains replay authority.

### ADR-003 — Two-table SQLite journal model

**Status:** Accepted  
**Decision:** Keep `runs` + `steps`; store sequential child frame stack inside Run control state rather than adding a new workflow-instance table in v0.1.  
**Escape hatch:** future parallel composition may justify a normalized workflow-instance/branch table in a later version.

### ADR-004 — Workers provide resource control, not untrusted-code security

**Status:** Accepted  
**Decision:** Script and JSONata evaluation use Worker termination/resource limits where preemption is required. Scripts remain trusted code.

### ADR-005 — Domain authority remains outside Runtime

**Status:** Accepted  
**Decision:** Runtime contracts contain generic workflow/state/step/error concepts only. No DAG/domain authority model is introduced.

---

## 17. Migration / Evolution Plan

The repository is greenfield, so v0.1 has no code migration phase.

Implementation order implied by the architecture:

```text
contracts + AST
→ loader/static validation/definition hash
→ SQLite store + migrations
→ XState compiler/control adapter
→ ExpressionRuntime
→ Step journal + Runner
→ Tool/Skill/Script executors
→ Child Workflow frames
→ waiting/send/cancel/recovery
→ public SDK
→ cross-domain validation
```

Future XState v6 migration remains the frozen drain-first policy:

```text
drain active v5 runs
→ compatibility spike
→ upgrade engine
→ create new runs on v6
```

Future static parallel composition may require extending control state from a stack into a deterministic branch tree and may justify additional normalized persistence, but v0.1 does not pre-design that feature.

Generic DAG execution remains evidence-gated and is not part of this architecture lock.

---

## 18. Architecture Risks / Open Questions

These are implementation risks, not product blockers:

1. **JSONata deterministic time binding must be contract-tested.** The selected JSONata 2.x package must demonstrably prevent access to uncontrolled wall-clock `$now/$millis` and must reject `$eval/$random` before v0.1 acceptance.
2. **Tool implementation drift is Host-owned.** DomainHarness can hash Tool contracts/assets, not arbitrary injected Host implementation code; active runs require compatible Tool deployments or drain/cancel policy.
3. **Worker resource limits are incomplete security controls.** They do not make first-party Scripts safe for hostile third-party code, which remains explicitly out of scope.
4. **WAL operational handling must keep `-wal` / `-shm` with the database during live-file backup/copy operations.** Backup/restore documentation must follow SQLite WAL rules.
5. **Cross-domain public contract pressure remains a release gate.** Tally-like plus City Atlas/non-software-domain validation must complete without adding domain-specific Runtime APIs.

None of these requires reopening the v0.1 product scope at L2.

---

## 19. L2 Freeze Result

```text
Frozen PRD
→ L2 Architecture Evidence
→ PASS
```

**Architecture contradiction:** `NONE`  
**Product scope change:** `NONE`  
**Frozen technology change:** `NONE`  
**Architecture status:** **FROZEN / READY FOR TASK DAG**

The next ai-development-standard Stage 2 artifact is the dependency-ordered Task DAG. L3 Implementation Evidence should be added only for high-risk tasks such as recovery reconciliation, deterministic JSONata time control, Worker execution limits and crash-recovery integration tests.
