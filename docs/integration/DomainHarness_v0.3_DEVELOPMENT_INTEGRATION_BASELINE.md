# DomainHarness v0.3 — Development Integration Baseline

**Status:** ACTIVE as the sibling-project integration baseline for the v0.3
development line.
**Authority anchor:** `v0.3` at merge commit
`8c530b83fcfb435bd5ebd6a72282a0fe239b15aa` (T-024 merge, PR #292) for product
and architecture semantics; the documentation/example set of this baseline
ships with the T-025 pull request (issue #243), whose exact HEAD is recorded
in the #243 task record.

This document freezes the T-025 output as the adoptable **v0.3 Development
Integration Baseline**: the exact authority set a sibling project integrates
against, the map of consumer-facing documentation and executable examples, and
the explicit non-claims that keep adoption honest.

## 1. Exact authority set

The baseline binds these frozen authorities, and no others:

| Authority | Document |
| --- | --- |
| Frozen PRD | `docs/product/DomainHarness_v0.3_PRD_FROZEN.md` |
| PRD Amendment A1 | `docs/product/amendments/DomainHarness_v0.3_PRD_AMENDMENT_A1_ROUND2_REVIEW_CANDIDATE.md` (frozen by `DomainHarness_v0.3_PRD_AMENDMENT_A1_FREEZE_RECORD.md`) |
| Frozen L2 architecture | `docs/architecture/DomainHarness_v0.3_L2_ARCHITECTURE_EVIDENCE_FROZEN.md` + `docs/architecture/DomainHarness_v0.3_ARCHITECTURE_BASELINE_FROZEN.md` |
| L2 Amendment A1 | `docs/architecture/DomainHarness_v0.3_L2_ARCHITECTURE_AMENDMENT_A1.md` (frozen by `DomainHarness_v0.3_L2_ARCHITECTURE_AMENDMENT_A1_FREEZE_RECORD.md`) |
| Integration HEAD | `v0.3` @ `8c530b83fcfb435bd5ebd6a72282a0fe239b15aa`, plus the T-025 documentation/example commit recorded in issue #243 |

Executed validation evidence behind host durability statements:

- **T-022** Node host persistence — PR #289 (merge commit `efc9917`).
- **T-023** Expo device (Android/Hermes, two-phase E1–E10) — PR #290 (merge
  commit `2d3ba3b`, validation HEAD `2cfb65b`).
- **T-024** cross-host parity + migration/retention (M1–M7) — PR #292 (merge
  commit `8c530b8`, validation HEAD `a642d6b`).

## 2. Document and example map

Consumer-facing documents shipped by this baseline:

| Document | Role |
| --- | --- |
| `docs/sdk/DomainHarness_v0.3_SDK_USAGE.md` | integration entry point |
| `docs/sdk/DomainHarness_v0.3_SDK_REFERENCE.md` | complete v0.3 public API reference |
| `docs/migration/DomainHarness_v0.2_TO_v0.3.md` | v0.2 → v0.3 migration, incl. the forbidden floating-authority substitutions |
| `docs/integration/DomainHarness_v0.3_HOST_INTEGRATION.md` | Node/Expo durable host wiring + durability-evidence honesty section |
| this document | the adoption baseline and its non-claims |

Executable examples (typechecked and executed in CI, importing the published
package by name):

| Example | Demonstrates |
| --- | --- |
| `packages/domain-harness/tests/examples/domain-workflow-boot.example.test.ts` | compiled package at startup → assembly → pin → governed turn → bound snapshot |
| `packages/domain-harness/tests/examples/governance-baseline-binding-pin.example.test.ts` | baseline retention, activation binding, execution pin, exact recovery |
| `packages/domain-harness/tests/examples/candidate-promotion-activation.example.test.ts` | deterministic validation, explicit promotion/activation authority, audit, revocation |
| `packages/domain-harness/tests/examples/runtime-evidence.example.test.ts` | append-only evidence, provenance, non-authority of evidence |
| `packages/domain-harness/tests/examples/support.ts` | the volatile in-memory port scaffolding the examples share |
| `packages/domain-harness/tests/examples/docs-guard.test.ts` | the executable acceptance guard over these documents |

## 3. Sibling-project adoption checklist

A sibling project adopting this baseline:

1. Pins an **exact commit SHA** of this repository (the T-025 HEAD recorded in
   issue #243, or a later v0.3 SHA it has reviewed) in its own integration
   evidence. It never tracks a moving branch as though it were a release.
2. Reads the SDK usage document, then the SDK reference, then (for durable
   deployments) the host integration guide.
3. Copies the example flows, not just the prose: every example is runnable and
   CI-executed at the baseline SHA.
4. Provides its own durable host wiring (or adopts the Node/Expo adapters) and
   records its own durability validation for its own environment.
5. Keeps authority exact in its own integration code: content-derived package
   identity, exact CDI digests, retained exact Governance Baseline bodies,
   bind-once execution pins.
6. Routes every authoritative turn through `admitTurn` under a durable pin,
   and persists control snapshots bound to the exact pin digest.

## What this baseline is NOT

- This baseline is **not a release qualification** and is **not Release
  Ready**. Release qualification remains T-026 (issue #244) and closes
  separately; nothing in this baseline pre-empts that gate.
- It depends on **no floating authority**: there is no `current`, `latest`, or
  `active` pointer anywhere in the integrated surface — every authority
  reference is an exact content-derived identity, and integration code must
  not introduce floating selectors (see the migration guide's forbidden
  section).
- It references **no unfrozen Domain Application Contract version**: the public
  surface is documented exactly as shipped at the integration HEAD named
  above, not as any planned or draft contract.
- It makes **no durability claim** for the volatile example scaffolding, and no
  host durability claim beyond what the T-022/T-023/T-024 executed evidence
  establishes (see the host integration guide's durability section).
- It is **not** a substitute for a sibling project's own review: adopt by
  exact SHA, review the diff since your last adopted SHA, and record both.
