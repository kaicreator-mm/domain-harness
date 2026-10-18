# K01 implementation map — exact anchors on base 1e6d4be0 (kernel blob
# fa30e1204d47c12f3f5842c497a83a08501d515b). One concern: live admission-fence/effect
# authorization. Four code edits, all in the selected kernel payload; no other source.

## Edit 1 — `claimAdmissionFence` same-revision rival refusal (the #1108 core)
File: `packages/domain-harness-compiler/src/qualified-package/payload/kernel-mechanism-v1.mjs`
Anchor: `WorkflowInstanceEngine.claimAdmissionFence` (~L2669), immediately before the
fence CAS `#docs.put`. Read the fence document; if it exists, is a JSON record with a
string `turnId` DIFFERENT from the claiming turn AND `stateRevision === expectedTargetSequence`,
refuse typed `ADMISSION_STATE_CAS_CONFLICT` (in-flight/crashed protected turn — fail closed)
BEFORE any write. Older-revision leftovers and same-turnId re-claims fall through to the
existing revision-CAS put + instance re-read, unchanged. Read-then-put stays sound: the
conditional put still arbitrates concurrency; the pre-read only adds a refusal.

## Edit 2 — `releaseAdmissionFence` conditional release (new engine method)
Anchor: after `claimAdmissionFence` in `WorkflowInstanceEngine`. `#docs.remove(fenceKey,
{ mustMatchRevision: fence.revision })`; if `fence.revision` is not a safe integer the
release is skipped (an unconditional fence write never exists — keep held). Errors
propagate to the caller's guarded catch (kept-held semantics).

## Edit 3 — `admitCentralDecision` effect-failure fence policy
Anchor: the `ports.admissionFence` call (~L1289) captures the returned fence; the
`executeEffectIntents` call (~L1293) is wrapped: on throw, IF a fence was captured AND
`ports.admissionFenceRelease` is wired, scan `ports.effectJournal.getEffect` for
`${turnId}/effect/1..effectIntents.length`; release ONLY when every existing record is
durably `failed` (no `started`/`completed`). Any scan/release failure keeps the fence
held. The original typed effect error is rethrown unchanged (never masked).

## Edit 4 — occurrence runtime wiring
Anchor: `createOccurrenceRuntime` submit path (~L5197-5216): the `admissionFence` port
callback RETURNS the claim result; add `admissionFenceRelease: (fence) =>
engine.releaseAdmissionFence(target, fence)` to the same ports object.

## Test artifacts (tests-first, written before Edits 1-4)
- Rework `tests/v08-integration/r02-stale-admission-cas-physical.test.ts` leg R02-b:
  same-revision rival claim refuses; same-turn re-claim allowed; hand-displaced fence
  commit refusal; post-commit supersede at the newer revision commits.
- New `tests/v08-host/k01-fence-race-multiprocess.test.ts` + `children/k01-fence-worker.mjs`
  (stock-node child processes; kernel imported from the exact current payload source;
  host store via package self-reference `@kaicreator/domain-harness/v8/host`).

## Ordering discipline
1. Tests written and committed-intent pinned. 2. Pre-fix two-process reproduction of
#1108 captured on the UNMODIFIED base (dispatch requirement). 3. Edits 1-4. 4. Same
tests green + R02-N1/N2/P/a regression green. 5. Targeted package suite + task-check.
