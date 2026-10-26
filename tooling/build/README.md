# DomainHarness v0.10.2 BUILD package (T05 draft)

This package owns static closed-world Domain App BUILD composition, selected-closure resolution and sealed ordinary-import policy. It MUST NOT import or expose Microkernel/Host runtime authority. It consumes only canonical shared types/errors/constants from `@kaicreator/domain-harness-contracts` and Node built-ins.

The parser is a vendored Acorn 8.19.0 migration from the previously pinned compiler v09 parser. `src/generated/acorn.ts` preserves the upstream vendored source plus a TypeScript no-check directive and emits one `dist/generated/acorn.js` through normal tsc (no runtime compiler import). The emitted bytes are pinned in `src/parser.ts` to SHA-256 `fcc0f872458c16ec224c202de4bdf49c01be03f707394e3897176084bf4a5373` (physical Node v24.21.0 / typescript 5.8.3 build, 2026-10-24); `assertVendoredParserBytes` fails closed on any drift, from both the `dist/` layout and the `src/` (tsx) layout against the same built file.

## Required gates before source PASS

- Source inspection and minimal correction of `src/import-policy.ts`: DONE — the surviving old compiler-v09 Acorn type import (`../v09build/generated/acorn.mjs`, dead path after the split) was removed and the three `V09_BUILD_PARSER_PIN` references now use `BUILD_PARSER_PIN`.
- Node24 `npm run build -w @kaicreator/domain-harness-build`: DONE — emitted `dist/generated/acorn.js` pinned to `fcc0f872458c16ec224c202de4bdf49c01be03f707394e3897176084bf4a5373`; clean-rebuild byte determinism and the fail-closed tamper negative (one tampered byte ⇒ `VENDORED_PARSER_DRIFT`) verified. Existing vendored acorn.mjs reference blob is `aee191eb880c1eb7733665be63b48038dd61f726` with SHA256 `76254fc76529713b4dfd2532972d17a991ffd9aafeebb1f977445b5506b9fb0b` (re-verified as the exact `// @ts-nocheck`-prefixed content of `src/generated/acorn.ts`).
- Scoped tests: DONE — `node --import tsx --test tooling/build/tests/*.test.ts` (4/4) and the frozen `tests/compiler/v010-selected-closure.test.ts`, `v10build-composition.test.ts` (16/16) pass on Node v24.21.0; workspace typecheck green.
- Independent packing: DONE — `npm pack` of `@kaicreator/domain-harness-build` + `@kaicreator/domain-harness-contracts` installed into a scratch dir; the installed `dist/generated/acorn.js` hashes to the pin, `assertVendoredParserBytes` passes from the installed layout, a full 4-role composition builds positively, `V10_TARGET_UNSUPPORTED` refuses negatively, and the installed tree contains no compiler package.
- Do not edit package manifests, lockfile, Microkernel or Host. Compiler compatibility shim/cutover must respect T05/T11/T07b ownership and not break existing clean consumers.
- Independent exact-head review P0/P1/P2 before merge to v0.10.2. No premature main merge.

**Status**: Physical build + pin + scoped tests + independent packing verified on Node v24.21.0 (evidence logs on the PR). Dist SHA pinned; still NOT merge-ready until the independent exact-head review P0/P1/P2 and controller `task-check` pass. This document is operational source handoff, not a new design authority.

## v0.10.2 A8b — published BUILD Component authoring adapter

The published BUILD workspace exposes `projectSelectedComponents` and type-only `ComponentDeclaration`, `ComponentProjection`, `SemanticKind`, `ToolPlacement`. These are **producer descriptions, not a second runtime, selected manifest, a Tool/Hook dispatcher, or an authority source**. This function takes declarations plus an already selected `V10ModuleInput[]` and returns only the original selected module objects needed by these declarations (and an informational bindings map); it does not import or execute module source. The producer then calls the unchanged `buildV10App` with its required K/S/B core modules and any selected Component modules. Original source/digest/ABI and dependencies are checked once by BUILD.

Supported v0.10.2 mapping:
- `semantic:rule|skill|workflow|decision|context|validator|schema|diagnostics|knowledge|evidence` — only if the declared `entry` exactly equals the already selected Standard Feature module's `featureExport`. A knowledge/prompt asset without an entry can stay a private Package asset.
- `hook:kernel-advisory` — only the already selected Kernel advisory extension `hookExport`; lifecycle/event/observer Business hooks are unsupported and refused, not silently executed.
- `tool:package-operation` — only a declared selected Capability `operationId→handler`; `externalEffect` must match its sealed **module-wide** flag. Ordinary local, package-shared and operation-private helper functions are not Tools. `system-operation` and `remote-operation` are provider-location labels, not evidence of an installed transport/Host provider; without a separately selected supported adapter they are currently typed UNSUPPORTED, regardless of effect type. No per-handler effect waiver.

Producer example (use real sealed modules and existing routes, never invent module bytes):

```ts
import { buildV10App, projectSelectedComponents } from '@kaicreator/domain-harness-build';

const selected = projectSelectedComponents([
  {
    class: 'tool', kind: 'package-operation', componentId: 'inventory.get',
    modulePackageId: inventoryCapability.packageId, operationId: 'inventory.get',
    handler: 'getInventory', externalEffect: false,
  },
], alreadySelectedModules);

const app = buildV10App({
  ...baseOptions,
  modules: [...coreKernelStandardBusinessModules, ...selected.modules],
  // Keep only routes that refer to explicitly selected Capability operations.
});
```

One logical Domain Package may author several independent selected module boundaries; two Tool Operations can share a Package-private helper but a private helper itself has no BUILD/Tool registration. BUILD still enforces the original role cardinalities, selected digest and dependency closure, import restrictions, duplicate provider IDs, effect/route bindings and typed refusals. No new `package.json` export-map entry, Node major matrix, package manifest authority or Microkernel/Host import is introduced by this adapter. Exact A8b scope: only `src/component-view.ts`, `src/index.ts`, `tests/component-view.test.ts`, `README.md`, and Node24-generated `dist/{component-view,index}.{js,d.ts}`. T07b owns later final tarball packaging; T09 owns external clean-installed consumer proof. Generated output must be a real Node24 TypeScript `tsc` emit, not handwritten.
