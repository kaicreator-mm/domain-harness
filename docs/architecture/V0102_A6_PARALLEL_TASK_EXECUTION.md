# v0.10.2 A6 — Parallel source-draft admission, original merge gates preserved

**DESIGN CANDIDATE — independent reviewer decision pending. No early source write authorized until A6 adopted.**

**Goal:** replace artificially serialized execution with 4–6 parallel work fronts while retaining frozen L2 product/ABI, exact owner write sets, validated shared files, and strict version-branch merge gates. User directly requested the parallel schedule adjustment. This is a **prospective additive scheduling amendment**, not a waiver to merge unready PRs.

## Diagnosed problem
Original task admission text says "Start only when every dependency Issue is closed / PR merged", which conflates source code editing (for independent new paths), joint ABI/integration acceptance, and shared-path merge. Concrete needless serialization: #1348 pure subscription projection does not require T04 Host/facade code to implement; #1325 sqlite/CAS adapter can be isolated from T04 bootstrap; #1329 documents/SDK can be drafted before T07b final export; #1330 clean-consumer fixture/forbidden import cases before final packages; #1327 can prepare a path mapping and no-op dry-run before T06b.

## Proposed two gates
- `SOURCE_DRAFT_ALLOWED_AFTER`: implementation on an isolated draft branch/PR only, strictly within A6-owned **disjoint new paths**. Allowed to run scoped tests; expected product integration may not yet compile. Source may be authored before its original dependency merges. Test receipts must identify actual exact SHA, and `NOT_RUN` is not PASS.
- `MERGE_ELIGIBLE_AFTER`: **unchanged original dependency Issues all closed, exact merged version head verified**, plus source/collisions/ABI/physical validation, independent review and CI. No draft-only artifacts counted as completed.
- Shared/frozen paths, generated dist, error Catalog and ABI barrels are **not** permitted in early branches unless already independently assigned. Late adoption of source re-pins/rebases against current version SHA, checks relevant changed-risk (not whole suite per leaf), and handles conflict via serial owner. One concern/PR maintained.

## Exact lanes (frozen DAG implementation count remains 18)
| Task | Early autonomous safe subtask | SOURCE_DRAFT_ALLOWED_AFTER | MERGE_ELIGIBLE_AFTER (original) |
| --- | --- | --- | --- |
| T05 #1323 | BUILD in current PR and A5 review | T00 DONE | A5 approved, exact source R2, CI/Node24 PASS |
| T04 #1324 | read-only activation/Host-seam design; **no compiled code** until T05 to avoid changing agreed BUILD import ABI | NOW (read-only) | T05+T01k |
| T03b #1325 | new Host sqlite adapter/driver mechanics, physical SQLite negative fixtures ONLY: **new** files `packages/host-node/src/sqlite-adapter.ts` and `packages/host-node/tests/sqlite-adapter.test.ts`. No new entrypoint/index, legacy H, deployment, activation/Microkernel, catalog, package json, dist or third-party dep writes in early draft. STOP if actual adapter needs another file. | T03a #1347 CLOSED (already) | T03a+T04, real DB/UNKNOWN/CT02 |
| T06a #1348 | frozen pure event projection & redaction plus STOP predicates in exactly `packages/microkernel/src/subscription-projection.ts` and `packages/microkernel/tests/subscription-projection.test.ts` only. No microkernel runtime/import, public index, Catalog, Host or dist changes in draft. | Contracts T00 CLOSED (already) | T04 and independent scoped tests |
| T08b #1329 | draft new `docs/sdk/V0102_DRAFT.md`, `docs/guides/V0102_DRAFT.md`, `docs/migration/V0101_TO_V0102_DRAFT.md` marked `DRAFT/NOT_QUALIFIED`; may not edit root README, final docs, legacy README or examples README early. No unverified pack/export claims | Product/L2 freeze + T08a CLOSED (already) | T07b; verify content against final published exports |
| T09 #1330 | new tests/fixture only under `examples/v0102-external-producer/draft/**` or `tests/integration/v010-clean-consumers/draft/**` (avoid shared existing `clean-consumers.test.ts`/build scripts); provisional Tiny/Rich scenarios/forbidden-import negatives NOT installed acceptance. No production sources or shipped manifest edits | T01 CLOSED (already), T00 CLOSED | T07b+T08b; real Node24 clean pack/install |
| T11 #1327 | read-only import/path inventory and dry-run mapping. Record mapping in #1327 issue comment only; do not create a file outside the frozen T11 write set, or delete/rewrite legacy C, tests/** or examples/** early | T08a CLOSED (already) | T06b+T08a; actual production cutover |
| T07b #1328 | read-only final packlist/CI status/manifest delta planning, evidenced in #1328 issue comment only, no new source/file writes | T08a CLOSED | T11 |
| R01 #1331 | read-only matrix and identification of existing validation evidence, no release approval | NOW | T09 and all release gates |

**Disjointness check:** early T03b Host paths vs T06a Microkernel paths vs T08b docs vs T09 new subdirectories; T11/T07b use issue comments only. No overlapping shared Catalog or manifest. If a path already exists or belongs to another task, STOP and amend exact write set before edits. **No premature T11 deletion/T07b manifest changes.**

## Source draft lifecycle
1. Exact version branch SHA as base, owner signs no shared-file changes; create draft PR labeled `PREPARATION_ONLY`.
2. Review safe early scope/static tests without claiming selected ABI or release. Node24 local only if truly needed; CI failures due to missing dependent implementation may be `EXPECTED_DEPENDENCY_NOT_MET` only with exact reproducible failing step, **never falsely PASS**.
3. After predecessors merged, rebase/update draft against exact version head; verify source & associated generated dist under legitimate owner; run narrow affected tests/real SQLite/prod pack where necessary; independent exact-head review. Merge only into v0.10.2, never main until R01.

## Independence
A5 R6 may proceed in parallel and retains its own BLOCK/PASS source authority adjudication; A6 cannot waive A5 or T05 review. Frozen design blob unchanged. A6 alone never upgrades `SOURCE_DRAFT` to `MERGE_PASS`, changes no runtime ABI/roles, and adds zero implementation DAG nodes.

## Review
Independent exact-SHA L2/DAG difference review required on A6 docs PR. Return P0/P1/P2, PASS/BLOCK, `A6_PARALLEL_DRAFT_READY`, file-collision analysis, DAG acyclicity, unchanged merge gates, and exact SHA. After PASS: merge docs-only PR to **v0.10.2**, append governing two-gate addendum to the 8 affected task Issues, begin independent source drafts on different branches immediately.
