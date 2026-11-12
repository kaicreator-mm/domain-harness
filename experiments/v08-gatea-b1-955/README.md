# #955 B1 trusted Package/Component/Handler binding experiment

**Status:** bounded research successor; **not** formal SDK implementation, approved Gate A, v0.7-equivalent execution, B2 effect authority, PRD freeze, or merge authorization.

## Exact provenance and bounded architecture

- Accepted main at experiment root: \`3c71b9138056babfafbc7de1349b5924483f2203\` / tree \`ee710c577f131d86f42819fc898a66e140de4f11\` (v0.7 accepted).
- \`reference940/**\` is a byte-identical Git tree from PR #940 at \`beea9cdd29c51a046b8612871aa53be54b966e7c\`, original source subtree \`12bed4e13d2b8d4f203bd21535e29ad0767c8d63\`. It is the **existing physical Package linker/bootstrap**, not rewritten.
- \`reference956/candidate-validator.mjs\` exact Git blob \`aa958fe76a52cee9b9c879377a4a2110de5ca853\` from fresh-reviewed PR #956 HEAD \`16037896d02fe5ba07159d07d4922375dc8553be\`.
- \`packages/domain-harness/dist/contracts/component-admission.js\` and \`kind-compatibility.js\` are executed directly from accepted main; source owners \`src/contracts/*.ts\` unchanged.
- This B1 bridge is not a second General Package Loader or Registry. It calls #940 **real bootstrap/link/seal** on exact manifest/module blob pins, and restricts a **B projection of the same physically attested package bytes** to an installed SDK Rule and pure Schema (3 and 4 physical Packages). The kernel-side B projection is explicitly a **bridge adapter**, not a new portable Kernel B artifact.
- After package linking the bridge snapshots candidate B data with the #956 descriptor-first canonicalizer *before* graph iteration, checks exact import/export, dependency and provider closure, and uses v0.7 exact Kind compatibility + must-understand admission on each B definition.
- Selected SDK Rule executable is imported from the *already verified module source bytes* (data URL; no caller JS handler), then privately retained in a sealed operation closure. Post-seal filesystem/host pin changes do not swap the old callable. The fixture adapts the SDK module's relative SpikeError import to a self-contained module **before** reattestation, not after verification.
- **Trust premise:** host owns the approved exact selector pins and trusted JS realm/intrinsics; arbitrary same-realm malicious packages/Proxies, symlinks, hostile filesystem actor races during the *original #940 bootstrap* code importer, publisher signatures, and full sandbox/side-effect isolation are **not claimed**. The B Rule itself is pinned from verified bytes to avoid a late module-path import.
- Neither the tested Rule path nor the B-side projection executes real v0.7 T002/T004 Central Admission/State/Effect/Replay. Do not relabel the #940 legacy workflow runtime as native B T004. K1/A1 and native B Gate 2 remain a different owner.

## Commands

\`\`\`sh
node --test experiments/v08-gatea-b1-955/tests/b1.test.mjs
\`\`\`

No network, npm install, new registry, side-effect port, v0.7 source edit, or production migration needed for bounded tests. GitHub Actions workflow: \`.github/workflows/spike-942-gatea-trusted-binding.yml\`.

## Fail-closed matrix

F2: actual #940 linker/4+ package closure, byte-verified original host pins, manifestation mismatch, implementation byte mismatch, undeclared cross import, exact dependency version, 0/N provider and missing selection. F3: unknown Kind, version mismatch, unknown required Semantic Contract, shape-incompatible installed Kind, operation-less Schema admitted. F1: exact source-bound Rule callable, repeated execution unchanged after caller pin/module file substitution, sealed rebind denied. P2-R4-01: top-level Graph entry array accessor zero calls / hidden key refused **before iterator**. P2-R4-02: trusted-host JS realm condition documented, hostile arbitrary global intrinsics not claimed.

Existing #956 29 candidate groups + 5 expected legacy defect witnesses + 12 R3 tests are **predecessor evidence**, not added to this B1 normative test count. A passed green defect witness is not a normative B1 PASS. Independent fresh exact SHA security/architecture Review is required before any bounded B1 acceptance.
