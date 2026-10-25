# @kaicreator/domain-harness-host-node

The DomainHarness v0.10.2 Host package for Node: the trusted Host bootstrap
surface that owns every physical, deployment and observation concern around
one selected Domain App. It never implements K State/Admission/Journal/
Effect semantics (the selected kernel owns those) and never imports BUILD or
any legacy package; every activation dependency crosses the Microkernel
`./host-seam`, every shared constant/type comes from Contracts.

```js
import { openSqliteCasStore, activateGovernedV10Build } from '@kaicreator/domain-harness-host-node';

const store = await openSqliteCasStore({ path: 'app.sqlite' }); // real better-sqlite3
const governed = await activateGovernedV10Build(builtApp, {
  store, deployment, decision, authorization,
});
const receipt = await governed.send({ intentType, instanceKey, messageId, input });
governed.close();
```

## Surface (v0.10.2)

- **Physical CAS + memory + durable controls (T03a, #1347)**
  - `sqlite-cas.ts`: the generic `CasDocumentStore` contract, the in-memory
    store, `validateWriteCondition`, `probeTrueCasStore`, `HostBoundaryError`.
  - `sqlite-adapter.ts`: `openSqliteCasStore` / `SqliteCasStore` — the REAL
    `better-sqlite3` revision-CAS store (WAL, restart recovery, cross-process
    locking, fault injection). `better-sqlite3` is an **optional peer**
    (dynamic import); this package has no hard native dependency.
  - `scoped-memory.ts`: `createV10ScopedMemory` — the authorization-scoped
    memory capability (`V10MemoryError`).
  - `durable-controls.ts`: `ExternalWorkCoordinator`, `ChildInvocationCoordinator`,
    `PoisonRecoveryCoordinator` and their doc-key derivations.
- **Governed deployment ledger (T03b, #1325; moved from the legacy Compiler)**
  - `activateGovernedV10Build(app, options)` with `selection: 'CURRENT' |
    'PINNED_ONLY'`, immutable occurrence→BUILD pins, reservation recovery
    (`recoverReservation`) and the `V10DeploymentError` family. The governed
    `counters` option of v0.10.1 is **dropped** (L2 §3); `kCounters(b)`
    returns a fresh copy. K02 scope prefixes and kernel doc-key builders are
    consumed from the LOADED selected kernel through the seam identity — no
    K key grammar is mirrored here.
- **Read-only observation (T03b, moved)**
  - `runShadowL4` (`shadow-l4-readonly.ts`), `runMetaFeedbackWorkflow`
    (`meta-feedback-workflow.ts`), `createDecisionEvidenceObserver`
    (`decision-evidence-observer.ts`). All three accept **only** facades
    branded by the Microkernel activation (`isV10AppFacade`) and read the
    activation-origin shadow binding through `readSelectedShadowBinding` —
    lookalike or prototype-forged facades are refused typed.
- **CT-02 data-only feature invoker (T03b, moved)**
  - `invokeAgentImprovementFeature` / `FeatureInputNotPlainDataError`
    (`ct02-invoker.ts`): the host-owned plain-data boundary for the four
    v0.10.1 agent-improvement standard features.

The optional subpath decomposition planned for finalization (`./shadow`,
`./meta-feedback`, `./decision-evidence`, `./ct02-invoker`) is not yet in the
package export map (manifest changes belong to the exclusive T07 owner);
until then the same surfaces are reachable from this root entry.

## Import direction (frozen, L2 §1.2)

`@kaicreator/domain-harness-contracts` ← this package → `@kaicreator/
domain-harness-microkernel` **only via `./host-seam`**, plus the optional
peer `better-sqlite3` (dynamic import). Importing BUILD, the legacy
Compiler/core packages, or any domain package from here is forbidden and
test-enforced.

## Tests

`packages/host-node/tests/` — physical SQLite CAS/memory/durable-controls
regressions (T03a), the SQLite adapter probes (WAL/CAS/restart/locks/fault),
a real cross-process CAS witness, the governed deployment physical positive
over a real database file, the brand/lookalike/override negatives for the
three moved consumers, and the governed-activation reachability walk.
