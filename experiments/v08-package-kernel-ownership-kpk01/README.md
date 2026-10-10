# v0.8 KPK-01 — Executable selected Kernel Domain Package owns the real Runtime mechanism

> Bounded, ISOLATED pre-freeze architecture experiment for
> [kaicreator-mm/domain-harness#993](https://github.com/kaicreator-mm/domain-harness/issues/993).
> **MODE=BOUNDED_PRE_PRODUCT_FREEZE_ISOLATED_EXECUTABLE_ARCHITECTURE_EXPERIMENT.**
> Not formal L2 implementation, not a v0.8 release feature, not Product Freeze,
> not mergeable. One Builder, one Draft PR, independent review afterwards.

## What this experiment proves (the falsifiable claim)

`const runtime = await DomainHarness.load(package)` loads a **system-produced,
sealed, versioned Domain Package root**. The **physically selected Kernel
Domain Package module** — instantiated from its exact sealed bytes via a
`data:` module import at installation — supplies the ENTIRE authoritative
occurrence mechanism, migrated from the accepted frozen v0.7 sources:

| Mechanism concern | Owner (executing code) | v0.7 lineage (see `MIGRATION_MAP.json`) |
|---|---|---|
| Admission decision (schema → pinned hard invariants → guard → transition) | `kernel-vnext@1.0.0` | `admission/admission.ts` `admitCentralDecision` |
| Guard / hard-invariant predicate evaluation | `kernel-vnext@1.0.0` | `workflow/predicate.ts` |
| Pinned Governance Baseline identity/digest verification | `kernel-vnext@1.0.0` | `governance/identity.ts` (bounded subset) |
| Durable effect journal (identity, re-begin, idempotent complete, fail-closed) | `kernel-vnext@1.0.0` | `admission/effect-journal.ts` |
| Deterministic Durable Control Turn identity | `kernel-vnext@1.0.0` | `admission/admission.ts` `deriveDurableControlTurnId` |
| State-transition commit + revision discipline + per-instance serialization | `kernel-vnext@1.0.0` | `engine/workflow-instance-engine.ts` + `per-instance-serialized-lane.ts` + `instance/persistent-workflow-instance.ts` |
| Rule interpretation (deterministic, LLM-free) | `standard-sdk@1.0.0` | new SDK package at this seam |
| Business policy (workflow definitions, guards, roles, effect handlers) | `business-order-approval@1.0.0` / `business-parts-sale@1.0.0` | mirrors the v0.7 admission golden fixtures |
| Raw durable storage / SHA-256 / clock / physical resources | **Host ports** (generic primitives only) | — |
| Loading, byte verification, endpoint wiring, UX transport | **Microkernel** (NO mechanism code) | — |

The Microkernel (`src/microkernel/`) contains **no** v0.7 engine import, no
business special case and no second journal — proven statically and at
runtime by KPK-02. A wrapper-style "kernel package" that merely called a
Host-hidden v0.7 engine would fail KPK-01 (executing-function source must be
contained in the sealed package bytes) and KPK-14 (bounded differential
against the ORIGINAL frozen v0.7 modules imported live from this repository
at the pinned base).

## Layout

```
src/
  microkernel/        thin loader: contracts + load(package) (A)
  host/               generic Host ports + memory/file adapters (KPK-07)
  producer/           test-only system producer: build-package.mjs (D)
  producer/payload/   the physical package payload modules:
                       kernel-mechanism-v1.mjs  (B, migrated v0.7 mechanism)
                       kernel-mechanism-v2.mjs  (B, controlled successor, generated)
                       sdk-standard.mjs         (C)
                       business-approval.mjs    (C, mirrors v0.7 golden fixtures)
                       business-parts.mjs       (C, materially different domain)
  ux/                 typed UX clients (E)
consumer/             stock-Node public consumer demo (KPK-13)
tests/                KPK-01 … KPK-14 executable falsifier matrix
evidence/             machine-readable receipts written by every falsifier
```

## Run

```bash
# stock Node 22/24, no compilation anywhere:
node consumer/demo-consumer.mjs
node --test tests/kpk01-*.test.mjs … tests/kpk13-*.test.mjs   # npm test
# the KPK-14 differential imports the original v0.7 TS sources (tsx):
node --import tsx --test tests/kpk14-differential.test.mjs    # npm run test:differential
```

## Falsifier matrix status

| Id | Claim | Verdict |
|---|---|---|
| KPK-01 | exact source ownership: executing mechanism functions come from the sealed kernel bytes; successor selection changes identity/behavior without touching the Microkernel | **PASS** (evidence: `kpk01-*.json`) |
| KPK-02 | thin loader: static scan (no v0.7 engine import/identifier, no business token in the business-agnostic host side) + non-aliasing runtime proof | **PASS** |
| KPK-03 | fixed closure: producer validates once; `load` does structural+digest work only; unbound intents fail typed | **PASS** |
| KPK-04 | v0.7-semantics positive: exact turn/effect identity, one authoritative completed journal row, one resource call, crash-recovery replay with 0 extra calls/rows | **PASS** (bounded semantic reference per user scope 6093427821 — no legacy-API-parity claim) |
| KPK-05 | negatives: hard-invariant / guard / business caller-role denials with zero resources and zero journal rows | **PASS** |
| KPK-06 | UNKNOWN: post-dispatch resource timeout → durable FAILED, retry forbidden; journal-complete fault → started-not-committed → AMBIGUOUS for non-idempotent; idempotent domain re-executes deterministically | **PASS** (migrated v0.7 paths; no fabricated UNKNOWN) |
| KPK-07 | durable restart recovery through the Host file-store seam (journal/pin/instance recovered; replay 0 extra dispatches) | **BOUNDED PASS** — real OS crash-mid-write, multi-process contention and cross-version migration NOT simulated (explicit boundary) |
| KPK-08 | two Business domains on identical kernel+sdk bytes, different guards/effects/roles/invariants; no hot swap interference | **PASS** |
| KPK-09 | kernel byte/version change (revised scope): truthful new digest/closure identity; v1-pinned occurrences fail typed under v2; active v1 runtime never hot-swapped | **PASS** (cross-version replay/rolling upgrade out of scope per user direction) |
| KPK-10 | raw/unqualified manifests: producer rejects wrong kind/provider/ABI before load; load rejects unsealed/impostor/stripped modules typed | **PASS** |
| KPK-11 | dangerous UX/Host: intents are JSON-only; no commit route; runtime frozen, no port replacement; host-store tampering fails closed at CAS with effects still journaled | **PASS (route/capability isolation)** — single-realm arbitrary-code sandbox explicitly NOT claimed |
| KPK-12 | fast path: 3 digests at install, 0 whole-package rehash per invoke (only the v0.7-mandated per-admission pinned-baseline re-verification); mutated bytes fail install | **PASS** |
| KPK-13 | clean public consumer on stock Node, no `compiledApp`, no runtime compilation | **PASS** |
| KPK-14 | independent differential: same material executed through the ORIGINAL frozen v0.7 `admitCentralDecision`/`VolatileAdmissionEffectJournal` (imported live) and through the loaded package — admitted plans, journal rows (byte-identical under the fixed clock), denial taxonomy and UNKNOWN taxonomy agree | **PASS (bounded)** — same-business-effect/deny/current-version-safety reference only |

## Provenance truth flags (per #993 preflight 6086996409)

```
G0_HAND_AUTHORED_SYSTEM_PRODUCER=YES
DOMAIN_FORGE_EXECUTABLE_PACKAGE_PRODUCER=NOT_PROVEN
SIMULATOR_COMPILED_MODULE_PROOF=NOT_PROVEN
CREATOR_BUILDER_ACTUAL=NOT_IMPLEMENTED_HERE
DAC_PRODUCTION_PROMOTION_SELECTION_ACTIVATION=NOT_PERFORMED
TEST_HOST_IMMUTABLE_MODULE_SNAPSHOT=EXECUTE_AND_PROVE
MICROKERNEL_DYNAMIC_ADMISSION_OWNER=PHYSICALLY_SELECTED_KERNEL_PACKAGE_ONLY
```

## Honest boundaries (NOT_PROVEN / out of scope)

- **Cross-version journal replay / rolling upgrade / old-occurrence
  continuation**: out of scope by user direction (#993@6093427821). The v2
  successor only demonstrates truthful new identity + typed refusal of
  v1-pinned durable records.
- **Legacy v0.7 public-API parity**: not claimed; KPK-04/KPK-14 are bounded
  same-business-effect semantic references.
- **Real OS crash-mid-write / multi-process store contention**: not
  simulated (KPK-07 boundary).
- **Sandboxing arbitrary same-realm JavaScript**: not claimed; what is proven
  is route/capability isolation from every public surface.
- **Production package tooling**: the producer here is a test-only G0 system
  fixture, not domain-forge/domain-simulator/domain-ai-creator/DAC.
