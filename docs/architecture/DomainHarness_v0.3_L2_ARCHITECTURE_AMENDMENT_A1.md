# DomainHarness v0.3 — L2 Architecture Amendment A1

**Project:** DomainHarness  
**Version:** v0.3  
**Status:** **REVIEW CANDIDATE — TARGETED EXTERNAL ADVERSARIAL REVIEW REQUIRED**  
**Prepared:** 2026-09-20  
**Amends:** `docs/architecture/DomainHarness_v0.3_L2_ARCHITECTURE_EVIDENCE_FROZEN.md`  
**Authority baseline:** `main@466a5196a8b29194b50eb4641d6cf988d38b4da8`  
**Frozen PRD:** `docs/product/DomainHarness_v0.3_PRD_FROZEN.md` (`blob 6a6fb59b156f576d48828019faf0e6039d08d5af`)  
**Frozen PRD Amendment A1:** `docs/product/amendments/DomainHarness_v0.3_PRD_AMENDMENT_A1_ROUND2_REVIEW_CANDIDATE.md` (`SHA-256 1aaea27bed59515a10d54101c917ed1db6fadc33434f5fdfefad4a9e9fe1be01`)  
**A1 Freeze Record:** `docs/product/amendments/DomainHarness_v0.3_PRD_AMENDMENT_A1_FREEZE_RECORD.md`  
**A1 independent review:** `docs/product/amendments/reviews/DomainHarness_v0.3_PRD_AMENDMENT_A1_ADVERSARIAL_REVIEW_R2.md` (`FREEZE_OK`, `P0=0`, `P1=0`)  
**Existing Frozen L2:** `docs/architecture/DomainHarness_v0.3_L2_ARCHITECTURE_EVIDENCE_FROZEN.md` (`blob 4a4755d1bb1f05a71ad0275cf12713f254335144`)  
**CI:** unavailable under operator-directed waiver; **no CI PASS is claimed**.

This is a **narrow normative architecture amendment**. Read the existing Frozen L2 together with this document. Where an explicitly mapped clause conflicts, this Amendment is authoritative. Every existing L2 clause not explicitly superseded below remains frozen and authoritative.

---

# 1. Amendment Scope

PRD Amendment A1 was frozen after the existing L2. The existing L2 already contains the durability, cache, promoted-artifact, recovery and effect contracts required by v0.3; it must not be rewritten.

This Amendment only maps the frozen A1 product abstraction into the existing architecture by resolving the following seams:

1. ownership of Domain Facts, Compiled Domain Intelligence, Domain Governance Baseline and Runtime Evidence;
2. Domain Workflow as the product-level business control-flow authority while XState remains the selected v0.3 engine;
3. Business Harness as the product role implemented by the existing bounded `HarnessMachine` child capability;
4. a future/offline Meta Harness Candidate seam without an autonomous v0.3 Meta Harness runtime;
5. one deterministic validation contract for every Candidate that can become executable Compiled Domain Intelligence;
6. strict separation of proposal, validation, evaluation, promotion and activation;
7. exact Governance Baseline identity, binding, retention, activation and crash/recovery semantics;
8. Runtime Evidence ownership, durability class, provenance, privacy/tenant and Candidate-input boundaries;
9. a shadow-only/non-mutating L4 seam with exact stable fallback identity;
10. pure Guard / Hard Invariant predicates.

This Amendment does **not** reopen product scope, remove XState, add a peer workflow runtime, add autonomous evolution, add an experiment platform, or alter the existing exact semantic cache / durable effect / recovery model.

---

# 2. Authority Inputs

The architecture authority after this candidate is frozen will be:

```text
Frozen v0.3 PRD
+
Frozen PRD Amendment A1
+
Existing Frozen v0.3 L2
+
Frozen L2 Architecture Amendment A1
```

A1's exact reviewed body is authoritative even though its retained filename contains `ROUND2_REVIEW_CANDIDATE`; the Freeze Record establishes its frozen status without editorially changing the reviewed body.

The following prior evidence remains consumed through the Frozen L2 and is not rerun by this Amendment:

- #187 one XState Actor System + structured decision/event boundary;
- #194 exact semantic invocation reuse;
- #195 real crash/reopen and journal-first recovery;
- #196 constrained reusable WorkflowCandidate lifecycle;
- #197 integrated Rule → Cache → Subworkflow → Harness flow;
- #201 recursive snapshot persistence;
- #203 DecisionResolver and exact semantic cache;
- #204 promoted subworkflow lifecycle;
- #205 Domain Data / Compiled Intelligence identity.

No new research claim is introduced here.

---

# 3. Superseded / Preserved L2 Clauses

## 3.1 Explicitly superseded or clarified

Only the following architecture wording is superseded/clarified:

### Existing ADR-01 / architecture map wording

Existing wording that can be read as:

```text
XState = product-level business control-flow contract
```

is superseded by:

```text
Domain Workflow / Domain Machine
= single product-level business control-flow authority

XState
= selected v0.3 implementation engine for that authority
```

The v0.3 implementation remains one XState Actor System. This is an abstraction correction, not an engine replacement.

### Existing ownership map

Rows naming `Domain Machine / XState` as one conceptual owner are refined so that:

- `Domain Workflow / Domain Machine` owns product control semantics;
- XState implements those semantics in v0.3;
- XState actor IDs, internal snapshot encoding and library-specific event shapes are not product identity.

### Existing Domain Data section

The frozen equation remains:

```text
Domain Data = Domain Facts + Compiled Domain Intelligence
```

This Amendment adds a separate `Domain Governance Baseline` authority and a separate `Runtime Evidence` output class. Neither becomes a third member of Domain Data.

### Existing ADR-08

ADR-08 remains authoritative and is **strengthened, not weakened**. Explicit human/operator promotion is the minimum production promotion authority for executable Candidates covered by A1. A policy may gate or reject; it cannot self-promote an LLM/Meta-originated Candidate.

## 3.2 Preserved without semantic change

The following Frozen L2 contracts remain authoritative:

- `DurableExecutionStore` as one per-instance durability/ordering domain;
- `executionFactRevision` fence;
- control snapshot vs committed-work journal separation;
- Durable Control Turn semantics;
- exact semantic cache distinct from execution replay;
- `ObservedDependencySet` and two-phase cache eligibility;
- `SemanticRevisionPort`;
- exact `packageId` retained-instance pinning;
- Promoted Artifact Registry ownership/retention;
- `DynamicChildExecutionPin` insert-once semantics;
- exact content digests;
- AI/query/effect journals;
- durable effect authority and idempotency;
- crash/restart recovery;
- Node / Expo logical contract parity;
- exact-SHA / fail-closed rules;
- resolver order: Rule → Exact Cache → Promoted Subworkflow → HarnessMachine;
- provider/model routing remains AI Runtime / ModelPort authority.

## 3.3 Scope clauses that remain closed

Frozen PRD Non-Goals and L2-deferred scope remain closed. In particular, this Amendment does not authorize autonomous Meta Harness, automatic pattern mining, automatic workflow optimization, production experiment scheduling, canary allocation, automatic metric promotion, automatic activation or live mutating L4 exploration.

No generic interpretive escape hatch is created: only clauses explicitly mapped in this Amendment are superseded.

---

# 4. Updated Architecture Model

```text
                           DOMAIN APPLICATION / HOST
                                     │
                           commands / facts / views
                                     │
                                     ▼
┌────────────────────────────── DomainHarness v0.3 ──────────────────────────────┐
│                                                                              │
│  Domain Facts ──────────────── selected mutable inputs                         │
│                                                                              │
│  Compiled Domain Intelligence                                                │
│  ├─ rules / knowledge / skills / procedures                                  │
│  ├─ workflow definitions / schemas / tool contracts                          │
│  └─ promoted reusable artifacts                                              │
│                                                                              │
│  Domain Governance Baseline                                                  │
│  ├─ Hard Invariants                                                          │
│  ├─ promotion / activation authority policy                                  │
│  ├─ governance-critical evaluation / fallback policy                         │
│  └─ exploration authorization                                                │
│                                                                              │
│  Domain Workflow / Domain Machine  ← single product control-flow authority   │
│           │                                                                  │
│           └─ v0.3 implementation → one XState Actor System                   │
│                                                                              │
│  Decision Point                                                              │
│  ├─ Rule                                                                     │
│  ├─ Exact Semantic Cache                                                     │
│  ├─ Known/Promoted Procedure                                                 │
│  └─ Business Harness when unresolved                                         │
│        └─ v0.3 implementation capability → bounded HarnessMachine child      │
│                                                                              │
│  structured DomainDecision / DomainEvent                                     │
│       → schema → pinned Hard Invariants → guard → transition                 │
│       → durable effect intent → Business Store / external SoR                │
│                                                                              │
│  DurableExecutionStore                                                       │
│  ├─ exact package execution pin                                              │
│  ├─ exact GovernanceExecutionPin                                             │
│  ├─ control snapshots / dynamic-child pins                                   │
│  └─ AI/query/effect committed-work journals                                  │
│                                                                              │
│  Runtime Evidence                                                            │
│  └─ provenance-bound execution/evaluation evidence, never replay authority   │
└──────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
                         future/offline proposal seam
                                     │
                           Candidate → validation
                                     │
                         human promotion / activation
```

There is still one business control runtime in v0.3. The new Governance Baseline and Runtime Evidence authorities do not create peer workflow runtimes.

---

# 5. Domain Data Ownership

## 5.1 Domain Facts

Ownership: domain application / Business Store / external System of Record unless an explicit domain contract says otherwise.

Properties:

- mutable/current runtime inputs;
- selected through declared deterministic projections;
- not promoted merely because they participate in a decision;
- not part of Compiled Domain Intelligence content identity unless intentionally materialized as versioned reference data under an explicit artifact contract.

## 5.2 Compiled Domain Intelligence

Ownership remains split exactly as the Frozen L2 defines:

- package-bundled immutable compiled intelligence is owned by the target package/compiler lifecycle;
- registry-promoted immutable artifact bodies are owned by the Promoted Artifact Registry.

Compiled Domain Intelligence is versioned/content-addressed cognition, not business fact storage.

## 5.3 Domain Governance Baseline

Ownership: a **human/operator governance authority**, represented by a persistent logical Governance Baseline Registry/Store. It may be physically colocated with existing package/registry persistence but is a separate logical authority and content identity.

It contains only governance-critical controls such as:

```text
Hard Invariants
Promotion Authority Policy
Activation Authority Policy
governance-critical Evaluation Policy
Exploration Authorization
governance-critical Fallback Policy
```

It is not ordinary Compiled Domain Intelligence and cannot be modified, promoted or activated by Business Harness, Meta Harness or an LLM Candidate.

## 5.4 Runtime Evidence

Ownership: DomainHarness execution/audit boundary for generated evidence records, subject to domain privacy/tenant policy. It is neither Domain Facts nor active Compiled Domain Intelligence and never becomes execution replay authority.

---

# 6. Governance Baseline Contract

## 6.1 Exact identity

Normative logical shape:

```ts
interface GovernanceBaselineIdentity {
  domainId: string;
  governanceId: string;
  schemaVersion: string;
  version?: string;       // operator-facing lifecycle label only
  contentDigest: string;  // canonical immutable semantic content digest
}
```

`version` never replaces `contentDigest`.

The digest is computed over canonical governance semantics, including every behaviorally relevant Hard Invariant and governance-critical authority rule. Audit metadata such as timestamps, signatures or operator display names may be stored alongside the artifact but SHALL NOT change semantic content identity unless the contract explicitly makes them behaviorally relevant.

Changing governance semantics creates a new `contentDigest`; mutation-in-place under the same digest is forbidden.

## 6.2 Governance-critical classification default

A policy/control is treated as governance-critical by default.

```text
unknown classification
→ governance-critical
```

It becomes non-governance only through an explicit human/operator governance classification performed under the then-active Governance Baseline. A Candidate/LLM cannot classify its own governing rule as non-governance.

## 6.3 Baseline body retention

Every exact baseline body referenced by an active or recoverable `GovernanceExecutionPin` SHALL remain resolvable. The logical Governance Baseline Registry/Store is retention authority.

Garbage collection is permitted only after reference accounting proves that no active/recoverable execution pin, governance audit record or required validation/promotion record needs the exact body.

## 6.4 Governance change procedure

Governance changes are not ordinary Meta Harness Candidates.

Required flow:

```text
operator-governed governance proposal B2
→ deterministic schema/integrity validation
→ evaluate B2 under exact pre-change active baseline B1
→ explicit human/operator governance approval
→ explicit activation of B2 for future bindings
```

`B2` cannot weaken B1 and then use B2 to approve itself.

---

# 7. Governance Baseline ↔ Package / CDI Binding

## 7.1 Activation binding for new instances

The existing exact target-package activation contract remains the concrete package activation mechanism. A1 extends the architecture with an exact governance binding for **new instance creation**.

Logical shape:

```ts
interface DomainActivationBinding {
  domainId: string;
  packageId: string;
  domainIntelligenceContentDigest: string;
  governanceBaseline: GovernanceBaselineIdentity;
}
```

This binding is operator-governed activation metadata. It does not merge Governance Baseline bytes into the target package's semantic content digest.

The runtime SHALL resolve one exact activation binding when a workflow instance is created. No running instance consults `current`, `latest` or another floating governance alias to determine its authority.

## 7.2 CDI compatibility with Governance Baseline

Package-bundled and registry-promoted Compiled Domain Intelligence MAY declare governance contract/schema compatibility requirements. Before fresh activation/selection, DomainHarness validates those requirements against the exact Governance Baseline being bound or already pinned.

A promoted artifact validated under baseline `B1` is not automatically valid for promotion/activation under baseline `B2` when behaviorally relevant governance changed. The validation result carries the exact baseline identity; if the target authority changed, revalidation is required unless a deterministic compatibility rule proves equivalence.

## 7.3 Running instances

Activation changes never rewrite an existing instance's package or governance pins.

```text
new active package/baseline binding
!=
running-instance authority rewrite
```

For a security/governance emergency, v0.3 permits an explicit operator abort/quarantine/recovery action. It does **not** permit silent semantic rebasing of an execution history onto a different Governance Baseline.

---

# 8. Workflow / XState Boundary

Product contract:

```text
Domain Workflow / Domain Machine
= State + Event + Guard + Transition + Invocation + Wait
  + Timer/Deadline + Callback + Failure + Recovery + Effect Intent
```

v0.3 implementation:

```text
Domain Workflow contract
→ XState machine/actors
```

Consequences:

- Domain Workflow is the single product-level business control-flow authority;
- XState remains the only selected v0.3 control engine;
- no second engine/runtime is introduced;
- library-specific state IDs, actor references and serialized snapshot bytes are internal implementation details;
- recursive XState persistence remains the existing Frozen L2 implementation contract;
- generated/public app contracts are expressed in Domain Workflow/Domain Event terms, not XState internals.

## 8.1 Guard / Hard Invariant purity

Both Workflow guards and Hard Invariant predicates SHALL be:

- synchronous for the transition/admission decision;
- deterministic for declared inputs;
- side-effect free;
- free of LLM/model calls;
- free of Tool calls;
- free of external I/O.

Required path:

```text
explicit Rule / Cache / Procedure / Business Harness invocation
→ structured result
→ schema validation
→ pinned Governance Baseline Hard Invariants
→ current Workflow guard
→ transition
→ durable effect intent
```

If reasoning or external observation is required, it occurs before predicate evaluation as an explicit invoked step. `guard() → LLM → transition` is forbidden.

Hard Invariants are evaluated using the exact `GovernanceExecutionPin`, never a floating active baseline.

---

# 9. Business Harness Boundary

`Business Harness` is the product role for unresolved runtime semantics. The existing bounded `HarnessMachine` child is the selected v0.3 implementation capability for this role; this mapping does not introduce another runtime.

Business Harness may consume selected:

- Domain Facts;
- package/registry Compiled Domain Intelligence;
- Knowledge / Skills / Decision Procedures;
- allowed read/query tools;
- bounded LLM reasoning through ModelPort / AI Runtime;
- current Domain Workflow context;
- exact pinned Governance Baseline constraints relevant to its output contract.

It may emit:

```text
DomainDecision
DomainEvent proposal
DecisionTrace
ReusablePatternCandidate
ObservedDependencySet
```

It SHALL NOT:

- set Domain Workflow state;
- bypass current schema, Hard Invariants or guards;
- directly mutate authoritative Business State;
- bind mutation-capable tools outside durable effect authority;
- replace active Compiled Domain Intelligence;
- change Governance Baseline;
- promote or activate its own Candidate;
- own provider/model routing strategy.

`DecisionTrace` is structured provenance/explanation material and SHALL NOT contain hidden/private chain-of-thought as execution authority.

---

# 10. Meta Harness Candidate Seam

v0.3 defines only a future/offline proposal role:

```text
Runtime Evidence
→ offline/future operator tooling or Meta Harness role
→ Candidate
```

Allowed ordinary Candidate kinds include:

```text
RuleCandidate
DecisionProcedureCandidate
SkillCandidate
WorkflowCandidate
```

This seam does not create:

- an autonomous Meta Harness service;
- an always-running self-improvement loop;
- an experiment scheduler;
- automatic pattern mining;
- automatic promotion/activation;
- `PolicyCandidate` / `HardInvariantCandidate` ordinary production authority.

Governance changes follow §6.4 instead of this ordinary Candidate path.

---

# 11. Unified Candidate Validation Contract

Every Candidate capable of becoming executable Compiled Domain Intelligence SHALL pass deterministic pre-promotion validation.

Logical output:

```ts
interface ValidatedCandidateIdentity {
  candidateKind: 'rule' | 'decision-procedure' | 'skill' | 'workflow';
  candidateId: string;
  candidateContentDigest: string;
  validatorContractVersion: string;
  governanceBaseline: GovernanceBaselineIdentity;
}
```

Required validation, as applicable:

1. schema / contract validity;
2. canonical content identity;
3. declared input/output compatibility;
4. capability allowlist;
5. Tool/event allowlist;
6. arbitrary executable-code rejection;
7. provider secret/state rejection;
8. actor/runtime-object rejection;
9. bounded control; v0.3 promoted Workflow IR continues to reject all cycles;
10. mutation-path validation;
11. exact referenced artifact identity validation;
12. Hard Invariant compatibility under the exact validation Governance Baseline;
13. applicability/precondition validity;
14. stable content digest generation.

For WorkflowCandidate, the existing #204/Frozen L2 validator remains the concrete specialized validator and is not weakened.

Validation does not grant execution permission.

If the Governance Baseline relevant to promotion has changed since validation, promotion requires deterministic revalidation under the target exact baseline unless the governance contract itself contains a reviewed exact compatibility rule that proves the prior validation remains valid.

A favorable metric or Runtime Evidence record can request evaluation; it cannot substitute for deterministic validation.

---

# 12. Promotion / Activation Contract

The authority sequence is frozen as:

```text
proposal
!= deterministic validation
!= evaluation
!= promotion
!= activation
```

## 12.1 Promotion

Promotion of executable LLM/Business-Harness/Meta-originated Candidates requires explicit human/operator promotion authority.

This is a **minimum** and preserves Frozen L2 ADR-08. Domain policy may require additional independent review, evidence or approvals.

Promotion records at least:

- exact Candidate content digest;
- exact validation identity;
- exact Governance Baseline used by validation/promotion authority;
- operator authority/audit identity;
- resulting immutable promoted artifact identity.

Promotion policy may gate/reject/rank/recommend, but does not autonomously perform the production promotion transition.

## 12.2 Activation

Promotion does not imply activation.

Concrete existing activation surfaces remain:

- exact target-package activation for new workflow instances;
- explicit Promoted Artifact Registry selection/alias authority for fresh promoted-subworkflow selection.

A1 adds the exact Governance Baseline side of the new-instance `DomainActivationBinding`.

Activation of Compiled Domain Intelligence or a Governance Baseline requires the applicable human/operator authority contract. An already-frozen non-LLM deployment action remains valid only within its existing explicit package/registry authority; it is not a general automatic activation exception.

Activation never rewrites already-running exact pins.

---

# 13. Runtime Evidence Contract

## 13.1 Separation of authorities

```text
Runtime Evidence
!= Domain Facts
!= active Compiled Domain Intelligence
!= execution journal identity
!= control snapshot
```

The existing execution journals remain authoritative for replay/idempotency. Runtime Evidence may reference those facts but cannot replace them.

## 13.2 Logical record

```ts
interface RuntimeEvidenceRecord {
  evidenceId: string;
  domainId: string;
  tenantScope?: string;
  sourceKind:
    | 'decision'
    | 'workflow-failure'
    | 'fallback'
    | 'human-override'
    | 'counterexample'
    | 'evaluation'
    | 'metric';
  packageId: string;
  governanceBaseline: GovernanceBaselineIdentity;
  workflowTarget?: string;
  workflowInstanceId?: string;
  durableControlTurnId?: string;
  subjectArtifact?: {
    kind: string;
    artifactId: string;
    contentDigest: string;
  };
  decisionTraceRef?: string;
  executionFactRefs?: string[];
  durability: 'durable-audit' | 'derived-ephemeral';
  provenance: string;
}
```

Field names are illustrative; semantics are normative.

## 13.3 Durability classes

`durable-audit` evidence is persisted when required by governance, Candidate evaluation, review or audit policy.

`derived-ephemeral` evidence is telemetry/derived observation whose loss does not change execution correctness.

Neither class proves that an AI/query/effect operation committed. Only the existing committed-work journal/effect records do that.

## 13.4 Provenance

Evidence used to produce/evaluate a Candidate SHALL retain enough exact references to establish:

- originating domain/tenant scope;
- exact package pin;
- exact Governance Baseline pin;
- source execution/decision identity where available;
- exact producer/artifact identity where relevant;
- whether the evidence is durable or derived.

Missing or mismatched provenance fails closed for governance-critical evaluation; it is not silently treated as trustworthy evidence.

## 13.5 Privacy / tenant boundary

Runtime Evidence is scoped at least as strictly as the source domain/tenant data. Candidate production/evaluation SHALL NOT cross tenant/privacy boundaries merely because evidence is available in a common physical store.

Cross-scope aggregation requires an explicit external privacy/governance contract and is not introduced by v0.3.

---

# 14. Governance Baseline Pin + Recovery

## 14.1 Required execution pin

Every v0.3 workflow instance has an immutable logical `GovernanceExecutionPin`.

```ts
interface GovernanceExecutionPin {
  domainId: string;
  workflowTarget: string;
  workflowInstanceId: string;
  packageId: string;
  domainIntelligenceContentDigest: string;
  governanceBaseline: GovernanceBaselineIdentity;
  bindingDigest: string;
}
```

`bindingDigest` is the canonical digest of the exact execution authority tuple:

```text
packageId
+ domainIntelligenceContentDigest
+ governanceBaseline(domainId, governanceId, schemaVersion, contentDigest)
```

It is an integrity/audit convenience and does not replace the constituent exact identities.

## 14.2 Durable home and ordering

`GovernanceExecutionPin` is a correctness-critical execution-definition record in the same per-instance `DurableExecutionStore` durability domain as the exact package pin, control snapshots, DynamicChildExecutionPin records and committed-work journals.

Before an instance may publish its first authoritative state-changing Durable Control Turn, the exact GovernanceExecutionPin SHALL be durable.

A snapshot references or carries the exact governance pin identity required to restore its semantics. A snapshot may not become durable ahead of the governance pin it depends on.

## 14.3 Recovery rule

Recovery is exact:

```text
load retained packageId
→ load GovernanceExecutionPin
→ load exact Governance Baseline body by contentDigest
→ verify digest / schema / package binding
→ restore control snapshot + dynamic children
→ continue using that same baseline
```

Forbidden:

```text
recovery
→ resolve current/latest/active Governance Baseline
→ continue under substituted semantics
```

If the exact required Governance Baseline body is missing, corrupt, incompatible or hashes differently:

```text
GOVERNANCE_BASELINE_RECOVERY_MISMATCH
→ fail closed / recovery-required
```

No silent fallback or substitution is permitted.

## 14.4 Baseline activation after instance creation

Suppose instance `I1` is pinned to `B1` and governance activation moves new instances to `B2`:

```text
I1 crash/restart → B1
new instance I2 → B2
```

`I1` remains on `B1` until terminal/explicitly aborted. v0.3 defines no automatic live rebase.

An explicit migration from `B1` to `B2` would change execution authority and therefore requires a separately reviewed migration contract; it is not an implementation freedom created by this Amendment.

---

# 15. Exploration / Stable Fallback Seam

v0.3 freezes vocabulary and reference contracts only.

## 15.1 L4

Default L4 representation is:

```text
shadow-only
+ non-mutating
+ no authoritative Workflow transition
+ no durable business Effect
```

A shadow evaluation may produce Runtime Evidence. It cannot feed an authoritative DomainEvent into the running parent Workflow unless it is separately admitted through the ordinary validated/activated runtime path.

No production experiment scheduler, canary allocator or automatic metric promotion is required or authorized.

## 15.2 Experimental artifact exact stable fallback

If an Experimental artifact is represented at all, it SHALL carry an exact stable fallback reference.

```ts
interface StableFallbackIdentity {
  packageId: string;
  governanceBaselineContentDigest: string;
  artifact: {
    kind: string;
    artifactId: string;
    contentDigest: string;
  };
}
```

Forbidden fallback authority:

```text
latest
active
current stable
nearest compatible
```

The fallback is for a future fresh selection/evaluation contract. It never rewrites an already-running instance's exact package, governance or dynamic-child pins.

Rollback of an artifact does not rollback already committed external business effects. Compensation remains an explicit durable business action.

---

# 16. Failure Handling / Fail-closed Rules

The Frozen L2 failure matrix remains in force. A1 adds the following mandatory cases:

| Condition | Required behavior |
| --- | --- |
| Governance Baseline identity missing at new-instance binding | fail closed; do not start instance |
| governance semantic body digest mismatch | fail closed |
| governance-critical classification absent/ambiguous | treat as governance-critical |
| Candidate tries to modify Governance Baseline through ordinary Candidate path | reject |
| Candidate validation lacks exact Governance Baseline identity | reject |
| Candidate validation baseline differs from promotion target and no exact compatibility rule exists | revalidate or reject |
| attempted autonomous promotion / activation | reject |
| guard/Hard Invariant attempts LLM, Tool or external I/O | contract violation; fail closed |
| recovered instance cannot resolve exact pinned Governance Baseline | recovery-required / fail closed |
| globally active Governance Baseline differs from recovered pin | retain exact old pin |
| Runtime Evidence provenance/tenant mismatch for governance-critical evaluation | reject evidence / fail closed evaluation |
| Runtime Evidence is presented as journal/effect completion truth | reject authority use |
| shadow/L4 path attempts authoritative transition or mutation | reject |
| Experimental fallback uses floating alias | reject |

Existing package, dynamic-child, snapshot, journal, semantic-cache and effect failure behavior is unchanged.

---

# 17. Compatibility / Migration

## 17.1 Pre-A1 L2 implementation impact

A1 is primarily an authority/identity clarification. It does not require rewriting the existing v0.3 architecture foundations.

Required implementation additions are narrow:

- explicit Governance Baseline identity/body persistence;
- new-instance `DomainActivationBinding`;
- durable per-instance `GovernanceExecutionPin`;
- current schema/guard path parameterized by the pinned baseline;
- generalized Candidate validation metadata carrying exact baseline identity;
- Runtime Evidence record/provenance seam;
- terminology/API boundary that exposes Domain Workflow semantics without exposing XState internals as product identity.

## 17.2 Existing v0.3 prototype/snapshot compatibility

A snapshot/instance created by a pre-A1 prototype without a provable exact Governance Baseline pin SHALL NOT infer `current` on restore.

Allowed migration choices are:

1. deterministic one-time migration only when the exact historical baseline can be proven from retained authority/evidence; or
2. fail closed and require explicit operator recovery/migration.

Silent binding to the latest baseline is forbidden.

## 17.3 v0.2 compatibility

This Amendment does not change v0.2 persisted semantics. v0.3 migration/productionization continues to follow the Frozen L2 incremental plan.

## 17.4 XState compatibility

No engine migration is required. Existing XState recursive persistence and child-machine work remain valid. Only product/public identity wording changes.

---

# 18. ADR Updates

These amendment ADRs overlay the existing Frozen L2 ADR set.

## A1-ADR-01 — Domain Workflow is the product control authority; XState is the selected v0.3 engine

Supersedes only the product-abstraction implication of Frozen L2 ADR-01. One XState Actor System remains the v0.3 implementation; no peer workflow runtime is allowed.

## A1-ADR-02 — Domain Governance Baseline is a separate exact authority

It is neither Domain Facts nor ordinary Compiled Domain Intelligence. Its semantic body is immutable by content digest and controlled by human/operator governance authority.

## A1-ADR-03 — Governance is execution-pinned

Every running workflow instance uses the exact Governance Baseline bound at instance creation. Recovery uses the pin; activation changes affect future bindings only.

## A1-ADR-04 — Governance pins are durable execution-definition facts

`GovernanceExecutionPin` resides in the per-instance `DurableExecutionStore` durability domain and must exist before the first authoritative control publication.

## A1-ADR-05 — Candidate validation is unified and baseline-bound

Every executable Candidate is deterministically validated, and its validation identity records the exact Governance Baseline used.

## A1-ADR-06 — Promotion and activation are separate human/operator authority transitions

Frozen L2 ADR-08 remains the minimum promotion rule. Promotion never implies activation; neither rewrites active execution pins.

## A1-ADR-07 — Business Harness is bounded unresolved-semantics capability, not workflow authority

The existing HarnessMachine is its v0.3 implementation capability and remains a child of the one Domain Workflow/XState control system.

## A1-ADR-08 — Runtime Evidence is provenance, not execution truth

Evidence may be durable for audit/evaluation or ephemeral for telemetry, but never replaces execution journals, snapshots, Domain Facts or active Compiled Intelligence.

## A1-ADR-09 — Guards and Hard Invariants are pure predicates

No model, Tool or external I/O is allowed inside authoritative predicate evaluation.

## A1-ADR-10 — L4 is shadow-only by default and stable fallback is exact

No live mutating L4 authority is introduced in v0.3. Any represented Experimental artifact carries exact fallback identity and no floating alias.

---

# 19. Architecture Contract / Review Vectors

These vectors are normative architecture tests for later L3/implementation tasks; they are not claims of executable CI in this documentation-only Amendment.

## V1 — Governance pin survives active-baseline movement

```text
create I1 under package P1 + baseline B1
activate B2 for new instances
crash I1
recover I1
EXPECT package=P1, governance=B1
EXPECT no lookup of B2/current/latest for execution authority
```

## V2 — Missing pinned baseline fails closed

```text
I1 snapshot references B1
B1 exact body unavailable
recover I1
EXPECT recovery_required / fail closed
EXPECT no B2 substitution
```

## V3 — Governance self-approval rejected

```text
Candidate proposes weaker promotion rule
Candidate attempts ordinary validation/promotion path
EXPECT reject: governance changes are outside ordinary Candidate authority
```

## V4 — Pre-change evaluation

```text
active governance = B1
operator proposes B2
validate/evaluate governance change
EXPECT B1 is evaluation authority
EXPECT B2 cannot approve itself
```

## V5 — Guard purity

```text
guard implementation attempts ModelPort/Tool/external I/O
EXPECT architecture-contract violation
```

## V6 — Reasoning remains explicit

```text
Business Harness resolves unknown case
→ structured DomainDecision
→ schema
→ B1 Hard Invariants
→ guard
→ transition
EXPECT Harness cannot set state directly
```

## V7 — Candidate invalid after governance change unless revalidated

```text
Candidate C validated under B1
B2 becomes target activation baseline with behaviorally relevant change
operator attempts promotion/activation using old validation
EXPECT revalidate under B2 or deterministic exact compatibility proof
```

## V8 — Runtime Evidence cannot replay work

```text
Runtime Evidence says model/effect succeeded
execution journal lacks matching committed fact
restore pending operation
EXPECT evidence does not suppress retry / does not prove mutation
```

## V9 — Tenant evidence isolation

```text
Candidate evaluation in tenant T1 consumes evidence scoped T2 without explicit external privacy/governance contract
EXPECT reject
```

## V10 — Shadow L4 cannot mutate

```text
shadow experimental path returns proposed DomainEvent/effect
EXPECT only Runtime Evidence output
EXPECT no authoritative parent transition/effect
```

## V11 — Exact stable fallback

```text
Experimental artifact fallback = latest/active/current stable
EXPECT reject

fallback = exact packageId + governance digest + artifact contentDigest
EXPECT identity contract valid
```

## V12 — Existing durability remains unchanged

```text
committed AI/query/effect journal fact
→ crash before newer control snapshot
→ recover exact package + governance + dynamic-child pins
→ journal hit
EXPECT committed work not repeated
```

---

# 20. Task DAG Implications

This section identifies decomposition implications only. **It is not the v0.3 Task DAG and does not authorize Task execution before this Amendment receives `FREEZE_OK`.**

After freeze, Task DAG generation should account for these concerns while preserving one-concern/one-PR discipline:

1. shared Governance Baseline identity/canonical digest + logical registry/retention contract;
2. activation binding + durable `GovernanceExecutionPin` integration with `DurableExecutionStore` and snapshot validation;
3. Domain Workflow public/product contract vs XState implementation boundary cleanup without engine replacement;
4. Business Harness/HarnessMachine contract alignment and pure predicate enforcement;
5. unified Candidate envelope/validator metadata across Rule/Procedure/Skill/Workflow while preserving specialized Workflow validator;
6. promotion vs activation authority and baseline-bound audit records;
7. Runtime Evidence port/record/provenance/privacy boundary;
8. shadow-L4 / exact stable-fallback reference contract;
9. integration/hidden-validation scenarios covering V1–V12 plus all existing Frozen L2 durability/cache/effect gates.

Dependencies should place shared identities/governance pin contracts before recovery integration and place central Domain Workflow wiring after the underlying contracts, consistent with the existing Frozen L2 productionization order.

---

# 21. Review / Freeze Disposition

Current state:

```text
Frozen PRD                         FROZEN
Frozen PRD Amendment A1            FROZEN / FREEZE_OK
Existing v0.3 L2                   FROZEN
This L2 Amendment A1               REVIEW CANDIDATE
```

Required next step:

1. independent targeted adversarial review of the exact candidate HEAD;
2. if verdict is `FREEZE_OK`, store review evidence;
3. freeze this Amendment without changing the reviewed normative body;
4. merge to `main`;
5. update version authority metadata as required;
6. only then generate the formal v0.3 Task DAG.

Before `FREEZE_OK` this branch SHALL NOT be merged to `main`, and no formal Task DAG SHALL be generated from it.

CI is currently unavailable under an operator-directed waiver. This document does not claim CI PASS, executable test PASS or implementation completion.

---

# 22. Final Architecture Rule

> **DomainHarness v0.3 executes exact package-pinned Compiled Domain Intelligence through one authoritative Domain Workflow contract implemented by XState, applies an exact execution-pinned Domain Governance Baseline to every authoritative decision/transition/effect admission, uses bounded Business Harness reasoning only for unresolved semantics, keeps every mutation behind durable effect authority, preserves Runtime Evidence as provenance rather than execution truth, and allows future evolution only through deterministic validation plus explicit human/operator promotion and activation. Recovery always reuses exact package, governance, child-definition and committed-work identities; it never substitutes `latest/current/active` authority.**
