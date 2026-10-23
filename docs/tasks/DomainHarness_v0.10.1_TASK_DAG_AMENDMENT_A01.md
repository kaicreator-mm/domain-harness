# DomainHarness v0.10.1 — Task DAG scoped amendment A01: BUILD optional Provider selection

**Status:** `AMENDMENT_CANDIDATE / INDEPENDENT_REVIEW_NOT_RUN / NOT_ADMITTED / DO_NOT_MERGE_SOURCE_YET`

## Source pins and reason

- Frozen Product: PR #1285, Product PRD blob `52b7169f62f040f9c869b288a7e78639473642db`.
- Frozen L2: PR #1288, L2 architecture blob `3eb3cd4f7fbe7c926f55b0a3971b0536c9a6c629`; L2 test witnesses `afce55b5e3ea911652d9fabdabc0a05ff081aabe`.
- Frozen DAG: [PR #1295](https://github.com/kaicreator-mm/domain-harness/pull/1295), original reviewed DAG blob `5e73c318e0870981e3f20432f8def8c9d3735a25`; 7 nodes and 6 edges.
- Exact version base `v0.10.1@dc6624c243a8e97c978271d95ee543b114c3da24`. Effective ADS `4.13.1@f35fcdb153ff171aaa0027b6e1b9c7592f28d3cd`.
- Research-inspired actual extension BUILD use exposed [#1296](https://github.com/kaicreator-mm/domain-harness/issues/1296): optional absent `standard-feature` / `kernel-extension` placeholders reserve the selected Provider key too early. Source-order confirmed; physical Node24 reproduction pending. This is a correctness repair **within existing optional BUILD semantics**, not a new capability/API or Kernel/Host authority change. C03 evidence interpretation correction [#1297](https://github.com/kaicreator-mm/domain-harness/issues/1297) is absorbed by existing C03 #1277 and does **not** create a new DAG node.

## Narrow amendment: 8 nodes, 7 edges (one new node + one edge)

```text
B00 #1296 (selected-only BUILD provider collision) ─┐
C01 #1275 ───────────────────────────────────────────┤
C02 #1276 ───────────────────────────────────────────┤
C03 #1277 (+ #1297) ─────────────────────────────────┼─> T05 #1289 ─> T06 #1290 ─> R01 #1291
C04 #1278 ───────────────────────────────────────────┘
```

**New node B00, Issue #1296 / Draft PR #1298**, may run in parallel with C01–C04; its only outgoing edge is B00→T05. T05's actual 16-subset BUILD/installed-package validation requires B00 accepted. T06 and R01 existing edges retained.

| Concern | Write set / Owner | Evidence / acceptance |
| --- | --- | --- |
| B00 #1296 | `packages/domain-harness-compiler/src/qualified-package/v10build/build.ts`, its **deterministically generated matching artifact** `packages/domain-harness-compiler/dist/qualified-package/v10build/build.js`, plus **only** `tests/hosts/node/v0101-build-skipped-optional-provider.test.ts` | Skip absent optional advisory before selected Provider collision checks, preserve selected collision refusal, existing ABI/import/digest/role checks, negative skipped-only required Feature |
| C03 #1277 + #1297 | existing C03 own `extensions/agent-improvement/packages/experience-reuse/**`; Draft PR #1282 | A caller-supplied `compatibilityRef` alone cannot make a different-SHA source a review candidate; conservative `uncertain` unless a separately governed proof API exists (not added in v0.10.1) |
| T05 #1289 | unchanged single Host adapter `extensions/agent-improvement/host/**` and root test discovery for T05 | consume B00 accepted code, run four independent packages, 16 composition subsets and focused pack/import/activation smoke; do not write compiler code |
| T06 #1290 | unchanged `tests/integration/v0101-agent-improvement/**` and `docs/validation/v0.10.1/t06/**` | exactly one full Node24/SQLite/Effect physical sweep; include B00 selected/skipped regressions, immutable exact-source receipts |
| R01 #1291 | unchanged release ledger only | compare exact T06 SHA/tree/installed artifacts; run only uncovered Hidden/critical/packaging cases; no repeated full regression |

**Dependency metadata:** Existing native `blocked_by` edges remain `NOT_MATERIALIZED` because the available GitHub connector does not expose that write. Do not claim the graph has been applied to GitHub native Issue relationships; the review-qualified versioned DAG amendment and Issue comments are the source of truth until a compatible tool can materialize/read back edges.

## Scope and freeze decision

- The frozen 7-node DAG is not silently edited. This document is an **append-only scoped amendment candidate**, to be independently reviewed for exact SHA / frozen Product-L2 compatibility / 8 nodes / 7 edges / source write-set disjointness / sequencing / risk.
- After independent `P0=0/P1=0` and `DAG_AMENDMENT_READY=YES`, the Controller may explicitly merge this document into **only** `v0.10.1`, record formal amendment admission on #1292 and #1296, then run independent exact-HEAD PR review of #1298. Original v0.10.1 DAG freeze stays immutable historical evidence.
- The committed compiler `dist/build.js` is a mechanically generated product of the **same** B00 source change, not a distinct concern. Both must be committed together: `check-committed-dist` is a real v0.10.1 CI gate. Other `dist/**` writes are forbidden unless the deterministic build produces them and the exact diff is justified. No v0.10 runtime compatibility/version promise beyond existing v0.10.1 Product, no Kernel primary change, no new Feature ABI, no schema migration.
- Do not promote source-only V8 tests or document CI waiver to true Node24 selected BUILD/Rich Pack PASS.
