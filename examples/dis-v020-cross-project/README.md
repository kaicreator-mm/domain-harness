# DIS 0.2 R7 — source-pinned three-project consumer Demo

Represents **actual byte-identical source** from kaicreator-mm/tally, kaicreator-mm/runx and kaicreator-mm/xDownload, at pinned Git commits listed in `manifest.json`. These snapshots are intentionally test-only fixtures, not copied business libraries for production distribution.

Run from the domain-harness monorepo root after dependencies are installed:

```sh
node --import tsx --test examples/dis-v020-cross-project/consumer.test.mjs
```

This runs 23 independent Node tests over the actual exported Tally Business/Release functions, the actual Runx TypeScript Agent Presence class, and actual xDownload Business policy/Acquisition stub. All selected source bytes are independently validated against their originating Git Blob SHA, and the scoped `consumer.mjs` validates Element.Function mapping, static dependencies, declared effect kinds and rejects direct external-effect calls. No real provider invocation, download traffic, release/Claim, native runtime deployment, production DB or user data is touched.

Cross-project scope: **source-qualified DIS Function contracts**, not a complete three-repo migrated runtime. The existing [R6.1 real KDP/SQLite+two-Business test](../dis-v020-real-aot-bridge/) proves host-level integration separately. Exact matching Woodpecker CI receipts are required for a PASS.
