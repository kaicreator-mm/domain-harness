# DomainHarness

DomainHarness is a **Domain Package runtime SDK** with a minimal Microkernel and package-owned domain behavior. This is the **v0.10.2 development candidate**, **not** a qualified release or a claim that `main` already contains it.

## v0.10.2 ownership

| Public npm workspace | Owns | Does not own |
| --- | --- | --- |
| `@kaicreator/domain-harness-contracts` | Shared ABI, canonical hashes and typed contracts | Business admission or external effects |
| `@kaicreator/domain-harness-build` | Offline BUILD, static sealed K/S/B/C selection, Component producer projection | Runtime/Host execution |
| `@kaicreator/domain-harness-microkernel` | `load(app, options)`, public `send/query/subscribe/stop` and trusted `./host-seam` | K state, journal, replay or effect policy |
| `@kaicreator/domain-harness-host-node` | Optional Node Host CAS/SQLite and governed adapters | BUILD or K-owned policy |

The Kernel Primary, Standard Primary and their extensions are **Domain Packages**, not implementation code that belongs to the Microkernel. A trusted producer seals the selected App **before** loading it; runtime never discovers packages or recompiles them.

```text
External producer: selected Domain Packages -> BUILD -> sealed plain-data App
                                                      |
Runtime: optional Host ports -> Microkernel.load(App) -> public Facade
                                                      |
                         Kernel Primary owns state/admission/journal/effects
                         Standard Primary and Business Packages own domain logic
```

**v0.10.2 Node policy:** package `engines.node >=24.0.0`; Node24 is the only physically qualified lane. These are a monorepo's development artifacts, not published registry dependencies by assumption.

## Public SDK surface (current v0.10.2 candidate)

```ts
import { load } from '@kaicreator/domain-harness-microkernel';
import { buildV10App, projectSelectedComponents } from '@kaicreator/domain-harness-build';

// BUILD executes separately, with already-authorized selected modules:
const app = buildV10App(buildOptions);
// Runtime receives only the trusted prebuilt App and an approved document store:
const runtime = await load(app, { store, queryAuthority });
const receipt = await runtime.send(intent);
const answer = await runtime.query(selector);
const subscription = await runtime.subscribe(selector, event => observe(event));
subscription.unsubscribe();
runtime.stop();
```

`buildOptions`, `store`, `queryAuthority`, `intent` and `selector` above are explicitly supplied application inputs, not globals supplied by the SDK. `subscribe` is async and returns an object with `unsubscribe()`; `stop()` is synchronous and idempotent. Never supply a caller-forged principal/grant as runtime authority. Only the Kernel Primary decides admission/effect eligibility.

Only these package roots are distributable. The four old `domain-harness{,-compiler,-node,-expo}` workspaces are private legacy test shims; retired Compiler `/v10*` public exports have been removed. Deep `src/` or `dist/` imports are not an SDK contract.

## Start here

- [Public API, package/ABI and Component map](docs/sdk/V0102_PUBLIC_API.md)
- [Tiny/Rich and external producer guide](docs/guides/V0102_TINY_RICH.md)
- [v0.10.1 → v0.10.2 migration](docs/migration/MIGRATING_V0101_TO_V0102.md)
- [Version candidate command/acceptance inventory](docs/validation/v0.10.2/T08B_R01_DOC_COMMANDS.md)
- [Cross-version architecture constraints](docs/architecture/DOMAIN_APP_CROSS_VERSION_PRINCIPLES.md)
- [Existing clean-consumer fixture](examples/v010-clean-consumer/README.md) (T09 is re-qualifying it against the new public package graph)

**Local scoped preflight, from the monorepo root on Node24:**

```sh
npm ci
npm run build
npm run lint
npm run typecheck
node --import tsx --test tests/compiler/v0102-tarball-inventory.test.ts
```

These commands are an **execution recipe**, not evidence they have all run at the final version SHA. Real Tiny/Rich clean install, external producer, docs command execution and full/hidden/critical regression belong to T09/R01. `PR PASS != Release PASS`. No `main` integration or tag is authorized until release qualification.
