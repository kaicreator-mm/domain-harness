/**
 * E10 claim 4 — no torn activation/currentness evidence
 * (issue #680; authority #589 PACK-D E10, DAG #534).
 *
 * Mid-flight caller/authority mutation at async seams can never produce
 * hybrid or torn activation/currentness evidence:
 *  - during `activate`, adversarial mutation of every caller-owned authority
 *    input (binding, current Definition graph) at a gated digest await leaves
 *    the durable pin reflecting the synchronous PHASE-1 snapshot;
 *  - during `recover`, mutation of the caller-held Definition graph reference
 *    mid-flight changes nothing (replay never re-reads caller objects after
 *    an await), and revoking the exact package/CDI authority mid-flight fails
 *    replay closed (PACKAGE_CDI_RECOVERY_MISMATCH) instead of resolving torn
 *    currentness;
 *  - the recovered pin is byte-identical to the activated pin — no torn
 *    hybrid evidence exists across the async seams.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import type { ComponentEnvelope } from '../../src/contracts/component.js';
import {
  computeDefinitionGraphDigest,
  type DefinitionGraphEnvelope,
} from '../../src/contracts/definition-graph.js';
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

/**
 * A Sha256Port whose next digest call blocks until the test releases it, so
 * the test can interleave adversarial mutation mid-await. Used AFTER fixture
 * construction, so it must gate the next digest rather than an absolute
 * counter value.
 */
class GatedSha256 implements Sha256Port {
  #gate: { readonly entered: () => void; readonly release: () => Promise<void> } | undefined;

  pauseNext(): { readonly entered: Promise<void>; readonly release: () => void } {
    let enteredResolve!: () => void;
    let releaseResolve!: () => void;
    const entered = new Promise<void>((resolve) => {
      enteredResolve = resolve;
    });
    const releasePromise = new Promise<void>((resolve) => {
      releaseResolve = resolve;
    });
    this.#gate = {
      entered: enteredResolve,
      release: () => {
        enteredResolve();
        return releasePromise;
      },
    };
    return { entered, release: () => releaseResolve() };
  }

  async digestUtf8(value: string): Promise<string> {
    const gate = this.#gate;
    if (gate !== undefined) {
      this.#gate = undefined;
      gate.entered();
      await gate.release();
    }
    return createHash('sha256').update(value, 'utf8').digest('hex');
  }
}

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
  return { graphId: 'graph.e10-torn', components: [component('component.a')], relations: [] };
}

function kindBinding(): KindImplementationBindingInput {
  return {
    pin: {
      kind: { kindId: 'example.e10-kind', version: '1.0.0' },
      implementation: {
        implementationId: 'impl.alpha',
        implementationVersion: '1.0.0',
        implementationDigest: 'sha256:alpha-content',
      },
    },
    understoodSemanticContracts: [{ contractId: 'contract.a', version: '1.0.0' }],
    understoodCapabilities: [{ capabilityId: 'cap.a', version: '1.0.0' }],
    validateComponent: () => {},
  };
}

async function sealAssembly(
  definitionGraph: DefinitionGraphEnvelope,
): Promise<SealedRuntimeAssembly> {
  return sealRuntimeAssembly(
    { definitionGraph, kindImplementations: [kindBinding()] },
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

const CDI: GovernancePackageCdiBinding = {
  domainId: 'orders',
  packageId: 'pkg-orders-1',
  domainIntelligenceContentDigest: 'cdi-orders-1',
};

const OCCURRENCE = { workflowTarget: 'orders.fulfill', workflowInstanceId: 'instance-e10-torn' };

interface Fixture {
  readonly activator: AssemblyExecutionActivator;
  readonly binding: DomainActivationBinding;
  readonly assembly: SealedRuntimeAssembly;
  readonly definitionGraph: DefinitionGraphEnvelope;
  readonly packageCdi: MemoryExactPackageCdiAuthority;
  readonly store: MemoryDurableExecutionStore;
}

async function fixture(port: Sha256Port = sha256): Promise<Fixture> {
  const definitionGraph = graph();
  const assembly = await sealAssembly(definitionGraph);
  const baseline = await governanceBody('B1');
  const baselines = new MemoryGovernanceBaselineStore();
  const registry = new GovernanceBaselineRegistry(baselines, sha256);
  await registry.register(baseline);
  const packageCdi = new MemoryExactPackageCdiAuthority();
  packageCdi.add(CDI);
  const store = new MemoryDurableExecutionStore();
  const activator = new AssemblyExecutionActivator(store, packageCdi, baselines, port);
  const binding: DomainActivationBinding = {
    domainId: 'orders',
    packageId: 'pkg-orders-1',
    domainIntelligenceContentDigest: 'cdi-orders-1',
    governanceBaseline: baseline.identity,
  };
  return { activator, binding, assembly, definitionGraph, packageCdi, store };
}

function activationRequest(fx: Fixture) {
  return {
    workflowTarget: OCCURRENCE.workflowTarget,
    workflowInstanceId: OCCURRENCE.workflowInstanceId,
    binding: fx.binding,
    assembly: fx.assembly,
    currentDefinitionGraph: fx.definitionGraph,
  };
}

test('E10-4: torn activation — adversarial mutation of every caller-owned authority input mid-await cannot alter the durable pin', async () => {
  const port = new GatedSha256();
  const fx = await fixture(port);
  const originalGraphDigest = await computeDefinitionGraphDigest(fx.definitionGraph, sha256);
  assert.equal(originalGraphDigest, fx.assembly.record.definitionGraphDigest);

  // Pause inside the FIRST async digest of activation (Definition-currentness
  // recomputation), which happens only after the synchronous PHASE-1 snapshot.
  const gate = port.pauseNext();
  const request = activationRequest(fx);
  const activating = fx.activator.activate(request);
  await gate.entered;

  // Adversarially mutate every caller-owned authority input mid-flight.
  (request.binding as { packageId: string }).packageId = 'pkg-EVIL-torn';
  (request.binding as { domainIntelligenceContentDigest: string }).domainIntelligenceContentDigest =
    'cdi-EVIL-torn';
  (request.currentDefinitionGraph.components[0] as { semanticBody: unknown }).semanticBody = {
    threshold: 999999,
  };

  gate.release();
  const pin = await activating;

  // The pin reflects the synchronous PHASE-1 snapshot, never the torn input.
  assert.equal(pin.packageId, 'pkg-orders-1');
  assert.equal(pin.domainIntelligenceContentDigest, 'cdi-orders-1');
  assert.equal(pin.assemblyDigest, fx.assembly.assemblyDigest);

  // The graph mutation was real (the live digest changed), yet activation
  // resolved — currentness was proven against the PHASE-1 snapshot.
  const mutatedGraphDigest = await computeDefinitionGraphDigest(request.currentDefinitionGraph, sha256);
  assert.notEqual(mutatedGraphDigest, fx.assembly.record.definitionGraphDigest);
});

test('E10-4: torn recovery — caller mutation mid-await and mid-flight authority revocation cannot produce torn replay evidence', async () => {
  const port = new GatedSha256();
  const fx = await fixture(port);
  const activated = await fx.activator.activate(activationRequest(fx));

  // --- Case A: caller mutates its own graph object mid-recovery-await.
  const gateA = port.pauseNext();
  const recoveringA = fx.activator.recover({
    workflowInstanceId: OCCURRENCE.workflowInstanceId,
    expectedAssembly: fx.assembly,
  });
  await gateA.entered;
  (fx.definitionGraph.components[0] as { semanticBody: unknown }).semanticBody = {
    threshold: 424242,
  };
  gateA.release();
  const recoveredA = await recoveringA;
  assert.equal(recoveredA.pin.bindingDigest, activated.bindingDigest, 'replay never re-reads caller objects after an await');
  assert.equal(recoveredA.assemblyDigest, fx.assembly.assemblyDigest);

  // --- Case B: the exact package/CDI authority is REVOKED mid-recovery-await;
  // replay must fail closed, never resolve torn currentness.
  const gateB = port.pauseNext();
  const recoveringB = fx.activator.recover({ workflowInstanceId: OCCURRENCE.workflowInstanceId });
  await gateB.entered;
  fx.packageCdi.remove(CDI);
  gateB.release();
  await assert.rejects(recoveringB, (error: unknown) => {
    assert.ok(error instanceof GovernanceExecutionBindingError);
    assert.equal(error.code, 'PACKAGE_CDI_RECOVERY_MISMATCH');
    return true;
  });

  // Restoration replays cleanly — the failure was exact-currentness, not
  // corruption of the pin itself.
  fx.packageCdi.add(CDI);
  const recovered = await fx.activator.recover({
    workflowInstanceId: OCCURRENCE.workflowInstanceId,
    expectedAssembly: fx.assembly,
  });
  assert.equal(recovered.pin.bindingDigest, activated.bindingDigest);
});

test('E10-4: the recovered pin is byte-identical to the activated pin — no torn hybrid evidence across the seams', async () => {
  const fx = await fixture();
  const pin = await fx.activator.activate(activationRequest(fx));
  const recovered = await fx.activator.recover({
    workflowInstanceId: OCCURRENCE.workflowInstanceId,
    expectedAssembly: fx.assembly,
  });

  assert.deepEqual(recovered.pin, pin, 'recovery reproduces the exact same pin record');
  assert.deepEqual(recovered.pin.governanceBaseline, pin.governanceBaseline);
  const viaGate = await fx.activator.requireActivatedExecution(OCCURRENCE.workflowInstanceId);
  assert.deepEqual(viaGate, pin, 'the activation gate reads the same one durable record');
});
