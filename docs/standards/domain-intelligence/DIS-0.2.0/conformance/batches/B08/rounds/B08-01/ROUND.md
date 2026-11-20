# DIS v0.2.0 B08-01 / R54 — real DKE producer → selected DIS Knowledge consumer

**Original candidate source** [`422e0e7c245bbb9d34916d471e243ac52a1ee3d5`](https://github.com/kaicreator-mm/domain-harness/commit/422e0e7c245bbb9d34916d471e243ac52a1ee3d5), TREE `0cdbe36c6c87f02a4067faed66d86230bf0a5a54`; native test Git Blob `f5d43f8c6080511241272124f2c8be2f7d8e2ab5`. **CI_PENDING**, not yet qualified or included in `matrix.json`.

## Actual producer, actual consumer (no fabricated Domain acceptance)

Upstream DKE #209 [original immutable source `domain-forge@880a24e8949d34901b8d8a2a04f691df4bfd08e2`](https://github.com/kaicreator-mm/domain-forge/commit/880a24e8949d34901b8d8a2a04f691df4bfd08e2): `EXECUTION_RECEIPT.json` Git Blob `62a992b9d22332aefcbbcbb02cccb55f5ab25427`, preserved bytes unchanged under `examples/dis-v020-native-sdk/fixtures`. Its actual original Tally graph source Git Blobs are old `2d4498dfa5f90bcf57cc81e9c155fb9ede31bf00` and new `0f6007315fd7352fe6fd218effcfecf672cb4961`. DKE executed 466 existing queries reused, 19 new AOT entries, including five Case→Evidence→Locator→Source chains; all unqualified, not a SAP Oracle.

DIS new local Knowledge Function `dke.provisional.query` has typed I/O, OBSERVED/UNKNOWN outcomes, version, evidence and selected AOT source dependencies on *both* original DKE receipt and this versioned reader implementation. Trusted installer independently pins exact DKE receipt and native reader origin, then real selected KDP SDK invokes the Function. New-version original chains are traceable `OBSERVATION/authority:NONE/attested:false/qualified:false`; old version and absent query return `UNKNOWN` with no fabricated answer, no physical Effect. Source tampering/false SAP, wrong Origin, stale independent source pins, fake SUCCESS, bad Function version/input are rejected.

DKE's Git history and original upstream source are not changed. This is an actual **producer/consumer interoperability Demo**, not independent semantic acceptance, novel domain code execution, complete Product/L1 Target applicability, L2 Freeze or release.

**Next exact gate:** Woodpecker full mandatory native+SDK+conformance suites on the cumulative PR source HEAD, then version this individual round, immutable test Blob and links into CORE-003/006 as PARTIAL only.

## B08-01 R54 R0 → R1 same-Writer fail-closed repair

R0 source `422e0e7c245bbb9d34916d471e243ac52a1ee3d5`, test Blob `f5d43f8c6080511241272124f2c8be2f7d8e2ab5`; Woodpecker #2307/1 native **FAILURE** (step logs not available via GitHub checks, so the exact failing test is not asserted). Builder independently found source-code contract bug: no-evidence UNKNOWN returned `evidenceRefs:[]`, which existing typed-outcome classifier rejects as `DIS_EVIDENCE_INVALID` when the ref field is present. This breaks legitimate old-version UNKNOWN.

Same Writer repair: Reader `269804b8a4be9d262deb61e1764d9030612dc01e` / Git Blob `ab0cb7d9fed146f419ef7555fcdc8a406f25db10` now omits evidenceRefs when absent; R1 native test `79e62556ed799a52dc8a8437cc17a4da3a96f97f` / Blob `503d34cc3d5049c036ba590e66b4092c52958c9e` makes the public output evidenceRefs optional, asserts zero fabricated refs, and leaves mandatory Source receipt/hard URI checks unchanged. Only exact new CI can qualify R54; #2307 original failure preserved.

## B08-01 R54 R1 → R2 actual cross-project source DATA gate repair

R1 branch candidate `c798f433ef9cffeb808b2c91b6c2923f5a406524` / Woodpecker #2308/1 native **FAILURE**. Source review found another real ABI defect: native `qualifyDisV020Artifact` disallows all `docs/` origins, while actual DKE #209 producer JSON comes from `docs/standards/dke/...`. The original Git path cannot be rewritten into a fake `examples/` path.

R2 targeted Contract source `8c8b29713c3f7aed70d448e707ab65d9234582fa` / Git Blob `fa2fb30875653eaa1eeb32ffbbc97fbb01210c34` accepts only `docs/standards/dke/.../*.json` as selected source DATA, **not** executable LOCAL implementations. R2 native test `d20622f226e40ffe75981d3df75ad7ff941a215f` / Blob `80ecb069278d4112cf38098bfbcb5f5d1465e498` exercises valid DKE Git-origin pin and rejects JSON-as-code, `..` path traversal and `.js` origin. All R0/R1 commits, test Blobs and FAILED CI histories retained. **CI_PENDING** for new cumulative source; no self-qualified R54 or Core state promotion.

## Exact R2 final source qualification (VERIFIED)

Full source `23dbb0ea5dabe661fb2a309adba00e4dbffe0c89` / TREE `fab96c9328a7bae37336b30a18f3cdc8d131a396`: real [Woodpecker #2309/1](https://ci.kaicreator.com/repos/18/pipeline/2309/1), [#2309/2](https://ci.kaicreator.com/repos/18/pipeline/2309/2), [#2309/3](https://ci.kaicreator.com/repos/18/pipeline/2309/3) **3/3 SUCCESS**. Final test Git Blob `80ecb069278d4112cf38098bfbcb5f5d1465e498`. Original producer DKE receipt Git Blob `62a992b9d22332aefcbbcbb02cccb55f5ab25427` unchanged. R0/#2307 native FAILURE and R1/#2308 native FAILURE are immutable historical evidence, **not** retroactively PASS.

The native DIS Function reads original DKE R6 *receipt* (not full original Tally graph in DIS), returns source-limited typed Knowledge `OBSERVED/UNKNOWN` with `authority:NONE`, `attested:false`, `qualified:false`. The DKE producer expressly had SAP_QUALIFIED=0; true first-party semantic authority and independent review remain blockers. Real DKE docs JSON original provenance is admitted as a DATA dependency only, never executable LOCAL code. CORE-003/006/016 remain PARTIAL.
