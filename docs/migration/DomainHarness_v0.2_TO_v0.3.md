# DomainHarness v0.2 → v0.3 Migration Guide

**Status:** ACTIVE for the v0.3 integration line

v0.3 is **additive** over v0.2. It does not rename, remove, or re-semantics any
v0.2 API. It composes the governance/admission/evidence authority stack around
the one existing Runtime, and it makes authority **exact and durable**: every
authoritative turn runs under a durable Governance Execution Pin bound to an
exact (package, CDI digest, Governance Baseline) tuple.

This guide covers what existing v0.2 integrations must add, what they must not
do, and how the new pieces map to concepts a v0.2 consumer already has.

## 1. Migration in one picture

v0.2:

```text
Build / CI:   Raw Domain Package -> compiler -> Target Compiled Domain Package
App startup:  compiled package + PackageRegistry + RuntimeStore + Host Bindings
              -> createDomainRuntime -> openInstance/send/query/subscribe/recover
```

v0.3:

```text
Build / CI:   unchanged (compiler output is the same compiled artifact)

App startup:  compiled package + PackageRegistry + RuntimeStore + Host Bindings
              + v3 authority ports:
                baselines / activationAuthority / exactPackageCdi /
                durableExecution / effectJournal / effectTools / evidence
              -> createDomainRuntimeV3
              -> runtime (retained, unchanged)
              -> governance.pinExecution(instance) BEFORE authoritative turns
              -> admitTurn(...)  (the single authoritative admission path)
              -> evidence captured on every outcome
```

## 2. What does not change

- `DomainRuntime` and its whole surface
  (`openInstance / send / query / subscribe / recover /
  invalidateBusinessSnapshot / awaitIdle / dispose`) are retained unchanged.
  `createDomainRuntimeV3` returns it as `assembly.runtime`.
- The Target Compiled Domain Package format and the compiler toolchain.
- `RuntimeStore`, `PackageRegistry`, `RuntimeHostBindings` contracts.
- Existing v0.2 behavior for applications that do not opt into v0.3: the v0.2
  entry points remain and are not deprecated by this migration.

## 3. What to add

| Step | API | Why |
| --- | --- | --- |
| Author + retain governance baselines | `createGovernanceBaselineBody`, `GovernanceBaselineRegistry.register` | Hard Invariants and operator authority semantics, identity = content digest |
| Register the exact package/CDI tuples you will run | `ExactPackageCdiAuthority.registerExactPackageCdi` (host port) | activation publication and recovery re-resolve this exact tuple |
| Publish the activation binding | `DomainActivationBindingCoordinator.publish` | one non-torn exact authority tuple for new instances |
| Pin every instance before authoritative work | `GovernanceExecutionCoordinator.pinExecution` | the durable pin is required for admission and snapshot persistence |
| Route authoritative turns through admission | `assembly.admitTurn(request)` | schema + pinned Hard Invariants + guard + transition + journaled effects |
| Persist control snapshots bound to the pin | `governance.persistSnapshot` | snapshots are recoverable only against the exact pin digest |
| Provide the evidence sink | `RuntimeEvidencePort` | decision/failure evidence on every admission, append-only |
| Recover by exact pin | `recoverGovernanceExecutionAuthority` | restart restores exactly the pinned authority, nothing else |

The executable, CI-run versions of these steps are in
`packages/domain-harness/tests/examples/` (see `docs/sdk/README.md`).

## Forbidden: silent floating-authority substitution

v0.3 has **no** floating authority pointers. Do not introduce them in
integration code:

- Never resolve "the current package" / "the current baseline" / "the active
  version" at runtime and pass it where an exact identity is expected. Silent
  substitution of `current`, `latest`, or `active` for an exact content-derived
  identity is a contract violation, even if the value happens to be right
  today.
- Never let a Governance Baseline movement (publishing a new activation
  binding) rewrite the pin of an already-running instance. New instances
  resolve the new binding; running instances recover under their exact pinned
  authority. `pinExecution` is bind-once and a conflicting rebind throws
  `GOVERNANCE_EXECUTION_PIN_CONFLICT`.
- Never recover an instance through a name or alias lookup.
  `recoverGovernanceExecutionAuthority` resolves only the durable exact pin
  and the retained exact baseline body; if the pinned body is gone it fails
  closed (`GOVERNANCE_BASELINE_RECOVERY_MISMATCH`) instead of substituting the
  newest baseline.
- Never promote or activate through validation alone. Validation grants no
  execution permission; promotion and activation are separate explicit
  human/operator authority actions with append-once audit.
- Never treat Runtime Evidence as execution truth. Evidence records declare
  `executionAuthority: 'none'`; replay identity belongs to the durable
  journals only.

If a migration shim in your codebase maps a floating selector onto a v0.3
authority seam, remove the shim and pass the exact identity instead.

## 4. Store and host migration

v0.2 persisted rows are **historical data, not authority**. There is no
semantic import of v0.2 runtime rows into the v0.3 authority stores: the v0.3
authority schema is built explicitly, and every entry is bound to exact
authority (content-derived package identity, exact CDI digest, retained exact
Governance Baseline body) at the time it is written. A v0.2 database is never
reinterpreted as v0.3 authority.

Pre-authority files fail closed by contract: an instance with no durable pin
has no recovery and no snapshot path (`GOVERNANCE_EXECUTION_PIN_MISSING`,
`SNAPSHOT_BEFORE_GOVERNANCE_PIN`), and a file written before the authority
schema exists is migrated through the versioned ledger or rejected — never
guessed at. The executed evidence for this behavior is the T-024
migration/retention matrix (M1 pre-authority fail-closed + drift guard, M2
exact-authority recovery), merged on `v0.3` as PR #292.

The v0.3 authority stores (baselines, activation authority, package/CDI
authority, execution pins/snapshots, effect journal, evidence, promoted
artifacts, semantic cache) have durable SQLite adapters in the host packages
(`@kaicreator/domain-harness-node`, `@kaicreator/domain-harness-expo`). Both
hosts version their schemas and migrate in place; a database newer than the
adapter is rejected rather than downgraded. See
`docs/integration/DomainHarness_v0.3_HOST_INTEGRATION.md` for setup and for
the validation evidence behind the durability claims.

Volatile in-memory references (`MemoryGovernanceBaselineStore`,
`MemoryPromotedArtifactStore`, `MemoryAuthorityAuditStore`,
`VolatileAdmissionEffectJournal`, `VolatileRuntimeEvidenceStore`,
`VolatileExactSemanticCacheStore`) exist for tests, examples and non-durable
environments. They make no durability claim.

## 5. Behavior changes to expect

- A v0.2 application that adds the v0.3 seam will see authoritative turns fail
  closed with `GOVERNANCE_EXECUTION_PIN_MISSING` until instances are pinned.
  This is intentional: pin first, then admit.
- Snapshots persisted without a pin fail with
  `SNAPSHOT_BEFORE_GOVERNANCE_PIN`.
- Admission denials are outcomes, not exceptions: inspect
  `outcome.denial.reason` (`schema`, `hard-invariant`, `guard`,
  `no-candidate-transition`).
- Evidence append failures never rewrite an admission outcome; observe them
  through the `onEvidenceError` secondary channel.
