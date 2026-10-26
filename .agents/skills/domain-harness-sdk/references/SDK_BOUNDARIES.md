# Exact v0.10.2 SDK surface and trust boundaries

**Pinned tagged source:** `cee14399d9d0af4e20e34b9111861b16a465b690`. Read its four `package.json` export maps and source code rather than guessing methods. New main docs may be newer than tagged code.

| Owner | Public root / source location | Allowed | Forbidden |
| --- | --- | --- | --- |
| Contracts | `@kaicreator/domain-harness-contracts`; `packages/contracts/src/index.ts` | ABI, digest, types, error identities | Runtime admission/effect implementation |
| External producer | `@kaicreator/domain-harness-build`; `tooling/build/src/index.ts` | `buildV10App`, `projectSelectedComponents`, sealed module selection | Runtime/Host state decisions, private Compiler imports |
| Runtime | `@kaicreator/domain-harness-microkernel`; `packages/microkernel/src/domain-app.ts` | `load(app, options)`, `send/query/subscribe/stop`, error redaction | Recreating Kernel admission/journal/replay; importing BUILD |
| Node Host (optional) | `@kaicreator/domain-harness-host-node`; `packages/host-node/src/index.ts` | `InMemoryCasStore`, `openSqliteCasStore` and declared ports | Inventing business policy, bypassing K permit |
| Trusted Host bootstrap | `@kaicreator/domain-harness-microkernel/host-seam` | exact enumerated activation/identity helpers | Assuming seam import = authorization |
| Selected Domain Packages | K/S/B/C Package payloads | K durable authority; S semantic logic; B workflows; C declared operations | Dynamic unselected exports, universal auto-Tool registration |

Runtime TS shape (illustrative, **not standalone**):

~~~ts
import { load } from '@kaicreator/domain-harness-microkernel';
const runtime = await load(prebuiltApp, { store, queryAuthority });
const receipt = await runtime.send(intent);
const answer = await runtime.query(selector);
const subscription = await runtime.subscribe(selector, event => observe(event));
subscription.unsubscribe();
runtime.stop();
~~~

The application **must supply all six identifiers above**: sealed `prebuiltApp`, `store`, scoped `queryAuthority`, `intent`, `selector` and callback `observe`. `subscribe` is async. `stop` is synchronous/idempotent. `query` also takes a scoped selector array. K owns replay and changed-input conflict. Host native SQLite is optional; `better-sqlite3` is a peer for chosen SQLite use.

Do not confuse **Node24 physically qualified** with all operating systems, Node majors or a 128GB requirement. The tagged public manifest versions are `0.10.2-rc.0`: a Git tag does not imply registry publication. Full RQ was **CONDITIONAL**, with source-limited exception; historical `npm test EXIT1`/`test:root NOT_RUN` cannot be relabeled.

**Real fixtures:** `examples/v0102-package-authoring/`, `examples/v0102-external-producer/` and `tests/integration/v010-clean-consumers/clean-consumers.test.ts`. To inspect remotely use pinned GitHub paths under https://github.com/kaicreator-mm/domain-harness/tree/v0.10.2. Full user/Agent docs on current main: https://github.com/kaicreator-mm/domain-harness/blob/main/docs/v0.10.2/README.md.
