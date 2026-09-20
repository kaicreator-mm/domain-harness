# DomainHarness v0.3 PRD Amendment A1 — Adversarial Review Round 2

**Reviewer:** Claude (external adversarial review)  
**Verdict:** `FREEZE_OK`  
**Findings:** `P0=0`, `P1=0`  
**Reviewed candidate SHA-256:** `1aaea27bed59515a10d54101c917ed1db6fadc33434f5fdfefad4a9e9fe1be01`  
**Frozen PRD blob:** `6a6fb59b156f576d48828019faf0e6039d08d5af`  
**Baseline:** `main@dc3ea6334d7153c799f0c569c8d3c641764094fc`

---

# Verdict

```text
FREEZE_OK
P0=0
P1=0
```

The candidate SHA-256 was independently verified. The Frozen PRD authority blob and baseline had already been independently verified during Round 1.

---

# Round 1 Blocker Closure

## P0-1 — Governance self-modification: CLOSED

Round 2 separates Domain Facts, Compiled Domain Intelligence and Domain Governance Baseline. The Governance Baseline contains Hard Invariants and governance-critical promotion / activation / evaluation / fallback / exploration authority. Meta Harness / LLM Candidates cannot modify or approve the active Governance Baseline. Governance changes require explicit human/operator authority, are evaluated under the pre-change active baseline, and cannot self-approve.

## P1-2 — Promotion authority: CLOSED

Promotion of LLM/Meta-originated production Candidates requires explicit human/operator authority. Promotion Policy may gate/reject/rank/recommend/require evidence but cannot itself constitute autonomous production promotion authority. Promotion and activation are distinct and activation does not rewrite running execution pins.

## P1-3 — Mandatory deterministic validation: CLOSED

Every executable Candidate kind now has mandatory pre-promotion validation covering schema / contract, input/output compatibility, capability allowlist, Tool/event allowlist, arbitrary-code rejection, provider-secret/state rejection, bounded control where applicable, mutation paths, active Governance Baseline Hard Invariants, applicability and stable content identity. A Candidate cannot become promotion-eligible solely because metrics are favorable.

## P1-4 — Guard purity: CLOSED

Guard and Hard Invariant predicates are required to be synchronous for transition decisions, deterministic, side-effect free, and free of model invocation, Tool invocation and external I/O. Reasoning must run as an explicit invoked step and return a structured result before predicate evaluation.

## P1-5 — v0.3 scope: CLOSED

Round 2 explicitly removes autonomous evolution/experimentation as a v0.3 release requirement. Not required in v0.3: autonomous Meta Harness, automatic pattern mining, automatic Workflow optimization, experiment scheduler, production canary, automated metric promotion, automated activation, or live mutating L4 exploration. Meta Harness and L1–L4 beyond the existing runtime behavior are reduced to contract/vocabulary seams. L4 defaults to shadow-only / non-mutating.

## P1-6 — Clause-level supersession: CLOSED

Round 2 maps the affected Frozen PRD clauses explicitly, including §4, §5, §6, §7, §9, §12, §17, §20, §21.1, §21.2, §21.4, §21.12, §21.17 and §24. `Harness is not a second peer Runtime` and `no peer business-control runtime` remain explicit invariants.

## P1-7 — Facts vs versioned artifacts: CLOSED

Domain Facts are explicitly mutable / externally owned selected inputs. Compiled Domain Intelligence is the versioned / promotable artifact class. Runtime Evidence is distinct from active Compiled Domain Intelligence.

---

# Non-blocking P2/P3

The reviewer reported only non-blocking observations:

- **P2-1:** ambiguous governance-critical policy classification should default to governance-critical unless explicitly classified non-governance by human/operator governance authority.
- **P2-2:** the activation exception should identify the concrete existing package activation / selection contract.
- **P2-3:** the L2 Amendment should define Governance Baseline identity, package/CDI binding, retained-instance behavior and recovery semantics.
- **P2-4:** Frozen PRD §19 Non-Goals and §23 L2-deferred list should be explicitly covered by the supersession map.
- **P3-1:** remove or narrow the generic interpretive escape hatch so only explicitly mapped clauses are superseded.
- **P3-2:** clarify that the human/operator promotion requirement is a minimum and does not weaken Frozen L2 ADR-08.
- **P3-3:** remove ambiguous Domain Facts wording and phrase the optional Experimental-artifact scenario conditionally.

These findings do not block freeze and are carried into the subsequent L2 Amendment / editorial follow-up.

---

# Scope Verdict

> **A1 can be frozen as a v0.3 clarification amendment and does not need to be promoted to v0.4.**

Reasoning: autonomous evolution is no longer a release requirement; Meta Harness is a future/offline proposal role; L1–L4 beyond current runtime behavior are contract/vocabulary seams; the new v0.3 obligations are mostly authority corrections / contract seams; and XState demotion remains a product abstraction correction without weakening state-machine semantics.

---

# Final Review Result

```text
FREEZE_OK
P0=0
P1=0
```

The exact reviewed Round 2 candidate is the authoritative frozen Amendment A1 body. Non-blocking P2/P3 observations are tracked for the L2 Amendment and any later editorial consolidation.