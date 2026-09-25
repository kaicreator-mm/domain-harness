# T-016 L3 — HarnessMachine execution journal + ObservedDependencySet production integration

**Issue:** #234  
**Branch:** `v0.3_t016`  
**Actual dependency-complete baseline:** `v0.3@0087720854dd235e02a35d612bddb4a023d80171`  
**Depends On:** T-002 + T-007 (including repair PR #262)  
**Interface reference:** merged T-013 Exact Semantic Cache contract only; T-018 DecisionResolver scope remains deferred  
**Risk:** H  
**L3:** REQUIRED  
**Status:** DOING

## 0. Frozen Authority / Scope

Read together as authority:

- `docs/product/DomainHarness_v0.3_PRD_FROZEN.md`;
- frozen PRD Amendment A1 + freeze record;
- `docs/architecture/DomainHarness_v0.3_L2_ARCHITECTURE_EVIDENCE_FROZEN.md`;
- frozen L2 Amendment A1 + freeze record;
- `docs/implementation/DomainHarness_v0.3_TASK_DAG.md`;
- GitHub Issue #234;
- `.dev-standard/PROJECT_OVERRIDES.md`;
- `.dev-standard/VERSION` → `kaicreator-mm/ai-development-standard@0446f04583f6cf464c835f26e2f657c8b703cb4e` (`2.0.0`).

Execution began only after re-checking `v0.3`; it remained exactly `0087720854dd235e02a35d612bddb4a023d80171`, which already contains the T-007 repair merge PR #262. The repository had no checked-in T-016 task-pack file at that baseline, so this L3 document is the task-specific implementation checkpoint derived from Issue #234 + the frozen Task DAG.

Frozen boundaries remain:

```text
Business Harness / HarnessMachine
→ structured DomainDecision / DomainEvent proposal
→ DecisionTrace / dependency evidence

Domain Workflow / Domain Machine
→ transition authority

Durable effect path
→ mutation/effect authority

Governance / promotion / activation
→ separate explicit authorities

AI Runtime / ModelPort
→ provider/model routing, retry/fallback policy
```

T-016 does not implement T-017 promoted-child runtime, T-018 DecisionResolver, T-019/T-021 central Runtime wiring, provider/model routing, business mutation, promotion/activation, Governance Baseline, or real host durability.

## 1. Tests

Focused test file:

`packages/domain-harness/tests/harness/harness-execution-journal.test.ts`

Required scenarios:

1. committed AI result → retry/restart simulation does not call `ModelPort` again;
2. committed query result → query executor does not run again;
3. same execution slot + same semantic identity → deterministic replay;
4. same execution slot + conflicting semantic identity → fail closed without external execution;
5. fresh execution → precise Fact/CDI/query/tool/semantic dependency evidence;
6. query provenance cannot be caller-predeclared and appears only from actual execution/committed replay;
7. dynamically observed versioned dependency represented in pre-read material → observed-dependency cache-write eligibility may remain true;
8. dynamically observed unversioned/live dependency → exact-cache write ineligible;
9. deterministic crash window after external execution + durable journal commit but before caller return → recovery replays committed result without duplicate external execution;
10. cancellation leaves ambiguous started work fail-closed on restart; committed failures replay without duplicate calls;
11. mutation capability remains forbidden and no Workflow transition/mutation authority is introduced;
12. execution journal storage/identity remains separate from T-013 semantic cache storage/identity.

Additional invariants exercised by the focused suite:

- the journal `begin` operation is atomic insert-or-existing, so a concurrent loser never executes the same slot;
- query/tool execution with no exact tool semantic identity is recorded as unversioned live semantic dependence for cache-write eligibility;
- a successful query dependency must be runtime-validated as `kind: query`; Fact/CDI provenance cannot be smuggled back through a query result;
- a journal conflict/ambiguous record is never converted into a normal recoverable query observation.

Required repository validation for the final exact HEAD:

```text
npm ci
npm run build
npm run lint
npm run typecheck
npm test
node --import tsx --test packages/domain-harness/tests/harness/harness-execution-journal.test.ts
npm pack -w @kaicreator/domain-harness
ci/woodpecker/pr/verify
```

Real OS kill/reopen, Node SQLite durability and Expo force-stop/relaunch are explicitly not T-016 evidence; they remain T-022/T-023.

## 2. Contract / Interface

### 2.1 Deterministic execution slot vs full operation identity

T-016 separates a deterministic operation **slot** from the full semantic operation identity so corruption can be detected instead of silently turning into a cache/journal miss.

Stable slot:

```text
workflow target
+ durableControlTurnId
+ operation kind (ai | query)
+ positive stable operation ordinal
```

Full operation identity:

```text
identity version
+ slot
+ operation semantic contract digest
+ exact promoted-child contentDigest when supplied by an already-pinned caller
```

The operation semantic contract digest is canonical and derived from:

```text
caller-bound Harness/decision semantic contract digest
+ operation kind
+ canonical operation material
```

For AI the operation material includes the exact provider-neutral `BusinessHarnessModelRequest`. For query it includes capability id/description/schema, exact query input, and exact tool identity when available. Provider/model names are never included and no routing policy is introduced.

A store lookup is by deterministic slot. If that slot contains a different full semantic identity, execution history is conflicting/corrupt and fails closed. It is not treated as a miss.

### 2.2 Journal logical contract

Portable logical store:

```text
read(slot)
begin(identity) -> created | existing
commit(identity, outcome)
```

`begin` is atomic insert-if-absent. A returned `existing` record is never permission to execute again.

Logical record states:

```text
started
committed(outcome)
```

Committed outcomes contain canonical operation completion data. They prove only AI/query execution completion for that exact execution operation. They do not prove transition, effect, mutation, snapshot, semantic equivalence, promotion or activation.

`VolatileHarnessExecutionJournalStore` is a deterministic logical/reference store only. It makes no persistence claim. T-022/T-023 own real host adapters and durability truth.

### 2.3 Journal integration seam

`createJournaledHarnessExecutionIntegration()` wraps exactly one existing bounded `HarnessMachine` invocation:

```text
existing BusinessHarnessInput
→ journal-wrapped ModelPort/query bindings
→ existing HarnessMachine
→ existing BusinessHarnessResult
→ integrated journal/dependency evidence
```

It is not a second Harness Runtime and it does not drive Domain Workflow state.

Direct model/query bounds, cancellation, output validation, mutation prohibition and finite result surfaces remain owned by the existing T-007 `HarnessMachine`.

### 2.4 Observed dependency boundaries

The integrated result keeps three explicit evidence classes:

```text
provenance
= T-007 domain-fact / compiled-intelligence / actual query provenance

semantic
= T-002/T-013 CompiledArtifactIdentity
  + ResolvedSemanticContextProjection
  + SemanticRevisionIdentity
  + unversionedLiveSourceIds

toolArtifacts
= exact actually-used query/tool CompiledArtifactIdentity subset
```

Caller-supplied `selectedDependencies` are runtime-validated again and may only be `domain-fact` / `compiled-intelligence`. This closes T-007 independent-review P2 at the T-016 production integration boundary: a non-typechecked caller cannot pre-claim `kind: query` observed provenance.

For dynamic query observation:

```text
successful query dependency with revision
→ SemanticRevisionIdentity { sourceId = query identity, revision }

successful query dependency without revision
→ unversionedLiveSourceIds += query identity

successful query without dependency identity
→ unversionedLiveSourceIds += query:<capabilityId>

actually used query capability with exact tool artifact identity
→ semantic.artifacts += exact tool identity

actually used query capability without exact tool identity
→ unversionedLiveSourceIds += tool:<capabilityId>
```

Query provenance is reconstructed identically on committed replay because the exact query result is journaled and revalidated through the same boundary.

### 2.5 T-013 cache-write eligibility handoff

T-016 imports only T-013's dependency-validation interface:

`validateObservedDependencySet(preReadDependencies, observedDependencies)`.

The integrated result reports observed-dependency eligibility only. It never reads/writes the semantic cache. T-013's `prepareSemanticCacheWrite()` remains the later final authority for pre-read eligibility, exact producer prebinding/observation and entry construction; T-018 owns resolver wiring.

Consequences:

- versioned dynamic observation must exactly match pre-read semantic material to remain eligible;
- an unversioned/live dynamic dependency makes write ineligible;
- extra pre-read material is never fabricated as observed evidence;
- a cache hit never becomes an execution-journal commit or mutation commit.

## 3. Core Implementation

### 3.1 AI operation

For each model turn:

```text
derive stable AI slot + exact semantic digest
→ journal read
→ committed exact hit: replay exact captured response/failure
→ started exact hit: ambiguous, fail closed, no provider call
→ conflicting identity: fail closed, no provider call
→ absent: atomic begin(started)
→ call injected provider-neutral ModelPort once
→ capture canonical return/failure
→ commit exact outcome
→ only then return to HarnessMachine
```

ModelPort exceptions are captured as committed operation outcomes. Replaying the same execution therefore reproduces the failure without paying for/repeating a provider call. Provider-internal retry/fallback remains outside DomainHarness.

### 3.2 Query operation

For each allowed query:

```text
derive stable query slot + exact semantic digest
→ same journal protocol
→ committed exact hit: replay exact query return/failure
→ fresh execution: call host query executor once
→ commit before returning to HarnessMachine
→ runtime-validate query provenance
→ update actual semantic/tool observations
```

Ordinary host query exceptions preserve T-007 behavior: they are journaled, then re-thrown to the existing query leaf so HarnessMachine may convert them to a bounded `{ ok:false, error }` observation. Journal conflict/ambiguous completion is different: it is transformed into a contract-invalid query output, forcing the existing `QUERY_OUTPUT_INVALID` fail-closed path rather than becoming a recoverable observation.

Mutation bindings are not wrapped as query work and remain blocked by T-007 before executor invocation.

### 3.3 No central runtime wiring

T-016 does not bind this store into `DurableExecutionStore`, snapshots, RuntimeStore, T-017 child pins or T-019 control turns. It freezes the portable logical operation/journal integration contract so those later tasks can wire the exact authority into their existing durability domain without redefining T-016 semantics.

## 4. Failure Handling

| Condition | T-016 behavior |
| --- | --- |
| exact committed AI/query record | deterministic replay; external port not called |
| same slot + conflicting semantic identity | fail closed; no external call |
| existing `started` record | `AMBIGUOUS_COMPLETION`; no automatic retry |
| concurrent `begin` loser | receives existing record; no external call |
| cancellation before execution begins | cancelled; no committed result claimed |
| cancellation after `started` / while external call active | no success commit is fabricated; record remains ambiguous for restart |
| ordinary ModelPort failure | exact failure outcome committed; HarnessMachine gets model failure; restart replays failure |
| ordinary query executor failure | exact failure outcome committed; existing bounded query-failure observation semantics preserved |
| non-canonical external return | exact invalid-output capture committed; fail closed through Harness contract |
| query returns non-query dependency provenance | fail closed as invalid query output; no fabricated Fact/CDI/query provenance |
| journal read/begin unavailable | fail closed; no external execution after missing authority |
| commit call reports error after external completion | current attempt never retries; fresh recovery must re-read and either replay committed truth or fail ambiguous |
| observed live/unversioned semantic source | current fresh Harness result may exist; exact-cache write handoff is ineligible |
| missing exact used tool identity | tool treated as unversioned live; exact-cache write handoff is ineligible |

The deterministic crash-window test models `commit persisted → call throws before return` and proves the next invocation replays without external duplication. This is not evidence of filesystem/database/process-kill durability.

## 5. Reference

Frozen authority preserved by this L3:

- Frozen PRD: Execution Journal = same execution identity / committed-work replay; Exact Semantic Result Cache = cross-execution semantic reuse. They are never collapsed.
- Frozen L2 D3: already committed AI/query/effect work must not duplicate after crash/restart.
- Frozen L2 exact operation identity: workflow target + durable control turn + kind + stable operation ordinal/id + semantic contract digest (+ exact promoted-child digest when applicable).
- Frozen L2: conflicting committed semantic identity at one deterministic slot is corruption/fail-closed.
- T-002: exact `CompiledArtifactIdentity`, semantic projection and `SemanticRevisionIdentity` vocabulary.
- T-007 + repair: bounded HarnessMachine, provider-neutral ModelPort, actual query provenance only, no transition/mutation/promotion/activation authority.
- T-013: semantic cache `ObservedDependencySet` + two-phase write eligibility; cache store has no execution-journal authority.
- Amendment A1: Business Harness is one bounded child capability and provider/model routing remains AI Runtime authority.

## 6. Allowed Write Set

T-016 is restricted to:

- `packages/domain-harness/src/harness/execution-journal.ts`;
- `packages/domain-harness/src/harness/harness-execution.ts`;
- `packages/domain-harness/src/harness/index.ts` narrow exports;
- `packages/domain-harness/tests/harness/harness-execution-journal.test.ts`;
- this T-016 task pack/evidence.

No central Runtime assembly, DecisionResolver, semantic-cache storage implementation, promoted-child runtime, effect executor, Governance registry, provider router or package-root export is modified.
