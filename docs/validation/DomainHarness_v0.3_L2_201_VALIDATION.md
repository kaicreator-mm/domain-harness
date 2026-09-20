# DomainHarness v0.3 L2 #201 Validation Evidence

**Status:** ACTIVE TASK EVIDENCE  
**Issue:** #201  
**Branch:** `v0.3_l2_201_snapshot_persistence`  
**Task baseline:** `a84fed0bfecc4c534a330844e6b6a4a76e3c67c2`  
**Research evidence consumed:** #195 `419269f788de1d46e24af8bea19b041c8e36760f`  
**CI policy for this task:** CI unavailable; explicit waiver authorized by #201 dispatch; do not claim CI PASS.

---

## 1. Validation scope

This task is L2 Architecture Evidence, not a production RuntimeStore implementation.

The executable fixture validates the proposed contract semantics for:

- recursive parent/child control-snapshot persistence;
- snapshot schema/package/machine/instance compatibility;
- journal-first ordering for AI/query/effect committed work;
- stale control snapshot recovery;
- crash-before-commit at-least-once semantics;
- atomic message-turn + snapshot publication model;
- stale-writer CAS rejection;
- missing/corrupt/incompatible fail-closed behavior;
- Node/Expo logical contract parity.

The real process/SQLite/SIGKILL proof is inherited as architecture evidence from #195 rather than duplicated with a second research runtime in #201.

---

## 2. Focused executable validation

Fixture:

`packages/domain-harness/tests/architecture-v03/snapshot-persistence-contract.test.ts`

Remote blob SHA:

`3ec45a3b06c9155b408cacceb388dd73be6222e4`

The locally executed file had the same Git blob SHA, proving the executed fixture bytes are identical to the fixture committed on this branch.

Execution environment:

```text
Node.js v22.16.0
```

Command:

```text
node --experimental-strip-types --test /tmp/snapshot-persistence-contract.test.ts
```

Result:

```text
PASS
7 tests
7 passed
0 failed
```

Covered cases:

1. Node contract parity: recursive parent/child round-trip and restore validation.
2. Expo contract parity: same logical contract.
3. Committed AI/query/effect journal result wins over stale control snapshot; underlying work count remains one.
4. Crash before AI commit permits re-execution and does not claim exactly-once.
5. Processed-message disposition + instance revision + matching control snapshot publish as one logical transaction.
6. Missing child, corrupt child, incompatible machine, revision mismatch and non-JSON snapshot fail closed.
7. Control-snapshot CAS rejects stale writers and committed-work identity mismatch fails closed.

---

## 3. Repository / TypeScript validation

| Gate | Status | Evidence / reason |
| --- | --- | --- |
| focused executable contract fixture | PASS | exact fixture blob `3ec45a3b06c9155b408cacceb388dd73be6222e4`, 7/7 passed |
| local full repository `npm test` | NOT_RUN | execution container cannot resolve `github.com`, so a clean repository checkout/dependency installation was not available |
| standalone TypeScript full typecheck | BLOCKED | local global `tsc` exists, but local environment does not contain repository `@types/node` dependencies; failure was environment-only `TS2688: Cannot find type definition file for 'node'` |
| canonical CI | NOT_RUN | explicit #201 CI waiver: service currently unavailable; this task must not wait for CI and must not claim PASS |
| real Node SQLite + separate-process SIGKILL evidence | PASS (consumed evidence) | #195 exact validated HEAD `419269f788de1d46e24af8bea19b041c8e36760f`; not rerun as a duplicate runtime experiment here |
| real Expo/Hermes production adapter implementation | NOT_APPLICABLE | #201 defines L2 contract; production adapter implementation is follow-up work |

The full-repository and CI statuses do not block the requested #201 L2 evidence because the dispatch explicitly waives current CI and asks for available focused/local evidence. They must not be converted into a release or production-implementation PASS.

---

## 4. #195 evidence consumed

#195 established the physical recovery behavior that the production contract must preserve:

- real SQLite database reopened by an independent process after hard `SIGKILL`;
- XState parent=`evaluating` + HarnessMachine child=`model` restored from recursive control snapshot;
- committed AI result reused without a second model call;
- committed query observation reused without duplicate query execution;
- committed mutation effect reused without duplicate mutation application;
- crash-before-AI-commit retried with explicit at-least-once semantics;
- corrupt/missing child snapshot failed closed;
- wrong committed-work identity failed closed;
- parent guard authority remained intact;
- provider/model authority and business mutation authority remained outside XState persistence.

#201 uses those results to define production ordering and compatibility contracts; it does not merge the #195 research branch.

---

## 5. CI waiver

Issue #201 dispatch states:

> CI service is currently unavailable. Do not wait on CI; run focused/local/Build Host evidence available to you and explicitly record CI waiver rather than claiming PASS.

Therefore canonical CI is recorded as:

```text
NOT_RUN — WAIVED FOR THIS L2 TASK BY #201 DISPATCH
```

This waiver applies only to completing the architecture-evidence task. It is not a statement that future v0.3 production implementation, version closure, or release qualification may skip their required validation.

---

## 6. Evidence conclusion

The available executable evidence supports the L2 contract proposed in:

`docs/architecture/DomainHarness_v0.3_L2_201_SNAPSHOT_PERSISTENCE_EVIDENCE.md`

No evidence requires reopening the frozen v0.3 PRD or Architecture Baseline, and no evidence supports introducing an independent Harness Runtime.

The branch final exact HEAD is recorded on the #201 closeout comment after all task files are committed, avoiding a self-referential commit-SHA edit loop in this document.
