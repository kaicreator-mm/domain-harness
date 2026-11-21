# DomainHarness v0.11.0 Basic App — clean packed consumer

This example is an author-facing, executable proof of the v0.11.0 Element-First SDK. It does not contain another Runtime, Kernel, BUILD, Router, App Init or Effect engine.

## What the consumer authors

- A zero-Function knowledge Element, a two-Function rule Element and a two-Function business app Element, with multiple content kinds and a legal semantic-relation cycle.
- One package owning multiple Elements and a second package explicitly importing and really calling the first package's public Function through installed ESM exports.
- Exactly one Kernel/SDK/Business Primary, one extension in every layer and one sealed Hook contribution.
- A selected structured rule that drives direct Function POS/NEG/UNKNOWN outcomes. Rebuilding with different rule bytes changes both the exact Lock and the observed behavior without changing implementation code.

The consumer imports the canonical public SDK only:

```js
import {
  buildApp,
  boot,
  canonicalJson,
  contentDigestOf,
} from '@kaicreator/domain-harness';
```

The four actual npm tarballs supply the SDK, contracts, BUILD and KDP. Business Domain Packages are authored locally by the consumer and copied into its external installRoot; their selected implementations, the trusted installed record, Boot/KDP trust ladder, Package-owned Element.Init, pre-READY BUILD-selected Function execution, inspection and reverse Exit all execute in that new directory outside the repository. Legacy executable App APIs are intentionally not part of this example.

## Run the complete acceptance path

From a Node.js 22.12+ checkout:

```bash
node examples/basic-domain-app/verify-clean-install.mjs
```

The driver:

1. builds the current checkout and separately packs the public SDK, Contracts, BUILD and Microkernel;
2. reads the real tarball bytes and checks versions, dependencies and canonical file fences;
3. initializes a new empty external directory and installs all four absolute tarball paths;
4. verifies installed realpaths and rejects workspace/symlink/source escapes;
5. runs `consumer.mjs` in that external directory;
6. writes incremental `driver-events.ndjson`, `consumer-events.ndjson` and final result JSON under an external evidence directory.

Set `DH_T05_NPM_REGISTRY` to select the registry/cache used for third-party transitive installation. Set `DH_T05_EVIDENCE` to choose the evidence directory. No `npm publish` occurs.

The AC01–AC10 result distinguishes assertions executed here from focused upstream BUILD/contracts/runtime tests reused by this acceptance path. It is candidate validation, not an npm release or a claim of compatibility with older executable App ABIs.
