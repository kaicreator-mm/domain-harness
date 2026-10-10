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
  code unavailability across kernel versions).
- `KernelGovernancePinStore` — the T-014 “pin required for EVERY admission”
  gate over the Host doc port, binding the occurrence to the exact kernel
  module bytes.

The successor module `kernel-mechanism-v2.mjs` is generated from v1 by
`generate-kernel-v2.mjs`; its only deltas are documented there and in
`MIGRATION_MAP.json`.
