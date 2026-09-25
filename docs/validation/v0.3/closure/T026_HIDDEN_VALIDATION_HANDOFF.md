# DomainHarness v0.3 T-026 — Hidden Validation Handoff

## Authority boundary

Hidden Validation is owner-held. T-026 prepares this handoff but does not execute, reveal, weaken, or self-declare the hidden suite PASS. Per Frozen L2 Amendment A1 §20 item 9, the hidden scenarios must cover the amendment vectors V1–V12 **and** all retained Frozen L2 durability/cache/effect gates.

```text
CANDIDATE_FROZEN_SHA=a7035746cc8fb0c7ae83da1da4b832ba0f1595bd
CANDIDATE_TREE_SHA=c181177b3eaf539a0f389d868b28be0d6ad12aa7
STANDARD_REVISION=0446f04583f6cf464c835f26e2f657c8b703cb4e
HIDDEN_VALIDATION_STATUS=BLOCKED(owner-held Hidden Validation not yet executed)
```

**Validate the exact candidate SHA above.** Do not validate the moving `v0.3` branch and do not substitute the T-026 closure-document commits or the T-026 PR HEAD for this candidate. The closure documents exist at later commits; the product candidate does not move.

## Candidate identity preflight

The Hidden Validation executor should establish an isolated clean checkout and prove identity before any scenario runs:

```bash
git fetch origin --prune
git checkout --detach a7035746cc8fb0c7ae83da1da4b832ba0f1595bd
test "$(git rev-parse HEAD)" = "a7035746cc8fb0c7ae83da1da4b832ba0f1595bd"
test "$(git rev-parse HEAD^{tree})" = "c181177b3eaf539a0f389d868b28be0d6ad12aa7"
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
npm pack -w @kaicreator/domain-harness -w @kaicreator/domain-harness-node -w @kaicreator/domain-harness-expo -w domain-harness-compiler
```

These visible commands are sanity checks only; passing them does not constitute Hidden Validation PASS. (Reference visible result at freeze time: 766/766 tests, packs 466/31/35/29 files — see `T026_EVIDENCE_INVENTORY.md` §3.)

## Required hidden scenario classes

The concrete fixtures/inputs/assertions remain owner-held. The hidden pack must cover the following without relying only on the visible test fixtures:

### A. Amendment A1 contract vectors (Frozen L2 A1 §19)

1. **V1** — governance pin survives active-baseline movement: crash/recover a pinned instance after baseline activation moves; expect original package+baseline, no current/latest lookup for execution authority.
2. **V2** — missing pinned baseline fails closed: exact baseline body unavailable → recovery_required; no substitution.
3. **V3** — governance self-approval rejected: a Candidate proposing weaker promotion rules cannot pass the ordinary validation/promotion path.
4. **V4** — pre-change evaluation: incumbent baseline is the evaluation authority for a proposed baseline; the proposal cannot approve itself.
5. **V5** — guard purity: guards/Hard Invariants attempting ModelPort/Tool/external I/O are rejected as architecture-contract violations.
6. **V6** — reasoning remains explicit: Harness output must flow structured DomainDecision → schema → Hard Invariants → guard → transition; direct state setting impossible.
7. **V7** — candidate invalid after governance change unless revalidated or exactly proven compatible.
8. **V8** — Runtime Evidence cannot replay work: evidence claiming success without a committed journal fact must not suppress retry or prove mutation.
9. **V9** — tenant evidence isolation: cross-tenant evidence consumption rejected absent an explicit privacy/governance contract.
10. **V10** — shadow L4 cannot mutate: shadow path yields evidence output only, no authoritative transition/effect.
11. **V11** — exact stable fallback: floating (`latest`/`active`/`current`) fallback identities rejected; exact packageId + governance digest + artifact contentDigest accepted.
12. **V12** — existing durability unchanged: committed AI/query/effect journal facts survive a crash before a newer control snapshot; exact package + governance + dynamic-child pins recover; committed work not repeated.

### B. Retained Frozen L2 durability / cache / effect gates

13. Durable acceptance/journal commitment crash boundaries on the real host profile (not in-process simulation): kill/force-stop between control snapshot and commit, between commit and snapshot, and during effect handoff.
14. Exact semantic cache correctness under adversarial inputs: identity poisoning attempts, eligibility violations, quarantine/invalidation, unrelated-context non-invalidation, cache≠journal storage separation.
15. Durable effect authority and idempotency: no duplicate committed effect under replay/retry; ambiguous non-idempotent outcomes never blind-retried.
16. Pin durability ordering: `GovernanceExecutionPin`/`DynamicChildExecutionPin` durable before any journaled child work; non-torn publication/read under concurrency.
17. Recovery paths: inspect/retry/resolve/terminate behavior, blocked following messages, restart continuity, fail-closed on unresolved ambiguity; retained pinned instances remain loadable (retention).
18. Migration fail-closed behavior: pre-A1 / v0.2 persisted stores rejected deterministically (no silent semantic import), drift-guard integrity.
19. Promotion/activation authority negatives: promotion without human/operator authority, activation without explicit authorized activation, alias targeting revoked artifacts, exact-pinned recovery of revoked artifacts only via the explicit recovery seam.

Where a scenario makes a durable/restart claim, use the real host/process boundary required by the frozen validation profile (Node Build Host per DAG §7.1; Expo Android/Hermes per DAG §7.2 where the scenario is host-classified); an in-process mock must not be reported as real restart evidence.

## Result contract

Post one immutable Hidden Validation result bound to the frozen candidate. Minimum evidence shape:

```text
HIDDEN VALIDATION_RESULT
candidate SHA: a7035746cc8fb0c7ae83da1da4b832ba0f1595bd
candidate tree: c181177b3eaf539a0f389d868b28be0d6ad12aa7
hidden pack identity/checksum: <owner-held identifier>
executor/platform/runtime identities: <recorded>
clean checkout: PASS/FAIL
changed during validation: NO/YES
V1..V12: PASS/FAIL (per vector)
durability crash boundaries: PASS/FAIL
cache correctness: PASS/FAIL
effect authority/idempotency: PASS/FAIL
pin durability ordering: PASS/FAIL
recovery paths: PASS/FAIL
migration fail-closed: PASS/FAIL
promotion/activation authority negatives: PASS/FAIL
findings: P0=<n> P1=<n> P2=<n> P3=<n>
verdict: PASS | FAIL | BLOCKED
```

## Release authorization rule

- Hidden Validation PASS with P0=0/P1=0 on the exact candidate authorizes the owner to proceed with the release action order (merge `v0.3` → `main`, baseline; tag optional — commit SHA is canonical).
- Any FAIL, any P0/P1, or validation of any SHA other than the frozen candidate: release remains BLOCKED; reconciliation restarts from the discrepancy.
- This handoff does not itself authorize anything. `T026_AC_GATE_MATRIX.md` §9 records the visible release decision (CONDITIONAL) that this owner-held result completes.
