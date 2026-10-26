# v0.10.2 public API quick reference

This **derived reference** is verified against [Microkernel entry](../../packages/microkernel/src/index.ts), [DomainApp facade source](../../packages/microkernel/src/domain-app.ts), [BUILD entry](../../tooling/build/src/index.ts), [Contracts](../../packages/contracts/src/index.ts), [Node Host](../../packages/host-node/src/index.ts) and package `exports` at the v0.10.2 tag. Frozen ABI/source remain authoritative.

| Stage | Public root | Useful API / interface | Constraints |
| --- | --- | --- | --- |
| Types / shared ABI | `@kaicreator/domain-harness-contracts` | `V10BuiltApp`, `V10DocStore`, scoped selector and error types | Zero runtime deps |
| External producer | `@kaicreator/domain-harness-build` | `buildV10App(options)`, `projectSelectedComponents(declarations, selectedModules)` | Do not import at runtime |
| Consumer | `@kaicreator/domain-harness-microkernel` | `load(app, options): Promise<DomainApp>` | Trusted *prebuilt* App, not raw source |
| Trusted Host bootstrapping | `@kaicreator/domain-harness-microkernel/host-seam` | `activateV10App`, selected identity helpers | API-hygiene boundary, not security token |
| Optional Node physical Host | `@kaicreator/domain-harness-host-node` | `InMemoryCasStore`, `openSqliteCasStore`, durable controls | Native `better-sqlite3` optional peer for selected SQLite path |

## Runtime signatures

~~~ts
import { load, type DomainApp, type LoadAppOptions } from '@kaicreator/domain-harness-microkernel';
import type { V10BuiltApp, V10PublicIntent, V10ScopedSnapshotQuery } from '@kaicreator/domain-harness-contracts';

declare const app: V10BuiltApp; // supplied by trusted external BUILD
declare const options: LoadAppOptions; // supplied by application Host
declare const intent: V10PublicIntent; // business intent
declare const selector: V10ScopedSnapshotQuery; // explicit scoped target

const runtime: DomainApp = await load(app, options);
const receipt = await runtime.send(intent);
const snapshot = await runtime.query(selector);
const many = await runtime.query([selector]); // authorized per-target
const subscription = await runtime.subscribe(selector, event => {
  // Event: kind, occurrenceId, target, optional snapshot.
});
subscription.unsubscribe();
runtime.stop(); // synchronous, idempotent
~~~

The `declare` lines **declare placeholders**, not runnable values. `LoadAppOptions` requires `store: V10DocStore`; optional `tenantId`, `deploymentIdentity`, `queryAuthority`, `deploymentRoot`, `now`. Query/subscribe are **not public grants**: the Host must bind actual caller/target authority. The returned Facade is frozen with exactly four own method keys.

## Errors and typed refusals

| Family | Typical interpretation |
| --- | --- |
| `V10BuildError` / BUILD-* | Invalid graph, role, hash, route, handler or import closure at BUILD |
| `V10ActivationError` / `V10_APP_INVALID` | Invalid prebuilt App or closed/incompatible activation |
| `V10PortDeniedError` | Denied Host/port boundary |
| `V10MultiBQueryError` / `QUERY_SELECTOR_INVALID` | Missing/ambiguous/unauthorized explicit business target |
| `V10ExternalEffectError` | Refused or unresolved governed external effect |
| `V10Error` | Safe fallback for untrusted Host errors |

Public facade sanitizes errors to avoid leaking K doc keys, raw receipts, paths or Host causes. Log safe error codes and redacted context, not the hidden raw internal object. Full error catalog lives in [typed source](../../packages/contracts/src/known-error-codes.ts).

## Do not assume

- `load(packageSource)` accepts an arbitrary unbuilt npm library — it accepts a trusted sealed **App**, and `buildV10App` remains external.
- `subscribe` is synchronous; it actually returns a **Promise** of `{unsubscribe()}`.
- Every helper is a Tool or every S Feature needs a Tool endpoint.
- `./host-seam` proves permission; security depends on actual K permits/Host authorization.
- A tagged source release guarantees package registry publication; manifests still have `0.10.2-rc.0`.
- Node22/Expo/browser/QuickJS production support; this release only physically qualified Node24.

For runnable journeys, copy [public-tarball authoring fixture](../../examples/v0102-package-authoring/README.md) and [clean-installed Tiny/Rich test](../../tests/integration/v010-clean-consumers/clean-consumers.test.ts).
