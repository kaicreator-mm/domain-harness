# @kaicreator/domain-harness-compiler

Build-time compiler for DomainHarness Target Compiled Domain Packages. It turns a Raw Domain Package (authoring-time workflows, tools, projections, schemas) into the `TargetCompiledDomainPackage` artifact that the portable runtime (`@kaicreator/domain-harness`) consumes at application startup.

## Installation (exact git pin)

The package is consumed by pinning an exact repository revision — there is no npm release. The built `dist/` tree is committed to the repository, so a git install delivers a usable package without lifecycle scripts:

```sh
pnpm add "github:kaicreator-mm/domain-harness#<exact-sha>&path:packages/domain-harness-compiler"
```

The compiler has a **peer dependency** on `@kaicreator/domain-harness@0.2.0`: install the runtime package in the same project (the same exact-SHA pin) — pnpm then satisfies the peer from your installed copy and no nonexistent-npm version is ever fetched:

```sh
pnpm add "github:kaicreator-mm/domain-harness#<exact-sha>&path:packages/domain-harness" \
          "github:kaicreator-mm/domain-harness#<exact-sha>&path:packages/domain-harness-compiler"
```

The subdirectory (`&path:`) form is required because this package lives in a monorepo; pnpm supports it (npm does not resolve git subdirectory dependencies).

## Usage

```ts
import {
  compileDomainPackage,
  emitTargetCompiledPackageModule,
  loadRawDomainPackage,
} from '@kaicreator/domain-harness-compiler';

const raw = await loadRawDomainPackage({ root: './authoring' });
const { manifest } = compileDomainPackage({
  raw,
  domainVersion: '1.0.0',
  target: { id: 'my-host@1', capabilities: [...], bindings: {...} },
  bindingContents: { /* immutable binding artifact content per bindingId */ },
});
const moduleSource = emitTargetCompiledPackageModule({
  manifest,
  bindingModules: { /* moduleSpecifier + content per bindingId */ },
});
// Write moduleSource (plus the binding modules) to the target build output and
// import it: its default export is the TargetCompiledDomainPackage consumed by
// createDomainRuntime + StaticPackageRegistry from @kaicreator/domain-harness.
```

See `docs/sdk/` in the repository for the full SDK and integration guides.
