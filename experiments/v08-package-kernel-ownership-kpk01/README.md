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
| Admission decision (schema → pinned hard invariants → guard → transition) | `kernel-vnext@1.1.0` | `admission/admission.ts` `admitCentralDecision` |
| Guard / hard-invariant predicate evaluation | `kernel-vnext@1.1.0` | `workflow/predicate.ts` |
| Pinned Governance Baseline identity/digest verification | `kernel-vnext@1.1.0` | `governance/identity.ts` (bounded subset) |
| Durable effect journal (identity, re-begin, idempotent complete, fail-closed) | `kernel-vnext@1.1.0` | `admission/effect-journal.ts` |
| Deterministic Durable Control Turn identity | `kernel-vnext@1.1.0` | `admission/admission.ts` `deriveDurableControlTurnId` |
| **Per-occurrence dynamic Effect input + business idempotency-key binding** (Controller 090 repair) | `kernel-vnext@1.1.0` | **NEW kernel-owned code — NOT a v0.7 migration** (design proven in #972 scratch @6097768812 Candidate A) |
| State-transition commit + revision discipline + per-instance serialization | `kernel-vnext@1.1.0` | `engine/workflow-instance-engine.ts` + `per-instance-serialized-lane.ts` + `instance/persistent-workflow-instance.ts` |
| Rule interpretation (deterministic, LLM-free) | `standard-sdk@1.0.0` | new SDK package at this seam |
| Business policy (workflow definitions, guards, roles, effect handlers) | `business-order-approval@1.0.0` / `business-parts-sale@1.0.0` / `business-inventory-reservation@1.0.0` | mirrors the v0.7 admission golden fixtures (approval); parts/inventory materially distinct domains |
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
                       kernel-mechanism-v1.mjs  (B, migrated v0.7 mechanism + Controller 090 dynamic binding)
                       kernel-mechanism-v2.mjs  (B, controlled successor, generated)
                       sdk-standard.mjs         (C)
                       business-approval.mjs    (C, mirrors v0.7 golden fixtures + dynamic intent)
                       business-parts.mjs       (C, materially different domain)
                       business-inventory.mjs   (C, Controller 090 dynamic-binding second domain)
  ux/                 typed UX clients (E)
consumer/             stock-Node public consumer demo (KPK-13)
tests/                KPK-01 … KPK-15 executable falsifier matrix
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
| KPK-11 | dangerous UX/Host: intents are JSON-only; no commit route; runtime frozen, no port replacement; **instance-document** host-store tampering fails closed at CAS with effects still journaled; the parallel **journal-document** tamper path is adversarially documented as ACCEPTED (forged completed effect replayed as authoritative — see honest boundaries) | **PASS (route/capability isolation)** — durable-journal integrity vs a Host-store writer = NOT_PROVEN (no kernel-keyed MAC); single-realm arbitrary-code sandbox explicitly NOT claimed |
| KPK-12 | fast path: 3 digests at install, 0 whole-package rehash per invoke (only the v0.7-mandated per-admission pinned-baseline re-verification); mutated bytes fail install | **PASS** |
| KPK-13 | clean public consumer on stock Node, no `compiledApp`, no runtime compilation | **PASS** |
| KPK-14 | independent differential: same material executed through the ORIGINAL frozen v0.7 `admitCentralDecision`/`VolatileAdmissionEffectJournal` (imported live) and through the loaded package — admitted plans, journal rows (byte-identical under the fixed clock), denial taxonomy and UNKNOWN taxonomy agree | **PASS (bounded)** — same-business-effect/deny/current-version-safety reference only |
| KPK-15 | **[Controller 090 repair]** per-occurrence dynamic Effect input + business idempotency binding: two domains (approval amount/requestId, inventory sku/qty/reservationId) yield per-request DISTINCT effect port inputs, journal inputs and keys; forged caller / out-of-limit / schema-path-template injection (typed, at installation) / idempotency-key injection (typed, before journal) / post-admission payload mutation (typed JOURNAL_CONFLICT) / replay (zero double dispatch) / UNKNOWN (AMBIGUOUS, no blind retry) / concurrent cross-instance isolation / digest+binding tamper refusal; static-intent v0.7 goldens untouched | **PASS** (evidence: `kpk15-*.json`) |

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

- **[Controller 090 repair scope] Per-occurrence dynamic Effect binding**:
  the kernel-vnext@1.1.0 mechanism resolves data-only, allowlisted,
  wiring-pinned `inputFrom`/`idempotencyKeyFrom` declarations per occurrence
  (after authorized admission, before any journal write). NOT repaired and
  NOT relabeled by that change (all remain open):
  - **post-final duplicate in-response readback** — a duplicate submit after
    completion still returns a typed `no-candidate-transition` denial without
    the completed outcome in the response; the separate journal query remains
    the readback path (#972@6096530583 Cell 2);
  - **misleading model-free receipt vocabulary** — the Standard SDK still
    reports `source:'harness-machine', llmAvoided:false,
    freshModelCallCount:1` for deterministic model-free decisions (deliberate
    v0.7 golden vocabulary; no model port exists at all);
  - **mandatory Host durability** — unchanged (see KPK-07 boundary);
  - **GLOBAL cross-instance business-key uniqueness is NOT kernel-enforced**
    — the effect journal remains occurrence-scoped per instance/turn (v0.7
    semantics preserved): two instances admitting the same business key stay
    isolated (KPK-15i) but do not globally deduplicate; a business needing a
    global unique constraint must own it outside this seam.
- **Durable-journal integrity against a hostile Host-store writer:
  NOT_PROVEN.** Within this experiment's explicitly trusted-Host-store
  premise, the KPK-11 adversarial boundary test documents the actual
  behavior: a raw journal-document writer can forge a completed effect
  envelope (copying the public `kernelModuleSha256`) that the
  current-version kernel replays as authoritative — attacker-controlled
  output, ZERO real resource dispatches, state transition commits on top.
  The instance-document path fails closed at CAS; the journal-document
  path does not (the module-SHA envelope refuses cross-version replay but
  is not an integrity proof — the digest is public and copyable). Closing
  this requires a separate integrity design (kernel-keyed MAC or
  equivalent) plus executable proof — a registered Product
  decision/implementation gate that MUST precede any unqualified
  production durability/security claim; it is deliberately NOT added in
  this bounded experiment.
- **Cross-version journal replay / rolling upgrade / old-occurrence
  continuation**: out of scope by user direction (#993@6093427821). The v2
  successor only demonstrates truthful new identity + typed refusal of
  v1-pinned durable records.
- **Legacy v0.7 public-API parity**: not claimed; KPK-04/KPK-14 are bounded
  same-business-effect semantic references.
- **Real OS crash-mid-write / multi-process store contention**: not
  simulated (KPK-07 boundary; `FileDocStore` CAS is read-check-write +
  rename, single-process-safe only).
- **Producer authentication is not cryptographic**: the `system-producer:`
  gate is a prefix-string check under a trusted-channel premise;
  `LOAD_PRODUCER_UNTRUSTED` enforces exactly that prefix and nothing more.
  A forged fully self-consistent root with a spoofed producerId loads and
  runs (verified in review).
- **`runtime.kernelRuntime` escape hatch (documented surface)**: the public
  frozen runtime object exposes the internal occurrence runtime via this
  getter. Direct calls bypass ONLY the UX transport checks (plain-JSON
  intent validation and sealed intent-type binding); business binding,
  caller-role authorization and SDK plain-JSON gates still hold inside the
  kernel and no authority escalates (verified in review).
- **Test-Host business fixture keys**: the memory/file Host adapters
  hardcode `ledger`/`warehouse`/`booking` resource fixtures — test-only
  business provisioning at the physical-resource seam, annotated as an
  accepted exception in KPK-02's static scan, which asserts these keys never
  appear in the Microkernel/producer/public API.
- **Sandboxing arbitrary same-realm JavaScript**: not claimed; what is proven
  is route/capability isolation from every public surface.
- **Production package tooling**: the producer here is a test-only G0 system
  fixture, not domain-forge/domain-simulator/domain-ai-creator/DAC.

### Controller 093 bounded P2-1 (Kernel Effect destination own-key)
At Kernel wiring, JSON-declared dynamic `inputFrom` destination keys must be 1..64-character ASCII identifiers; `__proto__`, `prototype`, `constructor`, Unicode, control characters and oversized names fail typed with `ADMISSION_EFFECT_BINDING_INVALID` before journal/resource dispatch. Tests KPK-15m..o cover own-key JSON.parse, nested binding descriptors, missing references, no prototype setter, and honest duplicate-key behavior: after JSON.parse, duplicate raw keys have already been normalized; detecting raw duplicate spellings requires an upstream strict producer parser (NOT_PROVEN in this bounded change). v1 and generated v2 Kernel module SHA-256 **change**; source version strings are retained for this single-concern experimental P2 patch; the module digests, not the label alone, pin execution identity. All original dynamic approval/inventory, UNKNOWN, replay and golden behavior remains under KPK-15a..l. Preexisting concurrent openInstance P2-2 is still OUT OF SCOPE; no L2/Freeze/merge.
