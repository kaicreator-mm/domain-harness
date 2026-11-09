# B06 — real loopback HTTP Form/Chat original selected Interaction consumer

**State: CI_PENDING** (all three Git rounds prepared, per-round CI intentionally skipped to prevent Woodpecker superseding cancellation). Three distinct immutable source/test commits: R47 `b3b2fd993b74897f80142f8ca7afb3ee2855bdca`, R48 `6b2a1d4e30c8b334074609a0f60ee7bc613cbcda`, R49 `4e0529eaf5299fb85c87fe2142e3ca3de1976510`. Final single CI gate will bind later exact branch SHA, with each original test Blob separately receipted.

| Round | Actual consumer/proof | Tested | Status |
| --- | --- | --- | --- |
| [R47](rounds/B06-01/ROUND.md) | Actual 127.0.0.1 HTTP Form URL-encoded POST and Chat JSON POST via native selected xDownload Interaction | 2 new cases | CI_PENDING |
| [R48](rounds/B06-02/ROUND.md) | Real network rejects forged Effect route, GET, MIME, credentials, duplicate Form keys, malformed JSON, overflow and token URLs | 3 new cases | CI_PENDING |
| [R49](rounds/B06-03/ROUND.md) | Six concurrent session isolation; no confirmation stays pending; SDK STOP rejects ingress with HTTP 503 | 3 new cases | CI_PENDING |

**Technical outcome boundary:** The transport is a real server+client over ephemeral **loopback-only** socket, with typed `OBSERVATION/NONE`, `PENDING_AUTHORIZATION`, never a KDP Effect permit. It does not certify actual public production Chat/Form UI, network authentication/security, real download Host, physical multi-OS deployments or independent source/SAP qualification. Product/L1 still decides applicability and CORE-014 stays PARTIAL. This is a source-scoped native proof, not full DIS v0.2.0 qualification.

**Workflow change learned:** Historical B04/B05 canceled CI was caused by pushing multiple intermediate round commits, not necessarily a failing test. This batch links three original Git commits first and updates the PR branch only once, allowing a single final exact-SHA Woodpecker gate. Prior B01–B05 **15/15 bounded rounds qualified**, Core **9/16 VERIFIED / 7 PARTIAL**, Optional 4 NOT_RUN, Governance 1 NOT_RUN. No new Owner handoff, Freeze, merge or Release.
