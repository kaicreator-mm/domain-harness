# DomainHarness v0.2 PRD

**Project:** DomainHarness  
**Formal Product Name:** DomainHarness Portable Interactive Domain Runtime  
**Version:** v0.2  
**Document Revision:** R4  
**Status:** **FROZEN**  
**Baseline:** DomainHarness v0.1 Frozen  
**Development Standard:** AI Development Standard v2.0.0, pinned revision `0446f04583f6cf464c835f26e2f657c8b703cb4e`  
**Revision Date:** 2026-09-18  

---

## 0. Revision Notes

R2 incorporates the first external adversarial review while preserving the converged v0.2 product direction.

R3 incorporates the second external adversarial review.

R2 closed 12 of 13 first-round findings. R3 closes the remaining freeze blockers and tightens acceptance coverage without adding new product subsystems.

R3 corrections:

- recovery termination now gives every already-accepted but unprocessed Domain Message an observable terminal disposition queryable by the sender/application;
- Projection is explicitly deterministic over declared inputs and SHALL NOT call Domain Tools, AI Skills, or external I/O;
- Subscription is explicitly a change signal, not a durable change log, and MAY coalesce intermediate notifications;
- Runtime activation explicitly consumes only the Target Compiled Domain Package and Runtime Resources, never the Raw Domain Package;
- accepted ACK is clarified to mean durable acceptance/ordering only, not successful processing;
- FAILED / RECOVERY-REQUIRED lifecycle behavior is made explicit at message acceptance;
- wording no longer leaks XState as a public product concept;
- Raw Domain Package formulas consistently include Required Host Capabilities;
- ambiguous non-idempotent Tool recovery is explicitly tied to the Workflow Instance recovery-required lifecycle;
- Acceptance Criteria now cover Workflow Address, correlation/causation, corrupt-package fail-closed, message terminal disposition, runtime startup without raw recompilation, projection authoritative revalidation, and both v0.1 expr/script migration paths.

R4 applies the final closure correction from the external Freeze Check: all already-accepted but unprocessed Domain Messages receive the same observable terminal disposition whenever their target Workflow Instance reaches terminal state, regardless of whether terminal state is reached by normal completion or recovery termination/resolution.

The final closure verification found no remaining product-level blocker. This document is **FROZEN**.

---

# 1. Product Definition

DomainHarness v0.2 is a portable TypeScript Domain Runtime SDK for turning a target-compiled Domain Package into a persistent, interactive and recoverable executable domain runtime.

It evolves v0.1 beyond a bounded:

```text
start
→ execute workflow
→ wait/resume
→ complete/fail/cancel
```

model into a runtime that can host long-lived, addressable Workflow Instances and support continuous application interaction.

### One-line definition

> DomainHarness v0.2 is a platform-independent TypeScript runtime that executes a target-compiled Domain Package and provides persistent Workflow Instances, durable Domain Messages, Domain Tool execution, Query, Subscription, Dynamic Domain State projection and recovery.

---

# 2. Product Motivation

DomainHarness v0.1 established a shared durable workflow execution layer.

Real domain applications require a broader common model:

```text
App remains active
+
multiple domain Workflow Instances remain logically active
+
Workflow Instances interact over time
+
App continuously reads/observes domain state
+
Domain Tools interact with authoritative business systems
```

Without a shared runtime, each domain project must separately implement:

- long-lived workflow identity;
- durable interaction;
- restart recovery;
- message ordering/deduplication;
- workflow-to-workflow communication;
- domain-tool execution boundaries;
- state projection;
- UI query/subscription;
- persistence;
- host portability.

v0.2 provides those generic runtime mechanics while preserving domain-project authority.

---

# 3. Core Product Model

## 3.1 Domain Runtime

```text
Domain Runtime
=
DomainHarness Runtime SDK
+
Target Compiled Domain Package
+
Runtime Resources
```

`Runtime Resources` are runtime-only values, handles and environment state, for example:

- database path / handle;
- user/session identity;
- service endpoints;
- credentials and secrets;
- current device/platform capabilities;
- external service connections.

Runtime Resources are not Domain Data and SHALL NOT become embedded business truth.

---

## 3.2 Raw Domain Package

```text
Raw Domain Package
=
Domain Data
+
Domain Tool Sources / Declarations
+
Required Host Capabilities
```

Raw Domain Package is the authoring/source form.

It SHALL be independent of a concrete Host Adapter implementation, but it MAY declare required host capabilities.

Therefore portability is conditional:

```text
Raw Package semantics
→ host-independent

Required capabilities
→ declared by package/tool

Target compatibility
→ compiler verifies target satisfies required capabilities
```

A package using only portable capabilities can compile for every target implementing those capabilities.

A package containing a Script Tool, native capability or other host-sensitive feature is portable only to target hosts that declare compatible support.

Failure to satisfy required capabilities SHALL fail compilation rather than silently change domain behavior.

A Raw Domain Package may contain:

```text
domain metadata
workflows
skills
schemas
rules
constraints
patterns
decision models
projections
knowledge
references
resources
domain tool definitions
expression tool sources
script tool sources
remote tool contracts
required host capability declarations
```

---

## 3.3 Target Compiled Domain Package

```text
Target Compiled Domain Package
=
Compiled Domain Data
+
Compiled / Declared Domain Tools
+
Target Host Bindings
+
Package Identity / Compatibility Metadata
```

Compilation occurs for a Target Host Profile.

The same Raw Domain Package may therefore produce multiple target artifacts:

```text
Raw Formula Domain Package
        │
        ├─ compile(target=Node/Electron)
        │      → Formula Node/Electron Domain Package
        │
        └─ compile(target=React Native)
               → Formula React Native Domain Package
```

Domain semantics and public domain contracts SHALL remain equivalent across supported targets.

Host-specific implementation details MAY differ.

---

## 3.4 Domain App

At the application interaction level:

```text
Domain App
=
App / UI Workflow
+
N × Dynamic Domain State
```

At the implementation level, the App integrates with a Domain Runtime and separately owns authoritative User / Business Data.

App/UI Workflow is application-owned.

DomainHarness does not provide a generic UI framework.

The interaction boundary is:

```text
state-changing interaction → durable Domain Message
read                       → Query
continuous read            → Subscription
```

---

# 4. Product Goals

v0.2 SHALL:

1. make the Runtime SDK independent of Node-specific built-ins;
2. separate build-time Domain Package compilation from runtime execution;
3. support capability-conditioned target compilation;
4. make Domain Tools first-class members of the Domain Package;
5. support local Expression/JSONata Tools;
6. support local Script Tools;
7. support Remote Tools;
8. support build-time Host Binding;
9. keep runtime-only resources and secrets outside the compiled package;
10. support persistent, addressable and recoverable Workflow Instances;
11. support durable Domain Messages between App and Domain Runtime;
12. support durable Domain Messages between Workflow Instances in one logical Domain Runtime;
13. support Query;
14. support Subscription;
15. support Dynamic Domain State Projection;
16. allow one Projection to depend on multiple Workflow Instances;
17. preserve deterministic serialized state mutation within one Workflow Instance;
18. allow multiple independent Workflow Instances to execute concurrently;
19. persist accepted messages and committed execution history across restart;
20. preserve Domain Project authority over User / Business Data;
21. preserve provider-neutral AI Skill execution;
22. provide explicit package/runtime compatibility and active-instance package pinning;
23. prevent DomainHarness Projection from becoming a second authoritative business store;
24. prevent DomainHarness messaging from becoming a generic distributed event platform.

---

# 5. Explicit Non-Goals

v0.2 SHALL NOT become:

- a distributed actor platform;
- a generic distributed event bus;
- Kafka/Pulsar replacement;
- a generic BPM product;
- a generic DAG scheduler;
- a distributed scheduler;
- a multi-service transaction coordinator;
- a business database;
- an application ORM;
- a generic query engine;
- a generic indexed read-model/materialized-view framework;
- a generic UI framework;
- a UI navigation/state-management library;
- an AI Gateway;
- a model/provider router;
- a generic autonomous tool-selection/agent loop;
- a knowledge database;
- a generic reasoning engine;
- a replacement for domain-specific business models;
- a domain authoring product or visual domain-design toolchain.

v0.2 does not require:

- cross-Domain-Runtime distributed workflow messaging;
- arbitrary topic/pub-sub infrastructure;
- exactly-once external side effects;
- automatic migration of arbitrary active workflow state across incompatible package versions;
- arbitrary runtime plugin discovery;
- runtime recompilation of Raw Domain Packages;
- generic multi-package dependency resolution;
- generic workflow-internal DAG execution;
- a generic parallel-workflow DSL;
- cross-source transactional snapshot isolation for Projection;
- a generic projection query DSL, index manager or pagination engine.

Multiple Workflow Instances may run concurrently without introducing a generic parallel-state or DAG primitive inside one Workflow.

---

# 6. Runtime Portability

## 6.1 Runtime SDK

The DomainHarness Runtime SDK SHALL be platform-independent TypeScript.

The core Runtime SDK SHALL NOT require Node built-ins such as:

```text
node:fs
node:path
node:crypto
node:worker_threads
```

and SHALL NOT expose a Node version as a fundamental runtime contract.

Node remains a supported host.

Node may also be used by build tooling and Compiler tooling.

---

## 6.2 Host Capability Model

A target host SHALL declare the capabilities it provides.

A Raw Domain Package or individual Domain Tool MAY declare required capabilities.

Examples include:

```text
sqlite-runtime-store
script-execution
expression-jsonata
http-transport
secure-random
crypto-hash
package-resource-loader
```

Exact capability identifiers are an L2 decision.

The product-level rule is:

> Compilation succeeds only when the Target Host Profile satisfies every required capability used by the package.

The Compiler SHALL NOT silently replace an unsupported capability with semantically different behavior.

---

## 6.3 Compiler

Domain Data loading, source discovery, static validation, capability validation and compilation are primarily build-time concerns.

Conceptually:

```text
Raw Domain Package
+
Target Host Profile
        ↓
DomainHarness Compiler
        ↓
Target Compiled Domain Package
```

The Compiler may run in Node-based development/CI environments.

The Compiler itself is not required in the final application runtime.

---

## 6.4 Runtime Loading

Application startup SHALL perform:

```text
load Target Compiled Domain Package
→ verify identity/compatibility
→ bind Runtime Resources
→ activate Domain Runtime
```

The Runtime startup/activation path SHALL consume only the Target Compiled Domain Package plus Runtime Resources.

It SHALL NOT parse, discover, compile, partially compile, or otherwise depend on the Raw Domain Package at App startup.

---

# 7. Host Binding Model

Host adaptation is primarily selected at build/compile time.

The Target Host Profile determines implementations for capabilities such as:

- Runtime Store;
- Script Tool execution;
- Expression Tool execution;
- remote transport;
- package/resource loading;
- hashing/crypto;
- AI Runtime transport where applicable.

Runtime SHALL NOT require a generic late-bound Host Adapter discovery system.

The boundary is:

```text
Host Adapter / transport implementation selection
→ build time

Runtime Resource values / handles
→ runtime
```

Examples:

```text
SQLite RuntimeStore implementation
→ build time

actual database path / handle
→ runtime
```

```text
HTTP Remote Tool transport
→ build time

endpoint / token / session
→ runtime
```

Credentials and secrets SHALL NOT be compiled into the Domain Package.

---

# 8. Persistence Model

Runtime persistence SHALL be accessed through a Runtime Store contract.

v0.2 officially requires SQLite as the initial persistence backend family.

The public DomainHarness persistence contract SHALL NOT expose `better-sqlite3` as a required implementation.

Different Target Hosts MAY use different SQLite access implementations while preserving the same Runtime Store semantics.

Examples may include:

```text
Node SQLite implementation
React Native / Expo SQLite implementation
other SQLite-compatible host implementations
```

PostgreSQL or other Runtime Store backend families are not required for v0.2.

---

# 9. Domain Tool Model

Domain Tools belong to the Domain Package.

They represent executable domain capabilities.

Examples:

```text
validateArtifact
calculateLearningScore
evaluateJourneyConstraint
commitTranslation
saveDesign
generateImage
publishContent
```

A Domain Tool answers:

> What domain capability is being performed and what is its domain contract?

A Host Binding answers:

> How can this target host execute or connect to the underlying mechanism?

---

## 9.1 Domain Tool Contract

Every Domain Tool SHALL declare at minimum:

```text
tool identity
input contract
output contract
effect semantics
execution kind/binding
required host capabilities where applicable
```

Effect semantics remain:

```text
none
idempotent
non-idempotent
```

---

## 9.2 Durable Tool Result Rule

A successfully completed Domain Tool invocation SHALL become a durable execution fact before any dependent Workflow transition is committed.

Once a Tool invocation result is committed:

> Recovery/replay SHALL use the journaled result and SHALL NOT re-invoke that Tool merely to reconstruct committed history.

This rule applies regardless of whether the Tool is deterministic.

Therefore:

```text
idempotent ≠ deterministic
```

does not cause committed execution history to fork during replay.

If a process failure occurs before Tool completion/result commitment:

- `none` and `idempotent` Tools MAY be re-executed according to frozen recovery policy;
- `non-idempotent` Tools SHALL NOT be automatically re-executed when outcome is ambiguous;
- ambiguous non-idempotent execution SHALL place the affected Workflow Instance into the same observable `failed / recovery-required` lifecycle defined by §11.2 and recovered through the §12.5 recovery path.

Exact journal schema, retry count and backoff are L2 decisions.

---

## 9.3 Expression Tool

A deterministic compact calculation may be represented as an Expression Tool.

JSONata is an allowed implementation form.

Conceptually:

```text
Workflow
→ Domain Tool
→ Expression Tool Executor
→ result
```

Expression is not required to remain a separate top-level Workflow primitive in v0.2.

---

## 9.4 Script Tool

A local code-based Domain Tool may contain compiled script implementation.

Conceptually:

```text
Workflow
→ Domain Tool
→ Script Tool Executor
→ compiled local code
```

Script execution infrastructure exists to execute local Domain Tools.

Script is not required to remain a separate top-level Workflow primitive in v0.2.

Raw TypeScript source may be compiled/bundled during Domain Package compilation.

The final runtime does not require a TypeScript compiler.

A Script Tool SHALL declare any required target-host execution capability.

---

## 9.5 Remote Tool

A Remote Tool is represented in three layers:

```text
1. Domain Tool Contract
   → Domain Package

2. Transport Binding
   → selected/bound at build time

3. Endpoint / Credential / Session / Connection
   → Runtime Resource
```

The Domain Tool Contract contains:

```text
domain tool identity
input/output contract
effect semantics
logical remote binding
```

A Remote Tool SHALL NOT bypass DomainHarness effect, journal and recovery semantics.

Long-running asynchronous external processes SHOULD complete through durable Domain Messages rather than one unbounded blocking Tool invocation.

---

# 10. AI Skill Boundary

AI-oriented Skill remains semantically distinct from Domain Tool.

DomainHarness owns:

- Skill definition;
- domain instructions/resources;
- Skill input/output schema;
- workflow placement;
- structured output validation.

AI Runtime owns:

- model/provider selection;
- model routing;
- strong/weak strategy;
- retry/fallback inside an AI operation;
- critic/judge/consensus;
- provider cost/latency strategy.

v0.2 SHALL NOT introduce model-mediated autonomous Domain Tool selection or generic agent loops.

---

# 11. Workflow Instance Model

v0.2 makes persistent Workflow Instance a first-class runtime concept.

A Workflow Instance is:

- durably identifiable;
- addressable;
- recoverable;
- able to receive Domain Messages over time;
- queryable;
- observable;
- logically long-lived.

Long-lived does not mean permanently resident.

The Runtime may:

```text
activate
→ process
→ persist
→ suspend/unload
→ rehydrate on future message
```

without changing the logical Workflow Instance identity.

---

## 11.1 Workflow Address

External consumers SHALL NOT be forced to use only an opaque internal Run ID as business identity.

A Workflow Instance SHALL expose a stable address/correlation model sufficient to distinguish:

```text
workflow definition
workflow instance identity
domain/business correlation
```

Exact address syntax is an L2 decision.

---

## 11.2 Instance Lifecycle

At minimum, the Runtime SHALL distinguish:

```text
active / processable
waiting / suspended
failed / recovery-required
terminal
```

Exact enum names are an L2 decision.

A terminal instance SHALL NOT accept a new state-changing Domain Message.

A `failed / recovery-required` instance MAY retain already-accepted pending messages but SHALL NOT accept a new state-changing Domain Message until the failure is explicitly recovered or resolved.

The Runtime SHALL reject messages targeting either a terminal instance or an unresolved `failed / recovery-required` instance before durable acceptance/ACK.

---

## 11.3 Per-instance Determinism

A single Workflow Instance SHALL process state-changing Domain Messages serially.

Accepted messages for one target instance SHALL be assigned a durable target sequence and SHALL be processed in accepted sequence order.

Conceptually:

```text
accept message #41
accept message #42

process #41
persist result/transition

process #42
persist result/transition
```

The Runtime SHALL NOT process #42 as a state mutation before #41 is resolved.

Different Workflow Instances MAY execute concurrently.

No global ordering across different Workflow Instances is promised.

---

# 12. Durable Domain Message Model

DomainHarness v0.2 has one common runtime primitive:

```text
Durable Domain Message
```

A message MAY carry a domain semantic label such as:

```text
command
event
```

but Command/Event SHALL NOT require separate transport, persistence, ordering or deduplication subsystems in v0.2.

Domain semantics may use the distinction:

```text
Command
= request/intention directed to a target

Event
= statement that something occurred
```

The Runtime mechanics are common.

---

## 12.1 Message Envelope Requirements

The common message model SHALL support at minimum:

```text
message identity
target Workflow Instance
message type
payload
correlation identity
causation identity
package/contract context sufficient for validation
accepted target sequence
```

Exact TypeScript shape is an L2 decision.

---

## 12.2 Acceptance / ACK Boundary

A state-changing message is **accepted** only after:

1. target exists and is neither terminal nor unresolved `failed / recovery-required`;
2. message contract is validated;
3. package/version compatibility is validated;
4. deduplication identity is checked;
5. the message is durably persisted;
6. its target ordering position is durably assigned.

Only then may the Runtime return accepted ACK.

Therefore:

> `send → accepted ACK` means the message has been durably accepted and ordered for the target and survives process/runtime restart.

Accepted ACK SHALL NOT mean that the message has been processed successfully.

Processing/result state SHALL be observed through Query and/or Subscription.

Validation failure before acceptance SHALL return rejection and SHALL NOT create an accepted durable message.

---

## 12.3 Deduplication

For a target Workflow Instance, the same accepted `messageId` SHALL NOT cause more than one logical Workflow state transition.

Deduplication protection SHALL be retained for as long as the target instance remains recoverable/addressable under the Runtime retention policy.

The exact physical retention/GC strategy is an L2 decision.

The product contract does not require indefinite dedup state after the Workflow Instance itself is permanently removed.

---

## 12.4 Ordering

For one target Workflow Instance:

```text
accepted target sequence
→ processing order
```

is authoritative.

There is no cross-instance global order.

Messages emitted concurrently by different Workflow Instances are ordered only when they are durably accepted into the target instance's message stream.

---

## 12.5 Processing Failure / Poison Message

An accepted message that fails during processing SHALL NOT disappear or be retried invisibly forever.

The Runtime SHALL persist an observable processing failure.

While an unresolved accepted message blocks deterministic progress:

```text
target instance
→ FAILED / RECOVERY-REQUIRED
→ following state-changing messages remain unprocessed
```

The Runtime SHALL provide an explicit recovery path sufficient to:

- inspect the failure;
- retry when policy permits; or
- terminate/resolve the affected instance according to domain-authorized behavior.

The Runtime SHALL NOT silently skip a failed accepted message.

Whenever a Workflow Instance reaches a terminal state — whether by normal completion or by recovery termination/resolution — every already-accepted but unprocessed Domain Message targeting that instance SHALL receive an observable terminal disposition such as `abandoned` or equivalent.

That terminal disposition SHALL be queryable through the public Query boundary so senders/applications can distinguish accepted-but-never-processed messages from successfully processed messages.

Exact disposition names, retry policy, retry count, backoff and operator UI are L2/application concerns.

---

# 13. Workflow-to-Workflow Interaction

Workflow Instances in the same logical Domain Runtime SHALL be able to send durable Domain Messages to one another.

Example:

```text
GenerationWorkflow
        │
 ArtifactGenerated
        ↓
QualityWorkflow
        │
 QualityCompleted
        ↓
DesignWorkflow
```

Workflow-to-workflow interaction SHALL NOT require direct access to another Workflow's internal runtime state.

Interaction occurs through:

```text
message
query
projection
```

v0.2 does not provide a generic distributed message broker or cross-runtime event bus.

---

## 13.1 Cross-package-version Delivery

A long-lived target Workflow Instance executes against its pinned Domain Package identity.

An incoming Domain Message SHALL be validated against the target instance's pinned message contract.

If a newer sender produces a message incompatible with the target's pinned contract:

```text
message
→ reject before accepted ACK
```

unless the Domain Package explicitly declares compatible contract handling.

A sender SHALL NOT force a target instance to reinterpret state under the sender's package version.

Exact schema-version representation is an L2 decision.

---

# 14. App / UI Interaction

App/UI Workflow remains outside DomainHarness execution authority.

DomainHarness SHALL allow App/UI to:

```text
send durable state-changing Domain Message
query current runtime/domain state
subscribe to relevant runtime/projection changes
```

UI SHALL NOT directly mutate Workflow Runtime internals.

UI SHALL NOT be required to understand:

- persistence rows;
- internal state-machine representation;
- journal internals;
- Tool Executor internals.

---

# 15. Query Model

Read-only interaction SHALL use Query rather than artificial read Events/Messages.

Queries SHALL NOT mutate Domain Runtime or business authority.

Typical queries include:

```text
current phase
current workflow status
available actions
current Dynamic Domain State
current projection revision
runtime failure/recovery status
package pin identity
```

Exact Query API and transport are L2 decisions.

---

# 16. Subscription Model

Applications SHALL be able to subscribe to relevant runtime/projection changes.

Subscription provides continuous observation.

Subscription session delivery itself does not need to be durable.

Subscription notifications are change signals, not a durable change log.

The Runtime MAY coalesce intermediate notifications and SHALL NOT guarantee one notification per underlying state/projection change.

A subscriber that remains connected SHALL eventually be able to observe the latest relevant state/projection revision after a relevant change.

Applications that require every discrete state-changing interaction to be durably observable SHALL use Durable Domain Messages and/or Query durable runtime history rather than counting Subscription notifications.

After disconnect/restart, a client may:

```text
Query latest state
→ re-establish Subscription
```

rather than requiring indefinite durable subscriber-session replay.

Durable truth remains in Runtime state and authoritative business systems.

---

# 17. Dynamic Domain State

Dynamic Domain State is a first-class v0.2 capability.

Conceptually:

```text
Dynamic Domain State
=
Projection(
  Target Compiled Domain Package,
  N × Workflow Instance State,
  User / Business Data
)
```

It provides an application-consumable domain view such as:

```text
current phase
current result
progress
constraints
pending actions
available actions
errors
quality state
derived scores
recommendations
```

---

## 17.1 Projection Ownership

Domain Package owns:

```text
Projection definitions
domain-specific projection semantics
projection input declarations
projection output schema/contracts
```

DomainHarness Runtime SDK owns generic:

```text
projection lifecycle
projection invocation boundary
dependency invalidation hooks
Query
Subscription
projection revision/snapshot identity
failure normalization
```

---

## 17.2 Projection Scope Limit

Projection in v0.2 is a bounded domain-defined deterministic computation over explicitly declared inputs.

Projection SHALL NOT invoke Domain Tools, AI Skills, Remote Tools, or perform external I/O.

All data required by a Projection SHALL be provided through its declared inputs/snapshots.

The Runtime SHALL NOT provide:

- generic ad-hoc query language;
- generic database-style filter/sort engine;
- generic index management;
- generic pagination engine;
- generic join planner;
- generic incremental materialized-view framework.

A Domain Package MAY define complex derived values, but their semantics remain domain-owned.

---

## 17.3 Multi-workflow Projection

One Dynamic Domain State MAY depend on multiple Workflow Instances.

Example:

```text
Design Dynamic Domain State
=
Projection(
  DesignDocument,
  DesignWorkflow,
  GenerationWorkflow,
  QualityWorkflow,
  ApprovalWorkflow,
  Creative Domain Data
)
```

The App/UI should not need to reconstruct this runtime composition itself.

---

## 17.4 Projection Consistency

v0.2 SHALL NOT promise a transactionally consistent snapshot across independent sources such as:

```text
Workflow Instance State
+
external authoritative Business Data
+
other independent Workflow Instance State
```

A Projection may therefore temporarily observe source skew.

Consequences:

1. Projection output is suitable for application read/display/decision support.
2. A state-changing Domain Tool/Workflow action that requires business correctness SHALL revalidate required authoritative facts before committing the mutation.
3. Projection output SHALL NOT be treated as transactional authorization merely because it is current at read time.

A future version may add stronger cross-source snapshot semantics if real evidence requires it.

---

## 17.5 Projection Is Derived, Not Authoritative

Projection MAY introduce derived values such as:

```text
riskScore
progressPercent
recommendedAction
qualitySummary
```

These are derived outputs, not new authoritative facts.

A derived value becomes authoritative business state only through an explicit domain-authorized mutation, normally via a Domain Tool.

Projection itself SHALL NOT directly commit business mutations.

Any Projection cache/materialization is reconstructable derived data unless the domain project explicitly commits selected results into its authoritative model through a Domain Tool.

---

## 17.6 Projection Freshness

Projection freshness can only be guaranteed relative to source changes observed by the Domain Runtime.

If authoritative Business Data changes outside the Runtime, the integration layer/domain project SHALL provide an invalidation or refresh signal when immediate Projection refresh is required.

DomainHarness v0.2 does not require generic database CDC.

---

# 18. User / Business Data Boundary

User / Business Data is not embedded into the Compiled Domain Package.

Examples:

```text
Project
Task
Journey
DesignDocument
Translation Memory
Learner Progress
Order
Customer
POI
Publication
```

Domain Tools may access or mutate authoritative business data through declared Runtime bindings.

Dynamic Domain State may consume read snapshots of User / Business Data.

DomainHarness SHALL NOT redefine authoritative business schemas merely to support Workflow execution.

---

# 19. Package Identity and Active Instance Compatibility

Every Target Compiled Domain Package SHALL have an immutable identity sufficient for compatibility checks.

Every active/recoverable Workflow Instance SHALL be associated with the Domain Package identity under which it executes.

A Runtime SHALL NOT silently continue an existing Workflow Instance against an incompatible package definition.

Possible explicit policies include:

```text
continue instance on pinned package
drain old instance
explicit migration
terminate old instance
start new instance on new package
```

Automatic arbitrary active-state migration is not a v0.2 requirement.

---

## 19.1 Pinned Package Retention

A package version referenced by an active/recoverable Workflow Instance SHALL remain loadable for as long as that instance is expected to recover/continue.

The Runtime SHALL expose enough inspection information to determine which package identities remain pinned by retained instances.

Exact storage layout, GC thresholds and retention duration are L2/application policy decisions.

---

# 20. Package Integrity

Runtime SHALL validate package identity and runtime compatibility before execution.

Corrupt or incompatible compiled packages SHALL fail closed.

Cryptographic distribution signing and remote package distribution are not mandatory v0.2 features unless L2 evidence proves them mandatory for a required target.

Secrets and credentials SHALL never be Domain Package content.

---

# 21. Behavioral Equivalence

For portability and migration validation, **behavioral equivalence** means:

> Given the same deterministic test fixture, initial authoritative data, Domain Package semantics and accepted Domain Message sequence, two supported runtimes/versions produce contract-equivalent observable domain behavior.

Observable behavior includes:

- message acceptance/rejection;
- Workflow Instance state/result visible through public contracts;
- Tool contract outputs under deterministic fixtures;
- Query outputs;
- Projection outputs;
- terminal/failure classification;
- emitted Domain Messages relevant to the scenario.

Behavioral equivalence does not require equality of non-semantic implementation details such as:

- internal row IDs;
- opaque runtime IDs where contract does not require equality;
- wall-clock timestamps;
- persistence layout;
- internal state-machine representation.

External nondeterministic services SHALL be replaced by deterministic fixtures/stubs when behavioral equivalence itself is the validation target.

---

# 22. v0.1 Compatibility and Migration

v0.1 remains a frozen product baseline.

v0.2 SHALL NOT retroactively redefine v0.1 runtime behavior.

Where v0.1 uses standalone:

```text
expr
script
```

the v0.2 migration/compiler model MAY translate these into:

```text
Expression Domain Tool
Script Domain Tool
```

without changing observable domain behavior.

Existing v0.1 active Runtime state is not required to be loaded directly as an active v0.2 Workflow Instance.

Migration evidence SHALL demonstrate behavioral equivalence for selected v0.1 reference scenarios.

---

# 23. Runtime Authority Principles

## P1. Runtime Mechanics, Not Domain Meaning

DomainHarness owns:

```text
workflow execution mechanics
durable message mechanics
runtime-state persistence
recovery
Tool invocation mechanics
Projection mechanics
Query/Subscription mechanics
package compatibility mechanics
```

Domain projects own:

```text
domain meaning
business entities
business authority
domain policies
Domain Tool semantics
Projection semantics
Workflow definitions
```

---

## P2. Domain Package Defines the Executable Domain Model

The executable domain model is supplied by the Target Compiled Domain Package.

It is not hard-coded into DomainHarness Runtime.

---

## P3. Domain Tool Is Domain, Host Binding Is Infrastructure

Domain Tool:

```text
what domain capability is being executed?
```

Host Binding / Runtime Resource:

```text
how does this target environment execute or connect to it?
```

---

## P4. Durable Writes, Simple Reads

```text
state change → durable Domain Message
read         → Query
continuous   → Subscription
```

---

## P5. One Instance, Serialized State Change

One Workflow Instance processes accepted state-changing messages in durable accepted sequence order.

Concurrency exists across independent instances, not as uncontrolled concurrent mutation inside one instance.

---

## P6. Projection Is Derived, Not Authority

Projection exists to provide a coherent application-facing view.

It SHALL NOT silently replace authoritative User / Business Data.

---

## P7. Authoring Toolchain Is External

DomainHarness Compiler consumes the Raw Domain Package contract.

DomainHarness v0.2 does not own a visual/domain authoring product.

Other tools MAY produce valid Raw Domain Packages without becoming a DomainHarness runtime dependency.

---

# 24. Required Product Scenarios

v0.2 must support at least the following scenario classes.

## S1. Local Expression Domain Tool

```text
Workflow
→ Expression Tool
→ deterministic output
→ state transition
```

## S2. Local Script Domain Tool

```text
Workflow
→ Script Tool
→ target-host execution capability
→ result
```

## S3. Remote Domain Tool

```text
Workflow
→ Remote Tool Contract
→ build-bound Transport
→ runtime endpoint/resource
→ structured result
```

## S4. Durable Tool Result Recovery

```text
Tool succeeds
→ result durably committed
→ process crashes
→ restart/replay
→ Tool is not re-invoked
→ committed result reused
```

## S5. Ambiguous Non-idempotent Tool

```text
non-idempotent Tool started
→ crash before known completion commit
→ restart
→ no automatic blind retry
→ observable recovery condition
```

## S6. Long-lived Workflow Instance

```text
create/open instance
→ process message
→ persist
→ runtime restart
→ later message
→ same logical instance continues
```

## S7. App → Domain Runtime

```text
App Workflow
→ durable Domain Message
→ accepted ACK only after persistence
→ Domain Workflow transition
```

## S8. Workflow → Workflow

```text
Workflow A
→ durable Domain Message
→ Workflow B
→ B state changes
```

## S9. Ordered Messages

```text
target accepts #41
target accepts #42
→ #41 processes/resolves first
→ then #42
```

## S10. Duplicate Message

```text
same messageId delivered twice
→ one logical Workflow transition
```

## S11. Poison Message

```text
accepted message
→ deterministic processing failure
→ failure persisted
→ instance recovery-required
→ later messages not silently processed past it
```

## S12. Cross-version Message

```text
sender package B
→ target instance pinned package A
→ incompatible message
→ reject before accepted ACK
```

## S13. Query

```text
App
→ Query
→ current state
→ no mutation
```

## S14. Subscription

```text
Projection/runtime changes
→ subscriber notified
→ reconnect
→ Query latest state
→ re-subscribe
```

## S15. Multi-workflow Dynamic Domain State

```text
Workflow A state
+
Workflow B state
+
business data
+
domain data
→ one derived Dynamic Domain State
```

## S16. Projection Source Skew

```text
Projection observes independent source revisions
→ may show temporary skew
→ state-changing operation revalidates authoritative facts before commit
```

## S17. Package Upgrade

```text
old instance pinned package A
new package B installed
→ old instance does not silently execute under incompatible B
```

## S18. Target Capability Rejection

```text
Raw Package requires script-execution
target lacks script-execution
→ compilation fails explicitly
```

## S19. Non-Node Runtime Portability

A Target Compiled Domain Package and Runtime SDK SHALL execute on at least one non-Node JavaScript/TypeScript host that:

- does not expose Node built-ins as the Runtime foundation;
- uses materially different Host Bindings for at least persistence and one execution/integration capability;
- passes the same deterministic Runtime conformance suite used for behavioral-equivalence validation.

The exact target platform is selected during L2 Architecture Evidence.

---

# 25. Acceptance Criteria

v0.2 Product Acceptance requires evidence that:

1. Runtime Core has no mandatory Node built-in dependency.
2. Compiler can turn one Raw Domain Package into a Target Compiled Domain Package.
3. compilation rejects a target missing a declared required host capability.
4. Host implementation selection can be bound during build.
5. runtime-only resources, credentials and secrets remain injectable at activation time.
6. Runtime startup consumes only the Target Compiled Domain Package plus Runtime Resources and does not parse, discover or recompile the Raw Domain Package.
7. SQLite is accessed through a Runtime Store contract rather than a public `better-sqlite3` dependency.
8. local Expression Tool works.
9. local Script Tool works through a declared target capability.
10. Remote Tool works through Contract → Transport Binding → Runtime Resource separation.
11. successfully committed Tool output survives restart and is not re-invoked merely for replay.
12. ambiguous non-idempotent Tool execution does not trigger blind automatic retry and places the affected Workflow Instance into observable recovery-required lifecycle.
13. a Workflow Instance exposes a stable public address/correlation model distinct from only an opaque internal Run ID.
14. a Workflow Instance survives runtime restart.
15. accepted ACK is returned only after durable message persistence and target ordering assignment.
16. accepted ACK is demonstrably distinct from successful message processing.
17. an accepted message survives immediate process termination and restart.
18. two accepted messages for one target are processed in accepted sequence order.
19. repeated delivery of the same `messageId` does not duplicate a Workflow state transition.
20. a terminal Workflow Instance rejects a new state-changing message before accepted ACK.
21. an unresolved failed/recovery-required Workflow Instance rejects new state-changing messages before accepted ACK while retaining already-accepted pending messages.
22. an accepted poison/failing message creates observable recovery-required state rather than silent infinite retry.
23. later state-changing messages do not pass an unresolved failed accepted message for the same Workflow Instance.
24. whenever an instance reaches terminal state while accepted messages remain unprocessed — whether by normal completion or recovery termination/resolution — those messages receive an observable terminal disposition queryable through the public Query boundary.
25. correlation identity and causation identity survive durable persistence and can be observed in a deterministic message-chain validation scenario.
26. App/UI can send a state-changing Domain Message without accessing Runtime internals.
27. Workflow A can durably message Workflow B within one logical Domain Runtime.
28. a message incompatible with the target instance's pinned package contract is rejected before accepted ACK.
29. Query reads current state without mutation.
30. Subscription is validated as a latest-state change signal rather than a per-change log: after relevant change a connected subscriber converges to the latest relevant state/projection revision, and after reconnect Query + resubscribe restores observation.
31. one Dynamic Domain State can combine multiple Workflow Instance states.
32. Dynamic Domain State can consume User / Business Data without becoming authoritative storage.
33. Projection may expose derived values but cannot commit them as authoritative business facts without an explicit domain-authorized mutation.
34. Projection executes deterministically from declared inputs and does not invoke Domain Tools, AI Skills, Remote Tools or external I/O.
35. Projection does not require a generic query/index/pagination/materialized-view subsystem; this is verified by L2 architecture review plus implementation dependency inspection.
36. a state-changing action based on potentially skewed Projection data revalidates the required authoritative facts before committing its mutation.
37. independent Workflow Instances can execute concurrently while each individual instance remains serialized.
38. incompatible package replacement does not silently reinterpret an active/recoverable instance.
39. package identities pinned by retained active/recoverable instances remain loadable.
40. corrupt or incompatible Target Compiled Domain Packages fail closed before execution.
41. behavioral equivalence is demonstrated for the deterministic portability conformance suite.
42. at least one non-Node JavaScript/TypeScript host passes the Runtime conformance suite without Runtime Core Node built-ins.
43. v0.1 `expr → Expression Domain Tool` migration is demonstrated by at least one non-trivial behavioral-equivalence reference scenario.
44. v0.1 `script → Script Domain Tool` migration is demonstrated by at least one non-trivial behavioral-equivalence reference scenario.
45. no mandatory validation or architecture decision moves authoritative domain/business state into DomainHarness; this is verified by architecture/release review.

---

# 26. Release Blockers

The following are v0.2 release blockers:

```text
Runtime Core requires Node-only built-ins
Raw Package silently changes semantics on unsupported target capability
Domain Package must be recompiled at every App startup
Host credentials/secrets must be embedded in Domain Package
Remote Tool bypasses Tool effect/journal/recovery semantics
committed Tool results are re-invoked during replay
ambiguous non-idempotent Tool execution is blindly retried
accepted ACK can occur before durable persistence
accepted durable messages can be silently lost
same messageId can duplicate one Workflow transition
same Workflow Instance can mutate messages out of accepted order
terminal instance can accept a new state-changing message
poison message can cause invisible infinite retry
later messages can silently pass an unresolved failed accepted message
cross-version incompatible message is accepted into target instance
Projection becomes authoritative business storage
Projection commits business mutation directly
Projection requires DomainHarness to become a generic read-model/query platform
App must directly manipulate Runtime internals
active instance can silently switch to incompatible Domain Package
pinned package needed by a recoverable instance can disappear
no non-Node portability evidence exists
public Runtime persistence contract is hard-bound to better-sqlite3
```

---

# 27. Required Validation Gates

Before v0.2 Release Qualification, required validation includes:

```text
G1  Compiler / package contract validation
G2  Target host capability validation
G3  Runtime Node-host validation
G4  Runtime non-Node-host validation
G5  SQLite RuntimeStore contract validation
G6  Expression Tool Critical Journey
G7  Script Tool Critical Journey
G8  Remote Tool Critical Journey
G9  Tool result journal / replay Critical Journey
G10 Non-idempotent ambiguous outcome negative validation
G11 Runtime activation without Raw Domain Package validation
G12 Durable message ACK + restart Critical Journey
G13 ACK-vs-processing state validation
G14 Message ordering validation
G15 Duplicate-message / dedup negative validation
G16 Terminal / recovery-required target rejection validation
G17 Poison-message / recovery-required validation
G18 Accepted-pending message terminal-disposition validation across normal and recovery terminal paths
G19 Workflow Address + correlation/causation trace validation
G20 Workflow-to-Workflow messaging Critical Journey
G21 Cross-package-version message compatibility validation
G22 App message → Query/Projection → Subscription Critical Journey
G23 Subscription coalescing/latest-state convergence validation
G24 Multi-workflow Dynamic Domain State Critical Journey
G25 Projection deterministic/no-I/O validation
G26 Projection source-skew / authoritative revalidation Critical Journey
G27 Package compatibility / active-instance pinning validation
G28 Pinned package retention validation
G29 Corrupt/incompatible package fail-closed validation
G30 Behavioral-equivalence portability conformance
G31 v0.1 expr migration behavioral-equivalence validation
G32 v0.1 script migration behavioral-equivalence validation
G33 L2/release authority-boundary review
G34 Hidden Validation covering crash boundaries, invalid package,
    invalid messages, incompatible package, Tool failures,
    ordering/dedup, terminal dispositions, Projection failures and recovery paths
```

Exact commands, platform tuples and validation profiles are defined after L2/Task Definition.

---

# 28. Architecture Decisions Explicitly Deferred to L2

The following are NOT frozen by this PRD:

- npm package split;
- exact Runtime public API names;
- exact Workflow Address syntax;
- exact Domain Message TypeScript shape;
- exact lifecycle enum names;
- exact accepted-message terminal-disposition enum names;
- mailbox/inbox/outbox table schema;
- atomic persistence implementation;
- XState retention/replacement;
- SQLite driver selection;
- exact non-Node reference host;
- Domain Package physical format;
- zip/binary/JSON representation;
- Compiler implementation;
- capability identifier naming;
- Tool bundler implementation;
- Script sandbox technology;
- Worker / WebWorker implementation;
- Remote Tool concrete protocol;
- HTTP vs MCP vs RPC;
- Projection cache strategy;
- projection invalidation implementation;
- subscription implementation;
- package retention storage mechanism;
- package migration implementation;
- package cryptographic signing implementation;
- retry count/backoff;
- scheduling strategy;
- physical persistence layout;
- exact Host Profile representation;
- exact contract schema-version representation.

L2 MAY choose these only if they remain consistent with the frozen product semantics.

---

# 29. Scope Protection

L2 and implementation SHALL NOT solve v0.2 requirements by silently introducing:

```text
distributed workflow service
generic actor cluster
generic event streaming platform
generic DAG scheduler
generic read-model/query database
second business database
generic UI framework
provider-specific AI orchestration
runtime compilation requirement
Node-only Runtime Core
```

If L2 discovers that a frozen requirement creates a genuine architecture contradiction, it must explicitly report the contradiction rather than silently broadening or weakening product scope.

---

# 30. Freeze Candidate Summary

Source:

```text
Raw Domain Package
=
Domain Data
+
Domain Tool Sources / Declarations
+
Required Host Capabilities
```

Build:

```text
Target Compiled Domain Package
=
DomainHarness Compiler(
  Raw Domain Package
  +
  Target Host Profile
)
```

Runtime:

```text
Domain Runtime
=
DomainHarness Runtime SDK
+
Target Compiled Domain Package
+
Runtime Resources
```

Interaction:

```text
state change → durable Domain Message
read         → Query
continuous   → Subscription
```

Instance semantics:

```text
accepted ACK
=
validated
+
deduplicated
+
durably persisted
+
target sequence assigned
```

```text
one Workflow Instance
=
serialized accepted message processing
+
persistent state
+
package pinning
+
explicit failure/recovery state
```

Dynamic application state:

```text
Dynamic Domain State
=
Projection(
  Target Compiled Domain Package,
  N × Workflow Instance State,
  User / Business Data
)
```

Projection semantics:

```text
derived
read-only
bounded/domain-defined
non-transactional across independent sources
not a generic query/read-model platform
```

Application model:

```text
Domain App
=
App / UI Workflow
+
N × Dynamic Domain State
```

This R4 document is the frozen DomainHarness v0.2 Product Requirements Document.

Final closure verification confirms that the external Freeze Check blocker B-01 is closed and that no further open-ended PRD adversarial-review round is required. Remaining implementation, architecture, optimization, documentation-cleanup and future-evolution questions proceed to L2 Architecture Evidence or later stages.
