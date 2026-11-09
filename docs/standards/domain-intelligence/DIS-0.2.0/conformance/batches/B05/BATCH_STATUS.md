# B05 native Host and selected original Source closure — CI_PENDING

**Version:** DIS v0.2.0 / Draft PR #1497 / master Issue #1499. Baseline B04 archive `9d44c1b32a96774a10cd6e7a3e3e9174368b39a5` had [#2289/1](https://ci.kaicreator.com/repos/18/pipeline/2289/1) integration SUCCESS, [#2289/2](https://ci.kaicreator.com/repos/18/pipeline/2289/2) minimum-node SUCCESS, but [#2289/3](https://ci.kaicreator.com/repos/18/pipeline/2289/3) ERROR; B04 3/3 not yet source-qualified. B05 is an independent next batch, **not an inherited B04 PASS**.

| Round | Original source commit | Original immutable test blob | Actual content / CI observation |
| --- | --- | --- | --- |
| [R44](rounds/B05-01/ROUND.md) | `36bcdca50d1b79b82bc0944d4691979631010707` | `650ac196f2df5fe9ba24f05f86edded9c41819e5` | Real Node OS/arch and independent installer `Target` mismatch before KDP boot; #2290/1 native SUCCESS, #2290/2 ERROR |
| [R45](rounds/B05-02/ROUND.md) | `6db5024fadb1b524e8eed39d604605404044e157` | `e66c8839dbab6551f2c0a33f2db867c9a7e1cc75` | **opt-in** `requireAllSourcesPinned:true` exact original Tally/Runx/xDownload consumed Source closure; absent or stale pin fails closed; #2291/1 native SUCCESS, #2291/2 ERROR |
| [R46](rounds/B05-03/ROUND.md) | `42fc7bde28bdbc653113651f2f87aa1021df614c` | `6aba7dd4a1bfd7597b6143ab3ef048c8150aa053` | Original Business Rule/Knowledge/Stateful and KDP admission consume under full installed Target/Source; [#2292/1](https://ci.kaicreator.com/repos/18/pipeline/2292/1) native SUCCESS, #2292/2/#2292/3 PENDING at recorded readback |

## Actual Contracts / SDK delta

R44 modifies the native Microkernel to compare the sealed Target and independent installer `expectedTarget` with **the actual Node process `process.platform`/`process.arch`** (including `win32→windows`) before KDP boot. This prevents a producer + installer agreeing on a false OS/CPU label while executing in a different runtime. The return value `actualHostTarget` exposes only this process-derived identity, not a hardware attestation. Legacy untargeted DIS v0.2 AOT remains backward compatible.

R45 adds the opt-in independent installer `requireAllSourcesPinned:true`: **every consumed original selected LOCAL Function source** must have an external installer-supplied exact SHA256 + Git repository/commit/path/blob pin. Earlier optional partial `expectedSourcePins` remains supported without the new strict option. Missing one consumed source, unknown extra, malformed policy or stale source is rejected prior to real KDP boot.

R46 composes those two checks with the **actual original** Tally Rule, xDownload Knowledge and Runx Stateful Handle; original `orders.approve` KDP route can grant real KDP admission, but `execution:NOT_PROVEN` and `businessAttested:false` prevent invented Effect success. LOCAL Function returns remain `authority:NONE` and `attested:false`, even on claimed positive business inputs.

## Normative/acceptance boundary

**These tests are not evidence of multiple native OS implementations.** `process.platform` checks actual Node execution environment but does not show distinct source/module implementations for Windows/Linux/Android, cryptographic hardware attestation, or Product/L1-approved scope. An exact Source Git Blob proves provenance **not independent semantic acceptance** or original Tally SourceLocator/SAP repair. Source owner and Tally SEK-09 independent qualification are still negative/unresolved; C1 and C3 remain blocked, and C4/C5 cannot be automatically accepted.

All three rounds independently committed `round.json` and `ROUND.md`, and have separate `PENDING` receipts `receipts/r44-b05-host-target-ci.json`, `receipts/r45-b05-source-closure-ci.json`, `receipts/r46-b05-target-original-consumer-ci.json`. None is linked in `matrix.receipts` until actual exact SHA Integration + general Verify success, with historical CI ERROR preserved. No new GitHub Issue/DAG or unrelated Node major gate.

**Total DIS v0.2:** Core **9 VERIFIED / 7 PARTIAL = 56.25%**, Optional 4 NOT_RUN, Governance 1 NOT_RUN. B01–B03: 9/9 scoped rounds accepted; B04 3/3 source-committed but not fully qualified; B05 3/3 source-committed with native success but not fully qualified. No merge/Freeze/Release.


## Final cumulative exact-SHA qualification — supersedes earlier pending snapshot

**VERIFIED for all three source-scoped rounds.** Git HEAD `1a00ecad9dcb795eb6df55cd2f53bd6208e7b9de`, TREE `4c3e3ecbac8cf1489fc807a60ce22806672f414f`, [Woodpecker #2293/1](https://ci.kaicreator.com/repos/18/pipeline/2293/1) native SUCCESS, [#2293/2](https://ci.kaicreator.com/repos/18/pipeline/2293/2) minimum-node SUCCESS, [#2293/3](https://ci.kaicreator.com/repos/18/pipeline/2293/3) Verify SUCCESS. All six original R41–R46 test Git Blobs were re-read and matched the successful cumulative source exactly. Earlier `ERROR` statuses had GitHub descriptions `Pipeline was canceled`, not demonstrated test failures, and remain historical. Separate `round.json`, `manifest.json` and independent `receipts/` now bind qualifying SHA; no full Core promotion, SAP authority, platform multi-variant or Release.
