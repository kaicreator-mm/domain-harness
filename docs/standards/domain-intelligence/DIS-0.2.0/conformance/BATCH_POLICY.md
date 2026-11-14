# DIS v0.2.0 — Batch-first Demo execution, Round-by-Round immutable evidence

**Entry:** [Demo Master #1499](https://github.com/kaicreator-mm/domain-harness/issues/1499) / [Product/L1 #1496](https://github.com/kaicreator-mm/domain-harness/issues/1496) / [Draft PR #1497](https://github.com/kaicreator-mm/domain-harness/pull/1497). Current planning baseline R30 repaired `4d3e52bc1a14a7c6d1557fd0589f8de3afe600c8`: [Woodpecker #2271/1](https://ci.kaicreator.com/repos/18/pipeline/2271/1), [#2271/2](https://ci.kaicreator.com/repos/18/pipeline/2271/2), [#2271/3](https://ci.kaicreator.com/repos/18/pipeline/2271/3) **all SUCCESS at that SHA**. This policy commit is a **new SHA**, and does not inherit those statuses.

## Default batches, not a replacement for individual qualification

Default **three bounded rounds per batch**. Each round can implement and repair its own native conformance scope, and **is committed immediately to Git**, not accumulated uncommitted to a batch-end PR. Keep one primary Writer per overlapping write set, use existing branch/PR and master Issue, and avoid web/local Ping-Pong or "validation-only" handoffs. Different disjoint scopes may be prepared in parallel, but all updates to the shared Draft branch use fresh HEAD and an exact expected-parent/ref update to preserve the Git DAG.

Every round has a per-round evidence directory `batches/<BatchID>/rounds/<BatchRoundID>/` created on actual execution with `ROUND.md` and `round.json`; versioned actual Demo/native test(s) remain in the canonical Examples path. Its receipt lives in `receipts/<actual-Rxx>-<scope>-ci.json`, and the machine matrix, Demo Index, and summary link to it. Source Git Blobs, AOT HEAD/TREE, exact tests, negative cases, typed UNKNOWN, discovered defects, repairs, and learnings are recorded independently **for every round**. A round's STATUS is one of `PLANNED / IN_PROGRESS / CI_PENDING / VERIFIED / BLOCKED`, and CI error is never assumed success. Create round artifacts only when that round actually executes; an initial plan is not evidence.

A future round may proceed while the previous independent CI is pending **only when no unverified predecessor is a normative dependency**; it must not inherit its PASS or mark the batch closed. On a failure, the same Writer repairs the original write set and rebinds the final exact SHA. No round loses its prior error/repair history. A source-certain but semantically unqualified claim stays UNKNOWN; no SAP/ECP authority can be minted from scripts, source receipts, or LLM labels.

**Batch conclusion:** after all its rounds have independent evidence and applicable CI SUCCESS, persist a batch-wide `BATCH_SUMMARY.md` and final manifest readback, summarize Core/Optional/Governance progress, newly exposed blockers, experiences reusable by ADS, and the next batch. If something remains blocked, report partial/blocked; do **not** pretend it was verified just because other rounds passed. The batch summary must not replace the round-specific documents.

## First batch: [B01 — C2 Function ABI + Domain-owned state](batches/B01/README.md)

**B01-01:** Source-pinned multi-category Function I/O Schema, typed results, Evidence and compatible consumer obligations (CORE-003).

**B01-02:** Knowledge/Rule/Stateful ownership and lifecycle across actual selected SDK and KDP; prevent data-only observation from minting execution or lease authority (CORE-006, CORE-003).

**B01-03:** Adversarial compatibility and cross-Function integration on the final C2 candidate; qualify C2 only if all applicable MUSTs and independent source requirements are actually discharged (CORE-003/006).

Numbers `B01-01..03` are stable **batch-local identifiers**. Global `Rxx` identifiers are allocated on each execution from the latest PR state to avoid conflicts with existing concurrent writers. The first batch is planned, **not already run**.

Future batches reuse the C1–C5/O1–O3 dependency groups in [closure-plan-r28.json](closure-plan-r28.json): C1 needs source-owner and SAP reviewer qualification; C3 needs Product/L1 Target/Interaction applicability; C4 matrix and C5 independent governance are late. No automatic merge, freeze or release, no GitHub Actions, no special Node major version as a DIS semantic gate.

**Execution mode:** A user request to "推进一批" authorizes executing as many applicable planned rounds as can be completed in the current active session, with separate exact-SHA receipts. It does not create background work, or promise progress after the session ends. 
