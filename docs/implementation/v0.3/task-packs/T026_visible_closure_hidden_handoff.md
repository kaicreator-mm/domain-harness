# T-026 — Visible closure + Hidden Validation handoff (release qualification)

Task: T-026 (DAG row: "v0.3 visible closure + Hidden Validation handoff", depends on T-024 + T-025; GitHub Execution Issue #244).
Branch: `v0.3_t026`. Base: `a7035746cc8fb0c7ae83da1da4b832ba0f1595bd` (v0.3 after T-025 merge, PR #294).

This task is version closure, not a feature task. It reopens no frozen semantics and adds no product code.

## 1. Candidate freeze semantics (decided up front)

Following the v0.2 closure precedent (docs/validation/v0.2/closure/*):

```text
CANDIDATE_FROZEN_SHA=a7035746cc8fb0c7ae83da1da4b832ba0f1595bd
```

- All visible release gates are executed on a **detached clean worktree** of this exact SHA (`.t026-evidence/candidate`, `npm ci` from lockfile, no reuse of the developer checkout's node_modules).
- The T-026 closure documents merge **after** the freeze via this branch's PR. Per the v0.2 precedent and the Validation Standard, the later documentation merge does not substitute for the candidate; the merge commit is recorded in the issue record with a docs-only diff proof (`git diff a703574..<merge> --stat` restricted to `docs/**`).
- Hidden Validation (owner-held) executes against the frozen candidate SHA only.

## 2. Deliverables (write set)

- `docs/implementation/v0.3/task-packs/T026_visible_closure_hidden_handoff.md` — this pack.
- `docs/validation/v0.3/closure/T026_AC_GATE_MATRIX.md` — the one exact-SHA gate matrix: PRD §21 AC1–AC28 + PRD A1 §17 AC1–AC18 + L2 A1 V1–V12 + retained Frozen L2 durability/cache/effect/recovery gates + host evidence + regression/packaging/CI + P0/P1 register + waivers, each with PASS/BLOCKED/NOT_APPLICABLE and evidence identity.
- `docs/validation/v0.3/closure/T026_EVIDENCE_INVENTORY.md` — candidate identity, per-task T-001…T-025 evidence inventory (issue/PR/merge/validation-HEAD/review/CI per task), administrative reconciliation (open issues vs merged PRs), deferred/P2/P3 carryover register.
- `docs/validation/v0.3/closure/T026_HIDDEN_VALIDATION_HANDOFF.md` — owner-handoff pack: candidate identity preflight, required hidden scenario classes (V1–V12 + retained L2 durability/cache/effect gates + crash boundaries), result contract. T-026 does not execute, reveal, or self-declare the hidden suite.

Nothing else. No `packages/**` changes; no issue closures of other tasks are required by this pack (open-issues-vs-merged-PRs is reconciled **in the inventory document**, and the six open issues (#219/#220/#228/#230/#231/#234) are closed administratively with backfilled records bound to their merged-PR evidence — comment-only, no code).

## 3. Gate inventory (visible, all bound to the frozen candidate)

| Gate | Evidence identity |
|---|---|
| Clean-room dependency install | `npm ci` at candidate SHA (exit 0) |
| Build | `npm run build` (all workspaces) at candidate SHA |
| Lint | `npm run lint` at candidate SHA |
| Typecheck | `npm run typecheck` at candidate SHA |
| Full regression | `npm test` (all workspaces) at candidate SHA — test count recorded |
| Packaging | `npm pack` for all four workspace packages at candidate SHA — file counts recorded |
| Installability | root-portability clean-consumer test (pack → install → import) inside the full regression |
| CI | Woodpecker pipeline on the T-026 PR HEAD (docs-only delta over candidate); plus the recorded CI state on candidate SHA itself (PR #294 pipeline 522 PASS) |
| Host evidence | T-022 Node (PR #289, merge efc9917) + T-023 Expo device (PR #290, merge 2d3ba3b, validation HEAD 2cfb65b) + T-024 cross-host (PR #292, merge 8c530b8, validation HEAD a642d6b) — cited, not re-executed |
| Hidden Validation / Critical Journeys | owner-held → handoff doc; status NOT_RUN(owner handoff), never self-PASS |

Status vocabulary per the pinned Validation Standard: PASS / FAIL / BLOCKED / NOT_RUN / NOT_APPLICABLE. WAIVED only with explicit justification and traceable authority.

## 4. Reconciliation rules

1. PRD AC items map to task evidence by issue/PR/SHA; an AC with no executed evidence is FAIL or BLOCKED, never assumed.
2. V1–V12 reuse the executed T-024 §3.4 matrix (which already binds core + host evidence per vector).
3. Every P0/P1 found in any task review must show a resolution commit or an explicit accepted deferral; unresolved P0/P1 blocks release qualification.
4. Administrative gaps (open issue despite merged PR) are disclosed and repaired by backfilled close records; they do not by themselves block if the underlying merge/CI/review evidence verifies.
5. Known limitations (T-024 P3 register, review P3 carryovers) are listed, not hidden.

## 5. Release decision authority

T-026's visible closure ends with a documented decision state per the pinned Release Standard (PASS/READY, CONDITIONAL, BLOCKED, FAIL). Because Hidden Validation is owner-held and executes only against the frozen candidate after handoff, the visible-closure output is expected to be **CONDITIONAL/BLOCKED-pending-hidden-validation** unless the owner executes the hidden pack within this task. T-026 must not declare Release Ready by itself, and `v0.3`→`main` merge/tag waits for the qualification outcome recorded on issue #244.

## 6. Failure handling / blocker protocol

- Any gate that cannot be executed (service down, owner-held) is BLOCKED with the reason and evidence identity; unavailability is never PASS.
- Any FAIL produces a reproducible blocker entry; closure continues collecting the remaining gates so the matrix is complete.
- Discrepancies found during evidence reconciliation (e.g., missing review records) are listed in the inventory's Discrepancies section with the compensating evidence or the residual risk.

## 7. Reference / ownership boundary

- Owns: this pack; `docs/validation/v0.3/closure/**`; administrative backfill closes of the six open task issues (comment-only).
- Does not own: frozen semantics, product code, host adapters, the owner-held hidden suite, the `v0.3`→`main` merge decision (that is the release qualification outcome, not this PR).

## 8. Validation gates for this task's own PR

Standard minimal set: build / lint / typecheck / full tests on the branch HEAD (docs-only delta expected: product code identical to the frozen candidate) + Woodpecker CI + fresh independent review bound to the PR HEAD.
