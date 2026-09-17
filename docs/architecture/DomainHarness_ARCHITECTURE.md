# DomainHarness — Detailed System Architecture

> Language: English. Chinese companion: `DomainHarness_ARCHITECTURE.zh-CN.md`.
>
> Status: descriptive technical companion for the v0.1 implementation. The frozen Product authority remains `docs/product/DomainHarness_v0.1_PRD_FROZEN.md`; frozen architecture decisions remain in `DomainHarness_v0.1_L2_ARCHITECTURE_EVIDENCE.md`. This document reorganizes those contracts for implementers and downstream integrators and does not create new Runtime primitives or reopen product scope.

## 1. Architectural purpose

DomainHarness is an embedded TypeScript/Node.js runtime and contract SDK for executing structured domain workflows composed of Skills, Tools, Expressions, Scripts and Child Workflows.

Its architectural job is narrow:

> Execute domain-owned workflow definitions durably, deterministically and recoverably without becoming the owner of domain truth.

The host product remains authoritative for domain/business state, external systems, credentials, UI, administration, provider/model strategy and domain-specific rules. DomainHarness owns generic execution mechanics only.

The core design separates four concerns that must never collapse into one another:

```text
Domain authority          → host/domain project
Workflow control          → private XState control machine
Executable Step authority → Runner + Step Journal
Durable recovery truth    → Runtime control state + SQLite journal
```

This separation is the most important architecture invariant in v0.1.

## 2. System context

```text
┌──────────────────────────────────────────────────────────────┐
│ Domain Product                                               │
│                                                              │
│ Domain Data / Domain Assets                                  │
│ Domain DB / business authority                               │
│ User UI / Admin UI                                           │
│ AI Runtime / provider strategy                               │
│ Host Tools / credentials / external clients                  │
└───────────────┬───────────────────────┬──────────────────────┘
                │ createDomainHarness() │ Tool / AI ports
                ▼                       ▼
┌──────────────────────────────────────────────────────────────┐
│ DomainHarness                                                │
│                                                              │
│ Definition plane                                             │
│   Loader → Zod/Ajv/JSONata checks → Harness AST → hash       │
│                                                              │
│ Control plane                                                │
│   Compiler → private XState v5 machine                       │
│                                                              │
│ Execution plane                                              │
│   RunLifecycle / RunCoordinator / StepDispatcher             │
│                                                              │
│ Durability plane                                             │
│   SQLite Store → runs + steps + migrations                   │
│                                                              │
│ Isolation boundaries                                        │
│   Expression Worker / Script Worker                          │
└──────────────────────────────────────────────────────────────┘
```

DomainHarness is embedded in the host process. v0.1 is not a server, distributed scheduler, generic BPM platform, AI gateway, storage abstraction, domain database or reasoning engine.

## 3. Source-module map

The implementation is organized by architectural responsibility:

```text
packages/domain-harness/src/
├─ loader/       definition loading, schema/static validation, hashing
├─ compiler/     Harness AST → private XState control machine
├─ runner/       durable workflow/Step driving and reconciliation
├─ execution/    Step dispatch, Tool/AI execution integration
├─ expression/   JSONata Worker execution and deterministic clock
├─ script/       trusted Script Worker execution
├─ persistence/  SQLite store, migrations, transactions, journal
├─ recovery/     definition/engine compatibility and crash resume
├─ contracts/    public-neutral contracts and error/json types
├─ public/       public lifecycle/facade behavior
├─ create-domain-harness.ts
└─ index.ts      public package-root exports only
```

These directories are implementation boundaries, not public import paths. Consumers import only from `@kaicreator/domain-harness`.

## 4. Five architectural planes

### 4.1 Definition plane

The definition plane turns versioned files into an executable, validated, definition-locked model.

Pipeline:

```text
Harness filesystem
→ canonical root resolution
→ harness.yaml / workflow YAML / Skill sidecars
→ Zod structural validation
→ JSON Schema compilation with Ajv 2020-12
→ JSONata parse/static restrictions
→ cross-reference/static graph validation
→ Harness AST
→ Runtime-relevant asset canonicalization
→ definitionHash
```

Important properties:

- referenced assets must remain inside the canonical Harness root;
- absolute path escape and symlink/junction escape are rejected;
- referenced Script source is loaded/frozen as definition content;
- unknown schema versions fail loading;
- invalid Harness definitions fail before SQLite creation/opening becomes a side effect of startup;
- Tool implementations are host-owned and are therefore not part of `definitionHash`.

The Loader is deliberately strict because invalid execution graphs should fail at deployment/startup time, not halfway through a durable Run.

### 4.2 Control plane

The compiler converts the validated Workflow AST into a private XState v5 machine.

XState is used as a **control-flow reducer** only. It does not own durable Step execution, replay authority, external side effects or the persistence contract.

Conceptual control cycle:

```text
current workflow state
→ Runtime obtains/executes Step result
→ Runtime evaluates ordered routes
→ Runtime selects one route index
→ private route event sent to XState
→ XState reduces to next state
→ Runtime persists portable control state
```

JSONata is not evaluated inside XState guards. Route decisions are precomputed by the Runtime. This keeps LLM output and engine-specific guard semantics away from workflow authority.

No XState type, machine config or persisted actor snapshot is exposed through public APIs or domain assets.

### 4.3 Execution plane

The execution plane owns the public lifecycle and logical Step driving.

It coordinates:

- `start`;
- `send`;
- `wait`;
- `resume`;
- `cancel`;
- `get`;
- `listRuns`;
- per-Run serialization;
- Step journal reconciliation;
- Step dispatch;
- timeout/cancellation propagation;
- ordered route evaluation;
- Child Workflow frame management.

A workflow state has at most one executable invocation. The five Step kinds are:

```text
skill    → AIOperationPort
工具/tool → Host Tool Registry
script   → fresh Script Worker
expr     → Expression Worker
workflow → Child Workflow frame
```

A non-final state with no invocation is a waiting state and may accept declared external events.

### 4.4 Durability plane

SQLite is the only persistence implementation in v0.1. There is no ORM and no storage-provider abstraction.

Logical durable authorities:

- `runs`: Run status, input/output/error, definition/engine lock and portable control/frame state;
- `steps`: logical Step identity, attempts, input/output/error, timing and idempotency context.

Required SQLite profile:

```text
journal_mode = WAL
synchronous = FULL
busy_timeout = configured Runtime value
PRAGMA user_version = migration version
```

The correctness model is one DomainHarness process actively driving one SQLite file. Multi-process/distributed writers are outside v0.1.

### 4.5 Integration plane

DomainHarness interacts with the outside world only through explicit host boundaries:

```text
Skill → AIOperationPort → AI Runtime
Tool  → HarnessTool      → host-owned external system/client
```

The AI Runtime owns provider/model selection, strong/weak model strategy, retry/fallback, critic/judge/consensus, cost and latency policy.

Host Tools own credentials, network clients, domain services and external side effects. DomainHarness supplies execution identity and effect/recovery semantics; it does not become a secret store or integration platform.

## 5. Startup sequence

`createDomainHarness()` follows an intentional order:

```text
1. Resolve and validate Harness root
2. Load manifest/workflows/Skills/Scripts/schemas/resources
3. Build and statically validate Harness AST
4. Build definitionHash
5. Validate host Tool registrations required by the definition
6. Compile private workflow machines/control metadata
7. Open/migrate/configure SQLite
8. Construct Runner/lifecycle/recovery components
9. Return public DomainHarness facade
```

The critical invariant is that bad domain definitions fail before persistence setup is allowed to hide the actual configuration error.

## 6. Run lifecycle architecture

Public Run status is exactly:

```text
running | waiting | completed | failed | cancelled
```

A Run is created by:

```ts
start({ workflowId, input })
```

The Run records:

- `runId`;
- Harness/workflow identity;
- input;
- current status;
- output/error when terminal;
- `definitionHash`;
- `executionEngineMajor`;
- timestamps;
- internal portable control/frame state.

`wait()` observes progress until waiting or terminal; it is not an event channel. `send()` is the only public path for a declared external event. `resume()` continues persisted `running` work after interruption; a waiting Run must be advanced through `send()` rather than by pretending a wait is executable work.

## 7. Logical Step identity

The durable Step identity is:

```text
(runId, workflowInstanceId, stateId, visit)
```

This identity is more important than a process-level invocation object. It allows the Runtime to ask after a crash:

> Has this logical Step already completed, is it safe to replay, or must it be interrupted?

The same identity supplies stable idempotency context for idempotent Tools.

`visit` distinguishes repeated visits to the same state. `workflowInstanceId` distinguishes root and nested Child Workflow executions.

## 8. Step transaction model

DomainHarness never holds a SQLite transaction open across AI, Tool or Worker execution.

The durable pattern is:

```text
TX A
  create/observe started Step journal record
COMMIT

execute Tool / AI / Script / Expression outside transaction

TX B
  persist Step terminal result
  persist compatible Run/control transition
COMMIT
```

This gap is intentional and explains why Tool effect classification is required. A database transaction cannot provide exactly-once semantics for an external system.

The Runtime therefore claims **at-least-once execution plus journal deduplication**, not exactly-once execution.

## 9. Recovery authority and replay matrix

Step Journal state wins over reconstructed control flow.

Recovery behavior:

| persisted Step state | kind/effect | recovery action |
|---|---|---|
| completed | any | reuse normalized output; never execute again |
| started | expr | may rerun |
| started | script | may rerun |
| started | skill | may rerun |
| started | tool / `effect:none` | may rerun |
| started | tool / `effect:idempotent` | rerun with the same idempotency identity |
| started | tool / `effect:non-idempotent` | never auto-replay; materialize interrupted/error route |

A common crash boundary is:

```text
Step completion committed
control transition not yet committed
```

On resume, the Runtime reuses the terminal journal result, recomputes the deterministic route using persisted logical time, advances control state and persists the new position. The side effect is not repeated.

## 10. Portable control state

Raw XState actor snapshots are not the canonical persistence format.

The Runtime persists a portable frame stack conceptually equivalent to:

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

XState state is reconstructed internally from the compiled machine plus the portable state identity. `executionEngineMajor` is still persisted because compiled control semantics may change across engine-major boundaries.

## 11. Child Workflow architecture

Child Workflows are same-Harness, sequential composition.

Identity:

```text
root
root/<parentStateId>#<parentVisit>
root/<parentStateId>#<parentVisit>/<childStateId>#<visit>
```

Execution model:

```text
parent workflow Step = started
→ push deterministic child frame
→ execute/resume child frame(s)
→ child reaches successful final
→ evaluate child workflow.output
→ mark parent workflow Step completed with that output
→ pop child frame
→ route parent
```

The child owns its own frame-local `input`, `steps` and `run.visits`; it cannot directly read parent `steps`. Parent data must be passed explicitly through `invoke.input`.

A child final state named `failed` becomes `child_workflow_error` at the parent Step boundary. Other final states are successful Runtime outcomes even if their domain meaning is negative (for example `rejected`).

Recursion and dependency cycles are rejected at load time.

## 12. Deterministic expression architecture

All JSONata execution goes through the internal ExpressionRuntime.

Rules:

- `$random` is forbidden;
- `$eval` is forbidden;
- external I/O functions are not registered;
- route predicates must return strict booleans;
- `$now()` / `$millis()` use persisted logical time rather than current wall clock;
- evaluation uses bounded JSON input/output and Worker timeout/resource limits.

Logical time is tied to the durable execution event:

- executable Step expressions use persisted `started_at`;
- waiting-event routing uses persisted event acceptance time;
- workflow output uses frame `lastDecisionAt`, with Run creation time fallback for initially-final workflows.

This allows replay/recovery to re-evaluate the same control decision without time drifting.

## 13. Script architecture

Script is a trusted deterministic extension, not a hostile-code sandbox.

v0.1 execution characteristics:

- source is loaded/frozen with the Harness definition;
- current executable contract is JavaScript ESM (for example `.mjs`); the Runtime does not transpile TypeScript Script assets at execution time;
- each invocation receives a fresh Worker;
- `env: {}` prevents normal environment-variable inheritance;
- JSON-only input/output boundary;
- timeout, `AbortSignal`, Worker termination and V8 resource limits;
- referenced Script path/content must remain within the canonical Harness root.

Scripts must not own external I/O by contract. External I/O belongs in Tools, where effect classification and recovery semantics are explicit.

## 14. Waiting/event architecture

A waiting state is durable workflow position, not an in-memory callback.

`send(runId, event)` performs:

```text
load Run
→ verify status == waiting
→ verify event is declared by current waiting state
→ validate optional event JSON Schema
→ evaluate event route deterministically
→ atomically persist accepted event output + control transition
```

Rejected events do not mutate persistence.

An accepted event payload becomes the waiting state output (`steps.<waitingStateId>`) in that workflow instance, allowing later expressions/workflow output to consume it like other Step results.

## 15. Concurrency and cancellation

v0.1 serializes lifecycle mutations per Run inside the owning process. This prevents two accepted sends, cancellation races or late Step commits from independently becoming authoritative.

Terminal fencing is required:

```text
Run becomes cancelled/failed/completed
→ late executor result must not overwrite terminal Run state
```

`cancel()` propagates cancellation to Tool/AI/Worker execution where the executor honors `AbortSignal`, then persists terminal `cancelled`. Executors that ignore or race cancellation are still fenced from committing a late successful result over the terminal Run.

## 16. Definition lock

`definitionHash` is SHA-256 over Runtime-relevant definition content, not deployment location.

It includes conceptually:

- normalized Runtime fields from `harness.yaml`;
- normalized Workflow ASTs;
- Child Workflow dependency graph;
- normalized Skill sidecars;
- invokable `SKILL.md` content;
- declared Skill resources/assets;
- referenced JSON Schemas;
- referenced Script source bytes.

It intentionally excludes absolute filesystem deployment paths and host Tool implementation code.

Continuation rule:

```text
stored definitionHash != loaded definitionHash
OR stored executionEngineMajor != current engine major
→ reject active continuation
```

v0.1 has no automatic active-run definition migration.

## 17. Trust and security model

DomainHarness provides correctness/isolation boundaries, not a general hostile-code security boundary.

Security responsibilities are split:

**Runtime provides**

- canonical Harness-root containment;
- schema/static validation;
- bounded Worker execution;
- environment-variable isolation for Script Workers;
- public-package export containment;
- deterministic replay rules;
- persistence fencing;
- no provider credentials in Runtime definition contracts.

**Host provides**

- trusted Script review;
- Tool credential storage;
- authentication/authorization;
- network policy;
- Tool implementation correctness;
- domain-level access control;
- safe AI Runtime/provider configuration.

A Worker Thread must never be described as a sandbox against malicious Script code.

## 18. Deployment topology

Supported v0.1 topology:

```text
one host process
  └─ one DomainHarness runtime instance (normal pattern)
       └─ one SQLite file actively driven by that process
```

Multiple Runtime instances against the same file, distributed scheduling, shared-network SQLite and active-active execution are outside the correctness contract.

A host should normally treat the Runtime as process-lifetime infrastructure rather than constructing one per HTTP request/job.

## 19. Domain authority boundary

DomainHarness may persist execution history and Workflow outputs, but that does not make those rows the authoritative business model.

Examples:

- Tally TaskDAG truth remains Tally-owned;
- Cairn knowledge promotion truth remains Cairn-owned;
- Formula creative/design truth remains Formula-owned;
- Forge trade-content truth remains Forge-owned;
- City Atlas canonical publishing truth remains City Atlas-owned.

When a workflow wants to change authoritative domain state, that change should normally occur through a domain Tool whose semantics, validation and credentials remain host-owned.

## 20. Extension strategy after v0.1

Confirmed future direction includes Static Parallel Composition, but it is not a v0.1 primitive.

Generic DAG execution remains evidence-gated. Domain-owned dependency/readiness logic should first be expressed through domain data + Script/Tool + Child Workflow (and future parallel composition) before introducing a Runtime DAG authority.

The architecture intentionally protects this future flexibility by keeping domain semantics out of the Runner and keeping the public SDK smaller than the internal engine.

## 21. Non-negotiable architecture invariants

1. XState never becomes public API or durable side-effect truth.
2. LLM output never directly owns workflow transition authority.
3. Completed journal records are never re-executed.
4. Started non-idempotent Tools are never auto-replayed after uncertain interruption.
5. SQLite transactions never remain open during external/AI/Worker execution.
6. Domain business authority stays outside DomainHarness.
7. Child Workflow scope is explicit and isolated.
8. Definition/engine mismatch rejects active continuation.
9. All referenced Harness assets remain inside the canonical Harness root.
10. Runtime behavior must remain provider-neutral and storage-fixed for v0.1.

## 22. Related documents

- Frozen Product authority: `docs/product/DomainHarness_v0.1_PRD_FROZEN.md`
- Frozen architecture evidence: `docs/architecture/DomainHarness_v0.1_L2_ARCHITECTURE_EVIDENCE.md`
- Integration model: `docs/architecture/DOMAINHARNESS_INTEGRATION_MODEL.md`
- Domain Data specification: `docs/domain-data/DOMAIN_DATA_SPEC.md`
- Harness technical specification: `docs/harness/HARNESS_TECHNICAL_SPEC.md`
- SDK contract: `docs/sdk/DomainHarness_v0.1_SDK_REFERENCE.md`
- Storage/recovery notes: `docs/operations/DomainHarness_v0.1_STORAGE_RECOVERY.md`
