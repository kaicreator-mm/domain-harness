# Issue #135 Validation Record — activation reclaim of interrupted processing

**Version:** v0.2
**Concern:** Issue #135 (P0) — message interrupted in `processing` wedges its Workflow Instance after restart
**Branch:** `v0.2_fix_135`
**Baseline:** `0d4059071f3d5919962e352e133e416b5472416f` (`v0.2` closure HEAD; frozen executable candidate `3019b064...` is affected by the defect)
**Validation executor:** real Node Build Host (Windows x64, Node `v26.8.1`, `better-sqlite3@12.11.1`)
**Candidate HEAD:** the commit that adds this record; exact SHA is posted on the PR and issue evidence.
**Architecture authority:** Frozen L2 amended per the issue's own requirement — see §25 Amendment A1 in `docs/architecture/DomainHarness_v0.2_L2_ARCHITECTURE_EVIDENCE.md`.

## Scope

Write set actually touched:

- `packages/domain-harness/src/v2/contracts/store.ts` — two new semantic operations;
- `packages/domain-harness/src/runtime/create-domain-runtime.ts` — activation reclaim + startup drain; drain failures surfaced;
- `packages/domain-harness/tests/instance/fake-runtime-store.ts` — contract stub parity;
- `packages/domain-harness-node/src/store/node-sqlite-runtime-store.ts` — Node adapter implementation;
- `packages/domain-harness-expo/src/store/**` — Expo adapter implementation + structural mirror;
- `packages/domain-harness-node/tests/store/runtime-store.test.ts`,
  `packages/domain-harness-node/tests/store/i135-processing-reclaim.test.ts`,
  `packages/domain-harness-expo/tests/store/runtime-store-conformance.ts` — conformance/regression pins;
- `tests/critical-journeys/node/**` — four new real process-kill windows;
- `tests/hosts/expo/restart-critical-journey.ts`, `examples/expo-conformance/App.tsx`,
  `docs/validation/v0.2/expo/T019_VALIDATION.md` — Expo restart reclaim journey + evidence wiring;
- `docs/architecture/DomainHarness_v0.2_L2_ARCHITECTURE_EVIDENCE.md` — Amendment A1.

No frozen product semantics, no shared T-017 fixture/expected-report semantics, and no sibling task acceptance definitions were modified.

## What was built

1. **RuntimeStore contract** gains `listUnresolvedMessageTargets()` and
   `reclaimInterruptedProcessing(target)`. Reclaim is atomic per target, returns
   `processing` messages to `accepted` with identity and `targetSequence` preserved, and
   clears the processing marker. Its single-writer precondition is frozen in L2 §11.1.
2. **Runtime activation** (`createDomainRuntime`) enumerates unresolved mailboxes after
   package preflight, reclaims interrupted processing, and schedules a startup drain per
   affected instance. An accepted message never again waits for a future send.
3. **Re-execution policy** after reclaim is the existing durable effect-journal recovery
   matrix, unchanged: completed → reuse; started `none`/`idempotent` → re-execute under the
   same idempotency identity; started `non-idempotent` → `recovery_required`. `recover()` is
   deliberately unchanged: reclaimed poison paths record a durable failure with
   `sourceMessageId`, so the operator path works exactly where it should.
4. **Drain failures surface**: `scheduleDrain` no longer swallows `ProcessingConflictError`;
   everything except the durable poison path (`RecoveryRecordedError`) reaches
   `onBackgroundError`.
5. **Adapter divergence removed** (issue root cause 3): Expo `getNextAcceptedMessage` is now
   head-of-queue blocking like Node, and Expo `beginEffect` identity excludes
   `attempt`/`startedAt` like Node, so the recovery matrix's same-identity re-execution works
   on both hosts. Both behaviors are pinned in the shared store conformance suite.

## Store conformance (PASS)

Node G5 suite additions (`packages/domain-harness-node/tests/store/runtime-store.test.ts`):
head-of-queue blocking pin, reclaim identity/sequence preservation, unresolved-mailbox
enumeration, reclaim no-op cases. Expo shared suite
(`packages/domain-harness-expo/tests/store/runtime-store-conformance.ts`) gains the same
semantic checks plus the effect re-begin identity pin; it executes on the real device through
the T-004 harness and is compile-verified here through `tests/hosts/expo-store` `build:validation`.

```text
npm ci && npm run build
npm run lint         → PASS
npm run typecheck    → PASS (all workspaces)
npm test             → PASS 151/151 (122 core + 1 compiler + 28 node)
```

## Runtime regression (PASS)

`packages/domain-harness-node/tests/store/i135-processing-reclaim.test.ts` pins the issue
scenario without a process kill: a durable `processing` wedge is written directly, a fresh
runtime activates over the same store, and the message reaches `processed` with no resend and
no operator recovery; later sends progress; the interrupted messageId stays deduplicated;
`recover()` is correctly refused on the healthy instance; `onBackgroundError` stays silent.
A second test forces a head conflict and proves the drain failure reaches `onBackgroundError`
while the accepted message stays durable.

## Real process-kill journeys (PASS)

`tests/critical-journeys/node/process-kill-recovery.test.ts` (real child process, SIGKILL at a
store-level durable boundary, fresh-process restart on the same SQLite file):

| Kill window | Durable state at kill | Restart expectation |
|---|---|---|
| `durable-ack` (existing) | accepted ACK, no processing | duplicate ACK identity preserved; auto-drain settles |
| `effect-journal` (existing) | effect + message committed | replay reuses; no fabricated transition |
| `poison-recovery` (existing) | `recovery_required` committed | no new acceptance; no fabricated Tool execution |
| `processing-interrupt` (new, the #135 window) | head `processing`, no effect fact | activation reclaim + drain, no resend; exactly 1 transition |
| `effect-started` (new) | `processing` + effect `started` | re-execute once under same identity; commit |
| `effect-committed` (new) | effect `completed`, message not committed | reuse; no duplicate external execution |
| `accepted-idle` (new) | `accepted`, never drained, no resend after restart | activation startup drain settles |

One resume-harness correction was required by the fix itself: the post-crash durable state is
now read from the raw store **before** runtime creation, because activation drain settles
interrupted mailboxes immediately — reading through the live runtime would race it.

Result on the candidate HEAD: **7/7 PASS**, three consecutive full runs, 0 flakes.

```text
node --import tsx --test tests/critical-journeys/node/process-kill-recovery.test.ts  → 7/7 PASS ×3
node --import tsx --test tests/hosts/node/conformance.test.ts                        → G30 PASS
```

## Expo restart reclaim journey (source-complete; real-device evidence owner-held)

`tests/hosts/expo/restart-critical-journey.ts` gains
`prepareReclaimCriticalJourney`/`verifyReclaimCriticalJourney` on a dedicated database. PREPARE
leaves the durable wedge deterministically (raw store accept + mark, no drain scheduled);
VERIFY runs after a real force-stop/relaunch and asserts the pre-activation `processing` read,
the no-resend reclaim drain (revision 1, exactly one quote Tool execution), continuation to
`completed` via approve, and zero background errors. App wiring and required evidence markers
(`DOMAIN_HARNESS_T019_RECLAIM_PREPARE_PREPARED` / `..._RECLAIM_VERIFY_PASS`) are recorded in
`docs/validation/v0.2/expo/T019_VALIDATION.md`.

Static evidence on the candidate HEAD:

```text
node tests/hosts/expo/check-runtime-boundary.mjs   → T019_RUNTIME_BOUNDARY_PASS (66 files)
cd examples/expo-conformance && npm ci && npm run typecheck → PASS
```

The real Android/Hermes execution remains owner-held per the T-019 record and must be bound to
the exact successor candidate SHA before Release Qualification (#148) can treat the Expo leg as
proven.

## Out of scope (tracked separately)

- #136 dedup-order defect, #137 out-of-state message policy, #138 w2w send rejection, #139
  package-root built-ins: untouched by this fix and still open.
- The issue-recommended generic crash-injection sweep harness (abort after the N-th store call
  for every N) is not added here; the four new targeted kill windows cover the #135 crash
  classes, and the sweep is recommended follow-up hardening.
