# DomainHarness v0.10.3 — GitHub SDK Tarball Distribution

> This is a proposed distribution guide. Download instructions become valid only AFTER independent acceptance and actual GitHub Release asset upload. These are **not npm Registry packages**.

## Source provenance

The immutable source Git tag is [v0.10.3](https://github.com/kaicreator-mm/domain-harness/tree/v0.10.3), commit 061376f4a023070f215f9feffad5c24d96d503cb, Git tree 099cdc831aef63befd62aaede7e7a853d1be468f. Its public workspace manifests still say 0.10.2-rc.0. Distribution builds from this pinned source **before** applying a disclosed, strictly package-metadata-only 0.10.3 version and intra-SDK dependency rewrite in a **disposable worktree**. Do not claim tarball package.json bytes are identical to the source tag, or that the original tag was modified.

Four public packages (Node.js >=24):

- @kaicreator/domain-harness-contracts
- @kaicreator/domain-harness-microkernel
- @kaicreator/domain-harness-build (producer only)
- @kaicreator/domain-harness-host-node (optional Host)

Legacy private workspaces and the Kernel Domain Package are **not** public SDK artifacts.

## Consumer installation (after release assets are uploaded)

1. Download all four actual tgz assets, SHA256SUMS and SDK_PROVENANCE.json from the GitHub Release for the existing v0.10.3 tag.
2. Check SHA256s and verify pinned source commit/tree and distribution script commit in the provenance.
3. For all four package names, use local file dependencies in a fresh Node24 project's package.json. Example: "@kaicreator/domain-harness-contracts": "file:./vendor/kaicreator-domain-harness-contracts-0.10.3.tgz". Repeat for the other three tarballs, then npm install.
4. Import only selected public SDK exports, respecting BUILD producer-only vs chosen K/Microkernel/Host runtime responsibilities. Downstream Tally/ai-rexform should pin artifacts and hashes.

Do **not** use ^0.10.3 npm Registry dependency specs: no such npmjs.com publication is asserted. Non-SDK dependencies may still need their ordinary cache/network access.

## Publisher / authorized local Agent

On distribution/v0.10.3-sdk-tgz with Node24, choose an **empty absolute directory outside the checkout**:

    node scripts/distribution/pack-sdk-v0103.mjs --out C:\xDev\_artifacts\domain-harness-v0103

The script verifies the exact Git tag SHA/tree, makes a disposable worktree, runs original npm ci/build/typecheck/lint and the existing tarball inventory before editing metadata, then changes **only the four temporary package manifests**. It runs four actual npm pack operations, inspects tarball metadata/compiled file inventory, and installs/imports all four local tarballs in a fresh offline test consumer. It writes four tgz files, SHA256SUMS and SDK_PROVENANCE.json. It never runs npm publish, changes the immutable source tag, changes runtime ABI or automatically uploads any asset.

Independent exact-SHA source R1, physical Node24 receipts, real Tally and ai-rexform installed consumer acceptance, and a separate release-assets RQ must precede GitHub Release upload/readback. A script PASS is not an upload receipt.

## Safety and known limits

The existing #1437 raw public DomainApp.send malformed nested DTO risk can poison a stable Case's K Effect Journal before an application validator. **Expose only an exclusive app-private trusted pre-send Host gateway to untrusted callers**; generic already-poisoned Case recovery is not qualified. New online ambiguous Guided Journey LLM form selection and real production cross-task Meta learning remain downstream-deferred; new LLM-specific private Hidden oracles were not in the accepted 7/7 pack.

docs/current and the installed Agent Skill remain on their separately authorized released pointers. For a concrete SDK issue, file a sanitized [DomainHarness Issue](https://github.com/kaicreator-mm/domain-harness/issues) with downstream revision, exact tarball SHA256s, and expected/observed behavior. Do not submit secrets or private model material.
