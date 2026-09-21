# T-014 L3 — Domain activation binding + durable governance execution pin

**Issue:** #232  
**Branch:** `v0.3_t014`  
**Dependency-complete base authority:** `v0.3@a857ce40e4d94202e7f2ad2b7ab42a480cab9834`  
**Depends on:** T-003 + T-006 (including T-006 repair PR #263)  
**Environment:** `portable-store-contract`  
**L3 status:** IMPLEMENTED — exact-head CI / Build Host handoff / independent review pending

T-014 productionizes the portable authority contract for one exact new-instance activation tuple and one immutable durable per-instance governance execution pin. It intentionally stops before central Workflow admission/effect wiring and before any Node/Expo physical persistence implementation.

The dependency-complete base does not contain a pre-existing individual `T014_*.md` file. T-014 task authority is therefore the combination of Issue #232, `TASK_PACKS.json`, `TASK_ISSUES.md`, the formal v0.3 Task DAG, and the frozen PRD/L2 + Amendment A1 authority.

## 1. Tests

Focused deterministic contract tests are in:

- `packages/domain-harness/tests/governance/execution-binding.test.ts`

They cover:

1. concurrent old/new activation publication exposes only a complete old or complete new tuple;
2. package-only activation movement;
3. governance-only activation movement;
4. full package + CDI + governance tuple movement;
5. governance pin durability before the authoritative state-publication gate returns;
6. snapshot-before-pin rejection;
7. exact persisted recovery of package + CDI + Governance Baseline + snapshot binding;
8. `current` / `latest` / `active` / explicit floating-alias rejection;
9. missing governance pin fail-closed;
10. corrupt governance pin fail-closed;
11. package/CDI/governance mismatch fail-closed;
12. retained old instance authority after a later activation move;
13. idempotent same-exact pin;
14. conflicting re-pin fail-closed;
15. snapshot binding-digest mismatch rejection, both before persistence and on recovery.

The activation and execution fake authorities used by focused fixtures are deterministic logical contract models. They do **not** establish SQLite transaction durability, process-kill/restart survival, Expo persistence, fsync behavior, or cross-host parity. Those claims remain assigned to T-022/T-023/T-024.

## 2. Contract / Interface

Production module:

`packages/domain-harness/src/governance/execution-binding.ts`

### 2.1 `DomainActivationBinding`

The binding reuses the T-003 exact authority components:

```text
domainId
+ exact packageId
+ exact domainIntelligenceContentDigest
+ exact GovernanceBaselineIdentity
```

Governance Baseline remains a separate authority from CDI. `version` remains an operator lifecycle label and is excluded from semantic binding identity; exact baseline `contentDigest` is authority.

`DomainActivationAuthority` is the narrow seam over the existing activation authority. Its required semantics are atomic whole-record read/publication. T-014 never exposes field-wise package/CDI/governance setters, so a caller cannot construct an authorized mixed tuple through this contract.

`DomainActivationBindingCoordinator` validates the complete tuple against the exact package/CDI resolver and the exact retained Governance Baseline body/digest. Only after both resolve exactly is a complete immutable tuple published. New-instance resolution repeats exact validation and returns one immutable binding snapshot.

### 2.2 `GovernanceExecutionPin`

The pin freezes:

```text
domainId
+ workflowTarget
+ workflowInstanceId
+ packageId
+ domainIntelligenceContentDigest
+ exact GovernanceBaselineIdentity
+ bindingDigest
```

`bindingDigest` is the canonical digest of:

```text
packageId
+ domainIntelligenceContentDigest
+ governanceBaseline(domainId, governanceId, schemaVersion, contentDigest)
```

It is an integrity/audit digest only and never replaces the constituent exact identities.

### 2.3 `DurableExecutionStore` seam

T-014 defines only the governance/snapshot methods needed from the already-frozen per-instance `DurableExecutionStore` durability/ordering domain:

```text
getGovernanceExecutionPin
bindGovernanceExecutionPin
getGovernanceBoundSnapshot
putGovernanceBoundSnapshot
```

`bindGovernanceExecutionPin` is contractually atomic and bind-once: first exact pin => `inserted`; repeated same exact pin => `existing`; different authority for the same instance => `conflict` without overwrite.

This is not a second store. The same concrete host store that owns execution-definition pins and control snapshots must implement this narrow seam. Physical Node/Expo implementations are deliberately not added by T-014.

### 2.4 Ordering gates

`GovernanceExecutionCoordinator.pinExecution()` completes only after the store has accepted the exact pin and read-back validation proves the same tuple/digest. `requirePinnedExecution()` is the T-014 gate central authoritative control publication must call; T-019 owns wiring that gate into central Workflow admission/effect publication.

`persistSnapshot()` first requires and validates the exact pin, then requires the snapshot `governanceBindingDigest` to equal the pin digest, and only then calls the same store's snapshot persistence method.

## 3. Implementation

### 3.1 Non-torn activation

Activation mutation is a single complete-record publication. The coordinator never performs independent package/CDI/governance writes. It validates a complete candidate tuple and invokes one atomic publication operation. A concurrent reader therefore has only two legal observations: the complete old record or the complete new record. Host adapters must preserve this single-record/CAS-or-transaction semantic.

### 3.2 Immutable per-instance authority

At instance creation the selected activation tuple is copied into a `GovernanceExecutionPin`. Later activation movement has no path to mutate the persisted pin. The binding digest excludes lifecycle labels and includes every exact execution-authority identity component frozen by A1.

### 3.3 Exact recovery

`recoverGovernanceExecutionAuthority()` accepts no activation authority and no alias/current/latest resolver. Recovery only performs:

```text
load exact persisted GovernanceExecutionPin
→ verify pin shape + canonical bindingDigest
→ resolve exact package/CDI tuple
→ resolve exact Governance Baseline body by exact identity
→ verify Governance Baseline semantic digest
→ load snapshot, if present
→ verify snapshot bindingDigest == pin bindingDigest
```

Because the recovery API has no floating activation lookup dependency, an active/current/latest authority cannot silently replace historical authority.

### 3.4 Floating authority rejection

The exact-authority boundary rejects reserved floating selectors including `current`, `latest`, `active`, `alias:*`, `@current`, `@latest`, and `@active` when presented as execution-authority package/CDI/governance digest tokens.

## 4. Failure Handling

| Condition | Required T-014 behavior |
|---|---|
| no activation binding for a new instance | fail closed; do not start |
| activation package/CDI exact resolver mismatch | fail closed; do not publish/resolve binding |
| activation Governance Baseline body missing/corrupt/mismatched | fail closed |
| floating alias/current/latest/active at execution authority boundary | reject |
| governance pin missing | fail closed / recovery required |
| governance pin malformed/corrupt/binding digest mismatch | fail closed |
| same instance re-pinned with same exact authority | idempotent |
| same instance re-pinned with different authority | conflict; do not overwrite |
| authoritative state-publication gate checked before pin | reject |
| snapshot attempted before pin | `SNAPSHOT_BEFORE_GOVERNANCE_PIN`; do not persist |
| snapshot binding digest differs from pin | reject; do not persist/restore |
| exact package/CDI unavailable during recovery | fail closed |
| exact Governance Baseline body unavailable/corrupt during recovery | `GOVERNANCE_BASELINE_RECOVERY_MISMATCH`; fail closed |
| globally active binding moved after instance creation | retained instance stays on old exact pin |

No recovery fallback to compatible, nearest, current, latest, active, or other floating authority exists.

## 5. Reference / Boundary

Authority consumed:

- Issue #232;
- `docs/implementation/v0.3/TASK_PACKS.json` (`T-014`, #232, `v0.3_t014`, dependencies T-003/T-006, environment `portable-store-contract`);
- `docs/implementation/v0.3/TASK_ISSUES.md`;
- `docs/implementation/DomainHarness_v0.3_TASK_DAG.md`;
- frozen v0.3 PRD;
- PRD Amendment A1 + freeze record;
- frozen v0.3 L2;
- L2 Amendment A1 + freeze record, especially A1 §7 and §14;
- T-003 final merged authority PR #250;
- T-006 final authority plus repair PR #263;
- `.dev-standard/VERSION` pinned to `ai-development-standard@0446f04583f6cf464c835f26e2f657c8b703cb4e`;
- `.dev-standard/PROJECT_OVERRIDES.md`;
- actual refreshed dependency-complete integration baseline `v0.3@a857ce40e4d94202e7f2ad2b7ab42a480cab9834`.

Deliberately deferred:

- T-015 promotion-vs-activation operator authority;
- T-017 promoted child runtime;
- T-018 DecisionResolver;
- T-019 central Workflow admission/effect wiring;
- T-021 runtime assembly/public central wiring;
- T-022 Node SQLite/process-kill durability implementation and proof;
- T-023 Expo/Hermes/`expo-sqlite` durability implementation and proof;
- T-024 cross-host parity/retention closure.

The deterministic focused tests are store-contract evidence only and must not be presented as real host durability PASS.
