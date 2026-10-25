# DomainHarness v0.10.2 — selected public API and Package/ABI map

**T08b #1329 documentation candidate.** Source basis: `v0.10.2@51dadcbbd31baf612507703ad389a255a8704462`, after T07b #1328 R2 PASS/merge. This is not a Release Qualification receipt; T09 external install and R01 documentation command execution are `NOT_RUN` at authoring.

## Installed/public package exports

The published `package.json` exports maps expose:

| Package | Root exports | Additional public subpath |
| --- | --- | --- |
| `@kaicreator/domain-harness-contracts` | ABI/digest/error/identity utilities and `V10BuiltApp` / selector types | None |
| `@kaicreator/domain-harness-build` | `buildV10App`, `projectSelectedComponents` and producer types | None |
| `@kaicreator/domain-harness-microkernel` | `load`, `DomainApp`, public errors/types | `./host-seam` (trusted Host bootstrap API only) |
| `@kaicreator/domain-harness-host-node` | `openSqliteCasStore`, `InMemoryCasStore`, durable/memory/deployment/observer utilities | None |

Node engine range `>=24.0.0`, real qualification Node24 only. All four selected packages are `0.10.2-rc.0` before release. Real `npm pack` file inventory and `./host-seam` entry/d.ts were verified at T07b; that does **not** prove a new external Tiny/Rich runtime install.

`@kaicreator/domain-harness-compiler` and other old workspaces are **private**. Their legacy `./v10build`, `./v10shadow`, `./v10meta`, payload aliases and private `dist` paths are not public. Do not add a legacy Compiler dependency to a new producer. There is no promise of cross-version compatibility before 1.0.

## The actual runtime signature

```ts
import {
  load,
  type DomainApp,
  type LoadAppOptions,
  type V10ScopedSubscriptionEvent,
  type V10Subscription,
} from '@kaicreator/domain-harness-microkernel';
import type { V10BuiltApp } from '@kaicreator/domain-harness-contracts';

const runtime: DomainApp = await load(prebuiltApp as V10BuiltApp, options as LoadAppOptions);
const receipt = await runtime.send(intent);
const snapshot = await runtime.query(selector);
const snapshots = await runtime.query([selectorA, selectorB]);
const observer: V10Subscription = await runtime.subscribe(selector, (event: V10ScopedSubscriptionEvent) => {
  // Only { kind, occurrenceId, target, snapshot? }; no raw receipts or K keys.
});
observer.unsubscribe();
runtime.stop();
```

`prebuiltApp`, `options`, `intent`, and selectors are illustrative **application-provided** values, not an executable standalone example. `LoadAppOptions` requires `store: V10DocStore` and optionally holds trusted `queryAuthority`, `deploymentIdentity`, `tenantId`, `deploymentRoot` or `now`. The facade has exactly `send`, `query`, `subscribe`, `stop` as own keys. `stop` is idempotent. Query/subscription authority must come from actual Host-selected caller/target evidence; the caller cannot forge a principal.

Host bootstrap can import `activateV10App` and read-only identity helpers from `@kaicreator/domain-harness-microkernel/host-seam` for the explicitly bounded integration. **That subpath is API hygiene, not a security capability.** K's durable documents and permits remain authoritative.

## BUILD and Component producer projection

```ts
import { buildV10App, projectSelectedComponents } from '@kaicreator/domain-harness-build';

const projection = projectSelectedComponents(componentDeclarations, alreadySelectedModules);
const prebuiltApp = buildV10App({
  ...buildOptions,
  modules: [...coreSelectedModules, ...projection.modules],
});
```

Inputs above must be sealed, locally selected and validated; `projection` does not invent new module bytes or authorize unselected features. Supported authoring entries are selected Standard semantic features, Kernel advisory hooks and Capability `package-operation` Tools. Generic Business event Hooks, implicit helper→Tool conversion, remote/system transport inferred from metadata, mixed effect permissions in one module and unselected exports are **unsupported / typed refusal**. No new runtime Component dispatcher exists.

K Primary uniquely owns State, Admission, Journal, Effect, UNKNOWN and Replay. S Primary owns interpretation/dispatch; B/C are Domain Packages. Host owns actual persistence/CAS operations, not the decision to commit business state. Neither Microkernel nor Host imports BUILD even type-only.

## Type/physical evidence boundary

Type imports must resolve from the published roots and the single public `./host-seam` export. Compile-time acceptance of a symbol is not proof of tarball or execution behavior. The final version must run exact Node24 clean-installed producer/Tiny/Rich journeys and a deep-import rejection; see `docs/guides/V0102_R01_DOC_COMMANDS.md`.

**No source/deep-distribution import, unpublished registry install claim, Node22 promise, R01 PASS or `main` release claim is made by this document.**
