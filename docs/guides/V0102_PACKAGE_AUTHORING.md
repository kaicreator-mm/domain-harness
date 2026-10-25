# v0.10.2 Package Authoring Guide — public producer first

**P1 release-candidate source draft; Issue #1379. Not independently Node24 qualified.** Domain Packages carry independently selected source modules. Do not copy historical Compiler internals or create one Package per tiny private function.

## Real public surfaces

```js
import { buildV10App, projectSelectedComponents } from '@kaicreator/domain-harness-build';
import { sha256Hex, V10_TARGET_PROFILE } from '@kaicreator/domain-harness-contracts';

// selectedModules: immutable, already chosen K Primary + S Primary + >=1 B,
// plus only actually required K/S/C extension modules.
// Each selected source has moduleSource and sha256Hex(moduleSource).
const projection = projectSelectedComponents(componentDeclarations, selectedModules);
const app = buildV10App({
  appId, audience, buildId,
  targetProfile: V10_TARGET_PROFILE,
  modules: [...coreKSBModules, ...projection.modules],
  routes: declaredIntentOperationRoutes,
  hardBudget: { maxStepsPerTurn: 8, maxWorkUnitsPerTurn: 64 },
});
// Serialize this sealed plain-data App to an installed App package.
// Runtime never imports BUILD or any Compiler package.
```

Variables in the above template are **deliberate author inputs**, not hidden SDK globals. The example is an authoring shape, not a standalone executable file. For a *physically executed* producer using published roots, see `examples/v0102-external-producer/producer.mjs`: reads exact installed K/S/Feature Package payloads and seals Tiny/Rich Apps. Its own evidence is in T09 #1330, not in this documentation.

## Three required authoring paths

1. **Pure non-Tool S Feature:** select a `standard-feature` module with `featureExport` and `moduleSha256`; declare `{class:'semantic',kind:'rule',componentId,modulePackageId,entry}` where `entry === featureExport`. Ordinary deterministic helper remains private. No Tool, no K permit, no hidden feature import. See `tooling/build/tests/component-view.test.ts` and `domain-packages/standard/features/semantic-decision/`.
2. **Private B/C helper:** import it through permitted *ordinary* local code within a declared B or C module. Never add an operation or Tool for the helper without a named cross-module boundary. Host/resource initialization and disposal follow the selected runtime, not inferred Tool metadata; unselected modules have no init/execute edge.
3. **Mixed independent C Modules:** use a read-only `externalEffect:false` C module for `inventory.get` and a *different* `externalEffect:true` C module for `jobs.submit`. Bind each declared `operationId` to its `handler` through `projectSelectedComponents`. BUILD must seal both selected module bytes and exact routes; effects go through K permits. Mixing read-only and effectful handlers in one module cannot grant per-handler overrides.

## Minimal one-command source probe (Node24, repo working tree)

```sh
npm ci && npm run build
node examples/v0102-package-authoring/projection-smoke.mjs
node --import tsx --test tooling/build/tests/component-view.test.ts
```

**Probe boundary:** this covers semantic/advisory/Tool projection, two distinct C modules and typed *static* negatives. It does not install/execute a third-party Domain App or prove effect/UNKNOWN by itself.

## Physical public-tarball authoring acceptance (Node24, one command)

```sh
node examples/v0102-package-authoring/authoring-template-check.mjs --evidence <file.json>
```

`examples/v0102-package-authoring/authoring-app/` is the minimal #1305 authoring App source (S non-Tool Feature + B with a private helper + read-only and external-effect C modules) and `authoring-producer.mjs` seals it inside an isolated public-tarball root through exactly this guide's path — `projectSelectedComponents` then `buildV10App` — before the sealed App is packed, clean-installed and executed with the governed permitted dispatch, the permitless typed refusal (zero adapter dispatch) and six typed binding/route negatives. The check records literal exit codes and digests in its evidence JSON. Never rely only on a monorepo source import for this proof; the existing T09 Tiny/Rich suite (`tests/integration/v010-clean-consumers/clean-consumers.test.ts`) remains the separate producer/consumer evidence.

## Release checks

The `0.10.2-rc.0` packages are local tarball candidates, not presumed published on npm. Verify exact `engines.node >=24.0.0`, selected `exports`, packed JS/d.ts, no deep `dist/` imports and no legacy Compiler alias. Capture literal command/exit/Node/npm/source SHA and artifact hashes. Use [extension index](SUPPORTED_EXTENSION_POINTS.md) and [migration guide](../migration/MIGRATING_V0101_TO_V0102.md). `R01` alone decides Release PASS; authoring docs do not.
