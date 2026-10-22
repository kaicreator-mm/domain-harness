# DomainHarness v0.10.1 — 7 Task executable DAG admission candidate

**Parent:** #1274. **Source of truth:** GitHub. **Current version:** `v0.10.1@913c1a0e38932c1a2757b39634096ebfb6506218`, L2 Freeze PR #1288 integrated. **Product** PRD blob `52b7169f62f040f9c869b288a7e78639473642db`; **L2** architecture blob `3eb3cd4f7fbe7c926f55b0a3971b0536c9a6c629`, witness blob `afce55b5e3ea911652d9fabdabc0a05ff081aabe`; ADS pin `4.13.1@f35fcdb153ff171aaa0027b6e1b9c7592f28d3cd`.

**Status:** `TASK_DAG_CANDIDATE / INDEPENDENT_DAG_REVIEW_NOT_RUN / IMPLEMENTATION_CLAIMS_NOT_ADMITTED / RQ_NOT_RUN`.

## Nodes and dependencies

| Node | Native GitHub Issue | Prerequisites | Narrow owner, one concern/PR | Stage |
| --- | --- | --- | --- | --- |
| C01 | #1275 / Draft PR #1280 | Frozen L2 | Agent Diagnostics S Feature, own independent package | Draft preadmission source |
| C02 | #1276 / Draft PR #1281 | Frozen L2 | Candidate Evaluation S Feature | Draft preadmission source |
| C03 | #1277 / Draft PR #1282 | Frozen L2 | Experience Reuse S Feature | Draft preadmission source |
| C04 | #1278 / Draft PR #1283 | Frozen L2 | Bounded Experiment S Feature | Draft preadmission source |
| T05 | #1289 | C01,C02,C03,C04 package source APIs available and independently qualified at integration merge gate | **Single owner** four-feature allowlisted CT02 Host adapter, CI test enrollment, all 16 closure subsets, full clean-installed Rich integration | Not started |
| T06 | #1290 | T05 and C01–04 accepted in version candidate | One Node24 clean BUILD/npm pack/SQLite/Tiny/Rich validation sweep, target-effect regressions | Not started |
| R01 | #1291 | T06, all exact code reviews and candidate pin | Independent release qualification/Hidden/critical journeys/tag decision | Not started |

**Edges, exactly six:** C01→T05, C02→T05, C03→T05, C04→T05, T05→T06, T06→R01. DAG node count 7, no cycles.

**Non-DAG scope:** #1279 C05 = `NO_NEW_PACKAGE`, reuse existing Decision/Workflow; #1267 S Primary→K stateful Admission repair separately owned, #1270 atomic genesis separately owned, #1273 post-v0.10 Tally contract separately owned. These are tracked external risks/conditions, **not silently merged into new Feature work**. #1286 L2 source Review is already PASS and frozen, not an implementation Task.

## Write-set separation

- C01–C04 each own only one feature producer `extensions/agent-improvement/packages/<name>/` and its own unit tests / original example migration; **no root package.json/package-lock** and no changes to T05 Host adapter.
- T05 uniquely owns `extensions/agent-improvement/host/**`, `tests/hosts/node/v0101-feature-suite.test.ts`, `tests/conformance/v0101-sdk-features.test.ts`, assembled Rich App fixture; no rewrites to C01–C04 Feature implementations.
- T06 uniquely owns integration test driver/report `tests/integration/v0101-agent-improvement/**` and validation ledger. Bugs return to the responsible source concern, one correction per PR.
- R01 uniquely owns release ledger and qualification decision, no hidden feature implementation.
- No external write to `main` or `v0.10`. Version branch receives only reviewed one-concern PRs.

## Gates, required negative evidence

- Premerge for each C0n: exact sealed namespace, mandatory init and named callable export, bounded data semantics and no authority, root-independent packaging, Node24 direct tests + evidence; independent exact-SHA source Reviewer and accepted claim.
- T05: exact four-key Host adapter only, request/deps both validated, T02 callable dependencies unchanged, getters/effectors/illegal authority keys rejected, bad Key refused. BUILD 16 subsets incl none; real clean pack and runtime read/evaluation.
- T06: real Node24, npm pack + clean install, file-backed SQLite, v0.10 Tiny/Rich unchanged, K State/CAS/Journal/Effect/UNKNOWN/replay; no release PASS from PR CI.
- R01: exact candidate HEAD, independent reviews, no open blocking P0/P1, bounded CI waivers, Hidden Validation/critical journeys, release decision.
- No unbounded repeated full regression per small source change: source diff targeted validation each PR, one version-level full sweep, reusable immutable physical evidence if exact source/Host unchanged.
- If Node24/physical install is not reachable from Web, hand off **one consolidated local Agent trigger for T06**, not 4 duplicate full test jobs.

## Acceptance and DAG review
Independent Reviewer must validate frozen L2 correspondence, 7 nodes / six directed edges / no cycles, owner write-set disjointness, test evidence responsibilities, review/CI staging, real environment/Host dependencies, no project scope bleed. Report `P0/P1/P2`, `DAG_FREEZE_READY`, `PASS/BLOCK` at exact source SHA, write back GitHub. Until that verdict the DAG is proposed, not formally admitted.

---

This file is a Task DAG source candidate. Its acceptance is separate from the closed-source Product and L2 freezes. Do not treat these dependencies as execution claims until an exact-SHA independent DAG review and controller admission.
