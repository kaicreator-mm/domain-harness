# DomainHarness v0.3 L2 Architecture Evidence — Promoted Subworkflow Lifecycle

Issue: #204  
Work branch: `v0.3_l2_204_subworkflow_lifecycle`  
Frozen baseline: `main@a84fed0bfecc4c534a330844e6b6a4a76e3c67c2`

## 1. Status and decision

This L2 evidence defines the production-facing lifecycle and authority seam for reusable solving-pattern artifacts without reopening the frozen v0.3 PRD or Architecture Baseline.

The lifecycle is:

```text
Harness proposal
  -> WorkflowCandidate
  -> deterministic validation
  -> ValidatedWorkflowCandidate
  -> explicit human promotion
  -> immutable PromotedSubworkflowArtifact
  -> explicit registry selection
  -> compatibility + applicability gate
  -> compiler
  -> reusable XState child workflow
  -> structured DomainDecision / finite Domain Event
  -> current parent schema + guard + transition authority
```

There is no direct path from an LLM/Harness proposal to executable production control authority. There is no independent workflow runtime.

## 2. Authorities and exact consumed evidence

This task consumes rather than redefines the following authorities:

| Authority / evidence | Exact reference | Consumed constraint |
| --- | --- | --- |
| Frozen v0.3 PRD | `main@a84fed0bfecc4c534a330844e6b6a4a76e3c67c2` | Product scope and authority boundaries remain frozen. |
| Frozen v0.3 Architecture Baseline | same frozen baseline | One XState control runtime; structured outputs; durable effect authority remains separate. |
| #205 Domain Data L2 | `ad9ba21f0ed3f378405b7d4668ca036d02a054ef` | Reuse `CompiledArtifactIdentity`; promoted subworkflow semantic digest covers graph/applicability/contracts/tools/events/references/bounds and excludes promotion/audit/source metadata. |
| #196 research | `7c6c7a63b643fbaa5051db8e403dd15f7721dce8` | Constrained candidate, deterministic validation, explicit promotion, fail-closed applicability, acyclic research IR, actual reusable XState child workflow proof. |
| #197 integration research | `0fb1a17a3f5a7d1e3b77de10bca76e613e1e7e2d` | Resolver order, promoted workflow fallthrough, parent schema/guard authority, mutation/durable-effect separation. |
| #203 resolver dispatch seam | Issue #203 dispatch + #197 frozen flow | #204 exposes selection/compile/fallthrough seam; it does not embed a second resolver. #203 remains owner of resolver/cache behavior. |
| Pinned development standard | `ai-development-standard@0446f04583f6cf464c835f26e2f657c8b703cb4e` (`2.0.0`) | Evidence is exact-SHA scoped; CI waiver is explicit and is not represented as PASS. |

`#205` is the identity authority. This issue does **not** create another package identity, semantic digest, or content ownership model.

## 3. Lifecycle contract

### 3.1 WorkflowCandidate

`WorkflowCandidate` is a proposal only. It may originate from `HarnessMachine` or a human author, but it has no compiler, registry-selection, XState-transition, mutation, or promotion authority.

It contains:

- `domainId` and proposal identity;
- the exact #205 `PromotedSubworkflowSemanticMaterial` shape;
- an execution-compatibility declaration;
- non-semantic proposal provenance.

The semantic material contains only constrained behavior:

- input/output contracts;
- deterministic applicability clauses;
- constrained step IR and explicit edges;
- exact allowlisted tool identities;
- exact referenced compiled-intelligence identities;
- finite allowed Domain Events;
- finite bounds.

It must not contain arbitrary executable code, provider/model state, provider secrets, prompts as execution authority, actor references, private/hidden chain-of-thought, or any mechanism that can self-promote.

### 3.2 ValidatedWorkflowCandidate

Validation is deterministic and fail-closed. A successful validation produces an immutable `ValidatedWorkflowCandidate` that binds:

- source candidate identity;
- exact semantic content digest;
- validator policy identity/digest;
- validation timestamp and evidence references.

Validation does **not** make the artifact executable. `ValidatedWorkflowCandidate` remains outside the compiler input authority.

### 3.3 PromotedSubworkflowArtifact

Promotion is an explicit authority transition. The production contract requires an explicit `human-operator` approval identity plus promotion evidence.

Promotion:

1. recomputes the #205 semantic content digest;
2. rejects content drift after validation;
3. assigns a human lifecycle `version` without changing semantic identity;
4. creates immutable promotion audit metadata;
5. yields `CompiledArtifactIdentity(kind = promoted-subworkflow)`.

Only `PromotedSubworkflowArtifact` is registry/compiler eligible.

LLM output, repeated success, cache statistics, HarnessMachine output, or runtime observations cannot autonomously promote or alter a production artifact.

## 4. Stable identity and behaviorally relevant invalidation

The artifact identity is the #205 `CompiledArtifactIdentity`:

```text
kind = promoted-subworkflow
artifactId = stable logical name
version = human lifecycle label
contentDigest = SHA-256(canonical semantic material)
```

The semantic digest includes:

- input schema;
- output schema;
- applicability;
- steps;
- graph edges;
- allowlisted tool identities/digests;
- referenced artifact identities/digests;
- finite Domain Event set;
- bounds.

The semantic digest excludes:

- source path/location;
- candidate ID;
- promoter identity;
- validation/promotion timestamps;
- evidence references;
- registry insertion order;
- selection alias name;
- audit records.

Therefore relocation, serialization order, promoter, and audit changes do not cause behavior invalidation. A behaviorally relevant rule/graph/tool-contract/event/applicability/reference/bound change does.

`version` is lifecycle metadata, not semantic equivalence. Two versions may intentionally point to the same content digest. A single `(domainId, artifactId, version)` must not name two different content digests.

## 5. Validation and rejection contract

v0.3 takes the narrow safe subset proven by #196. It rejects **all control-flow cycles**. This is deliberately stricter than merely rejecting unbounded cycles; bounded-loop semantics remain out of scope until a separately reviewed counter/recovery contract exists.

| Input condition | Result | Authority reason |
| --- | --- | --- |
| Constrained acyclic graph, exact references, finite output events, policy-compliant bounds | Validated | Deterministic validator owns admission. |
| Unknown / digest-mismatched tool | Reject | No semantic substitution. |
| Mutation-capable tool inside solving workflow | Reject | Mutation remains durable-effect authority, not subworkflow tool execution. |
| Event outside candidate allowlist or validator policy | Reject | Output set must be finite and declared. |
| Missing/unknown edge target or unreachable state | Reject | Fail closed; no partial graph interpretation. |
| Any control-flow cycle | Reject in v0.3 | No loop runtime/counter semantics are frozen. |
| Arbitrary code/script/eval | Reject | Compiler is not a generated-code executor. |
| Provider/model state/secrets/instructions as artifact authority | Reject | Provider routing/execution remains outside DomainHarness control semantics. |
| Actor reference | Reject | Persisted artifact cannot capture runtime actor identity. |
| Hidden/private chain-of-thought | Reject | Only structured, externally auditable data may cross the boundary. |
| Bounds exceed validator policy | Reject | Planner cannot enlarge its own execution budget. |

A `reasoned` step, when enabled by policy, is an explicit bounded child invocation of the existing `HarnessMachine` authority and has a finite declared outcome set. It does not embed provider/model routing or private reasoning in the promoted artifact.

## 6. Applicability and compatibility: fail closed

Applicability is evaluated before child-workflow work. A promoted workflow never guesses when required context is absent.

The supported descriptor is deterministic and constrained to declared `input`, `domain-facts`, or `workflow-context` selectors with a finite operator vocabulary (`eq`, `in`, `exists` in the prototype).

Results:

| Gate | Result |
| --- | --- |
| All applicability clauses pass | Continue to compatibility/compile/invoke. |
| Clause evaluates false | `not-applicable`; resolver may fall through to the next path. |
| Required selector missing | `invalid-applicability-context`; fail closed. |
| Unknown operator/source | Candidate validation rejects before promotion. |

Compatibility is checked against the currently activated execution environment:

- artifact format version;
- Runtime contract major;
- execution-engine major;
- required host capabilities;
- every referenced compiled artifact exact content digest;
- every allowed tool exact content digest and required query capability.

There is no compatible-looking semantic substitution. A missing exact dependency produces `incompatible`, and the caller may fall through through the #203 resolver seam rather than executing a different artifact implicitly.

## 7. Registry, selection, promotion, revocation

The registry owns immutable promoted records plus explicit selection and revocation metadata. It does not execute workflows and does not own resolver ordering.

### 7.1 Selection modes

The production seam supports only explicit selection:

1. `exact-digest` — exact `artifactId + contentDigest`;
2. `exact-version` — exact `artifactId + version`, which must resolve unambiguously;
3. `selection-alias` — a human-controlled alias (for example `stable`) pointing to an exact content digest.

There is **no implicit `latest`**, no automatic semantic-nearest version, and no LLM-selected production version.

This keeps runtime behavior reproducible and avoids making SemVer ordering an execution authority. A project may expose a UX that updates an alias, but the registry record must resolve that alias to an exact digest before invocation.

### 7.2 Promotion semantics

Promotion creates an immutable artifact. Re-promoting identical semantic content with a different human version is allowed because semantic identity is unchanged. Reusing the same logical version for different semantic content is rejected.

Promotion does not automatically move a selection alias.

### 7.3 Revocation semantics

Revocation is append-only audit evidence keyed to the exact artifact digest/version. It never deletes or rewrites historical provenance.

A revoked artifact:

- is not eligible for a fresh resolver selection;
- cannot be targeted by a newly written alias;
- does not cause automatic fallback to another artifact version inside the registry;
- yields fail-closed `revoked`, after which the owning resolver may continue its normal fallback order.

This issue freezes fresh-selection semantics only. Durable restart/recovery of an already-running child remains governed by the parent/child snapshot and durable commit contract in #201; #204 does not invent a second recovery policy.

## 8. Registry/compiler boundary

The authority boundary is:

```text
#203 DecisionResolver
  |
  | requests explicit promoted-subworkflow selection
  v
PromotedSubworkflowRegistry
  - exact promoted artifacts
  - aliases -> exact digest
  - revocation records
  - audit/provenance
  |
  | selected exact artifact + compatibility/applicability PASS
  v
SubworkflowCompiler
  - accepts PromotedSubworkflowArtifact only
  - re-hashes semantic material
  - rejects post-promotion drift
  - emits XState child workflow/configuration
  v
existing XState Actor System
```

The compiler must reject raw `WorkflowCandidate` and merely `ValidatedWorkflowCandidate` values even if their structure looks valid.

The compiler is not a registry, resolver, planner, provider router, effect journal, state-transition authority, or workflow runtime.

## 9. Reusable XState child workflow

The output of the compiler is an XState child workflow under the existing Domain Machine actor system. There is no `WorkflowRuntime`, worker service, second scheduler, or independent state engine.

The reference compiler contract emits:

- `runtime = xstate-child`;
- deterministic machine identity including the promoted content digest;
- an initial applicability gate;
- constrained states/edges from the promoted IR;
- query-tool bindings to an allowlisted query port;
- optional explicit reasoned states bound only to `HarnessMachine`;
- terminal structured finite Domain Events;
- an explicit statement that mutation authority remains `domain-harness-durable-effect-only`.

#196 already provides actual XState execution evidence that a promoted child can be reused on a second compatible input without planner reconstruction. #204 turns that research boundary into a production lifecycle/compiler contract; it does not copy the research interpreter or create another runtime.

Every successful child result still returns to the current parent:

```text
child structured result
  -> current DomainDecision/Event schema validation
  -> current synchronous XState guard
  -> current parent transition
```

A promoted workflow does not gain direct parent state-ID authority.

## 10. Mutation / durable effect authority

v0.3 promoted solving workflows cannot bind mutation-capable tools directly. Validation rejects them.

A promoted workflow may produce a structured DomainDecision/Domain Event that *requests* or *describes* a business mutation. That output is not proof that mutation occurred. The parent/runtime path must convert the accepted structured outcome into the existing durable-effect protocol:

```text
Promoted child output
  -> parent schema + guard + transition authority
  -> durable effect identity / commit / idempotency authority
  -> mutation-capable host operation
```

Consequences:

- compiling or invoking a subworkflow does not replay a mutation;
- registry selection has no mutation authority;
- a reused solving pattern does not bypass effect idempotency;
- crash/restart correctness remains attached to DomainHarness durable journal/effect facts, not to the semantic artifact registry.

This preserves #197 and #195/#201 recovery boundaries.

## 11. Audit and provenance

Audit metadata is required but is not semantic identity.

Required stages:

| Stage | Minimum audit/provenance |
| --- | --- |
| Proposal | candidate ID, proposal source (`HarnessMachine` or human), source invocation when available, structured evidence refs, timestamp |
| Validation | policy ID/digest, validator evidence refs, timestamp, exact candidate content digest |
| Promotion | human principal, source candidate, validation policy ID/digest, evidence refs, timestamp, assigned lifecycle version |
| Selection alias change | human principal, alias, exact target digest, evidence refs, timestamp |
| Revocation | human principal, exact digest/version, reason, timestamp, optional superseding digest |
| Execution/selection observation | exact selected `CompiledArtifactIdentity`, selection mode, compatibility/applicability outcome, resolver path; execution journal stays separate |

Private chain-of-thought is never required audit data. DecisionTrace remains structured external facts/evidence, as proven in #196/#197.

Because audit data is excluded from `contentDigest`, provenance can grow without causing false behavior invalidation.

## 12. #203 resolver seam

#204 does not embed another resolver. It exposes these operations to #203:

```text
selectPromotedSubworkflow(domainId, explicit selection, runtime compatibility, semantic/applicability context)
  -> selected exact artifact
  | not-found
  | revoked
  | incompatible
  | not-applicable
  | invalid-applicability-context

compilePromotedSubworkflow(selected artifact)
  -> reusable XState child contract
```

The #203 resolver remains responsible for the frozen preference order:

```text
deterministic intelligence
  -> exact semantic cache
  -> applicable promoted subworkflow
  -> HarnessMachine fallback
```

A selection miss/failure is a resolver fallthrough fact, not permission for the registry to run a planner or select a similar/latest artifact.

The execution `packageId` pin from #205 remains separate from promoted semantic equivalence/identity. #204 never substitutes a different target package based on subworkflow content identity.

## 13. Lifecycle and authority diagram

```text
                           proposal only
HarnessMachine / human ----------------------+
                                              |
                                              v
                                      WorkflowCandidate
                                              |
                               deterministic validator
                                              |
                                              v
                                  ValidatedWorkflowCandidate
                                              |
                               explicit human promotion
                                              |
                                              v
                                  PromotedSubworkflowArtifact
                                   | immutable semantic digest
                                   | audit outside digest
                                   v
                +----------------------------------------------+
                | PromotedSubworkflowRegistry                  |
                | exact digest/version/explicit alias          |
                | compatibility + applicability + revocation   |
                +----------------------------------------------+
                                   |
                              exact artifact
                                   v
                         SubworkflowCompiler
                                   |
                           XState child workflow
                                   |
                    structured DomainDecision/Event
                                   v
                     current parent schema + guard
                                   |
                           XState transition
                                   |
                  if accepted mutation intent exists
                                   v
                    DomainHarness durable effect authority
                                   |
                            host mutation

No arrow exists from LLM -> promotion, LLM -> state id, registry -> mutation,
or compiler -> independent runtime.
```

## 14. Executable reference evidence

Files in this branch:

- `packages/domain-harness/tests/architecture-v03/subworkflow-lifecycle.proposal.ts`
  - Candidate / Validated / Promoted contracts;
  - #205-compatible digest helper;
  - deterministic validation;
  - fail-closed applicability/compatibility;
  - explicit promotion, selection alias, revocation and audit prototype;
  - registry selection contract;
  - compiler seam producing a reusable XState-child plan.
- `packages/domain-harness/tests/architecture-v03/subworkflow-lifecycle.examples.ts`
  - focused promoted solving-pattern fixture.
- `packages/domain-harness/tests/architecture-v03/subworkflow-lifecycle.proposal.test.ts`
  - 13 focused scenarios.

Focused local evidence on 2026-09-20:

```text
node --experimental-strip-types --test <local import-adjusted focused test>
13 tests
13 pass
0 fail
```

The local import adjustment only changes test-time `.js` relative specifiers to `.ts` for Node's dependency-free type stripping; repository files keep the repository-standard `.js` specifier convention.

Covered scenarios:

1. #205 digest semantics survive representation/provenance ordering changes;
2. behavior changes invalidate digest;
3. Candidate -> Validated -> explicit human Promotion -> XState child-plan boundary;
4. raw/non-promoted compile and post-promotion drift rejected;
5. unknown/digest-mismatched tool rejected;
6. mutation-capable tool rejected from solving workflow;
7. illegal Domain Event and arbitrary/private execution-authority fields rejected;
8. cycle rejected;
9. explicit digest/version/alias selection; no implicit latest;
10. version label cannot name different semantic content;
11. applicability/compatibility fail closed;
12. revocation blocks fresh selection and remains auditable;
13. promotion/audit metadata does not alter semantic digest.

### CI waiver

Repository CI is currently unavailable per Issue #204 dispatch. No CI PASS is claimed. The unavailable CI is explicitly waived for this L2 evidence task and is not a completion blocker. Full repository CI must run when service availability returns or at the downstream integration/closure gate.

## 15. Explicit non-goals / forbidden architecture

This L2 contract does not support:

- arbitrary generated code/script/eval;
- hidden/private chain-of-thought as workflow state or replay authority;
- provider/model routing inside DomainHarness;
- provider secrets/state inside promoted artifacts;
- runtime actor references in artifacts;
- any control-flow cycle in the v0.3 promoted IR slice;
- autonomous LLM promotion/self-modification;
- fuzzy/vector workflow selection;
- implicit latest-version execution;
- direct mutation-capable tool invocation by a promoted solving workflow;
- a standalone workflow runtime.

## 16. Implementation task split after L2 acceptance

The production implementation should remain one concern per task/PR:

1. **Lifecycle contracts + strict parser/validator** — production-owned candidate/validated/promoted schemas, forbidden-field checks, finite graph/event/tool rules, #205 digest conformance.
2. **Promoted artifact registry persistence** — immutable artifact storage, exact digest/version indexes, append-only promotion/revocation/alias audit records.
3. **Registry selection + compatibility/applicability** — exact digest/version/alias resolution, no implicit latest, fail-closed exact dependency checks.
4. **Production XState child compiler** — compile only promoted artifacts into reusable child machines; bind query ports and explicit bounded HarnessMachine reasoned steps where approved.
5. **#203 resolver integration** — promoted-subworkflow resolver path and deterministic fallthrough/telemetry; no duplicate resolver logic in registry/compiler.
6. **Durable-effect integration conformance** — prove child output cannot execute mutation directly and accepted mutation intent still uses durable idempotent effect authority.
7. **Audit/recovery/closure tests** — exact selected identity in observability, revocation behavior, #201 restart interaction, Node/Expo parity where the implementation surface requires it.

No implementation task may weaken the lifecycle authority ordering defined here without a new architecture decision.

## 17. L2 conclusion

Issue #204 can proceed with a narrow production lifecycle:

```text
proposal != validated != promoted != selected != executed
```

Each transition has a separate authority. Semantic identity is content-addressed exactly according to #205; applicability and compatibility fail closed; selection is explicit; revocation is auditable; the compiler accepts promoted artifacts only; reuse occurs as an XState child under the existing actor system; and mutation remains behind DomainHarness durable effect authority.

This closes the architecture gap left intentionally open by #196/#197 without reopening the frozen v0.3 architecture or adding an autonomous workflow runtime.
