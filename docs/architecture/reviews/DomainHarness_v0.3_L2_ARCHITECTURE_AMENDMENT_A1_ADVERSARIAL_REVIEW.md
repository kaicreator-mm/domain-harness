# DomainHarness v0.3 L2 Architecture Amendment A1 — External Adversarial Review

**Project:** DomainHarness  
**Version:** v0.3  
**Reviewed candidate commit:** `94c87647e505f0a2ed16d9c68b59d4b2eff40945`  
**Reviewed normative-body blob:** `db867fbc4dd64df47cae8cd8afa2d2545d07f045`  
**Authority baseline:** `main@466a5196a8b29194b50eb4641d6cf988d38b4da8`  
**External reviewer:** Claude  
**Review disposition:** `FREEZE_OK`

```text
FREEZE_OK
P0=0
P1=0
```

The reviewer also confirmed the previously frozen PRD Amendment A1 SHA-256 `1aaea27bed59515a10d54101c917ed1db6fadc33434f5fdfefad4a9e9fe1be01` and the authority references to PRD blob `6a6fb59b156f576d48828019faf0e6039d08d5af` and prior L2 baseline `dc3ea6334d7153c799f0c569c8d3c641764094fc` from the preceding review round.

## Round 1 blocker closure

### P0-1 — Governance self-modification

Closed by the clarification model and L2 mapping:

- Domain Facts remain mutable/external and are not promoted merely because they participate in Domain Data.
- Promotion/activation/pinning/content identity applies to Compiled Domain Intelligence.
- Domain Governance Baseline is a separate authority containing Hard Invariants, promotion/activation authority policy, governance-critical evaluation/fallback policy and exploration authorization.
- Meta/LLM Candidates may not modify or approve active Governance Baseline changes.
- Governance change requires explicit human/operator authority, is evaluated under the exact pre-change baseline, and cannot self-approve.
- Policy/Hard-Invariant change is outside the ordinary Meta Candidate path.

The path "weaken governing rule → use weakened rule to approve itself" is closed.

### P1-2 — Promotion authority

Closed:

- executable LLM/Meta-originated production Candidate promotion requires explicit human/operator authority;
- promotion policy may gate/reject/rank/recommend/require evidence but is not autonomous production-promotion authority;
- promotion and activation are distinct;
- activation does not rewrite running pins.

### P1-3 — Mandatory validation

Closed:

- executable Candidates have mandatory deterministic validation (`SHALL`);
- validation covers schema/contract, I/O compatibility, capability allowlist, Tool/event allowlist, arbitrary-code rejection, provider-secret rejection, bounded-control where applicable, mutation-path validation, exact Hard-Invariant baseline evaluation, applicability and stable content identity;
- WorkflowCandidate rejection boundaries extend to every executable Candidate kind where semantically applicable;
- favorable business metrics cannot alone grant promotion eligibility.

### P1-4 — Guard purity

Closed:

- Guard and Hard-Invariant predicates are synchronous for the transition decision, deterministic, side-effect-free, and free of model calls, Tool calls and external I/O;
- reasoning/query/external computation must occur as an explicit invoked step returning structured data before predicate evaluation.

### P1-5 — v0.3 scope

Closed:

- Meta Harness remains future/offline proposal authority only;
- no autonomous Meta service, automatic mining/generation/scheduling/promotion/activation is required or authorized;
- L1-L4 is conceptual maturity vocabulary, not runtime permission;
- L4 defaults to shadow-only/non-mutating;
- canary/allocation/metric-driven autonomous production evolution remains outside v0.3;
- the scope statement is normative.

### P1-6 — Clause-level map

Closed:

- PRD clauses affected by engine-neutralization and authority correction are explicitly mapped;
- the one-control-runtime invariant remains preserved;
- Business Harness remains an invoked bounded capability, not a second peer Runtime or business-control authority;
- peer control-flow runtime remains a release blocker.

### P1-7 — Facts vs versioned artifacts

Closed:

- Domain Facts are not implicitly frozen into promoted artifacts;
- promotion/activation/pinning/content identity applies to CDI, not mutable facts;
- Runtime Evidence does not become active CDI merely by existing.

## Accepted non-blocking P2/P3 observations

The reviewer found no blocking contradiction. The following were accepted as non-blocking and were required to be absorbed by the L2 Amendment / implementation planning.

### P2-1 — governance-critical classification authority

Recommended fail-safe rule:

```text
unknown classification
→ governance-critical
```

Only explicit human/operator governance authority may classify a control as non-governance. Candidate/LLM output cannot self-classify its own governing rule as non-governance.

**L2 Amendment disposition:** absorbed in Governance Baseline §6.2.

### P2-2 — activation exception must be concrete

Any "already-frozen non-LLM deployment mechanism" activation path must point to concrete package/registry activation authority rather than creating a generic exception.

**L2 Amendment disposition:** absorbed by §12.2 concrete target-package activation and Promoted Artifact Registry selection/alias authority.

### P2-3 — Governance Baseline binding/recovery

L2 must define exact Governance Baseline identity, package/CDI binding, retained-instance pinning and crash/recovery behavior so implementations cannot choose between current-vs-pinned baseline semantics.

**L2 Amendment disposition:** absorbed by `DomainActivationBinding`, `GovernanceExecutionPin`, same-durability-domain ordering, exact baseline retention and recovery in §§7 and 14.

### P2-4 — PRD §19 Non-Goals / §23 L2-deferred scope

The clarification must not silently reopen deferred/non-goal scope.

**L2 Amendment disposition:** absorbed by §3.3 explicit closed-scope rule and the narrow-supersession rule.

### P3-1 — no generic supersession escape hatch

Only explicitly mapped conflicts are superseded; no generic contradiction escape hatch is allowed.

**L2 Amendment disposition:** absorbed by §3 and the opening authority statement.

### P3-2 — promotion wording is a minimum, not weakening ADR-08

The human/operator promotion rule for LLM/Meta-originated Candidates must not be read as weakening Frozen L2 ADR-08.

**L2 Amendment disposition:** §12.1 explicitly states that the rule is a **minimum** and preserves ADR-08.

### P3-3 — Experimental artifact obligation is conditional and fallback exact

Experimental/L4 language should be conditional on representation and any represented fallback must be exact, not floating.

**L2 Amendment disposition:** §15 makes L4 shadow-only by default and makes exact fallback identity conditional on representation; floating `latest/active/current stable/nearest compatible` is forbidden.

## Scope decision

The reviewer concluded that Round 2 A1 remains a v0.3 clarification amendment and does not need to move to v0.4 because:

1. autonomous evolution is reduced to contract/vocabulary seams rather than a release runtime;
2. the newly required pieces are narrow authority/contract corrections: Runtime Evidence, Governance Baseline, explicit Hard-Invariant evaluation, Candidate validation/promotion/activation boundaries;
3. XState is demoted from product identity to selected v0.3 engine without weakening Workflow state-machine semantics or adding a second engine.

## Final external review result

```text
FREEZE_OK
P0=0
P1=0
```

The reviewed normative Amendment body at blob `db867fbc4dd64df47cae8cd8afa2d2545d07f045` is eligible for freeze without post-review editorial modification. Non-blocking P2/P3 items are carried into L2 implementation/task acceptance and do not block the freeze transition.
