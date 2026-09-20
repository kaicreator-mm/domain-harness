# DomainHarness v0.3 PRD Amendment A1 — Adversarial Review Round 1

**Reviewer:** Claude (external adversarial review)  
**Review verdict:** `CHANGES_REQUIRED`  
**Findings:** `1 × P0`, `6 × P1`, `6 × P2`, `2 × P3`  
**Source:** User-provided Claude review result in the DomainHarness project conversation  
**Reviewed amendment SHA-256:** `76a19cf0694765581325a01d41758d70c00b9a0b9083fc5ad5f64639940c95e8`  
**Reviewed frozen PRD blob:** `6a6fb59b156f576d48828019faf0e6039d08d5af`  
**Baseline:** `main@dc3ea6334d7153c799f0c569c8d3c641764094fc`

---

# Metadata Verification

Amendment SHA-256 matched the declared value.

`dc3ea633` exists as:

```text
docs(v0.3): freeze L2 architecture evidence
```

Its PRD blob is:

```text
6a6fb59b156f576d48828019faf0e6039d08d5af
```

L2 at that commit is FROZEN.

The reviewer read only L2 §11.3 / ADR-08 as needed to determine whether Amendment §11 weakened promotion authority, and did not reread the research evidence.

---

# Verdict

```text
CHANGES_REQUIRED
```

Blocking findings:

```text
P0 = 1
P1 = 6
```

Non-blocking:

```text
P2 = 6
P3 = 2
```

The XState demotion (§14/§19) and Domain Data / Workflow clarification (§1–§4) were found supportable.

Blocking findings concentrate on the newly introduced evolution / governance surface (§7, §9, §11, §17, §18, §19, §22).

---

# P0-1 — Hard Invariants and governance policy can self-evolve

Affected:

```text
Amendment §2.2 / §7 / §10 / §11
vs
Frozen PRD §12 / §19 / §24
```

§2.2 places:

```text
Hard Invariants
Evaluation Policy
Promotion Policy
Exploration Policy
Fallback Policy
```

inside Compiled Domain Intelligence.

§7 also allows Meta Harness to propose:

```text
ConstraintCandidate
PolicyCandidate
```

Failure path:

```text
Meta proposes removing HI-7
or lowering the promotion threshold
        ↓
Candidate is evaluated under the current policy
        ↓
promoted into version N+1
        ↓
HI-7 no longer exists
or promotion threshold is now lower
```

No §10 "override" occurs because the invariant is replaced through the ordinary evolution pipeline.

§11 separates proposal/evaluation/promotion only at single-Candidate granularity and does not prevent:

```text
change the rules first
→ act under the new rules second
```

The statement forbidding autonomous **silent** mutation also does not prevent an audited but self-authorized governance change.

## Minimum required correction

Hard Invariants and governance-critical policy must be a separate governance class.

Changing them must require an authority that cannot be satisfied through:

```text
Meta proposal
+
automatic evaluation
```

Governance changes must:

- require explicit human/operator governance authority;
- be evaluated under the **pre-change** policy set;
- never self-approve.

---

# P1-2 — Promotion no longer requires explicit human/operator authority

Affected:

```text
Amendment §11 / §18.5 / §18.8 / §20
vs
Frozen PRD §12 / §19 / §21.12
and Frozen L2 §11.3 / ADR-08
```

§11 only requires:

```text
proposal != evaluation != promotion != activation
```

and:

```text
Meta Harness SHALL NOT be the sole proposer and sole production authority
```

This allows a Domain Data Promotion Policy such as:

```text
if shadow metrics are better N times
→ promote
```

executed by an automated promoter that is not Meta Harness.

This satisfies the Amendment text while still allowing an LLM-originated Candidate to enter production without a human/operator decision.

This weakens the already frozen L2 rule:

```text
explicit human/operator authority transition
```

## Minimum required correction

Promotion of an LLM-originated production Candidate must require explicit human/operator authority.

Promotion Policy may gate or recommend, but in v0.3 it must not itself constitute promotion authority.

---

# P1-3 — Deterministic validation became optional for a wider Candidate space

Affected:

```text
Amendment §7 / §11
vs
Frozen PRD §12 / §21.14 / §24
```

Candidate types expanded from WorkflowCandidate to:

```text
Rule
Procedure
Skill
Constraint
Policy
Experiment
```

But §11 listed:

```text
deterministic contract/schema validation
```

as one item in a `MAY` evaluation list.

Therefore a RuleCandidate could theoretically be promoted based only on favorable metrics without mandatory schema/capability validation.

## Minimum required correction

For every executable Candidate kind, the following must be mandatory pre-promotion validation:

- deterministic contract/schema validation;
- capability validation;
- Hard Invariant validation;
- applicable Frozen PRD §12 rejection classes.

A Candidate must not become executable based only on favorable metrics.

---

# P1-4 — XState demotion lost the pure synchronous guard invariant

Affected:

```text
Amendment §4 / §19.4
vs
Frozen PRD §7 / §5
```

The Amendment correctly replaced:

```text
LLM cannot directly set XState state id
```

with an engine-neutral authority statement.

However, the original PRD also said synchronous XState guards cannot issue asynchronous LLM calls.

The replacement text did not preserve an engine-neutral equivalent.

Failure path:

```text
guard()
→ invoke Business Harness
→ LLM result decides boolean guard
```

The LLM never directly sets Workflow state, but effectively owns whether the transition occurs.

## Minimum required correction

Workflow guards and Hard Invariant predicates must be:

- synchronous for the transition decision;
- deterministic;
- side-effect free;
- unable to call LLM;
- unable to call Tool;
- unable to perform external I/O.

Reasoning must occur as an explicit invoked step that returns a structured result before guard evaluation.

---

# P1-5 — Meta Harness / exploration became v0.3 release scope

Affected:

```text
Amendment §17 / §18 / §22
vs
Frozen PRD §13 / §19 / §20 / §21
```

§17 says v0.3 `SHALL` preserve evidence for:

- Meta Harness producing Rule/Procedure/Workflow/Policy Candidates;
- stable and exploratory alternatives coexisting;
- shadow execution;
- exact experimental fallback identity;
- L1–L4 permissions varying by risk.

§18 makes several of those Acceptance Criteria.

§22 later says a v0.3 minimum slice `MAY` be smaller.

The `MAY` does not constrain earlier `SHALL` requirements.

The proposed minimum itself includes:

```text
shadow-only L4 reference path
```

which can imply dual execution, evidence capture and effect suppression rather than a pure contract seam.

## Minimum required correction

Normatively identify which evolution/exploration items are:

- contract/seam only in v0.3;
- executable release evidence in v0.3.

Or remove runtime experimentation requirements from v0.3 scenarios and acceptance criteria.

---

# P1-6 — Category-based supersession leaves the effective frozen PRD ambiguous

Affected:

```text
Amendment §18 / §19
vs
Frozen PRD §4 / §6 / §7 / §9 / §12 / §17 / §20 / §21 / §24
```

The Amendment supersedes categories of XState wording instead of explicit clauses.

Examples:

Frozen PRD §21.2 contains both:

```text
HarnessMachine is an invoked child machine/actor
```

and the important invariant:

```text
not a second Runtime
```

It is unclear which half survives.

Other ambiguous areas include:

- PRD §6 "other XState-supported control structures";
- PRD §17 / §21.17 "XState persisted control snapshot";
- PRD §24 XState-state-id blocker.

## Minimum required correction

Provide an explicit clause-level supersession map covering at least:

```text
PRD §4
§6
§7
§9
§12
§17
§21.1
§21.2
§21.4
§21.12
§21.17
related §24 blockers
```

For each, provide replacement text or explicitly mark it preserved.

---

# P1-7 — Immutability/version semantics incorrectly apply to all Domain Data

Affected:

```text
Amendment §1 / §7 / §11 / §18.6
vs
Frozen PRD §10.1 / §16
```

The Amendment retains:

```text
Domain Data
=
Domain Facts
+
Compiled Domain Intelligence
```

and recognizes Domain Facts as current facts from source systems.

But other sections say promotion produces:

```text
immutable, identity-controlled Domain Data artifact/version
```

and refer to:

```text
active immutable Domain Data
```

This either:

1. incorrectly freezes live business facts into artifacts; or
2. uses "Domain Data" with inconsistent meanings.

## Minimum required correction

Immutability/version/promotion must apply specifically to:

```text
Compiled Domain Intelligence
```

Domain Facts remain externally owned and mutable.

Execution may select/project facts, but they do not automatically enter promoted artifact versions.

---

# P2 — Non-blocking Findings

## P2-1

§9 says L1–L4 are not authority, but execution permission is said to depend on Maturity Level.

Clarify that maturity is classification/input to policy, never authority by itself.

## P2-2

Business L2/L3 duplicate the evolution pipeline without explicitly pointing back to validation/promotion authority.

Require those transitions to use the common validation/promotion path.

## P2-3

`Policy > Workflow` has no explicit evaluation point in the transition path.

Also the Hard / Policy / Preference distinction is only `SHOULD`.

Clarify where policy is applied and which parts are mandatory.

## P2-4

Business Harness / Meta Harness policies are not explicitly provider-neutral.

Preserve the AI Runtime boundary.

## P2-5

Business L4 defaults too permissively to possible live experimentation.

Reverse the default:

```text
L4 = shadow/non-mutating unless explicitly authorized
```

Any durable effect exposure needs explicit authorization plus effect-risk policy.

## P2-6

Exact fallback is stated as `SHOULD` in one place but treated as guaranteed elsewhere.

Use `SHALL` when fallback is represented.

---

# P3 — Non-blocking Findings

## P3-1

Activation authority is not explicitly defined.

## P3-2

The Amendment should explicitly preserve the PRD §24 prohibition on:

```text
multiple peer control-flow runtimes competing for business authority
```

---

# Findings That Withstood Adversarial Review

The reviewer found these areas supportable:

- one Workflow business-control authority;
- Business Harness vs Meta Harness role separation at the execution layer;
- single target Domain Data compiled from multiple source-domain knowledge;
- exact fallback identity;
- recovery preserving exact pins;
- Workflow rollback not implying committed business-effect rollback;
- compensation remaining an explicit durable action;
- XState demotion from product identity to selected implementation engine;
- preservation of existing frozen cache/journal/effect/recovery/AI Runtime boundaries, except for the promotion/validation weaknesses above.

---

# Scope Verdict

The Round 1 Amendment contains both:

## Clarification / correction appropriate for v0.3

- Domain Data as primary product abstraction;
- source domains → one target Domain Data;
- Workflow as deterministic composition structure;
- Business Harness as the existing bounded reasoning role;
- Hard Invariant layering;
- XState demotion from product contract to selected engine.

## Net-new scope if treated as v0.3 runtime release requirements

- autonomous Meta Harness behavior;
- broad Candidate classes;
- Runtime Evidence as a new evolution subsystem;
- L1–L4 runtime risk/experiment execution;
- evaluation / experimentation pipeline;
- shadow/canary execution platform;
- automatic evolution mechanics.

Recommended resolution:

1. keep A1 as a v0.3 clarification Amendment but reduce Meta Harness / L4 / experimentation to contract seams and future-compatible vocabulary; or
2. move those runtime capabilities into a future v0.4 "Evolvable Domain Data" product scope.

Regardless of version split, P0-1, P1-2, P1-3, P1-4, P1-6 and P1-7 must be corrected in any frozen Amendment retaining the affected clauses.
