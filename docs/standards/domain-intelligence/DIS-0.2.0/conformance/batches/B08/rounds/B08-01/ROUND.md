# DIS v0.2.0 B08-01 / R54 — real DKE producer → selected DIS Knowledge consumer

**Original candidate source** [`422e0e7c245bbb9d34916d471e243ac52a1ee3d5`](https://github.com/kaicreator-mm/domain-harness/commit/422e0e7c245bbb9d34916d471e243ac52a1ee3d5), TREE `0cdbe36c6c87f02a4067faed66d86230bf0a5a54`; native test Git Blob `f5d43f8c6080511241272124f2c8be2f7d8e2ab5`. **CI_PENDING**, not yet qualified or included in `matrix.json`.

## Actual producer, actual consumer (no fabricated Domain acceptance)

Upstream DKE #209 [original immutable source `domain-forge@880a24e8949d34901b8d8a2a04f691df4bfd08e2`](https://github.com/kaicreator-mm/domain-forge/commit/880a24e8949d34901b8d8a2a04f691df4bfd08e2): `EXECUTION_RECEIPT.json` Git Blob `62a992b9d22332aefcbbcbb02cccb55f5ab25427`, preserved bytes unchanged under `examples/dis-v020-native-sdk/fixtures`. Its actual original Tally graph source Git Blobs are old `2d4498dfa5f90bcf57cc81e9c155fb9ede31bf00` and new `0f6007315fd7352fe6fd218effcfecf672cb4961`. DKE executed 466 existing queries reused, 19 new AOT entries, including five Case→Evidence→Locator→Source chains; all unqualified, not a SAP Oracle.

DIS new local Knowledge Function `dke.provisional.query` has typed I/O, OBSERVED/UNKNOWN outcomes, version, evidence and selected AOT source dependencies on *both* original DKE receipt and this versioned reader implementation. Trusted installer independently pins exact DKE receipt and native reader origin, then real selected KDP SDK invokes the Function. New-version original chains are traceable `OBSERVATION/authority:NONE/attested:false/qualified:false`; old version and absent query return `UNKNOWN` with no fabricated answer, no physical Effect. Source tampering/false SAP, wrong Origin, stale independent source pins, fake SUCCESS, bad Function version/input are rejected.

DKE's Git history and original upstream source are not changed. This is an actual **producer/consumer interoperability Demo**, not independent semantic acceptance, novel domain code execution, complete Product/L1 Target applicability, L2 Freeze or release.

**Next exact gate:** Woodpecker full mandatory native+SDK+conformance suites on the cumulative PR source HEAD, then version this individual round, immutable test Blob and links into CORE-003/006 as PARTIAL only.
