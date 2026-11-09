# Source ownership map — v0.7 → physically selected Kernel Package (KPK-01)

The machine-readable, blob-pinned map lives in [`MIGRATION_MAP.json`](./MIGRATION_MAP.json).
This file is the human-readable index; every migrated section in
[`src/producer/payload/kernel-mechanism-v1.mjs`](./src/producer/payload/kernel-mechanism-v1.mjs)
carries the same attribution in its header.

## Pinned sources

- Base (claim): `main@3c71b9138056babfafbc7de1349b5924483f2203` (= bridge/v0.7-to-main merge; verified HEAD at claim)
- Frozen line: `version/v0.7@86110c616b8cb18c730553e4cdab7ef555214521`
- Same-repository provenance (kaicreator-mm/domain-harness); no third-party license applies.

## Function-level ownership

| v0.7 function (file@blob) | Kernel package module section | Authority |
|---|---|---|
| `admitCentralDecision` (admission.ts@955ecf1f) | kernel-mechanism-v1.mjs › “central admission path” | THE admission mechanism |
| `executeEffectIntents` (admission.ts@955ecf1f) | same section | journal-first effect authority |
| `deriveDurableControlTurnId` (admission.ts@955ecf1f) | same section | turn identity |
| `selectAdmittedTransition` + predicate shape validation (admission.ts@955ecf1f) | same section | guard selection |
| `requirePinnedBaseline` (admission.ts@955ecf1f) | same section (port = `KernelGovernancePinStore`) | pinned governance gate |
| predicate engine family (predicate.ts@e680f125) | kernel-mechanism-v1.mjs › “predicate engine” | guard/invariant evaluation |
| `verifyGovernanceBaselineBody` / `governanceBaselineKey` (governance/identity.ts@e60aa62e) | › “baseline identity” | baseline digest verification |
| `VolatileAdmissionEffectJournal` (effect-journal.ts@c6ae1f98) | › “VolatileAdmissionEffectJournal” | portable journal (golden parity) |
| `PerInstanceSerializedLane` (per-instance-serialized-lane.ts@d5a94501) | › “serialized lane” | occurrence serialization |
| `PersistentWorkflowInstanceRepository` (persistent-workflow-instance.ts@3e225296) | › “instance repository” (Host doc port) | instance persistence |
| `WorkflowInstanceEngine.processAcceptedTransition` (workflow-instance-engine.ts@10829999) | › “instance engine” (CAS commit) | state commit discipline |

## New (non-v0.7) kernel-owned composition

- `createOccurrenceRuntime` — the kernel endpoint that composes admission +
  engine + journal + business/SDK endpoints per the sealed bindings (the
  bounded replacement for the NOT-migrated 1094-line T004C host composition).
- `KernelDurableEffectJournal` — the v0.7 journal semantics ported over the
  generic Host doc-store port, plus a `kernelModuleSha256` envelope (typed
  code unavailability across kernel versions). **Scoped claim (review P1-1):
  the envelope binds journal records to kernel module bytes but is NOT an
  integrity proof against a hostile Host-store writer** — the digest is
  public (visible via the runtime mechanism identity) and copyable, so a
  forged completed journal envelope is accepted and replayed as
  authoritative under the experiment's trusted-store premise
  (adversarially documented by KPK-11; only the instance-document tamper
  path fails closed at CAS). Durable-journal integrity vs a Host-store
  writer = NOT_PROVEN; a kernel-keyed MAC (or equivalent) is a registered
  Product follow-up required before any production durability/security
  claim.
- `KernelGovernancePinStore` — the T-014 “pin required for EVERY admission”
  gate over the Host doc port, binding the occurrence to the exact kernel
  module bytes.
- `wireAdmissionEffectBindings` / `resolveAdmissionEffectIntents` /
  `snapshotEffectBinding` (**Controller 090 bounded repair, kernel-vnext
  v1.1.0**) — the per-occurrence dynamic Admission Effect input and business
  idempotency-key binding. NEW kernel-owned code (NOT a v0.7 migration; the
  data-only declarative design was first proven executable in the #972
  scratch remedy @6097768812 Candidate A and is here sealed into the
  package-owned mechanism): `inputFrom`/`idempotencyKeyFrom` declarations
  are validated once at wiring inside `createOccurrenceRuntime` (the trusted
  `DomainHarness.load` installation boundary — event paths confined to the
  rule-`payloadFromInput`-authorized projection, decision paths to the typed
  decision shape, template literals to `[A-Za-z0-9._:-]` with placeholders ⊆
  declared fields, static/dynamic authority mutually exclusive,
  deep-frozen snapshots keyed by intent-object identity) and resolved ONLY
  inside `admitCentralDecision` AFTER authorized transition admission and
  BEFORE any journal write or effect dispatch (resolved keys must match
  `[A-Za-z0-9][A-Za-z0-9._:-]{0,127}`; post-wiring live mutation is ignored,
  injected syntax fails typed `ADMISSION_EFFECT_BINDING_UNVALIDATED`).
  Falsified by KPK-15; the v1.0.0 independent review does NOT transfer to
  the mutated v1.1.0 bytes.

The successor module `kernel-mechanism-v2.mjs` is generated from v1 by
`generate-kernel-v2.mjs`; its only deltas are documented there and in
`MIGRATION_MAP.json`.


Controller 093 Kernel destination-field P2-1: new module digests on unchanged experimental module labels after own-key fail-closed wiring hardening. kernel-vnext@1.1.0 SHA256 `c87b1b7ac5df64734d7c0835a368bbcac84cd3a15294e9e8633407e2b211d756`; controlled kernel-vnext@2.0.0 SHA256 `49b04915570719c5cb8f89c17da49ef0bdefb459bda3cd290df9c827df59229e`. The original reviewer proof at bf132c1 does not transfer to the changed bytes. P2-2 shared-baseline openInstance concurrency remains OUT OF SCOPE; no production authority change or formal Freeze.
