# B05-01 / R44 — actual runtime Target OS + architecture preflight

**CI_PENDING** on independently committed initial R44. Baseline B04 `9d44c1b32a96774a10cd6e7a3e3e9174368b39a5` remains CI_PENDING; its earlier incomplete receipts are NOT inherited as PASS.

R44 adds an actual Node `process.platform`/`process.arch` check for already-declared `program.target`, using `win32→windows` normalization. The independent installer `expectedTarget` and AOT-declared same OS label are **not sufficient** if the executing Node host is different: `DIS_TARGET_HOST_MISMATCH` fails before KDP boot. A real matching selected original Tally/xDownload/KDP module can load; real Tally output is `OBSERVATION/NONE`, not domain semantic or business permission. Legacy untargeted artifacts remain compatible and cannot inherit an external Target assumption.

This proves *runtime process OS/CPU identity*, not physically attested hardware, per-OS-specific Business source bytes, Windows/Android deployments, owner-approved Product/L1 Target applicability, or an approved SAP. No Node major-version restriction, no new Host side effect. [Machine round](round.json) and separate receipt will be exact CI-bound.


### Final round-specific source requalification

**VERIFIED (bounded native scope)**. Original independently committed test Git Blob remained unchanged at Git HEAD `1a00ecad9dcb795eb6df55cd2f53bd6208e7b9de`, TREE `4c3e3ecbac8cf1489fc807a60ce22806672f414f`. Woodpecker [#2293/1](https://ci.kaicreator.com/repos/18/pipeline/2293/1), [#2293/2](https://ci.kaicreator.com/repos/18/pipeline/2293/2), [#2293/3](https://ci.kaicreator.com/repos/18/pipeline/2293/3) all **SUCCESS**. Machine [round.json](round.json) and [independent exact-source receipt](../../../../receipts/r44-b05-host-target-ci.json) record this later qualification and original cancellation history. This does not promote unfulfilled Core MUSTs or C5 independent governance.
