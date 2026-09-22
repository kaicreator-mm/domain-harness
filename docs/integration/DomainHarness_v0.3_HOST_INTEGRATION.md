# DomainHarness v0.3 — Host Integration Guide (Node / Expo)

This guide covers integrating the v0.3 surface of
`@kaicreator/domain-harness` on the two supported durable hosts:

- **`@kaicreator/domain-harness-node`** — Node.js hosts, SQLite via
  `better-sqlite3`.
- **`@kaicreator/domain-harness-expo`** — Expo / React Native (Hermes) hosts,
  SQLite via `expo-sqlite`.

The portable core owns all runtime and authority semantics; the host packages
own only storage/durability adapters and host capabilities. Everything in this
guide composes the public package roots — do not import `src/` or `dist/`
internal paths from any package.

## 1. What a host provides

A v0.3 host assembles three layers:

1. **The v0.2 runtime layer** (unchanged): a `RuntimeStore`, a
   `PackageRegistry` over the compiled Domain Package, and
   `RuntimeHostBindings` (capabilities, SHA-256, secure random, expression
   evaluation, optional remote transports).
2. **The v0.3 authority stores**: Governance Baseline store, activation-binding
   authority, exact package/CDI authority, durable execution store (pins +
   bound snapshots), durable admission effect journal, evidence sink,
   promoted-artifact store, authority audit store, dynamic-child pin store,
   semantic cache, Harness execution journal.
3. **The assembly**: `createDomainRuntimeV3({ packageRegistry, store,
   bindings, v3: { … } })`.

## 2. Node host

```ts
import { createDomainRuntimeV3 } from '@kaicreator/domain-harness';
import {
  NodeSqliteRuntimeStore,
  openNodeSqliteAuthorityStores,
} from '@kaicreator/domain-harness-node';

const store = new NodeSqliteRuntimeStore({ path: '/var/app/domain-harness.sqlite' });
const authorities = openNodeSqliteAuthorityStores({ path: '/var/app/domain-harness-authority.sqlite' });

const assembly = await createDomainRuntimeV3({
  packageRegistry,
  store,
  bindings: nodeHostBindings,
  v3: {
    baselines: authorities.baselines,
    activationAuthority: authorities.activation,
    exactPackageCdi: authorities.exactPackageCdi,
    durableExecution: /* Node durable execution store (pins + snapshots) */,
    effectJournal: authorities.admissionEffectJournal,
    effectTools: hostEffectTools,
    evidence: authorities.evidence,
  },
});
```

`openNodeSqliteAuthorityStores` returns one bundle — `baselines`,
`activation`, `exactPackageCdi`, `promotedArtifacts`, `semanticCache`,
`dynamicChildPins`, `authorityAudit`, `evidence`, `harnessJournal`,
`admissionEffectJournal` — plus `close()`. Individual store classes
(`NodeSqliteGovernanceBaselineStore`, `NodeSqlitePromotedArtifactStore`,
`NodeSqliteAuthorityAuditStore`, `NodeSqliteAdmissionEffectJournal`,
`NodeSqliteExactSemanticCacheStore`, `NodeSqliteHarnessExecutionJournalStore`,
`NodeSqliteRuntimeEvidenceStore`, …) are exported for hosts that wire stores
individually.

Schema management is explicit and versioned: `applyNodeSqliteMigrations` /
`NODE_SQLITE_RUNTIME_STORE_MIGRATIONS` apply additive migrations recorded in a
schema ledger. **A database newer than the adapter is rejected, never
downgraded or silently read** — upgrade the package instead of opening a newer
database with an older adapter.

## 3. Expo host

```ts
import { createDomainRuntimeV3 } from '@kaicreator/domain-harness';
import {
  ExpoSqliteRuntimeStore,
  openExpoSqliteAuthorityStores,
} from '@kaicreator/domain-harness-expo';
```

The Expo adapters mirror the Node surface (`ExpoSqliteRuntimeStore`,
`ExpoSqliteGovernanceBaselineStore`, `ExpoSqliteDomainActivationAuthority`,
`ExpoSqliteExactPackageCdiAuthority`, `ExpoSqlitePromotedArtifactStore`,
`ExpoSqliteAuthorityAuditStore`, `ExpoSqliteDynamicChildPinStore`,
`ExpoSqliteAdmissionEffectJournal`, `ExpoSqliteExactSemanticCacheStore`,
`ExpoSqliteHarnessExecutionJournalStore`, `ExpoSqliteRuntimeEvidenceStore`,
`openExpoSqliteAuthorityStores`). Writes are serialized through the host's
exclusive transaction queue; the schema version is exported as
`EXPO_RUNTIME_STORE_SCHEMA_VERSION`, and the same newer-than-adapter rejection
applies.

Host entry points `createNodeDomainRuntime` / `createExpoDomainRuntime` remain
the v0.2-capability hosts (HTTP transport wiring); v0.3 assembly goes through
`createDomainRuntimeV3` exactly as on any other host.

## Durability claims are established only by dedicated validation evidence

The durable stores in this guide carry durability claims **only** to the extent
that dedicated validation executions established them. API shape, code review,
or the fact that SQLite is durable technology are not durability evidence.

The executed evidence anchors are:

- **T-022** — Node host persistence validation (`@kaicreator/domain-harness-node`
  v0.3 stores): crash/restart, journal-first effect recovery, governance pin
  and snapshot durability, retention and cache bounds. Merged on `v0.3` as PR
  #289 (merge commit `efc9917`).
- **T-023** — Expo host persistence validation
  (`@kaicreator/domain-harness-expo`): the same authority/durability adapter
  surface over `expo-sqlite`, plus the two-phase on-device Hermes harness
  (E1–E10). Merged on `v0.3` as PR #290 (merge commit `2d3ba3b`).
- **T-024** — cross-host conformance: schema parity and byte-identical durable
  operation dumps across the Node and Expo stacks, migration/retention vectors
  M1–M7 (fail-closed pre-authority files, exact-authority recovery, retention
  tombstones, revocation surviving reopen, bounded cache
  eviction/quarantine/invalidation, newer-than-adapter rejection). Merged on
  `v0.3` as PR #292 (merge commit `8c530b8`). The T-024 cross-host parity
  driver is logical-parity infrastructure: it proves the two adapter stacks
  produce byte-identical durable state under the same operations; it is not
  itself a device or filesystem durability proof.

When you make a durability statement about your own deployment (hardware, OS,
SQLite configuration, filesystem), treat it as unestablished until your own
dedicated validation run covers it; cite the upstream task evidence for the
adapter semantics, and your own evidence for your environment.

The volatile in-memory stores used in the SDK examples
(`packages/domain-harness/tests/examples/`) make **no** durability claim and
must not be cited as durability evidence for anything.

## 4. Operational notes

- **Close order**: dispose the runtime (`assembly.runtime.dispose()`), then
  close the store handles the host owns. The runtime does not close injected
  host resources; the host closes them after `dispose()` resolves.
- **One writer**: both SQLite adapters assume single-writer access to their
  database files (WAL on Node; the exclusive transaction queue on Expo). Do
  not open the same authority database from two processes.
- **Backups**: back up database files only through a quiesced writer or the
  SQLite backup API; copying live WAL files is not a consistent backup.
- **Time**: admission and evidence accept explicit logical timestamps (`now`);
  keep host clocks sane, but never let wall-clock corrections rewrite durable
  records — they are append-once.
