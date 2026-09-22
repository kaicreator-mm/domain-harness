// T-025 example 2 — Governance Baseline, activation binding, and execution pin.
//
// The governance lifecycle a consumer wires up:
//   1. author a Domain Governance Baseline body (Hard Invariants + operator
//      authority semantics) — its contentDigest is the identity, the version
//      label is display only;
//   2. retain the exact body in the baseline store so pinned executions stay
//      recoverable;
//   3. publish the DomainActivationBinding (one non-torn package + CDI digest
//      + Governance Baseline tuple) used for NEW instance creation;
//   4. pin a workflow instance: the GovernanceExecutionPin becomes durable
//      before any authoritative state-changing turn;
//   5. recover with the exact pin only.
//
// Forbidden by contract and demonstrated below: recovering through a floating
// `current`/`latest`/`active` selector, or letting a baseline movement rewrite
// an already-running instance's pin. All stores are volatile (support.ts).
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DomainActivationBindingCoordinator,
  GovernanceBaselineRegistry,
  GovernanceContractError,
  GovernanceExecutionBindingError,
  GovernanceExecutionCoordinator,
  MemoryGovernanceBaselineStore,
  createGovernanceBaselineBody,
  recoverGovernanceExecutionAuthority,
  type DomainActivationBinding,
  type GovernanceBaselineBody,
} from '@kaicreator/domain-harness';
import {
  VolatileActivationAuthority,
  VolatileDurableExecutionStore,
  VolatileExactPackageCdiAuthority,
  buildCompiledPackage,
  exampleSha256,
} from './support.js';

const DOMAIN_ID = 'orders';
const WORKFLOW_ID = 'order-quote';
const WORKFLOW_INSTANCE_ID = 'order-quote:instance:42';

function orderBaseline(version: string, cap: number): Promise<GovernanceBaselineBody> {
  return createGovernanceBaselineBody({
    domainId: DOMAIN_ID,
    governanceId: 'orders-governance',
    schemaVersion: '1',
    version,
    semantics: {
      hardInvariants: [
        {
          invariantId: 'inv:cap',
          predicate: {
            op: 'not',
            predicate: {
              op: 'gt',
              left: { source: 'event', path: ['payload', 'amount'] },
              right: { source: 'literal', value: cap },
            },
          },
        },
      ],
      operatorAuthority: version,
    },
  }, exampleSha256);
}

async function governanceStack() {
  const compiledPackage = await buildCompiledPackage();
  const b1 = await orderBaseline('B1', 100);
  const b2 = await orderBaseline('B2', 250);

  const baselines = new MemoryGovernanceBaselineStore();
  await baselines.putBody(b1);
  await baselines.putBody(b2);

  const packageCdi = new VolatileExactPackageCdiAuthority();
  const bindingB1: DomainActivationBinding = {
    domainId: DOMAIN_ID,
    packageId: compiledPackage.manifest.packageId,
    domainIntelligenceContentDigest: 'cdi-orders-b1',
    governanceBaseline: b1.identity,
  };
  packageCdi.registerExactPackageCdi(bindingB1);

  const activationAuthority = new VolatileActivationAuthority();
  const activation = new DomainActivationBindingCoordinator(
    activationAuthority,
    packageCdi,
    baselines,
    exampleSha256,
  );
  const durableExecution = new VolatileDurableExecutionStore();
  const governance = new GovernanceExecutionCoordinator(durableExecution, exampleSha256);
  const registry = new GovernanceBaselineRegistry(baselines, exampleSha256);
  return { activation, baselines, durableExecution, governance, packageCdi, registry, bindingB1, b1, b2 };
}

test('example: baseline identity is its content digest, never the version label', async () => {
  const { b1, b2 } = await governanceStack();
  assert.notEqual(b1.identity.contentDigest, b2.identity.contentDigest);
  assert.equal(b1.identity.version, 'B1', 'version is an operator-facing label only');
  assert.ok(/^[0-9a-f]{64}$/.test(b1.identity.contentDigest));
});

test('example: publish one non-torn activation binding and resolve it for a new instance', async () => {
  const stack = await governanceStack();
  await stack.activation.publish(stack.bindingB1);

  const resolved = await stack.activation.resolveForNewInstance(DOMAIN_ID);
  assert.deepEqual(resolved, stack.bindingB1);

  // Publishing fails closed when the exact baseline body is not retained.
  const stranger: DomainActivationBinding = {
    ...stack.bindingB1,
    governanceBaseline: { ...stack.b1.identity, contentDigest: '0'.repeat(64) },
  };
  await assert.rejects(
    () => stack.activation.publish(stranger),
    (error: unknown) =>
      error instanceof GovernanceExecutionBindingError
      && error.code === 'GOVERNANCE_BASELINE_BINDING_MISMATCH',
  );
});

test('example: the execution pin is durable before authoritative work and recovery is exact', async () => {
  const stack = await governanceStack();
  await stack.activation.publish(stack.bindingB1);

  const pin = await stack.governance.pinExecution({
    workflowTarget: WORKFLOW_ID,
    workflowInstanceId: WORKFLOW_INSTANCE_ID,
    binding: stack.bindingB1,
  });
  assert.equal(pin.governanceBaseline.contentDigest, stack.b1.identity.contentDigest);

  // Same exact pin is idempotent; a different pin for the instance never overwrites.
  const rebound = await stack.durableExecution.bindGovernanceExecutionPin(pin);
  assert.equal(rebound, 'existing');

  await stack.governance.persistSnapshot({
    workflowInstanceId: WORKFLOW_INSTANCE_ID,
    governanceBindingDigest: pin.bindingDigest,
    snapshot: { marker: 'control-position-1' },
  });

  const recovered = await recoverGovernanceExecutionAuthority({
    workflowInstanceId: WORKFLOW_INSTANCE_ID,
    store: stack.durableExecution,
    packageCdiAuthority: stack.packageCdi,
    baselines: stack.baselines,
    sha256: exampleSha256,
  });
  assert.equal(recovered.pin.bindingDigest, pin.bindingDigest);
  assert.equal(recovered.governanceBaseline.identity.contentDigest, stack.b1.identity.contentDigest);
  assert.equal(recovered.snapshot?.governanceBindingDigest, pin.bindingDigest);
});

test('example: baseline movement re-targets new instances but never rewrites the running pin', async () => {
  const stack = await governanceStack();
  await stack.activation.publish(stack.bindingB1);
  const pin = await stack.governance.pinExecution({
    workflowTarget: WORKFLOW_ID,
    workflowInstanceId: WORKFLOW_INSTANCE_ID,
    binding: stack.bindingB1,
  });

  // Governance activates B2 for FUTURE bindings; the running instance stays on B1.
  const bindingB2: DomainActivationBinding = {
    ...stack.bindingB1,
    domainIntelligenceContentDigest: 'cdi-orders-b2',
    governanceBaseline: stack.b2.identity,
  };
  stack.packageCdi.registerExactPackageCdi(bindingB2);
  await stack.activation.publish(bindingB2);

  const freshBinding = await stack.activation.resolveForNewInstance(DOMAIN_ID);
  assert.equal(freshBinding.governanceBaseline.contentDigest, stack.b2.identity.contentDigest);

  const recovered = await recoverGovernanceExecutionAuthority({
    workflowInstanceId: WORKFLOW_INSTANCE_ID,
    store: stack.durableExecution,
    packageCdiAuthority: stack.packageCdi,
    baselines: stack.baselines,
    sha256: exampleSha256,
  });
  assert.equal(
    recovered.governanceBaseline.identity.contentDigest,
    stack.b1.identity.contentDigest,
    'recovery continues under the exact pinned baseline — no silent rebase',
  );
  assert.equal(recovered.pin.bindingDigest, pin.bindingDigest);
});

test('example: recovery fails closed when the pinned baseline body is missing', async () => {
  const stack = await governanceStack();
  await stack.activation.publish(stack.bindingB1);
  await stack.governance.pinExecution({
    workflowTarget: WORKFLOW_ID,
    workflowInstanceId: WORKFLOW_INSTANCE_ID,
    binding: stack.bindingB1,
  });

  // A store that lost the exact body must not substitute anything else.
  const emptyBaselines = new MemoryGovernanceBaselineStore();
  await assert.rejects(
    () =>
      recoverGovernanceExecutionAuthority({
        workflowInstanceId: WORKFLOW_INSTANCE_ID,
        store: stack.durableExecution,
        packageCdiAuthority: stack.packageCdi,
        baselines: emptyBaselines,
        sha256: exampleSha256,
      }),
    (error: unknown) =>
      error instanceof GovernanceExecutionBindingError
      && error.code === 'GOVERNANCE_BASELINE_RECOVERY_MISMATCH',
  );
});

test('example: baseline bodies are retained while recoverable references need them', async () => {
  const stack = await governanceStack();
  await stack.activation.publish(stack.bindingB1);
  await stack.registry.retain({
    referenceId: 'retention:order-quote:instance:42',
    reason: 'recoverable-execution',
    baseline: stack.b1.identity,
    authorityBinding: stack.bindingB1,
  });

  // Collection is refused while the retention reference is live.
  await assert.rejects(
    () => stack.registry.collect(stack.b1.identity),
    (error: unknown) =>
      error instanceof GovernanceContractError && error.code === 'GOVERNANCE_BASELINE_RETAINED',
  );

  const count = await stack.registry.referenceCount(stack.b1.identity);
  assert.equal(count, 1);
});
