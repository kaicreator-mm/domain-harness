# DomainHarness — Harness Authoring Guide

> Chinese companion: `HARNESS_AUTHORING_GUIDE.zh-CN.md`.
>
> Audience: domain engineers, architects and coding Agents designing or refactoring a domain workflow onto DomainHarness v0.1.

## 1. Authoring objective

A good Harness is a **thin executable projection of stable domain process**.

It should make orchestration, validation, waiting and recovery explicit without becoming:

- a replacement for the domain model;
- a giant prompt graph;
- a hidden integration layer;
- a UI state machine;
- a generic DAG implementation;
- an opaque script application.

The authoring goal is to choose the smallest correct primitive for each piece of work.

## 2. Start from a Critical Journey

Do not start from all project code. Start from one real end-to-end journey with a clear business outcome.

Write it first as plain domain steps, for example:

```text
load authoritative context
→ generate proposal
→ validate proposal
→ review quality
→ wait for approval
→ commit approved result
```

Then identify for every step:

- input;
- output;
- owner;
- deterministic/semantic nature;
- side effects;
- failure meaning;
- whether it can be retried;
- whether it mutates authoritative state.

Only after that should you choose DomainHarness primitives.

## 3. Primitive decision model

Use this order.

### 3.1 Can JSON Schema enforce it?

Use Schema for structural validity.

Good examples:

- required fields;
- type/range constraints;
- discriminated structures;
- waiting event payload shape;
- Skill/Tool input/output contract.

Do not use Skill/Script to check something Schema can reject before execution.

### 3.2 Can JSONata express it clearly and deterministically?

Use Expression for small mappings, projections and predicates.

Good:

```text
select fields
calculate a simple score
format JSON
threshold route
check a deterministic flag
```

Bad:

```text
hundreds of lines of nested JSONata that no reviewer can reason about
```

When JSONata stops being easy to review, use Script.

### 3.3 Is it complex deterministic logic with no I/O?

Use Script.

Good Script candidates:

- graph traversal;
- parser/normalizer;
- deterministic scoring;
- complex validation algorithm;
- dependency/readiness calculation owned by the domain.

If it needs credentials/network/domain DB mutation, it is not a Script; use Tool.

### 3.4 Does it cross the Runtime boundary?

Use Tool.

Examples:

- read/write authoritative database;
- GitHub operation;
- HTTP/API call;
- object storage;
- filesystem outside Harness assets;
- queue/message publish;
- call another domain service.

Every Tool must have correct `effect` classification before the Workflow is considered recovery-safe.

### 3.5 Does it require semantic AI judgment or generation?

Use Skill.

A Skill should be bounded enough to have a meaningful JSON output schema.

Do not use a Skill when the real task is simply “call an API” or “evaluate a threshold.”

### 3.6 Is it reusable sequential orchestration inside the same Harness?

Use Child Workflow.

Use it when the sub-process has meaningful internal Steps/recovery and a stable result contract.

Do not use Child Workflow merely to avoid a five-line parent Workflow.

### 3.7 Does execution need an external/human decision?

Use Waiting State + `send()`.

The host project is responsible for authorization before sending the event.

## 4. Design boundaries before YAML

Before creating files, draw three boundaries:

```text
Domain Authority
Harness Execution
Host/External Side Effects
```

For every piece of data ask:

> If DomainHarness SQLite disappeared but the domain database remained, would this business fact still be authoritative?

If YES, that fact belongs to the domain system of record, not Runtime state.

For every operation ask:

> Could this operation create an effect that survives a Runtime crash?

If YES, it is probably a Tool and its effect/idempotency must be explicit.

## 5. Design the Tool table first

A strong Harness design usually begins with a Tool table, not Workflow YAML.

Example:

| Tool | Purpose | Effect | Idempotency | Authority |
|---|---|---|---|---|
| `load_record` | read domain record | none | n/a | read-only |
| `save_draft` | upsert draft | idempotent | run/step key | domain DB |
| `send_email` | send external mail | non-idempotent unless provider key proves otherwise | explicit | external |

If the effect is uncertain, choose the safer classification until the external system's semantics are proven.

Never label a Tool idempotent simply because “we normally call it once.”

## 6. Design Skills from schemas outward

For AI work, define the output contract before writing long instructions.

Recommended order:

```text
expected structured output
→ output JSON Schema
→ required input
→ minimum references
→ instructions/rules
→ examples/counterexamples
→ optional execution profile
```

This keeps a Skill focused on one semantic capability.

A Skill should return a proposal/assessment/result. The Workflow owns routing; a Tool owns external mutation.

## 7. Keep Workflow state meaningful

State names should answer:

> What domain/execution stage are we in?

Good:

```text
load_context
analyze
normalize
await_review
commit
completed
failed
```

Avoid names tied to code structure:

```text
handler_1
controller_b
next_step
call_llm
```

Avoid names tied to provider implementation:

```text
ask_openai
claude_review
```

The AI Runtime may change provider without changing domain workflow semantics.

## 8. Prefer short states and explicit outputs

Each executable state should do one logical thing.

The output should be understandable as `steps.<stateId>`.

Example:

```yaml
lookup:
  invoke:
    tool: load_record
    input: '{"id": input.id}'
```

Later states can read:

```text
steps.lookup
```

If the output contains many unrelated responsibilities, the state/Tool/Skill may be too broad.

## 9. Route design

Route conditions should be deterministic, small and reviewable.

Recommended:

```yaml
on:
  done:
    - target: review
      when: "output.confidence < 0.8"
    - target: completed
```

Avoid embedding a second program in route expressions.

When the route decision is complex:

```text
complex deterministic decision
→ compute explicit decision in Script/Expression Step
→ route on a simple field
```

This improves testability and crash replay clarity.

Always provide an unconditional fallback when using conditional routes.

## 10. Error-route design

Separate three meanings:

1. Runtime/executor error;
2. recoverable domain condition;
3. successful negative domain outcome.

Example:

```text
Tool network failure → on.error / Runtime error path
proposal needs human review → successful Step output + route to waiting
review rejects proposal → final state `rejected` (Runtime completed)
```

Do not route every negative business result to `failed`.

The `failed` final state is reserved for Runtime failure semantics.

## 11. Waiting-state design

Use waiting when workflow progress legitimately depends on an external/human event.

A waiting state should define:

- allowed event type(s);
- payload schema when payload matters;
- deterministic target/route;
- host authorization expectations.

Example:

```yaml
await_approval:
  on:
    approve:
      schema: schemas/approval.schema.json
      target: commit
    reject:
      target: rejected
```

Do not poll inside Script or repeatedly invoke AI while waiting for a person. Persist the waiting state and let the host call `send()`.

## 12. Child Workflow design

Use a Child Workflow when all are true:

- the subflow is reusable or conceptually distinct;
- it can accept explicit JSON input;
- it has a meaningful output contract;
- it belongs to the same domain/Harness;
- sequential composition is sufficient.

Do not make a Child depend implicitly on parent `steps`; pass required data explicitly.

Good boundary:

```text
parent invoke.input
→ child isolated scope
→ child workflow.output
→ parent Step output
```

This makes recovery and reuse predictable.

## 13. Expression vs Script review rule

Prefer Expression when:

- under a few readable transformations/conditions;
- naturally JSON-oriented;
- easy to test with a small fixture table.

Prefer Script when:

- algorithm has loops/graph traversal;
- readability in JSONata is poor;
- intermediate variables/data structures matter;
- error diagnosis needs code structure.

Do not choose Script for external I/O.

## 14. Script authoring rules

Script should be deterministic with respect to its input and Runtime-provided logical context.

Recommended:

```js
export default function execute(input) {
  // deterministic transformation
  return result;
}
```

Do not rely on:

- process environment credentials;
- arbitrary filesystem/network access;
- global mutable state;
- current wall clock for control semantics;
- random values.

Even though Script is trusted code and Worker Threads do not sandbox malicious code, domain authors should keep Script within the intended deterministic contract.

## 15. Tool authoring rules

A Tool should be designed as a clear host capability boundary.

Tool review checklist:

- input/output are JSON-compatible;
- schemas exist when they add safety;
- effect class is justified;
- idempotent Tool actually uses or maps the supplied `idempotencyKey` where external semantics require it;
- `AbortSignal` is observed when practical;
- timeout behavior is understood;
- credentials stay in Host configuration;
- business authorization occurs in the domain layer;
- error messages do not leak secrets.

For non-idempotent Tool execution, authors must accept the v0.1 recovery rule: uncertain started execution becomes `interrupted`; automatic replay is intentionally refused.

## 16. Skill authoring rules

A Skill should contain domain intelligence, not Runtime intelligence.

Good Skill instruction covers:

- domain task;
- input interpretation;
- relevant constraints;
- references;
- expected structured result;
- abstention/uncertainty handling when relevant.

Avoid:

- hard-coded provider names;
- retry loops;
- deciding next workflow state;
- writing to databases/APIs;
- hidden calls to other Skills;
- instructions to ignore the output schema.

## 17. Schema design

Use schemas at important trust boundaries:

```text
external event payload
Tool input/output where useful
Skill input/output
important JSON structures
```

Schema is preferable to prose when a rule can be mechanically checked.

Avoid an “anything object” output schema for a critical Skill; that defeats structured validation.

## 18. `maxSteps` sizing

Estimate the longest legitimate path, including loops/retries represented as logical visits and accepted waiting events.

Then choose reasonable headroom.

Example reasoning:

```text
normal journey: 12 visits
worst valid review loop: +12
nested child maximum: +18
reasonable headroom: x2
maxSteps: 84 or 100
```

Do not use values such as one million unless there is evidence that the domain needs that many logical visits.

## 19. Recovery-aware authoring

For every Tool boundary, test mentally or explicitly:

```text
crash before Tool executes
crash during Tool
crash after external side effect but before journal completion
crash after journal completion but before route/control commit
```

Then confirm the chosen effect classification yields acceptable behavior.

For important workflows, create automated tests around at least the high-risk boundaries.

## 20. Definition-lock awareness

Changes to executable assets can change `definitionHash`, including meaningful Workflow/Skill/resource/schema/Script content.

Before deploying a breaking Harness definition with active Runs decide to:

```text
drain
cancel
finish on old definition
or deploy with a controlled version strategy
```

Do not assume active v0.1 Runs will migrate automatically.

Host Tool code is outside the hash, so Tool deployments require separate compatibility discipline.

## 21. Harness review sequence

Review in this order:

1. authority boundary;
2. Tool effects;
3. Skill schemas/boundaries;
4. deterministic logic placement;
5. Workflow structure;
6. routes/fallbacks;
7. waiting/event authorization boundary;
8. Child scope/output;
9. recovery implications;
10. `maxSteps` and loops;
11. validation coverage.

Reviewing YAML syntax first can miss much more serious architectural mistakes.

## 22. Validation suite for a new Harness

Minimum recommended suite:

### Loader/static

- valid Harness loads;
- missing Skill/Tool/Script/Child fails;
- invalid target/unreachable/cycle fails;
- forbidden JSONata fails;
- path escape/symlink escape fails.

### Primitive

- one Skill success + invalid output;
- Tool effect behavior;
- Expression result/error;
- Script result/timeout/cancel;
- Child result/failure/recovery;
- waiting valid/invalid event.

### Lifecycle

- start → completed;
- start → waiting → send → completed;
- cancel active work;
- resume persisted running work;
- get/listRuns observation.

### Recovery

- completed Step reuse;
- idempotent Tool replay with stable key;
- non-idempotent Tool interrupted;
- terminal journal/control-lag reconciliation;
- definition/engine mismatch rejection.

### Domain journey

- one real positive Critical Journey;
- one negative-but-successful domain outcome;
- one domain/external failure journey.

## 23. Anti-pattern catalog

### Giant Workflow

Hundreds of states replicating application internals. Split by meaningful domain subflows or keep orchestration in the domain app when it is not stable Domain Data.

### Giant Skill

One prompt performs research, planning, approval and mutation. Split semantic capability from deterministic/workflow/Tool responsibilities.

### Giant Script

Script becomes a second application/service. Move I/O and business authority back to domain code/Tools; keep only deterministic algorithmic logic.

### Tool without effect semantics

This makes crash behavior undefined. Classification is mandatory for safe recovery.

### Hidden parent-child coupling

Child assumes access to parent data not passed through input. Explicitly map it.

### UI Workflow

States mirror screens/buttons rather than domain process. UI can change without changing domain execution policy.

### Provider Workflow

States encode specific models/providers. Put model strategy in AI Runtime.

### Error as business outcome

`rejected`/`not_recommended` incorrectly ends in `failed`. Use successful domain final state.

### Infinite review loop + huge maxSteps

Fix loop policy. Do not hide it with an excessive limit.

## 24. Authoring checklist

Before merge:

- [ ] domain authority boundary documented;
- [ ] one real Critical Journey selected;
- [ ] each state maps to exactly one clear responsibility;
- [ ] correct primitive chosen using deterministic-before-AI rule;
- [ ] all Tools registered and effects justified;
- [ ] Skills have required output schemas and bounded scope;
- [ ] no provider-specific routing in Harness;
- [ ] routes are deterministic with fallbacks;
- [ ] waiting event schemas/authorization boundary understood;
- [ ] Child inputs/outputs explicit and cycles absent;
- [ ] Scripts contain no intended external I/O;
- [ ] `maxSteps` justified;
- [ ] positive, negative and recovery tests exist;
- [ ] active-run definition compatibility considered;
- [ ] no XState/internal Runtime API leaks into domain assets.

## 25. Recommended Agent workflow

For an Agent authoring a Harness:

```text
1. Read frozen PRD/architecture/domain authority.
2. Read Domain Data Spec + Harness Technical Spec.
3. Map one Critical Journey.
4. Produce Tool effect table.
5. Produce primitive mapping.
6. Draft schemas first.
7. Draft Skills/Tools contract.
8. Draft Workflow/Child Workflows.
9. Add examples/fixtures.
10. Run static validation/tests.
11. Review recovery boundaries.
12. Only then refactor adjacent journeys.
```

Never ask the Agent to infer domain authority from Runtime implementation.

## 26. Related documents

- `HARNESS_TECHNICAL_SPEC.md`
- `../domain-data/DOMAIN_DATA_SPEC.md`
- `../domain-data/DOMAIN_DATA_AUTHORING_GUIDE.md`
- `../architecture/DOMAINHARNESS_INTEGRATION_MODEL.md`
- `../sdk/DomainHarness_v0.1_AGENT_MIGRATION_GUIDE.md`
