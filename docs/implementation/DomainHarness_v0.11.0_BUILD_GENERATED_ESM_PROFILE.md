# DomainHarness v0.11.0 — BUILD generated ESM profile

This document records the implementation scope of the v0.11.0 **static proof boundary**. The normative Package/Core requirements are in the v0.11.0 Package lifecycle specification.

The BUILD accepts a deliberately constrained, deterministic Node 22 ESM subset. The final compiled JavaScript and its relative import closure are analyzed before composition. A generated Package may access only directly declared Extension imports/exports and pinned resources; unprovable code-loading or capability transfer is rejected. Runtime does not repeat this static check.

## Supported private computations

Normal private computation remains available without computed property acquisition:

```js
const values = [2, 4, 6];
const labels = new Map([['first', 'READY']]);
export function init() {
  const index = 1;
  const key = 'first';
  return { status: labels.get(key), detail: { score: values.at(index) } };
}
export function exit() {}
```

Plain literal property reads, local functions, loops, conditionals, `Array.at(index)` and `Map.get(key)` are allowed subject to all other static checks. Avoid dynamically accessing `obj[key]` or declaring dynamic `[expression]` properties in the **generated ESM**: these forms are rejected even when they are harmless private table lookups, because the current proof checker cannot reliably distinguish them from late acquisition of a loader or foreign Package handle. This is a known expressiveness tradeoff, not a claim that ordinary JavaScript itself is unsafe.

## Rejected mechanisms

- Nonliteral or undeclared cross-Package imports, missing/nonpublic named exports, namespace/default foreign imports, raw imported Function handle escapes.
- Dynamic/indirect code loaders including `eval`, `Function`, `Reflect`, `createRequire`, `getBuiltinModule`, and unapproved Node builtins.
- Nonliteral computed property reads and computed property declarations in final generated ESM.
- Package `package.json` install-time npm lifecycle scripts such as `preinstall`, `install`, `postinstall`, `prepare` and related hooks: BUILD rejects them before materialization or npm installation. Ordinary development-only `build`/`test` scripts are not run by the composition step.

The user-facing Package lifecycle still follows `Core.Order`, single-pass recursive Init, optional Exit and optional Package InitFrom; narrowing the generated-code profile does not change runtime scheduling.

**Validation:** `tooling/build/tests/core/build-positive.test.ts`, `build-negatives.test.ts`, and the independent composed-App consumer cover the allowed alternatives, denied code paths and rejected package-install hooks. Acceptance is restricted to the actual exact-HEAD test and CI evidence.

## npm installation boundary (v0.11.0)

Each selected Package is bundled from BUILD-verified files. Selected `package.json` files must **not** declare their own `dependencies`, `optionalDependencies`, `devDependencies`, `peerDependencies`, bundled dependencies, workspaces or npm overrides: even a transitive local `file:` dependency could execute an unselected `postinstall` before Boot. All selected Extension Packages are placed explicitly in the composed root `file:./packages/<id>` dependency set.

The only external runtime dependencies allowed by BUILD at v0.11.0 are the exact first-party `@kaicreator/domain-harness-microkernel@0.11.0` and optional `@kaicreator/domain-harness-contracts@0.11.0`; any additional caller-supplied root dependency or version is refused. These first-party modules are an explicitly trusted installation boundary, not arbitrary third-party code proved safe by JavaScript AST analysis. Installing the resulting package still requires the trusted runtime package source. BUILD does not execute `npm install`.

### Implicit npm native-build hook

Even when a selected Package has no explicit `scripts` or npm dependency fields, a root `binding.gyp` can cause npm to run an implicit `node-gyp rebuild` during installation. BUILD rejects root `binding.gyp` both in the Package input root and in the selected sealed file closure before it materializes the composed App; native addons are outside the supported generated ESM profile for v0.11.0. Ordinary non-root data resources are unaffected.
