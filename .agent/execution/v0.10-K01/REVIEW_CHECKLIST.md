# K01 review checklist — independent exact-HEAD reviewer pass (review:required, risk:critical)

Reviewer requirements: fresh independent context (not the builder session); verify at the
PR HEAD SHA; cite file:line for every verdict; `REVIEW_DECISION` = APPROVE only when every
applicable item holds; any REJECT item is a changes-requested with evidence.

## Root-cause fidelity
- [ ] The PR's diagnosis matches #1108/#6253939912: same-stateRevision fence takeover by a
      later-snapshot rival + dispatch-before-held-check ordering; pre-fix two-process
      reproduction evidence exists and shows the duplicate/orphaned dispatch.
- [ ] The pre-fix reproduction ran on the UNMODIFIED base (behavior changed only after).

## Correctness of the repair
- [ ] Same-revision rival claim refuses typed BEFORE any journal begin or effect dispatch
      (kernel claimAdmissionFence pre-read; R02-b-rework + K01-P1 witness it).
- [ ] No unconditional fence write/remove exists anywhere in the diff (CAS-only discipline).
- [ ] Same-turn replay re-claim still allowed; journal-driven resolution (replayed /
      AMBIGUOUS / FAILED) unchanged in semantics (K01-N1/N2).
- [ ] Release happens ONLY on the zero-ambiguity all-`failed` path; `started`/`completed`,
      unreadable journal, missing port, or failed removal all keep the fence held.
- [ ] Release failure never masks the original typed error.
- [ ] Commit-side `requireHeldAdmissionFence` and stale-admission CAS refusals are
      untouched and still pinned green (R02-N1/N2/P/a unchanged and passing).

## Physical proof honesty
- [ ] All K01 physical legs use REAL stock-node child processes over ONE SQLite file via
      openSqliteCasStore (WAL/IMMEDIATE); children import the exact current kernel payload.
- [ ] The external effect ledger is a real non-idempotent append (one line = one call);
      counts asserted exactly (1 line protected; 2 lines pre-fix reproduction).
- [ ] No mock CAS, no in-process-only race sold as two-process, no PASS from NOT_RUN.

## Scope and frozen-input integrity
- [ ] Diff touches ONLY the four write-set source/test paths + this pack
      (+ lockfile-free); no Product/A01/L2/DAG edits, no v0.9 release evidence edits,
      no domain-harness-node changes, no SDK AST/hash/static-currentness additions,
      no expiry lease, no exactly-once external-effect claim.
- [ ] `.agent/` is package-excluded (no shipped artifact surface).

## Evidence and gates
- [ ] Exact base SHA == dispatch expected_base_sha (1e6d4be0...); PR targets v0.10 only.
- [ ] Targeted suites green at HEAD with recorded commands + exit codes; `task-check.sh`
      green; truthful NOT_RUN/BLOCKED for anything not executed; no full-suite claim.
- [ ] Issue #1167 updated with real results; PR NOT merged before review acceptance.
