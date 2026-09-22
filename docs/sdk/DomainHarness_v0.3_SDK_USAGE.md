# DomainHarness v0.3 — SDK Usage Entry Point

This is the short integration entry point for the v0.3 surface of
`@kaicreator/domain-harness`. For the complete API reference, use
**`DomainHarness_v0.3_SDK_REFERENCE.md`**. Coming from v0.2, read
**`docs/migration/DomainHarness_v0.2_TO_v0.3.md`** first. For durable Node/Expo
hosts, read **`docs/integration/DomainHarness_v0.3_HOST_INTEGRATION.md`**.

## What v0.3 adds

v0.3 is **additive** over v0.2. The v0.2 Runtime — the one that boots a Target
Compiled Domain Package and drives Domain Workflow instances — is retained
unchanged. v0.3 composes the authority stack around it:

- **Governance Baseline** — content-addressed governance bodies (Hard
  Invariants + operator authority semantics), retained by exact digest.
- **Domain Activation Binding** — one non-torn exact tuple of
  (domain, package, CDI digest, Governance Baseline) used for new instances.
- **Governance Execution Pin** — the durable, bind-once binding of one workflow
  instance to its exact execution authority, required before any authoritative
  state-changing turn.
- **Central admission** — the single authoritative path from a structured
  decision to an admitted transition with durable effects.
- **Candidate → promotion → activation** — deterministic validation, explicit
  human/operator authority actions, append-once audit, revocation.
- **Runtime Evidence** — append-only, provenance-exact, output-only records.
  Evidence is never execution authority and never replay truth.

## Runnable examples

The fastest honest orientation is the executable example suite. These are real
tests that import the published package by name and run in CI:

```text
packages/domain-harness/tests/examples/
  support.ts                                    volatile in-memory port scaffolding
  domain-workflow-boot.example.test.ts          compiled package -> boot -> pin -> governed turn
  governance-baseline-binding-pin.example.test.ts
  candidate-promotion-activation.example.test.ts
  runtime-evidence.example.test.ts
```

Run them with:

```bash
cd packages/domain-harness
npm run build
node --import tsx --test "tests/examples/*.example.test.ts"
```

Every example boots from a **compiled** Domain Package whose `packageId` is
derived from its content. The examples use volatile in-memory stores so they
run anywhere; **no durability claim is made or implied by them** — durability
is a host concern with its own validation evidence (see the host integration
guide).

## Minimal assembly

```ts
import {
  createDomainRuntimeV3,
  MemoryGovernanceBaselineStore,
  StaticPackageRegistry,
  VolatileAdmissionEffectJournal,
  VolatileRuntimeEvidenceStore,
} from '@kaicreator/domain-harness';

const assembly = await createDomainRuntimeV3({
  packageRegistry: new StaticPackageRegistry([compiledPackage], compiledPackage.manifest.packageId),
  store: runtimeStore,            // RuntimeStore — volatile here, SQLite adapter on a real host
  bindings: hostBindings,         // capabilities + sha256 + secureRandom + expression
  v3: {
    baselines: new MemoryGovernanceBaselineStore(),
    activationAuthority,          // DomainActivationAuthority (host-durable)
    exactPackageCdi,              // ExactPackageCdiAuthority — exact-tuple resolution only
    durableExecution,             // GovernanceExecutionPin + bound snapshots (host-durable)
    effectJournal,                // AdmissionDurableEffectJournal
    effectTools,                  // mutation-capable host Domain Tool port
    evidence: new VolatileRuntimeEvidenceStore(),
  },
});

// Pin one instance to exact authority BEFORE any authoritative turn.
const pin = await assembly.governance.pinExecution({
  workflowTarget: 'order-quote',
  workflowInstanceId: 'order-quote:instance:42',
  binding: {
    domainId: 'orders',
    packageId: compiledPackage.manifest.packageId,
    domainIntelligenceContentDigest: 'cdi-orders-b1',
    governanceBaseline: baseline.identity,
  },
});

// The retained v0.2 capability surface, unchanged:
const opened = await assembly.runtime.openInstance({
  address: { workflowId: 'order-quote', instanceKey: 'instance:42' },
  correlationId: 'corr:1',
  input: {},
});

// The single authoritative v0.3 admission path:
const outcome = await assembly.admitTurn(turnRequest);
```

`assembly.runtime` is the same `DomainRuntime` v0.2 exposes
(`openInstance / send / query / subscribe / recover /
invalidateBusinessSnapshot / awaitIdle / dispose`). `assembly.governance`,
`assembly.activation`, `assembly.admitTurn` and `assembly.evidenceCapture` are
the v0.3 additions.

## Import rule

A downstream project imports only from the package root:

```ts
import { ... } from '@kaicreator/domain-harness';
```

Do not import `src/`, `dist/` internal module paths, engine internals, or
store adapter internals. The public root is the supported consumer contract;
the engine that executes a compiled Domain Workflow definition is an internal
implementation detail and is deliberately unreachable from this surface.

## Ownership boundary

DomainHarness owns generic durable execution mechanics and the v0.3 authority
contracts. The consuming project remains authoritative for:

- domain/business state and rules;
- application APIs and UI;
- databases/repositories and the choice of durable host adapter;
- authentication/authorization;
- credentials and external clients;
- Domain Tool implementations and their effect classification;
- AI provider/model/routing policy behind the AI Runtime port;
- the operator authority process behind promotion/activation actions.

## Fail-closed posture

v0.3 authority seams fail closed by contract: a missing pin, a missing retained
baseline body, an unregistered exact package/CDI tuple, a revoked artifact, or
a conflicting append are errors, never silent substitutions. There is no
floating `current`/`latest`/`active` authority anywhere in the surface —
selection is always by exact content-derived identity (see the migration
guide's forbidden-substitution section).
