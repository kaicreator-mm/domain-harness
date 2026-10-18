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

## Edit 5 — Host kernel-ports `remove` seam (discovered from the real repo during implementation)
The v0.8 Host installs the Kernel's docs port as a frozen {get,put,list} tuple
(`packages/domain-harness/src/host-v8/bootstrap.ts` kernelPorts; installed via
`packages/domain-harness/src/public-v8/kernel-host.ts` preflight/install), while
the store contract (`host-v8/cas.ts`) HAS conditional `remove`. Without `remove`
on the installed port, Edit 2's release throws and is swallowed — the fence is
never released (fail-closed wedge; witnessed by HF16/HF20/HF33 neighbor suites).
Changes: bootstrap kernelPorts.docs gains `remove` (conditions forwarded
verbatim); kernel-host preflight REQUIRES docs.remove (complete-set fail-closed
discipline) and install forwards it; `V8KernelHostPorts.docs` type gains
remove. Committed-dist discipline: `packages/domain-harness/dist/**` rebuilt and
committed. Test-side port constructions updated: `i01-kernel-ports.test.ts`
(fixture + positive remove assertion), `i01-bootstrap-failclosed-occupied-kernel.test.ts`
(occupier), `v08-tb-fixture.ts` b01MemoryHost (memory remove).

## Edit 6 — commit-phase zero-record release (runner)
Anchor: the `commitAcceptedTransitionInLane` call in `createOccurrenceRuntime`'s
submit path is wrapped: on failure, the fence is released ONLY when the turn has
ZERO begun journal records (effect-free turns faulted at the commit CAS — HF20
witness); any existing record keeps it held (replay reconciles).

## Edit 7 — selected-blob rebind (mechanical consequence)
`packages/domain-harness-compiler/tests/v08-tf-oracle-fr02-fr07.test.ts`
`V08_K_BLOB` rebind to the post-fix payload blob (the WEB-ORACLE-1 META pin of
the physically selected K file; the pin's purpose is byte-exactness of the
CURRENT selection, not an immutable historical digest).

## Ordering discipline
1. Tests written and committed-intent pinned. 2. Pre-fix two-process reproduction of
#1108 captured on the UNMODIFIED base (dispatch requirement). 3. Edits 1-4. 4. Same
tests green + R02-N1/N2/P/a regression green. 5. Targeted package suite + task-check.

## R1 addendum (review #6254726103 P1 — lost-ACK fence release)
Review finding: a journal `failed` record reflects a THROWN adapter call, NOT
proof of zero external mutation; the R0 release-on-all-failed rule could free
the fence after a real external dispatch with a lost ACK, letting a competing
turn redispatch. Bounded fix (kernel + declared-protocol, no behavior change to
frozen surfaces):
- Dispatch probe: the runtime's own effectTools.execute wraps the resources
  port handed to the Business handler; `probe.invoked` records whether the
  physical dispatch port was ever called. A missing/non-object port passes
  through verbatim (handler guard shapes unchanged).
- Provable zero-external-effect classes ONLY: handler never invoked the port;
  dispatcher-level pre-impl refusals (HOST_RESOURCE_MALFORMED / _UNKNOWN /
  _NAMESPACE_RESERVED); adapter-declared HOST_RESOURCE_PRE_DISPATCH (the
  sealed resource layer asserts its failure performed no external mutation —
  the truthful home of the "outage before the ledger" class). Everything else
  (handler fault, timeout, lost ACK) is UNCERTAIN.
- The classification persists into the durable failure record
  (`error.zeroExternalEffect`) so a same-turn replay refusal restores the same
  fence policy (fixes the retry-reclaim wedge witnessed by HF33-N).
- admitCentralDecision releases ONLY on error.zeroExternalEffect === true AND
  all-failed journal scan. Uncertain outcomes keep the fence held
  (fail-closed UNKNOWN).
- Trusted-seam reconciliation supersede: a turn source of kind `recovery`
  (operator-credentialed, durably CAS-delivered poison recovery) may claim a
  fence held at the same stateRevision ONLY when the holder's every begun
  journal effect is durably `failed` (>=1 record, none started/completed) —
  HF16 authorized recovery stays live for genuinely uncertain poisons.
- Fixtures: tg5-hf16 outage becomes a declared HOST_RESOURCE_PRE_DISPATCH
  (truthful: the outage never reached the ledger — follower drain preserved);
  hf16-authorized-recovery's poison stays UNDECLARED/uncertain and now drains
  via the recovery supersede. K01 multiprocess suite: F1 keeps provable
  pre-port release liveness; new N3 is the reviewer-required lost-ACK
  falsifier (real ledger line then throw → fence held, zero second dispatch,
  honest typed refusals, no false ACK).
