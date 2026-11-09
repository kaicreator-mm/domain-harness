# B06 — real loopback HTTP Form/Chat original selected Interaction consumer

**State: CI_PENDING** (all three Git rounds prepared, per-round CI intentionally skipped to prevent Woodpecker superseding cancellation). Three distinct immutable source/test commits: R47 `b3b2fd993b74897f80142f8ca7afb3ee2855bdca`, R48 `6b2a1d4e30c8b334074609a0f60ee7bc613cbcda`, R49 `4e0529eaf5299fb85c87fe2142e3ca3de1976510`. Final single CI gate will bind later exact branch SHA, with each original test Blob separately receipted.

| Round | Actual consumer/proof | Tested | Status |
| --- | --- | --- | --- |
| [R47](rounds/B06-01/ROUND.md) | Actual 127.0.0.1 HTTP Form URL-encoded POST and Chat JSON POST via native selected xDownload Interaction | 2 new cases | CI_PENDING |
| [R48](rounds/B06-02/ROUND.md) | Real network rejects forged Effect route, GET, MIME, credentials, duplicate Form keys, malformed JSON, overflow and token URLs | 3 new cases | CI_PENDING |
| [R49](rounds/B06-03/ROUND.md) | Six concurrent session isolation; no confirmation stays pending; SDK STOP rejects ingress with HTTP 503 | 3 new cases | CI_PENDING |

**Technical outcome boundary:** The transport is a real server+client over ephemeral **loopback-only** socket, with typed `OBSERVATION/NONE`, `PENDING_AUTHORIZATION`, never a KDP Effect permit. It does not certify actual public production Chat/Form UI, network authentication/security, real download Host, physical multi-OS deployments or independent source/SAP qualification. Product/L1 still decides applicability and CORE-014 stays PARTIAL. This is a source-scoped native proof, not full DIS v0.2.0 qualification.

**Workflow change learned:** Historical B04/B05 canceled CI was caused by pushing multiple intermediate round commits, not necessarily a failing test. This batch links three original Git commits first and updates the PR branch only once, allowing a single final exact-SHA Woodpecker gate. Prior B01–B05 **15/15 bounded rounds qualified**, Core **9/16 VERIFIED / 7 PARTIAL**, Optional 4 NOT_RUN, Governance 1 NOT_RUN. No new Owner handoff, Freeze, merge or Release.


## R50 CI-repair candidate — mandatory isolated loopback tests (2026-11-09)

Original B06 batch SHA `99700d759b156e8a7be96b52238d04220129f3a4` / TREE `d8a384e8cc24a2ef75ebdc39885a330c9a8ec5c2` returned Woodpecker [#2294/1](https://ci.kaicreator.com/repos/18/pipeline/2294/1) **FAILURE**, [#2294/2](https://ci.kaicreator.com/repos/18/pipeline/2294/2) **SUCCESS**, [#2294/3](https://ci.kaicreator.com/repos/18/pipeline/2294/3) **SUCCESS**. GitHub commit-status description is only `Pipeline failed`; the exact failing command/test log was not accessible in the connected evidence tools. Do **not** classify as an actual assertion bug without logs and do not mark B06 VERIFIED on #2294.

Diagnosis candidate: R47–R49 open real loopback HTTP servers while the previous YAML passed all 19 native test files to a single parallel `node --test` command, creating possible KDP/SQLite fixture resource contention. The repair preserves all original three B06 test Git blobs and assertions, removes them from the parallel native invocation, and adds one **mandatory** separate `node --import tsx --test --test-concurrency=1` command after the existing native suite. This also makes the B06 transport failure scope more legible within Woodpecker step logs. This is an **isolation experiment**, not proof that race/resource contention caused #2294.

The next candidate remains CI_PENDING until its own exact SHA confirms native, minimum and verify CI success. If native fails again, obtain actual Woodpecker step logs via a connected human/browser/local agent rather than blindly changing other passing code. Historical #2294 failure must be retained.
