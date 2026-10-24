# v0.10.2 A5 — T07a4 early compiler manifest bridge for T05

**DESIGN CANDIDATE / independent exact-HEAD PASS required.** Parent issue #1300, issue #1354; frozen L2 remains byte-identical. This is an additive T07-owner timing correction, not an extra implementation node.

## Trigger: independent T05 R1 P1-01
[T05 PR #1351 R1](https://github.com/kaicreator-mm/domain-harness/pull/1351#issuecomment-6385801933) discovered the new `@kaicreator/domain-harness-build` package implements canonical BUILD while three legacy `C/v10build/{build,selected-closure,import-policy}.ts` still implement independent old algorithms. Frozen L2 §12 Strategy S' requires forwarding shims. Replacing them with package reexports without updating legacy Compiler's runtime dependency would cause `ERR_MODULE_NOT_FOUND` in clean installed Compiler. Existing Compiler manifest has no BUILD dependency; manifest/lock edits belong only to T07.

## Proposed phased DAG: no new Task node

Original T07 (early T07a / late T07b) remains one exclusive **manifest owner** and existing frozen 18-Task DAG retains 18 nodes. Authorize T07a4 as one **additional serialized PR inside T07**, after T00 and A4 and **before T05 source cutover**:

`T07a → T00 → T07a4 (manifest-only) → T05 → T04 → ... → T11 → T07b`.

T03a already closed in parallel at version commit `ab4d4d1d7c1c08f33977c49749bf5ac363475398`; T07a4 cannot reopen it. T07b keeps late legacy privatization, export pruning and untracking of Compiler dist. No scheduler gate, no new Domain Package or Kernel authority.

## T07a4 exact exclusive write set (two files)

1. `packages/domain-harness-compiler/package.json`: append **one runtime dependency** `"@kaicreator/domain-harness-build": "0.10.2-rc.0"`. No change to existing other deps, peerDeps, exports, scripts, `private`, `engines` or `files`.
2. `package-lock.json`: update the matching `packages/domain-harness-compiler` workspace entry's `dependencies` field with precisely the same local workspace version; no root workspace churn, new registry resolution or unrelated lock entries. `tooling/build` and `node_modules/@kaicreator/domain-harness-build` local workspace already exist.

Nothing else: no compiler source or generated dist in this PR, no `tooling/build/package.json`, no root manifest, no K/S, no frozen Product/L2/Freeze, no CI yaml. Verify actual npm lock after `npm install --package-lock-only --ignore-scripts` and `npm ci` on Node24; no invented lock edits or CI waiver.

## Subsequent T05 source, with its own reviewed owner

After T07a4 manifest + lock integration into the version branch, T05 must implement **all three** source forwarders in its previously allowed exact C/v10build files. Preferred compiler-compatible static export path is through `@kaicreator/domain-harness-build` public entry only. Its current index exports only `buildV10App` and Contracts types, while existing legacy consumers need `resolveV10SelectedClosure`, `emptyExternalImports`, `collectModuleEdges`, `assertSealedImportClosure` and associated types. T05 may consider **narrowly adding only these pure BUILD-time helpers** to `tooling/build/src/index.ts` (within its original write set, dist/index paired output already admitted by A4). This is a **PUBLIC_API_SURFACE_DELTA** and must be independently reviewed for necessity, module identity and package exports; no Host/K runtime capability or new manifest subpath/deep imports. If a minimal surface cannot be accepted, independent reviewer should BLOCK and request a different serialized L2 amendment, rather than smuggling a relative dist import.

The new BUILD's Contracts-based errors must share class identity with old compiler shims and catch sites. Verify package `npm pack`/clean install **Compiler + BUILD + Contracts** in one transaction and a negative missing-BUILD dependency install/refusal, no latent registry dependency. Existing frozen C tests should now exercise canonical new BUILD through the shims, and T05 new official entry `manifest-shape` authority negatives must PASS. `tsc` outputs only A4 exact T05 derived files. Upstream Node24 Acorn byte pin and earlier full suite PASS may be reused when unaffected.

## Independent design review and closure

Review at exact SHA: P0/P1/P2, `A5_FREEZE_READY`, `EARLY_T07_MANIFEST_AUTHORIZED`, `DAG_ACYCLIC`, `T05_COMPILER_FORWARDING_PATH_FEASIBLE`, `MAIN_INTEGRATION=NO`. Check frozen L2 §§1.2, 4, 5, 12, T07b eventual pruning, actual manifest/lock structure, and whether public BUILD helper exports are an acceptable minimal consequence. Distinct reviewer must explicitly flag any unresolved source/API issues; design PASS does **not** auto-pass T05 implementation.

If PASS: merge **docs-only** A5 into v0.10.2, amend #1323 and T07 owner record, create T07a4 two-file implementation PR, validate CI and installed package closure, independently review/merge, then resume T05 source and exact-SHA R2. Do not merge T05 or main ahead of those gates.
