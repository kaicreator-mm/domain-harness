# B07-03 / R53 — source-anchored Semantic Relation validation (CI_PENDING)

Original source [`0b4df62efa77e28fc9763f383706199074156170`](https://github.com/kaicreator-mm/domain-harness/commit/0b4df62efa77e28fc9763f383706199074156170), TREE `ed14d0c8d805f17e5af90801cf9a404b53ae53aa`, original test Git Blob `dc0a51bfbdae6aba620f7ed596aedcd862732d9b`.

## Normative problem and narrow repair

DIS R3 requires semantic relations to have a unique identity, applicability, version/source and constraint verifier. Prior native `program.relations` only had `from/to/kind`: it validated graph references but could not bind provenance to real original Function logic. This adds optional `relation.contract:{schema,id,version,sourceId,verifierFunctionId,verifierContractVersion,applicability:'AOT_SELECTED',authority:'NONE'}`, AOT validator and read-only SDK relation catalog.

Actual original xDownload Policy's `xdownload.describePolicy` Function is the selected verifier for the declared `xdownload.policy` constrains `xdownload.acquire` relationship. The native SDK invokes that real source-pinned Knowledge Function and observes `OBSERVATION/NONE`, with no independent Effect or semantic acceptance. The existing KDP boundary is untouched. Other legacy `from/to/kind` relations remain compatible; semantic graph cycles remain distinct from acyclic static invocation DAG.

Positive: real original source SHA/verified Function version, bounded relation catalog and native Policy Knowledge observation. Negative: false independent authority, wrong/unselected source, unrelated Function, altered Function version, malformed applicability and duplicate/invalid relation identity; semantic backlink does not introduce a static KDP route.

**Status CI_PENDING.** This is structural/runtime observability of source-linked declared semantics, *not independent SAP acceptance or a production constraint engine*. CORE-005 remains PARTIAL; no Release/Freeze/merge.
