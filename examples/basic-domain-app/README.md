# DomainHarness v0.11.0 Basic App — clean packed consumer

> **CURRENT v0.11.1 R60 NOTE**: This v0.11.0-labelled demo name is historical; current public product is one `@kaicreator/domain-harness` SDK with built-in Composition and `/runtime`. Internal Contracts/Microkernel are transitive dependencies, not extra Consumer SDK products. JSON/YAML functions in this v0.11.1 demo are not yet independent Standard Readers; extraction and a second Domain Consumer are owned by [0.11.1 Task #1656](https://github.com/kaicreator-mm/domain-harness/issues/1656), not 0.11.2.


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

The three actual npm tarballs supply the single SDK and its Contracts/KDP transitives. Package composition is built into the SDK; no standalone BUILD package is installed. Business Domain Packages are authored locally by the consumer and copied into its external installRoot; their selected implementations, the trusted installed record, Boot/KDP trust ladder, Package-owned Element.Init, pre-READY BUILD-selected Function execution, inspection and reverse Exit all execute in that new directory outside the repository. Legacy executable App APIs are intentionally not part of this example.

## Run the complete acceptance path

From a Node.js 22.12+ checkout:

```bash
node examples/basic-domain-app/verify-clean-install.mjs
```

The driver:

1. builds the current checkout and separately packs only the public SDK and its Contracts/Microkernel transitives;
2. reads the real tarball bytes and checks versions, dependencies and canonical file fences;
3. initializes a new empty external directory and installs three exact tarball paths, then verifies SDK Runtime and built-in Composition independently;
4. verifies installed realpaths and rejects workspace/symlink/source escapes;
5. runs `consumer.mjs` in that external directory;
6. writes incremental `driver-events.ndjson`, `consumer-events.ndjson` and final result JSON under an external evidence directory.

Set `DH_T05_NPM_REGISTRY` to select the registry/cache used for third-party transitive installation. Set `DH_T05_EVIDENCE` to choose the evidence directory. No `npm publish` occurs.

The AC01–AC10 result distinguishes assertions executed here from focused upstream BUILD/contracts/runtime tests reused by this acceptance path. It is candidate validation, not an npm release or a claim of compatibility with older executable App ABIs.


> v0.11.1 R69: `dh.std.file.json` / `dh.std.file.yaml` 提供独立读写格式函数。Workflow 在本演示仅选定 Read Function；Write 是纯序列化，落盘不属于未授权的 Element Effect。
