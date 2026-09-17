# DomainHarness v0.2 — L2 Architecture Evidence

**Project:** DomainHarness  
**Formal Product Name:** DomainHarness Portable Interactive Domain Runtime  
**Target Version:** v0.2  
**Status:** **FROZEN / READY FOR TASK DAG**  
**Date:** 2026-09-18  
**Standard:** `kaicreator-mm/ai-development-standard` v2.0.0  
**Standard Revision:** `0446f04583f6cf464c835f26e2f657c8b703cb4e`  
**Frozen PRD:** `docs/product/DomainHarness_v0.2_PRD_FROZEN.md`  
**Frozen PRD SHA-256:** `e95534773b0879a7e4892ba995ca90928d6029730f0de1e70c2915aa56679d9b`  
**Repository Baseline:** `main@2a41b3401950a2550a063616a572a86f3b44e733`  
**Architecture Contradiction:** **NONE FOUND**

> This L2 starts from the frozen v0.2 R4 PRD and the shipped v0.1 baseline. It does not reopen product scope. Decisions below resolve only items explicitly deferred to L2 and preserve the frozen boundaries: portable Runtime Core, build-time compilation, persistent addressable Workflow Instances, durable Domain Messages, Domain Tool recovery semantics, Query/Subscription/Projection, package pinning, and non-authoritative business-data integration.

---

## 1. Architecture Drivers

### AD-01 — Runtime Core is portable TypeScript, not Node infrastructure

`@kaicreator/domain-harness` becomes the portable Runtime Core and public SDK. It SHALL NOT import Node built-ins and SHALL NOT require `better-sqlite3`, `node:worker_threads`, `node:fs`, `node:path`, or `node:crypto`.

Node remains a supported host through an explicit host-binding package.

### AD-02 — Compilation is a build concern; activation is a runtime concern

The runtime boundary is frozen as:

```text
Raw Domain Package + Target Host Profile
        ↓ build/CI
DomainHarness Compiler
        ↓
Target Compiled Domain Package
        ↓ app startup
Portable Runtime Core + Host Bindings + Runtime Resources
```

App startup SHALL NOT rediscover or compile the Raw Domain Package.

### AD-03 — Evolve v0.1 recovery semantics instead of replacing them

v0.1 already establishes the useful separation:

```text
private workflow control
+
durable effect/result journal
```

v0.2 retains that separation. XState v5 remains an internal control-flow reducer unless implementation evidence later proves a local incompatibility. Durable Tool/message facts, not an XState snapshot, remain replay authority.

### AD-04 — One Workflow Instance is one serialized mutation lane

State-changing Domain Messages are accepted into a durable per-instance mailbox and processed in target-sequence order. Different instances may run concurrently. There is no global runtime ordering.

### AD-05 — Accepted ACK and processed result are separate states

Durable acceptance is a storage transaction. Processing is later work. Public contracts must preserve the distinction so a caller can observe `accepted` even if the target later fails or terminates.

### AD-06 — Durable Tool result precedes dependent state transition

External effects can never be reconstructed safely from control state alone. A completed Tool result is committed first and then reused on recovery. Ambiguous non-idempotent execution enters `recovery_required` and is never blindly retried.

### AD-07 — Workflow-to-workflow messaging is a runtime effect, not a broker

Workflow A can durably send to Workflow B in the same logical Domain Runtime. The mechanism is journaled and deduplicated, but it does not introduce topics, partitions, consumer groups, cross-runtime routing, or a distributed transaction coordinator.

### AD-08 — Projection is deterministic derived state, not authority

Projection runs only over declared snapshots. It cannot access Runtime Resources, call Tools/Skills, or perform I/O. Business reads occur before projection through an application-owned snapshot port.

### AD-09 — Package pinning is explicit and fail-closed

Every instance is pinned to an immutable Target Compiled Domain Package identity. A new application build must retain every package module still referenced by recoverable instances, or runtime activation fails rather than silently reinterpreting state.

### AD-10 — Portability must be proven on a materially different host

The v0.2 non-Node reference host is **React Native / Expo on Hermes, Android profile**, using `expo-sqlite` and a non-Worker Script execution binding. This is materially different from Node in runtime engine, storage adapter, package loading, and Script execution mechanics.

---

## 2. Current-State Findings

### 2.1 v0.1 strengths to retain

The v0.1 implementation and frozen L2 already provide:

- private XState control-flow compilation;
- Runtime-owned portable control state rather than persisted raw XState snapshots;
- durable step journal as replay authority;
- two-phase external effect execution with no SQLite transaction held across external work;
- deterministic JSONata routing time;
- explicit Tool effect classification;
- crash reconciliation and non-idempotent interruption handling;
- a monorepo workspace and a stable public package name.

These mechanisms remain valid foundations for v0.2.

### 2.2 Node coupling that must move out of Runtime Core

Current v0.1 code has direct host dependencies:

- `create-domain-harness.ts` accepts a Raw Harness root and SQLite path, runs the Loader at application startup, and constructs `SqliteStore` directly;
- `persistence/sqlite-store.ts` imports `better-sqlite3` directly;
- `script/script-executor.ts` imports `node:fs/promises`, `node:path`, and `node:worker_threads`;
- `expression/expression-runtime.ts` imports `node:module`, `node:url`, and `node:worker_threads`;
- `loader/load-harness.ts` performs filesystem discovery/parsing at runtime.

These are v0.1 implementation choices, not v0.2 product constraints. They SHALL be moved into build tooling or host-binding packages.

### 2.3 Public API is Run-centric rather than Instance/Message-centric

The current API exposes `start/send/wait/resume/cancel/get/listRuns` around an opaque `runId`. v0.2 requires a stable business-facing Workflow Address, explicit durable message acceptance state, Query, Subscription, Projection, package pin identity, and recovery inspection. A new v0.2 public contract is therefore required.

### 2.4 v0.1 active state is not a migration blocker

The frozen PRD explicitly does not require active v0.1 runtime state to become an active v0.2 Workflow Instance. v0.2 may add new persistence tables and leave v0.1 `runs/steps` data intact for historical inspection/migration tooling.

---

## 3. External Architecture Evidence

Research date: 2026-09-18.

### 3.1 Per-entity serialized execution — Microsoft Orleans

Microsoft Orleans documents per-grain task schedulers that execute queued work one item at a time while different grains can execute concurrently. This validates the v0.2 direction of a keyed, per-Workflow-Instance serialized mutation lane rather than a global runtime lock.

Evidence:

- https://learn.microsoft.com/en-us/dotnet/orleans/implementation/scheduler
- https://learn.microsoft.com/en-us/dotnet/orleans/grains/external-tasks-and-grains

DomainHarness does **not** adopt Orleans clustering/actor distribution; only the local turn-serialization pattern is relevant.

### 3.2 Durable write messages vs read Queries — Temporal

Temporal documents asynchronous state-changing Signals, tracked Updates, and read-only Queries as distinct interaction contracts. It also separates accepted-vs-completed Update lifecycle and uses stable Workflow IDs for long-lived entity-style interaction.

Evidence:

- https://github.com/temporalio/documentation/blob/main/docs/encyclopedia/workflow-message-passing/workflow-message-passing.mdx
- https://github.com/temporalio/documentation/blob/main/docs/encyclopedia/workflow-message-passing/sending-messages.mdx
- https://github.com/temporalio/documentation/blob/main/docs/design-patterns/signal-with-start.mdx

Implication:

> DomainHarness should keep durable state-changing messages distinct from Query and keep acceptance distinct from processing completion.

DomainHarness still uses one common Durable Domain Message primitive and does not copy Temporal's distributed service architecture.

### 3.3 Version pinning precedent — Temporal Worker Versioning

Temporal's current Worker Versioning guidance uses workflow pinning so a running workflow stays on the deployment version where it started while new executions can use a newer version.

Evidence:

- https://github.com/temporalio/documentation/blob/main/docs/production-deployment/worker-deployments/worker-versioning/index.mdx
- https://github.com/temporalio/documentation/blob/main/docs/encyclopedia/workflow/workflow-definition.mdx

Implication:

> Retained DomainHarness instances should keep their package identity and must not silently reinterpret state under a replacement package.

### 3.4 SQLite write atomicity

SQLite documents `BEGIN IMMEDIATE` as acquiring a write transaction immediately and serializing writers. This maps cleanly to atomic operations such as message acceptance + target sequence assignment.

Evidence:

- https://www.sqlite.org/lang_transaction.html
- https://sqlite.org/isolation.html

The public RuntimeStore contract SHALL express logical atomic operations; it SHALL NOT expose SQL transaction syntax.

### 3.5 Expo SQLite provides a materially different storage binding

Expo SQLite persists databases across app restarts and exposes exclusive transaction APIs on Android/iOS/macOS/tvOS. Its documentation also warns that ordinary async transaction scopes can be interleaved, while `withExclusiveTransactionAsync()` scopes database work to the transaction object.

Evidence:

- https://docs.expo.dev/versions/v55.0.0/sdk/sqlite/

Implication:

> The Expo adapter can satisfy the same RuntimeStore atomic semantics using host-specific transaction mechanics rather than sharing the Node driver.

### 3.6 React Native / Expo is a real non-Node JavaScript host

React Native documents Hermes as the normal JavaScript engine and warns against relying on engine-specific behavior. Expo Metro documents that Node built-ins are special server/browser concerns and that the native `Worker` API is traditionally unavailable in React Native/Expo.

Evidence:

- https://reactnative.dev/docs/0.82/javascript-environment
- https://docs.expo.dev/versions/v54.0.0/config/metro/

Implications:

1. Runtime Core must avoid Node built-ins.
2. Script execution cannot assume `worker_threads` or Web Workers.
3. Script Tool source must be target-compiled/bundled before runtime.
4. Node and Expo may use different Script execution isolation mechanics while preserving contract-equivalent deterministic fixtures.

---

## 4. Candidate Patterns and Decision Matrix

| Concern | Candidate | Decision | Reason / trade-off |
|---|---|---|---|
| Package layout | Keep one package with conditional internals | REJECT | Easy to accidentally retain mandatory Node deps; harder to validate host boundaries independently. |
| Package layout | Portable core + compiler + Node host + Expo host | **ADOPT** | Clear ownership, parallel implementation, no Node dependency leakage, preserves `@kaicreator/domain-harness` as the main SDK. |
| Workflow engine | Replace XState with custom engine | REJECT | Unnecessary rewrite; v0.1 already validated private XState control semantics. |
| Workflow engine | Retain private XState reducer behind compiled IR | **ADOPT** | Incremental evolution; still portable because XState is not a Node runtime primitive. |
| Package activation | Raw YAML/filesystem Loader at startup | REJECT | Directly contradicts frozen runtime-loading requirement. |
| Package activation | Generated Target Compiled Package module | **ADOPT** | Static app import works for Node and Metro; no Raw Package discovery at startup. |
| Persistence API | Public SQL/driver abstraction | REJECT | Leaks implementation and makes core depend on driver transaction quirks. |
| Persistence API | Semantic RuntimeStore atomic operations | **ADOPT** | Node/Expo can implement different SQLite APIs with equivalent behavior. |
| Message ordering | Global event log/sequence | REJECT | Exceeds product scope and creates unnecessary global contention. |
| Message ordering | Per-instance mailbox sequence | **ADOPT** | Exactly matches frozen ordering semantics. |
| Workflow-to-workflow | Generic broker/outbox service | REJECT | Becomes distributed messaging infrastructure. |
| Workflow-to-workflow | Journaled Runtime Message Effect + target dedup | **ADOPT** | Crash-safe without distributed transactions; remains same-runtime only. |
| Script source | Compile TypeScript at app runtime | REJECT | Violates build/runtime separation and is unsuitable for Expo production runtime. |
| Script source | Build-time target bundle with host executor | **ADOPT** | Node can use Worker; Expo can execute a statically bundled module. |
| Projection execution | Arbitrary JS with Runtime Resources | REJECT | Cannot enforce the frozen no-I/O/no-Tool boundary. |
| Projection execution | JSONata projection over declared snapshot object | **ADOPT for v0.2** | Deterministic, portable, no external I/O registration, reuses expression policy. |
| Projection persistence | Generic materialized-view subsystem | REJECT | Explicit non-goal. |
| Projection persistence | Recompute + optional bounded cache | **ADOPT** | Keeps derived state reconstructable and avoids a second authoritative store. |
| Non-Node evidence | Browser-only host | REJECT | Does not prove required SQLite/mobile host binding and is a weaker portability test. |
| Non-Node evidence | Expo Android + Hermes + expo-sqlite | **ADOPT** | Materially different runtime and persistence/execution bindings. |
| Package retention | Runtime remote package distribution | REJECT | Not required and expands scope. |
| Package retention | Static PackageRegistry in app build containing all pinned package modules | **ADOPT** | Simple, fail-closed, compatible with Metro and product non-goals. |

---

## 5. Recommended Monorepo Architecture

```text
domain-harness/
├── packages/
│   ├── domain-harness/              # @kaicreator/domain-harness
│   │   └── portable Runtime Core + public contracts
│   ├── domain-harness-compiler/     # @kaicreator/domain-harness-compiler
│   │   └── Node/build-time Raw Package compiler
│   ├── domain-harness-node/         # @kaicreator/domain-harness-node
│   │   └── better-sqlite3 + Node Worker/host bindings
│   └── domain-harness-expo/         # @kaicreator/domain-harness-expo
│       └── expo-sqlite + Hermes/Expo bindings
├── tests/
│   ├── conformance/                 # same semantic suite for Node + Expo
│   ├── integration/
│   ├── migration/
│   └── critical-journeys/
├── examples/
│   └── expo-conformance/
└── docs/
```

Publishable package roles:

| Package | Runtime? | Node built-ins allowed? | Host-specific deps? | Responsibility |
|---|---:|---:|---:|---|
| `@kaicreator/domain-harness` | YES | **NO** | NO | contracts, compiled IR, instance/message runtime, Tool journal, Query/Projection/Subscription |
| `@kaicreator/domain-harness-compiler` | build only | YES | build tooling | Raw Package discovery, validation, capability resolution, target artifact generation, legacy translation |
| `@kaicreator/domain-harness-node` | YES | YES | `better-sqlite3`, worker threads | Node RuntimeStore, Script executor, hashing/package helpers |
| `@kaicreator/domain-harness-expo` | YES | NO Node built-ins | `expo-sqlite` and Expo peers | Expo RuntimeStore, Hermes-safe Script binding, package activation helpers |

Dependency rule:

```text
compiler ───────→ core contracts
node host ──────→ core
expo host ──────→ core
core ───────────X compiler/node/expo
```

`@kaicreator/domain-harness` remains the primary SDK name so migration does not require replacing the conceptual product package.

---

## 6. Target Compiled Domain Package

### 6.1 Physical form

v0.2 freezes the target artifact form as a **generated JavaScript/TypeScript module artifact with a canonical serializable manifest**.

Conceptually:

```ts
interface TargetCompiledDomainPackage {
  manifest: CompiledPackageManifest;
  bindings: TargetExecutableBindings;
}
```

The application imports the generated module as part of its normal Node or Metro build. The Runtime receives the imported object; it never scans the Raw Package directory.

### 6.2 Manifest minimum content

```text
formatVersion
runtimeContractMajor
executionEngineMajor
domainId
domainVersion
packageId
targetProfileId
requiredCapabilities
workflow IR + message contracts
Domain Tool contracts + binding descriptors
Skill contracts/resources metadata
Projection definitions + declared inputs/output schemas
schema/contract versions
binding content digests
compatibility metadata
```

Runtime Resources, endpoints, credentials, session values, database handles/paths and business data are forbidden from the manifest.

### 6.3 Package identity

`packageId` is:

```text
sha256(canonical identity material)
```

where identity material excludes `packageId` itself and includes semantic compiled data plus compiler-produced binding digests.

The compiler calculates the identity. Runtime activation recalculates/validates canonical manifest identity through the host's `crypto-hash-sha256@1` binding and verifies binding descriptors/digests match the manifest.

This is corruption/compatibility detection, **not** cryptographic distribution signing. Distribution signing remains outside mandatory v0.2 scope.

### 6.4 Static package registry and retention

Runtime activation receives a `PackageRegistry` containing the current package and any older target packages that remain pinned by recoverable instances.

Activation algorithm:

```text
load supplied Target Compiled Package modules
→ validate identity/format/runtime compatibility
→ read retained instance package pins from RuntimeStore
→ verify every pinned packageId is present
→ fail closed if any required package is absent
→ select default package only for new instances
```

The Runtime exposes pinned package identities so build/release tooling knows when an old module can be removed.

---

## 7. Host Capability Model

### 7.1 Frozen v0.2 capability identifiers

The standard v0.2 capability vocabulary is:

```text
sqlite-runtime-store@1
expression-jsonata@1
script-execution@1
http-transport@1
secure-random@1
crypto-hash-sha256@1
compiled-package-module@1
```

Future capabilities may use the same `<name>@<major>` form, but implementation tasks SHALL NOT invent capabilities merely to bypass a missing required capability.

### 7.2 Target Host Profile

Conceptual contract:

```ts
interface TargetHostProfile {
  id: string;
  capabilities: ReadonlySet<CapabilityId>;
  bindings: Readonly<Record<CapabilityId, string>>;
}
```

Raw packages declare semantic requirements. The compiler checks the set and selects target binding descriptors. Unsupported requirements fail compilation.

### 7.3 Runtime Resources

Runtime Resources are activation-time values/handles keyed by binding contract, for example:

- SQLite path/connection handle;
- HTTP endpoint/token/session;
- AI Runtime port;
- authoritative business snapshot reader;
- user/session identity.

They are not hashed into the Domain Package and SHALL NOT be persisted as domain truth by the SDK.

---

## 8. Public Workflow Identity and Lifecycle

### 8.1 Workflow Address

v0.2 freezes this public address shape:

```ts
interface WorkflowAddress {
  workflowId: string;
  instanceKey: string;
}
```

`instanceKey` is stable and domain/application visible. Storage MAY use an internal surrogate ID, but public callers target the stable address.

Every instance also records an application/domain `correlationId`. This keeps these concepts distinct:

```text
workflowId      → definition
instanceKey     → stable instance identity
correlationId   → business/domain correlation
```

Uniqueness is `(workflowId, instanceKey)` within one logical Domain Runtime.

### 8.2 Lifecycle enum

The v0.2 public lifecycle is:

```text
active
waiting
recovery_required
completed
failed
cancelled
terminated
```

Terminal statuses are `completed | failed | cancelled | terminated`.

New state-changing messages are rejected before durable acceptance when target status is terminal or `recovery_required`.

### 8.3 Instance revisions

Every committed Workflow Instance state transition increments a durable monotonically increasing `stateRevision`. Query and Projection use this revision as an observable source revision. Revision has meaning only within one instance; there is no global revision.

---

## 9. Durable Domain Message Contract

### 9.1 Public envelope

```ts
interface DomainMessage {
  messageId: string;
  target: WorkflowAddress;
  type: string;
  payload: JsonValue;
  correlationId?: string;
  causationId?: string;
  contractVersion?: string;
}
```

On acceptance the Runtime resolves/persists the target's pinned `packageId`, target sequence, effective correlation identity and contract context.

For workflow-emitted messages:

```text
correlationId = current message correlationId (unless domain explicitly starts a new correlation)
causationId   = current source messageId
```

### 9.2 Accepted ACK

```ts
interface MessageAcceptedAck {
  status: 'accepted' | 'duplicate';
  messageId: string;
  target: WorkflowAddress;
  targetSequence: number;
  packageId: string;
  acceptedAt: string;
}
```

A duplicate request with the same `(target, messageId)` returns the original durable acceptance identity and never allocates a new target sequence.

### 9.3 Durable disposition

Accepted-message disposition is:

```text
accepted
processing
processed
failed
abandoned
```

`abandoned` is the terminal disposition for an accepted message that never processed because its target became terminal. Query exposes this state.

Pre-acceptance rejection is returned as a rejection result/error and is **not** inserted as an accepted durable message.

---

## 10. RuntimeStore Contract and SQLite Logical Model

### 10.1 RuntimeStore is semantic, not SQL-shaped

The portable core depends on an async `RuntimeStore` interface whose methods correspond to atomic runtime facts. Implementations may be synchronous internally (Node) or async (Expo).

Required semantic operations include:

```text
open/create instance
read instance by WorkflowAddress
list retained instances / pinned packageIds
atomic accept-or-deduplicate message + allocate targetSequence
read next accepted message by sequence
mark message processing
commit instance state + processed message
persist processing failure + recovery_required
terminalize instance + abandon every accepted/unprocessed message
begin/complete/recover Tool invocation journal fact
query message disposition/history
recovery retry/reset transition
```

### 10.2 v0.2 logical tables

v0.2 adds a new schema family rather than reusing v0.1 active-state tables:

```text
dh_v2_instances
  internal_id PK
  workflow_id
  instance_key
  correlation_id
  package_id
  lifecycle
  state_revision
  workflow_state_json
  next_target_sequence
  timestamps...
  UNIQUE(workflow_id, instance_key)

dh_v2_messages
  target_internal_id
  target_sequence
  message_id
  type
  payload_json
  correlation_id
  causation_id
  contract_version
  target_package_id
  disposition
  error_json
  accepted_at / processing_at / resolved_at
  UNIQUE(target_internal_id, target_sequence)
  UNIQUE(target_internal_id, message_id)

dh_v2_effect_journal
  effect_id PK
  target_internal_id
  source_message_id
  workflow_step_identity...
  effect_kind
  effect_semantics
  status
  attempt
  input_json
  output_json
  error_json
  started_at / completed_at
```

Physical indexes and column encoding are adapter implementation details so long as conformance semantics are preserved.

v0.1 `runs/steps` tables are retained untouched; v0.2 does not load them as live instances.

### 10.3 Acceptance transaction

`acceptMessage()` is one atomic store operation:

```text
verify target still accepts new messages
verify expected target package pin still matches
check UNIQUE(target,messageId)
if duplicate → return original ACK
else increment next_target_sequence
insert message(disposition=accepted, sequence=N)
commit
return ACK
```

Node uses a write transaction (`BEGIN IMMEDIATE` semantics through the adapter). Expo uses `withExclusiveTransactionAsync()` or an equivalent adapter-level exclusive transaction.

### 10.4 No external effect inside store transaction

No Tool, AI call, HTTP call, Script execution, business-data read, or Projection execution may occur while a RuntimeStore write transaction is held.

---

## 11. Per-Instance Processing Architecture

The portable runtime owns an in-process keyed scheduler:

```text
WorkflowAddress / internal instance id
        ↓
Serialized Instance Lane
        ↓
next accepted targetSequence only
```

One lane may await a Tool or other effect while other instance lanes continue. Query may observe the last committed state plus current message disposition while a turn is in flight.

Processing algorithm:

```text
load next accepted message
→ mark processing
→ restore target pinned package + workflow state
→ execute deterministic control flow
→ reconcile/execute journaled effects
→ commit resulting instance state + message processed
→ increment stateRevision
→ wake projection/subscription invalidation
→ continue with next target sequence
```

If the current message cannot resolve deterministically, the instance enters `recovery_required`; later accepted messages stay durable but unprocessed.

---

## 12. Tool and Effect Architecture

### 12.1 Domain Tool contract

Compiled Tool descriptors contain:

```text
toolId
input/output schema ids
effect semantics: none | idempotent | non-idempotent
execution kind/binding descriptor
required capabilities
```

### 12.2 Expression Tool

Expression Tools use JSONata through `expression-jsonata@1`.

The compiler performs static parse/policy validation. Runtime execution receives only the frozen expression descriptor and deterministic logical-time/input values.

The portable default executor may run in-process. The Node host may substitute a Worker-isolated executor. Hard CPU preemption is therefore a host capability/quality property, not a universal v0.2 semantic guarantee.

### 12.3 Script Tool

Script Tool TypeScript/JavaScript source is compiled/bundled at build time.

- Node target: binding may use a Worker and bundled script source/module.
- Expo target: binding is a statically bundled module callable under Hermes; no native Worker assumption.

Scripts are trusted package code, not hostile-code sandbox input. Runtime receives JSON-only Tool input/output contracts.

### 12.4 Remote Tool

The v0.2 reference remote binding is **HTTP + structured JSON** behind `http-transport@1`.

```text
Domain Tool Contract
→ compiled HTTP transport binding
→ Runtime Resource(endpoint/token/session)
→ structured result
```

No endpoint or credential enters the compiled package.

### 12.5 AI Skill

The v0.1 provider-neutral `AIOperationPort` concept is retained. AI Runtime owns model/provider selection and retry/fallback within an AI operation. DomainHarness does not gain agentic tool selection.

### 12.6 Durable effect journal

All externally meaningful effects use a deterministic `effectId` derived from target instance, source message/turn and workflow step visit.

Recovery matrix:

| Journal state | effect=none | idempotent | non-idempotent |
|---|---|---|---|
| completed | reuse result | reuse result | reuse result |
| started / no committed result | may re-execute | may re-execute with same idempotency identity | **do not automatically re-execute; instance → recovery_required** |

A committed result is durable before the dependent workflow transition commit.

---

## 13. Workflow-to-Workflow Messaging

### 13.1 Compiled message effect

The compiled workflow IR gains a Runtime-owned `domain-message` effect. Raw authoring syntax is compiler-owned, but the semantic compiled form is:

```ts
interface SendDomainMessageEffect {
  kind: 'domain-message';
  targetExpression: string;
  messageType: string;
  payloadExpression?: string;
  contractVersion?: string;
}
```

Target/payload expressions use the same deterministic expression policy as routing and cannot perform I/O.

### 13.2 Crash-safe send algorithm without distributed transaction

A source message effect derives a deterministic child `messageId` from its `effectId`.

```text
journal source send effect = started
→ accept target message using deterministic child messageId
→ target store returns durable ACK (or existing duplicate ACK)
→ persist source send-effect result = target ACK
→ source workflow continues
```

Crash window:

```text
target accepted
→ crash before source effect result committed
→ recovery retries accept with same child messageId
→ target dedup returns original ACK
→ source commits effect result
```

This provides durable same-runtime workflow messaging without a broker or a multi-instance distributed transaction. Target processing may begin before the source advances; v0.2 intentionally does not promise cross-instance transactional isolation.

---

## 14. Query Architecture

v0.2 public Query is a bounded discriminated union, not a query language.

Required query kinds:

```text
instance
message-disposition
runtime-failure
package-pin
projection
```

Query never mutates Runtime state.

Representative public surface:

```ts
runtime.query({ kind: 'instance', target })
runtime.query({ kind: 'message-disposition', target, messageId })
runtime.query({ kind: 'projection', projectionId, key })
runtime.query({ kind: 'package-pins' })
```

No generic filter/sort/join/index/pagination DSL is introduced.

---

## 15. Projection Architecture

### 15.1 v0.2 projection representation

v0.2 freezes Projection execution to **JSONata over a declared input snapshot object**.

A compiled projection declares:

```text
projectionId
JSONata expression
dependent workflow address selectors
dependent business snapshot selectors
output schema
```

### 15.2 Snapshot assembly boundary

```text
RuntimeStore workflow snapshots
+
Application BusinessSnapshotPort read snapshots
+
compiled Domain Data
        ↓
ProjectionInput (plain JSON + source revisions)
        ↓
JSONata Projection
        ↓
validate output schema
        ↓
Dynamic Domain State
```

`BusinessSnapshotPort` is a read-only Runtime Resource owned by the application/domain integration layer. It can perform I/O to authoritative systems **before** projection execution. The Projection function receives only the returned snapshot JSON and revision identity.

### 15.3 Projection revision

Projection revision is a deterministic hash of:

```text
packageId
projectionId
all dependent Workflow Instance stateRevision values
all supplied business snapshot revision identities
```

It is an observable snapshot identity, not a globally increasing database revision.

### 15.4 Cache

A bounded in-memory projection cache MAY key by projection revision. Cache is reconstructable and disposable. v0.2 introduces no durable materialized-view table.

### 15.5 Authoritative revalidation

Projection output is never an authorization token. A state-changing Tool/Workflow action that relies on authoritative business data must re-read/revalidate required facts through the domain-owned Tool/business boundary before committing the mutation.

The SDK does not interpret domain truth; acceptance is proven by a race fixture where business data changes after a Projection read and the subsequent mutation rejects stale assumptions.

---

## 16. Subscription and Invalidation

Subscription is implemented with portable in-process listener sets and a coalescing scheduler; Node EventEmitter is not a core dependency.

Supported subjects:

```text
instance
message
projection
```

For Projection subscriptions:

```text
source invalidated
→ coalesce same-subject pending notifications
→ recompute/query latest projection snapshot
→ emit latest revision/snapshot signal
```

Intermediate revisions MAY be skipped. After reconnect/restart the client must Query latest state and create a new subscription.

External authoritative business data changes are surfaced through an application call such as:

```ts
runtime.invalidateBusinessSnapshot({ source, key })
```

No database CDC subsystem is added.

---

## 17. Package Compatibility and Versioning

### 17.1 New instance

A new instance pins the Runtime's configured default `packageId` at creation.

### 17.2 Existing instance

Every Query, message validation and processing turn resolves contracts/workflow IR from the instance's pinned package.

### 17.3 Cross-version message

A newer sender does not impose its package version on the target. The target message is validated against the target package's message contract. Incompatible input is rejected before accepted ACK.

### 17.4 Upgrade deployment

```text
build package B
+ include package A if any retained instance pins A
→ ship app/runtime with PackageRegistry {A,B}
→ default new instances to B
→ old instances continue A
→ query pins
→ remove A only after no retained instance requires it
```

Automatic arbitrary active-state migration is not implemented in v0.2.

---

## 18. v0.1 Migration Architecture

### 18.1 Build-time source migration

The compiler accepts the frozen v0.1 authoring forms needed by migration fixtures:

```text
invoke.expr   → synthetic Expression Domain Tool
invoke.script → synthetic Script Domain Tool
```

The generated v0.2 Tool identity is deterministic from workflow/state/source identity so repeated builds are stable.

### 18.2 Behavioral equivalence, not active-state import

Reference fixtures compare observable acceptance/state/output/emitted-message behavior. v0.1 live `runs/steps` records are not automatically promoted into v0.2 Workflow Instances.

### 18.3 API migration

The conceptual package `@kaicreator/domain-harness` remains, but applications migrate from:

```text
createDomainHarness({ root, sqlitePath, ... })
```

to:

```text
build: compileDomainPackage(raw, targetProfile)
runtime: createDomainRuntime({ packageRegistry, store, bindings, resources })
```

A migration guide is required; a runtime compatibility shim that recompiles Raw Packages at startup is prohibited.

---

## 19. Public Runtime Contract Shape

Exact implementation names may be refined without changing semantics, but the L2 contract families are frozen:

```ts
interface DomainRuntime {
  openInstance(request: OpenWorkflowInstanceRequest): Promise<WorkflowInstanceSnapshot>;
  send(message: DomainMessage): Promise<MessageAcceptedAck>;
  query(request: DomainQuery): Promise<DomainQueryResult>;
  subscribe(request: DomainSubscription, listener: DomainChangeListener): Unsubscribe;
  recover(request: RecoveryRequest): Promise<RecoveryResult>;
  invalidateBusinessSnapshot(request: BusinessInvalidation): void;
}
```

No public method accepts XState objects, raw SQLite handles/rows, Raw Domain Package file paths, or internal journal records.

Host convenience constructors may exist in host packages, but they assemble the same portable `DomainRuntime`.

---

## 20. Key ADRs / Invariants

### ADR-201 — Four-package runtime/compiler/host split

**Decision:** keep `@kaicreator/domain-harness` portable; add compiler, Node host and Expo host packages.  
**Rollback:** host packages can later be consolidated behind subpath exports only if dependency inspection proves no portability regression.

### ADR-202 — XState remains private workflow reducer

**Decision:** retain v0.1's engine isolation; no raw XState snapshots become durable/public contract.  
**Failure mode prevented:** engine snapshot semantics taking authority over durable effects.

### ADR-203 — Generated module is the Target Compiled Package physical form

**Decision:** app build imports a generated target module containing canonical manifest + target bindings.  
**Failure mode prevented:** runtime Raw Package discovery and Metro dynamic-code loading problems.

### ADR-204 — RuntimeStore exposes semantic atomic operations

**Decision:** portable core never manipulates SQL transactions directly.  
**Consequence:** Node and Expo adapters must pass one shared store conformance suite.

### ADR-205 — Workflow Address is `(workflowId, instanceKey)`

**Decision:** stable domain-visible address replaces opaque-run-id-only targeting.  
**Correlation:** separate `correlationId` remains persisted and observable.

### ADR-206 — Per-instance target sequence is ordering authority

**Decision:** acceptance allocates sequence atomically; only the next unresolved sequence mutates an instance.  
**No global order:** intentional.

### ADR-207 — Workflow-to-workflow send is a journaled Runtime Message Effect

**Decision:** deterministic child message IDs + target dedup close crash windows.  
**Rejected:** broker/outbox service or distributed transaction coordinator.

### ADR-208 — v0.2 Projection is JSONata-only over declared snapshots

**Decision:** projection can be complex but receives only JSON snapshots and no Runtime Resources.  
**Escape hatch:** a future deterministic WASM/pure-module projection capability requires new evidence and contract work.

### ADR-209 — Static PackageRegistry owns pinned package availability

**Decision:** application build retains old compiled package modules while pins exist.  
**Activation:** missing pin fails closed.

### ADR-210 — Expo Android/Hermes is the non-Node reference target

**Decision:** release qualification requires the same deterministic conformance suite on Node and real Expo/Hermes host evidence.  
**Browser-only tests:** supplemental, not sufficient for AC-42.

### ADR-211 — Script isolation strength is host-specific, semantics are portable

**Decision:** Node may use Worker hard termination; Expo uses precompiled trusted module execution.  
**Non-claim:** v0.2 does not promise hostile-code sandboxing or universal hard CPU preemption.

### ADR-212 — New v0.2 persistence schema coexists with v0.1 history

**Decision:** `dh_v2_*` tables store v0.2 live state; v0.1 `runs/steps` are not silently reinterpreted.  
**Consequence:** migration validation is fixture-based behavioral equivalence, not live row conversion.

---

## 21. Failure Handling Invariants

1. Invalid/corrupt/incompatible compiled package fails before execution.
2. Missing required target capability fails compilation, not runtime semantic substitution.
3. Missing pinned package fails activation/recovery closed.
4. Message validation/recovery/terminal rejection occurs before accepted ACK.
5. Accepted message persists before ACK and keeps its target sequence across restart.
6. Duplicate `(target,messageId)` returns the original acceptance identity.
7. A failed accepted message cannot be silently skipped.
8. `recovery_required` blocks new state-changing acceptance while retaining existing pending messages.
9. Terminalization writes `abandoned` for every accepted-but-unprocessed target message in the same terminalization transaction.
10. Completed Tool/effect results are reused and never reinvoked merely for replay.
11. Ambiguous non-idempotent started effect never auto-retries.
12. Projection failure cannot mutate runtime/business state.
13. Subscription loss cannot lose durable truth because subscription is not the truth store.

---

## 22. Validation Architecture

The PRD G1–G34 gates map to four reusable validation layers:

### V1 — Contract/unit

Compiler schema/capabilities, package identity, message validation, address, lifecycle, query purity, projection no-I/O policy.

### V2 — RuntimeStore conformance

One semantic suite runs against:

```text
Node better-sqlite3 adapter
Expo expo-sqlite adapter
```

It covers atomic acceptance/sequence/dedup, terminal abandonment, tool journal, package pins and crash-visible state.

### V3 — Runtime semantic conformance

The same deterministic fixture set runs on Node and Expo/Hermes and compares only product-level observable behavior defined by the PRD.

### V4 — Process/device Critical Journeys

Node process-kill tests and real Expo Android restart/relaunch tests cover persistence/recovery boundaries that unit tests cannot prove.

Hidden Validation remains separate and owner-held.

---

## 23. Architecture Risks and Open Questions

These are implementation risks, not architecture contradictions.

### R-01 — Expo Script execution cannot inherit Node Worker guarantees

Hermes/Expo does not provide Node `worker_threads`, and native Web Worker is not a standard Expo primitive. A badly behaved trusted Script can block the JS thread. v0.2 accepts this because the frozen product does not require universal hard preemption. Script fixtures must be bounded; future isolated execution can be a new capability.

### R-02 — Static package retention increases application bundle size temporarily

If many long-lived instances pin old packages, a new app may need to bundle multiple package modules. v0.2 exposes pin inspection; applications must drain/migrate/terminate old instances before dropping packages. Remote package distribution is intentionally not introduced.

### R-03 — Expo database locking differs from synchronous Node SQLite

The adapter must use exclusive transaction APIs correctly and the shared conformance suite must include concurrent acceptance/dedup races.

### R-04 — JSONata-only Projection may eventually be too restrictive

This is intentional scope control for v0.2. Evidence from real domain integrations should decide whether a future deterministic pure-module/WASM projection capability is justified.

### R-05 — Package identity does not equal signed supply-chain integrity

v0.2 identity protects semantic compatibility and accidental corruption. Signed distribution remains a future concern unless a required target proves it mandatory.

### R-06 — Long-running per-instance Tools delay later messages for that instance

This is a consequence of deterministic serialized mutation. Long external jobs should use asynchronous completion through durable Domain Messages, as the PRD already recommends.

---

## 24. L2 Freeze Result

```text
Frozen v0.2 PRD R4
→ L2 Architecture Evidence
→ PASS
```

**Architecture contradiction:** `NONE`  
**Product scope change:** `NONE`  
**Portable Runtime requirement:** satisfied by package/host split  
**Non-Node reference target:** Expo Android / Hermes  
**Primary persistence:** SQLite through RuntimeStore  
**Architecture status:** **FROZEN / READY FOR TASK DAG**

Implementation agents SHALL treat this document as architecture authority beneath the Frozen PRD. Any change to the decisions above requires explicit architecture-change evidence; ordinary implementation difficulty is not sufficient authority to broaden scope.
