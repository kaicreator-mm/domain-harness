# DomainHarness v0.10.2 · v0.10.2 release status

[Index](index.md) · [中文版](../zh-CN/release.md)

## Release complete, but qualification is conditional

| Item | Verified state |
| --- | --- |
| Git Tag | [v0.10.2](https://github.com/kaicreator-mm/domain-harness/tree/v0.10.2) → `cee14399d9d0af4e20e34b9111861b16a465b690` |
| Frozen Git Tree | `9618e88b32f16a63164f65b8fbdf4457c96f5e76` |
| Original `main` integration | [PR #1387](https://github.com/kaicreator-mm/domain-harness/pull/1387); newer docs have subsequently landed on main |
| Product/L2/Task DAG | 8/8 P0 plus 2/2 required P1 domains qualified; original DAG 20/20 |
| Hidden Validation | 7/7 PASS at exact source |
| Independent R3 / RQ | R3 PASS; **RQ CONDITIONAL** |
| Real Full Regression | **`npm test EXIT1`**: 3,979/3,986 workspace PASS, 7 OS/runner resource failures |
| `test:root` | **NOT_RUN** in that Full execution |
| Accepted exception | `EX-v0.10.2-R01-FULL-OS-01`, Owner-authorized / third independently reviewed, exact SHA only |
| Retained P2 | 8 release limitations (distinct from docs PR findings) |

**Never relabel a conditional release as Full PASS.** Historical root evidence and scoped changed-risk proofs were admitted under an explicit one-source authority exception, not a successful current Full command. That exception **does not** carry to v0.10.3 automatically.

Public workspace manifests still say `0.10.2-rc.0`; no npm registry publication is established. Node24 is the physically qualified lane; no OS brand or RAM size is required by the SDK. Current main may contain **post-tag documentation** without moving the released product Tag.

Authority: [R01 release closure](https://github.com/kaicreator-mm/domain-harness/issues/1331) · [original detailed release status](../../release/V0102_RELEASE_STATUS.md).

---

**Authority:** tagged source `cee14399d9d0af4e20e34b9111861b16a465b690`; v0.10.2 was qualified **CONDITIONALLY**. Post-release docs do not alter that SHA or authority.
