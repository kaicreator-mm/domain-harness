/**
 * E10 claim 2 — stale/replaced Assembly fails closed for replay of EXISTING
 * pins (issue #680; authority #589 PACK-D E10, DAG #534).
 *
 * T002C replacement-invalidates-currentness semantics at the replay seam:
 *  - a replacement Assembly (re-sealed over the SAME Definition graph with a
 *    replaced Kind implementation pin) is NEVER an acceptable replay target
 *    for an occurrence pinned under the old Assembly — `recover` with the
 *    replacement as `expectedAssembly` fails ASSEMBLY_REPLAY_MISMATCH;
 *  - bare `recover` (no expectedAssembly) resolves the ORIGINAL exact
 *    assemblyDigest — a replacement never silently becomes the replay
 *    target;
 *  - re-activation of the same occurrence under the replacement Assembly
 *    fails GOVERNANCE_EXECUTION_PIN_CONFLICT (bind-once) and the retained
 *    durable pin still carries the original authority;
 *  - replay-time currentness is re-proven, not cached: revoking the exact
 *    package/CDI authority or the exact Governance Baseline body after
 *    activation fails replay closed (PACKAGE_CDI_RECOVERY_MISMATCH /
 *    GOVERNANCE_BASELINE_RECOVERY_MISMATCH), and restoration makes replay
 *    succeed again;
 *  - #658 boundary (Fresh Planning Authority Review, issuecomment-5995416551):
 *    a FRESH occurrence MAY bind a genuine sealed Assembly by exact identity
 *    even after a replacement Assembly exists — #657 was CANCELLED and no
 *    global current-Assembly authority exists. Replay of an EXISTING pin
 *    remains exact-A only (ASSEMBLY_REPLAY_MISMATCH for a replacement).
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import type { ComponentEnvelope } from '../../src/contracts/component.js';
import type { DefinitionGraphEnvelope } from '../../src/contracts/definition-graph.js';
import type { Sha256Port } from '../../src/contracts/identity.js';
import {
  sealRuntimeAssembly,
  type KindImplementationBindingInput,
  type SealedRuntimeAssembly,
} from '../../src/contracts/runtime-assembly.js';
import {
  AssemblyExecutionActivator,
  GovernanceBaselineRegistry,
  GovernanceExecutionBindingError,
  MemoryGovernanceBaselineStore,
  createGovernanceBaselineBody,
  type DurableExecutionStore,
  type ExactPackageCdiAuthority,
  type GovernanceBaselineBody,
  type GovernanceBaselineStore,
  type GovernanceBoundSnapshot,
  type GovernanceExecutionPin,
  type GovernancePackageCdiBinding,
} from '../../src/governance/index.js';
import type { DomainActivationBinding } from '../../src/governance/index.js';

const sha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

function component(componentId: string): ComponentEnvelope {
  return {
    family: 'semantic',
    componentId,
    kind: { kindId: 'example.e10-kind', version: '1.0.0' },
    requiredSemanticContracts: [{ contractId: 'contract.a', version: '1.0.0' }],
    requiredCapabilities: [{ capabilityId: 'cap.a', version: '1.0.0' }],
    semanticBody: { threshold: 10 },
  };
}

function graph(): DefinitionGraphEnvelope {
  return { graphId: 'graph.e10-stale', components: [component('component.a')], relations: [] };
}

function kindBinding(implementationId: string): KindImplementationBindingInput {
  return {
    pin: {
      kind: { kindId: 'example.e10-kind', version: '1.0.0' },
      implementation: {
        implementationId,
        implementationVersion: implementationId === 'impl.alpha' ? '1.0.0' : '2.0.0',
        implementationDigest: `sha256:${implementationId}-content`,
      },
    },
    understoodSemanticContracts: [{ contractId: 'contract.a', version: '1.0.0' }],
    understoodCapabilities: [{ capabilityId: 'cap.a', version: '1.0.0' }],
    validateComponent: () => {},
  };
}

async function sealAssembly(
  implementationId: string,
  definitionGraph: DefinitionGraphEnvelope = graph(),
): Promise<SealedRuntimeAssembly> {
  return sealRuntimeAssembly(
    { definitionGraph, kindImplementations: [kindBinding(implementationId)] },
    sha256,
  );
}

class MemoryExactPackageCdiAuthority implements ExactPackageCdiAuthority {
  readonly #records = new Map<string, GovernancePackageCdiBinding>();

  add(binding: GovernancePackageCdiBinding): void {
    this.#records.set(this.#key(binding), { ...binding });
  }

  remove(binding: GovernancePackageCdiBinding): void {
    this.#records.delete(this.#key(binding));
  }

  async resolveExactPackageCdi(
    binding: GovernancePackageCdiBinding,
  ): Promise<GovernancePackageCdiBinding | undefined> {
    const record = this.#records.get(this.#key(binding));
    return record === undefined ? undefined : { ...record };
  }

  #key(binding: GovernancePackageCdiBinding): string {
    return `${binding.domainId} ${binding.packageId} ${binding.domainIntelligenceContentDigest}`;
  }
}

class MemoryDurableExecutionStore implements DurableExecutionStore {
  readonly events: string[] = [];
  readonly #pins = new Map<string, unknown>();
  readonly #snapshots = new Map<string, unknown>();

  async getGovernanceExecutionPin(workflowInstanceId: string): Promise<unknown> {
    return this.#pins.get(workflowInstanceId);
  }

  async bindGovernanceExecutionPin(
    pin: GovernanceExecutionPin,
  ): Promise<'inserted' | 'existing' | 'conflict'> {
    this.events.push(`pin:${pin.workflowInstanceId}`);
    const existing = this.#pins.get(pin.workflowInstanceId);
    if (existing === undefined) {
      this.#pins.set(pin.workflowInstanceId, pin);
      return 'inserted';
    }
    if (JSON.stringify(existing) === JSON.stringify(pin)) return 'existing';
    return 'conflict';
  }

  async getGovernanceBoundSnapshot(workflowInstanceId: string): Promise<unknown> {
    return this.#snapshots.get(workflowInstanceId);
  }

  async putGovernanceBoundSnapshot(snapshot: GovernanceBoundSnapshot): Promise<void> {
    this.events.push(`snapshot:${snapshot.workflowInstanceId}`);
    this.#snapshots.set(snapshot.workflowInstanceId, snapshot);
  }
}

async function governanceBody(label: string): Promise<GovernanceBaselineBody> {
  return createGovernanceBaselineBody(
    {
      domainId: 'orders',
      governanceId: 'orders-governance',
      schemaVersion: '1',
      version: label,
      semantics: {
        hardInvariants: [{ id: `invariant-${label}`, kind: 'deny-negative-total' }],
        operatorAuthority: label,
      },
    },
    sha256,
  );
}

interface Fixture {
  readonly activator: AssemblyExecutionActivator;
  readonly binding: DomainActivationBinding;
  readonly packageCdi: MemoryExactPackageCdiAuthority;
  readonly baselines: GovernanceBaselineStore;
  readonly baseline: GovernanceBaselineBody;
  readonly assembly: SealedRuntimeAssembly;
  readonly definitionGraph: DefinitionGraphEnvelope;
  readonly store: MemoryDurableExecutionStore;
}

async function fixture(): Promise<Fixture> {
  const definitionGraph = graph();
  const assembly = await sealAssembly('impl.alpha', definitionGraph);
  const baseline = await governanceBody('B1');
  const baselines = new MemoryGovernanceBaselineStore();
  const registry = new GovernanceBaselineRegistry(baselines, sha256);
  await registry.register(baseline);
  const packageCdi = new MemoryExactPackageCdiAuthority();
  const cdi: GovernancePackageCdiBinding = {
    domainId: 'orders',
    packageId: 'pkg-orders-1',
    domainIntelligenceContentDigest: 'cdi-orders-1',
  };
  packageCdi.add(cdi);
  const store = new MemoryDurableExecutionStore();
  const activator = new AssemblyExecutionActivator(store, packageCdi, baselines, sha256);
  const binding: DomainActivationBinding = {
    domainId: 'orders',
    packageId: 'pkg-orders-1',
    domainIntelligenceContentDigest: 'cdi-orders-1',
    governanceBaseline: baseline.identity,
  };
  return { activator, binding, packageCdi, baselines, baseline, assembly, definitionGraph, store };
}

const OCCURRENCE = { workflowTarget: 'orders.fulfill', workflowInstanceId: 'instance-e10-stale' };

function activationRequest(
  fx: Fixture,
  assembly: SealedRuntimeAssembly = fx.assembly,
) {
  return {
    workflowTarget: OCCURRENCE.workflowTarget,
    workflowInstanceId: OCCURRENCE.workflowInstanceId,
    binding: fx.binding,
    assembly,
    currentDefinitionGraph: fx.definitionGraph,
  };
}

function expectBindingError(promise: Promise<unknown>, code: string): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error(`expected GovernanceExecutionBindingError(${code}), but it resolved`);
    },
    (error: unknown) => {
      assert.ok(
        error instanceof GovernanceExecutionBindingError,
        `expected GovernanceExecutionBindingError, got ${String(error)}`,
      );
      assert.equal(error.code, code);
      return error;
    },
  );
}

test('E10-2: a replacement Assembly over the SAME Definition graph is never an acceptable replay target for an existing pin', async () => {
  const fx = await fixture();
  const replacementAssembly = await sealAssembly('impl.bravo', fx.definitionGraph);

  assert.notEqual(
    replacementAssembly.assemblyDigest,
    fx.assembly.assemblyDigest,
    'the replacement has a different exact Assembly identity',
  );
  assert.equal(
    replacementAssembly.record.definitionGraphDigest,
    fx.assembly.record.definitionGraphDigest,
    'the Definition identity is unchanged — replacement invalidates currentness on the Assembly plane only',
  );

  const pin = await fx.activator.activate(activationRequest(fx));

  // Replay against the replacement fails closed, typed.
  await expectBindingError(
    fx.activator.recover({
      workflowInstanceId: OCCURRENCE.workflowInstanceId,
      expectedAssembly: replacementAssembly,
    }),
    'ASSEMBLY_REPLAY_MISMATCH',
  );

  // Bare replay still resolves the ORIGINAL exact Assembly — the replacement
  // never silently becomes the replay target.
  const recovered = await fx.activator.recover({
    workflowInstanceId: OCCURRENCE.workflowInstanceId,
  });
  assert.equal(recovered.assemblyDigest, fx.assembly.assemblyDigest);
  assert.notEqual(recovered.assemblyDigest, replacementAssembly.assemblyDigest);

  // Re-activation of the pinned occurrence under the replacement conflicts
  // (bind-once); the retained durable authority is the original pin.
  await expectBindingError(
    fx.activator.activate(activationRequest(fx, replacementAssembly)),
    'GOVERNANCE_EXECUTION_PIN_CONFLICT',
  );
  const retained = await fx.activator.requireActivatedExecution(OCCURRENCE.workflowInstanceId);
  assert.equal(retained.bindingDigest, pin.bindingDigest, 'old exact authority is retained');
  assert.equal(retained.assemblyDigest, fx.assembly.assemblyDigest, 'never the replacement');
});

test('E10-2: replay-time currentness is re-proven — revoking the exact package/CDI authority mid-life fails replay closed, restoration replays', async () => {
  const fx = await fixture();
  await fx.activator.activate(activationRequest(fx));

  // Revoke the exact package/CDI authority the pin was bound under.
  fx.packageCdi.remove({
    domainId: 'orders',
    packageId: 'pkg-orders-1',
    domainIntelligenceContentDigest: 'cdi-orders-1',
  });
  await expectBindingError(
    fx.activator.recover({ workflowInstanceId: OCCURRENCE.workflowInstanceId }),
    'PACKAGE_CDI_RECOVERY_MISMATCH',
  );

  // Restoration makes replay succeed again — the check is exact-currentness,
  // never a cached activation-time decision.
  fx.packageCdi.add({
    domainId: 'orders',
    packageId: 'pkg-orders-1',
    domainIntelligenceContentDigest: 'cdi-orders-1',
  });
  const recovered = await fx.activator.recover({
    workflowInstanceId: OCCURRENCE.workflowInstanceId,
    expectedAssembly: fx.assembly,
  });
  assert.equal(recovered.assemblyDigest, fx.assembly.assemblyDigest);
});

test('E10-2: replay-time currentness is re-proven — a removed exact Governance Baseline body fails replay closed', async () => {
  const fx = await fixture();
  await fx.activator.activate(activationRequest(fx));

  // The pinned baseline body is garbage-collected (no live retention
  // references hold it in this fixture).
  const collected = await fx.baselines.collectBodyIfUnreferenced(fx.baseline.identity);
  assert.equal(collected, true, 'fixture: the baseline body was removed');

  await expectBindingError(
    fx.activator.recover({ workflowInstanceId: OCCURRENCE.workflowInstanceId }),
    'GOVERNANCE_BASELINE_RECOVERY_MISMATCH',
  );
});

test('E10-2 (#658 boundary): a FRESH occurrence MAY bind a genuine sealed Assembly by exact identity even after a replacement Assembly exists — acceptance, not rejection', async () => {
  const fx = await fixture();
  const replacementAssembly = await sealAssembly('impl.bravo', fx.definitionGraph);
  assert.notEqual(replacementAssembly.assemblyDigest, fx.assembly.assemblyDigest);

  // Occurrence 1 binds the original genuine Assembly A1.
  const pin1 = await fx.activator.activate(activationRequest(fx));

  // After the replacement Assembly A2 exists, a FRESH occurrence (2) MAY
  // still bind the original genuine A1 by exact identity: #658 ruled there is
  // NO global current-Assembly authority (#657 CANCELLED).
  const freshUnderOriginal = await fx.activator.activate({
    workflowTarget: OCCURRENCE.workflowTarget,
    workflowInstanceId: 'instance-e10-stale-fresh-a1',
    binding: fx.binding,
    assembly: fx.assembly,
    currentDefinitionGraph: fx.definitionGraph,
  });
  assert.equal(freshUnderOriginal.assemblyDigest, fx.assembly.assemblyDigest);

  // Equally, a fresh occurrence MAY bind the replacement A2 — each occurrence
  // pins its own exact Assembly identity.
  const freshUnderReplacement = await fx.activator.activate({
    workflowTarget: OCCURRENCE.workflowTarget,
    workflowInstanceId: 'instance-e10-stale-fresh-a2',
    binding: fx.binding,
    assembly: replacementAssembly,
    currentDefinitionGraph: fx.definitionGraph,
  });
  assert.equal(freshUnderReplacement.assemblyDigest, replacementAssembly.assemblyDigest);

  // Replay of each EXISTING pin remains exact-A only: recovery with the wrong
  // Assembly for either occurrence fails closed.
  const recovered1 = await fx.activator.recover({
    workflowInstanceId: OCCURRENCE.workflowInstanceId,
    expectedAssembly: fx.assembly,
  });
  assert.equal(recovered1.pin.bindingDigest, pin1.bindingDigest);
  await expectBindingError(
    fx.activator.recover({
      workflowInstanceId: 'instance-e10-stale-fresh-a2',
      expectedAssembly: fx.assembly,
    }),
    'ASSEMBLY_REPLAY_MISMATCH',
  );
  await expectBindingError(
    fx.activator.recover({
      workflowInstanceId: OCCURRENCE.workflowInstanceId,
      expectedAssembly: replacementAssembly,
    }),
    'ASSEMBLY_REPLAY_MISMATCH',
  );
});

test('E10-2: a mutated (stale) current Definition graph fails replay-adjacent activation closed — no pin is rebound', async () => {
  const fx = await fixture();
  const pin = await fx.activator.activate(activationRequest(fx));
  const writesAfterActivation = fx.store.events.length;

  const staleGraph: DefinitionGraphEnvelope = {
    ...fx.definitionGraph,
    components: [component('component.a')].map((envelope) => ({
      ...envelope,
      semanticBody: { threshold: 999 },
    })),
  };
  await expectBindingError(
    fx.activator.activate({
      workflowTarget: OCCURRENCE.workflowTarget,
      workflowInstanceId: OCCURRENCE.workflowInstanceId,
      binding: fx.binding,
      assembly: fx.assembly,
      currentDefinitionGraph: staleGraph,
    }),
    'ASSEMBLY_DEFINITION_CURRENTNESS_MISMATCH',
  );

  // The original pin is untouched; no additional durable write happened.
  assert.equal(fx.store.events.length, writesAfterActivation);
  const retained = await fx.activator.requireActivatedExecution(OCCURRENCE.workflowInstanceId);
  assert.equal(retained.bindingDigest, pin.bindingDigest);
});
