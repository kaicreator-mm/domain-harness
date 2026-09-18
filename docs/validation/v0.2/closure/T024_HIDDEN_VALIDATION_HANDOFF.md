# DomainHarness v0.2 T-024 — G34 Hidden Validation Handoff

## Authority boundary

G34 is owner-held Hidden Validation. T-024 prepares this handoff but does not execute, reveal, weaken, or self-declare the hidden suite PASS.

```text
CANDIDATE_FROZEN_SHA=3019b064faccbc5ede9ce4f8c67e23c8703996f6
CANDIDATE_TREE_SHA=7709db6d064926c09de66fd13f917eb57119e0c6
STANDARD_REVISION=0446f04583f6cf464c835f26e2f657c8b703cb4e
G34_STATUS=BLOCKED(owner-held Hidden Validation not yet executed)
```

**Validate the exact candidate SHA above.** Do not validate the moving `v0.2` branch and do not substitute the later T-024 documentation commit/PR HEAD for this candidate.

## Candidate identity preflight

The Hidden Validation executor should establish an isolated clean checkout and prove identity before any scenario runs:

```bash
git fetch origin --prune
git checkout --detach 3019b064faccbc5ede9ce4f8c67e23c8703996f6
test "$(git rev-parse HEAD)" = "3019b064faccbc5ede9ce4f8c67e23c8703996f6"
git status --porcelain
node --version
npm --version
```

`git status --porcelain` must be empty before execution. The executor must record OS/platform/runtime/toolchain identities used by the hidden profile.

A clean dependency/build sanity may be run before the owner-held scenarios:

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

These visible commands are sanity checks only; passing them does not constitute G34 PASS.

## Required hidden scenario classes

The concrete fixtures/inputs/assertions remain owner-held. The hidden pack must cover the frozen PRD G34 classes without relying only on the visible test fixtures:

1. crash boundaries around durable acceptance, Tool/result journal commitment, Workflow→Workflow send commitment and recovery;
2. invalid/corrupt Target Compiled Domain Package inputs and incompatible runtime/package identity;
3. invalid Domain Messages, including lifecycle/contract/package-context rejection before accepted ACK;
4. cross-version incompatible package/message behavior with retained pinned instances;
5. Tool failures, including deterministic failure and ambiguous non-idempotent outcome where blind retry is forbidden;
6. same-instance ordering and duplicate/dedup behavior, including adversarial/concurrent delivery cases;
7. terminal dispositions for accepted-but-unprocessed messages across both normal terminal completion and recovery termination/resolution;
8. Projection failures: malformed/missing declared inputs, schema failures, deterministic/no-I/O boundary violations and source-skew revalidation;
9. recovery paths: inspect/retry/resolve/terminate behavior, blocked following messages, restart continuity and fail-closed unresolved ambiguity.

Where a scenario makes a durable/restart claim, use the real host/process boundary required by the frozen validation profile; an in-process mock must not be reported as real restart evidence.

## Result contract

Post one immutable G34 result bound to the frozen candidate. Minimum evidence shape:

```text
G34 VALIDATION_RESULT
candidate SHA: 3019b064faccbc5ede9ce4f8c67e23c8703996f6
candidate tree: 7709db6d064926c09de66fd13f917eb57119e0c6
hidden pack identity/checksum: <owner-held identifier>
executor/platform/runtime identities: <recorded>
clean checkout: PASS/FAIL
changed during validation: NO/YES
crash boundaries: PASS/FAIL
invalid package: PASS/FAIL
invalid messages: PASS/FAIL
incompatible package/version: PASS/FAIL
Tool failures: PASS/FAIL
ordering/dedup: PASS/FAIL
terminal dispositions: PASS/FAIL
Projection failures/revalidation: PASS/FAIL
recovery paths: PASS/FAIL
findings: P0=<n> P1=<n> P2=<n> P3=<n>
G34: PASS/FAIL/BLOCKED
```

Do not include secret/withheld fixture bodies in public evidence when doing so would destroy the hidden-test property. A stable hidden-pack identifier/checksum plus category result, exact candidate identity and sufficiently diagnostic failure evidence is enough for the public release record.

## Failure and candidate-drift rules

- If a hidden scenario executes and fails due to a product/runtime defect, G34 is `FAIL`; create a focused defect concern. Do not patch the frozen candidate in place.
- If the executor cannot provide a required real platform/capability, G34 remains `BLOCKED`; do not infer PASS from another host.
- If any product/runtime/test/dependency fix is merged after Candidate Freeze, `3019b064...` remains the old candidate and cannot silently inherit the fix. Select a new exact candidate, reconcile impacted visible gates, update the closure evidence and rerun G34 on the new SHA.
- If only T-024 closure documentation is merged, Hidden Validation still targets `3019b064...`; closure docs are evidence about the candidate, not replacement runtime content.
- `changed during validation = YES` invalidates the run as release evidence until the exact resulting state is separately committed/reconciled.

## Release handoff after G34

Only after G34 reports PASS on the exact frozen candidate may release authority perform Final Closeout / Release Qualification. At that point it must re-check:

- candidate identity is unchanged;
- G1–G33 visible evidence remains valid;
- G34 is PASS on the same candidate;
- no unresolved P0/P1 Runtime blocker exists;
- documentation/known limitations remain accurate.

T-024 does not authorize a tag, GitHub Release, package publish, merge to `main`, or a `READY` verdict by itself.
