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

## R2 addendum (review #6258041474 P1 — post-invocation error codes prove nothing; dispatcher per-call pre-handler attestation only)
Review finding: under R1, `probeProvesZeroExternalEffect` trusted the THROWN
error's `code` string (the `PRE_DISPATCH_RESOURCE_REFUSALS` set). A resource
adapter / Business handler can land the physical mutation and only THEN throw
an error carrying any of those code names — an honest code collision with no
hostile code required (tagged lost-ACK: append the ledger line, then throw
`code: 'HOST_RESOURCE_MALFORMED'`). The journal `failed` row would carry
`zeroExternalEffect:true`, the fence would release, and a rival turn could
re-dispatch the already-landed non-idempotent mutation at the unchanged
stateRevision. Pure "invoked===false only" was REJECTED: it would permanently
break the tg5 follower-drain journey (dispatcher refusals would also keep the
fence, with no recovery seam on the selected runtime for that journey).

Adopted contract (B) — the attest has FOUR load-bearing properties:
1. KERNEL-MINTED: `effectTools.execute` mints one fresh
   `{ preHandlerRefusal: null }` per resources-port call and pushes it into
   `probe.dispatchAttests` BEFORE the call (a synchronous throw still leaves
   an unmarked attest in the probe — fail-closed).
2. PER-CALL, DEDICATED ARGUMENT: threaded as the trailing argument of
   `resources.call(key, op, payload, attest)` / `callScoped(scope, key, op,
   payload, attest)` — never the payload, never the DispatchContext.
3. TRUSTED-DISPATCHER-WRITTEN ONLY: `ResourceDispatcher`
   call/callScoped/#dispatch mark `attest.preHandlerRefusal = '<code>'`
   synchronously BEFORE throwing ONLY its own pre-handler refusals
   (HOST_RESOURCE_MALFORMED, HOST_RESOURCE_NAMESPACE_RESERVED,
   HOST_RESOURCE_UNKNOWN). HOST_FAULT_INJECTED is NEVER marked (uncertain).
   Once the handler runs, nothing is marked and nothing is provable; the
   handler signature stays `(operation, payload, context)`.
4. NEVER FORWARDED TO THE ADAPTER: the attest is invisible to the resource
   handler and any Business code — it cannot be marked, stripped or faked
   downstream. Wiring: bootstrap kernelPorts.resources forwards it;
   microkernel's runtime-narrowed view forwards it through BOTH branches
   (claimed → callScoped as 5th arg, bare → call as 4th arg); the
   adapter-less branch passes the raw port reference verbatim. A host that
   ignores the attest simply never marks it → fail-closed.

Code strings are PERMANENTLY disqualified as zero-effect evidence — including
HOST_RESOURCE_PRE_DISPATCH and every dispatcher-owned name.

Fail-closed proof matrix (`probeProvesZeroExternalEffect(probe)`, error no
longer an input):
- `supported !== true` (foreign executor) → NOT provable;
- `invoked !== true` (port never called) → provable zero effect;
- `invoked === true`  → provable ONLY when `dispatchAttests.length > 0` and
  EVERY attest has `typeof preHandlerRefusal === 'string'` (all calls
  attested pre-handler refusals);
- everything else (any unattested call, handler fault, fault injection, lost
  ACK, post-mutation tagged throw) → NOT provable; fence stays held.

Test surface changes:
- k01-fence-worker.mjs: `--fail lost-ack-tagged` (throws
  `code:'HOST_RESOURCE_MALFORMED'`) and `--fail lost-ack-tagged-predispatch`
  (throws `code:'HOST_RESOURCE_PRE_DISPATCH'`), both AFTER the real ledger
  append; K01-N4 parameterized falsifier: fence held, rival refused typed at
  the same revision, ledger exactly 1 line, journal failed row carries NO
  zeroExternalEffect.
- tg5-hf16: journey semantics change — the adapter-thrown
  HOST_RESOURCE_PRE_DISPATCH poison (q-poison, q-uncertain) now keeps the
  fence HELD (fail-closed, materialized by the new q-uncertain leg: a
  follower occurrence is refused ADMISSION_STATE_CAS_CONFLICT); the
  follower-drain journey rides a TRUSTED DISPATCHER refusal seam instead
  (unprovision 'ledger' → pre-handler HOST_RESOURCE_UNKNOWN → attested →
  fence released → follower drains); physical dispatch accounting moved to
  the dispatcher-side callCount (sees refused pre-handler dispatches an
  adapter-side counter cannot); HF16-N durable-failed-row / same-messageId
  typed retry / fresh-process reopen legs unchanged in meaning.
- hf16-authorized-recovery: unaffected (its poison was already a plain
  uncertain throw; drains via the operator-authorized recovery supersede).

This file is the T00/K02 contract: the attest parameter is the ONLY sanctioned
zero-external-effect proof channel between the kernel and the trusted host
dispatcher; do not reintroduce code-string classification.
