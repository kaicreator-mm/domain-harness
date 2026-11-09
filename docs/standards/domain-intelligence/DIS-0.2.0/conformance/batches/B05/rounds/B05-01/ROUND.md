# B05-01 / R44 — actual runtime Target OS + architecture preflight

**CI_PENDING** on independently committed initial R44. Baseline B04 `9d44c1b32a96774a10cd6e7a3e3e9174368b39a5` remains CI_PENDING; its earlier incomplete receipts are NOT inherited as PASS.

R44 adds an actual Node `process.platform`/`process.arch` check for already-declared `program.target`, using `win32→windows` normalization. The independent installer `expectedTarget` and AOT-declared same OS label are **not sufficient** if the executing Node host is different: `DIS_TARGET_HOST_MISMATCH` fails before KDP boot. A real matching selected original Tally/xDownload/KDP module can load; real Tally output is `OBSERVATION/NONE`, not domain semantic or business permission. Legacy untargeted artifacts remain compatible and cannot inherit an external Target assumption.

This proves *runtime process OS/CPU identity*, not physically attested hardware, per-OS-specific Business source bytes, Windows/Android deployments, owner-approved Product/L1 Target applicability, or an approved SAP. No Node major-version restriction, no new Host side effect. [Machine round](round.json) and separate receipt will be exact CI-bound.
