import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import type { Sha256Port } from '../../src/contracts/identity.js';
import type {
  GovernanceBaselineBody,
  GovernancePackageCdiBinding,
} from '../../src/governance/contracts.js';
import {
  DomainActivationBindingCoordinator,
  GovernanceExecutionBindingError,
  GovernanceExecutionCoordinator,
  MemoryGovernanceBaselineStore,
  GovernanceBaselineRegistry,
  createGovernanceBaselineBody,
  createGovernanceExecutionPin,
  recoverGovernanceExecutionAuthority,
  type BindGovernanceExecutionPinResult,
  type DomainActivationAuthority,
  type DomainActivationBinding,
  type DurableExecutionStore,
  type ExactPackageCdiAuthority,
  type GovernanceBoundSnapshot,
  type GovernanceExecutionPin,
} from '../../src/governance/index.js';

const sha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

class AtomicActivationAuthority implements DomainActivationAuthority {
  current: unknown;
  #gate: {
    readonly enter: () => void;
    readonly releasePromise: Promise<void>;
  } | undefined;

  constructor(initial?: DomainActivationBinding) {
    this.current = initial;
  }

  pauseNextPublication(): { readonly entered: Promise<void>; readonly release: () => void } {
    let enter!: () => void;
    let release!: () => void;
    const entered = new Promise<void>((resolve) => { enter = resolve; });
    const releasePromise = new Promise<void>((resolve) => { release = resolve; });
    this.#gate = { enter, releasePromise };
    return { entered, release };
  }

  async readDomainActivationBinding(_domainId: string): Promise<unknown> {
    return this.current;
  }

  async publishDomainActivationBinding(binding: DomainActivationBinding): Promise<void> {
    const gate = this.#gate;
    if (gate !== undefined) {
      gate.enter();
      await gate.releasePromise;
      this.#gate = undefined;
    }
    this.current = binding;
  }
}

class MemoryExactPackageCdiAuthority implements ExactPackageCdiAuthority {
  readonly #records = new Map<string, GovernancePackageCdiBinding>();
  readonly requests: GovernancePackageCdiBinding[] = [];

  add(binding: GovernancePackageCdiBinding): void {
    this.#records.set(this.#key(binding), { ...binding });
  }

  async resolveExactPackageCdi(
    binding: GovernancePackageCdiBinding,
  ): Promise<GovernancePackageCdiBinding | undefined> {
    this.requests.push({ ...binding });
    const record = this.#records.get(this.#key(binding));
    return record === undefined ? undefined : { ...record };
  }

  #key(binding: GovernancePackageCdiBinding): string {
    return `${binding.domainId}\u0000${binding.packageId}\u0000${binding.domainIntelligenceContentDigest}`;
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
  ): Promise<BindGovernanceExecutionPinResult> {
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

  setRawPin(workflowInstanceId: string, pin: unknown): void {
    this.#pins.set(workflowInstanceId, pin);
  }

  setRawSnapshot(workflowInstanceId: string, snapshot: unknown): void {
    this.#snapshots.set(workflowInstanceId, snapshot);
  }
}

async function governanceBody(label: string): Promise<GovernanceBaselineBody> {
  return createGovernanceBaselineBody({
    domainId: 'orders',
    governanceId: 'orders-governance',
    schemaVersion: '1',
    version: label,
    semantics: {
      hardInvariants: [{ id: `invariant-${label}`, kind: 'deny-negative-total' }],
      operatorAuthority: label,
    },
  }, sha256);
}

function binding(
  body: GovernanceBaselineBody,
  packageId = 'pkg-orders-1',
  cdi = 'cdi-orders-1',
): DomainActivationBinding {
  return {
    domainId: 'orders',
    packageId,
    domainIntelligenceContentDigest: cdi,
    governanceBaseline: body.identity,
  };
}

async function fixture(): Promise<{
  readonly b1: GovernanceBaselineBody;
  readonly b2: GovernanceBaselineBody;
  readonly baselines: MemoryGovernanceBaselineStore;
  readonly packageCdi: MemoryExactPackageCdiAuthority;
}> {
  const b1 = await governanceBody('B1');
  const b2 = await governanceBody('B2');
  const baselines = new MemoryGovernanceBaselineStore();
  const registry = new GovernanceBaselineRegistry(baselines, sha256);
  await registry.register(b1);
  await registry.register(b2);
  const packageCdi = new MemoryExactPackageCdiAuthority();
  packageCdi.add({
    domainId: 'orders',
    packageId: 'pkg-orders-1',
    domainIntelligenceContentDigest: 'cdi-orders-1',
  });
  packageCdi.add({
    domainId: 'orders',
    packageId: 'pkg-orders-2',
    domainIntelligenceContentDigest: 'cdi-orders-1',
  });
  packageCdi.add({
    domainId: 'orders',
    packageId: 'pkg-orders-2',
    domainIntelligenceContentDigest: 'cdi-orders-2',
  });
  return { b1, b2, baselines, packageCdi };
}

function assertBindingEquals(actual: DomainActivationBinding, expected: DomainActivationBinding): void {
  assert.equal(actual.domainId, expected.domainId);
  assert.equal(actual.packageId, expected.packageId);
  assert.equal(actual.domainIntelligenceContentDigest, expected.domainIntelligenceContentDigest);
  assert.equal(actual.governanceBaseline.domainId, expected.governanceBaseline.domainId);
  assert.equal(actual.governanceBaseline.governanceId, expected.governanceBaseline.governanceId);
  assert.equal(actual.governanceBaseline.schemaVersion, expected.governanceBaseline.schemaVersion);
  assert.equal(actual.governanceBaseline.contentDigest, expected.governanceBaseline.contentDigest);
}

test('T-014: concurrent activation move exposes complete old or complete new tuple only', async () => {
  const { b1, b2, baselines, packageCdi } = await fixture();
  const oldBinding = binding(b1);
  const newBinding = binding(b2, 'pkg-orders-2', 'cdi-orders-2');
  const authority = new AtomicActivationAuthority(oldBinding);
  const coordinator = new DomainActivationBindingCoordinator(
    authority,
    packageCdi,
    baselines,
    sha256,
  );
  const gate = authority.pauseNextPublication();
  const moving = coordinator.publish(newBinding);
  await gate.entered;

  const whileMoving = await coordinator.resolveForNewInstance('orders');
  assertBindingEquals(whileMoving, oldBinding);

  gate.release();
  await moving;
  const afterMove = await coordinator.resolveForNewInstance('orders');
  assertBindingEquals(afterMove, newBinding);
});

test('T-014: package-only activation move remains one exact tuple', async () => {
  const { b1, baselines, packageCdi } = await fixture();
  const authority = new AtomicActivationAuthority(binding(b1));
  const coordinator = new DomainActivationBindingCoordinator(authority, packageCdi, baselines, sha256);
  const moved = binding(b1, 'pkg-orders-2', 'cdi-orders-1');
  await coordinator.publish(moved);
  assertBindingEquals(await coordinator.resolveForNewInstance('orders'), moved);
});

test('T-014: governance-only activation move remains one exact tuple', async () => {
  const { b1, b2, baselines, packageCdi } = await fixture();
  const authority = new AtomicActivationAuthority(binding(b1));
  const coordinator = new DomainActivationBindingCoordinator(authority, packageCdi, baselines, sha256);
  const moved = binding(b2);
  await coordinator.publish(moved);
  assertBindingEquals(await coordinator.resolveForNewInstance('orders'), moved);
});

test('T-014: full activation tuple move is published and read as one exact record', async () => {
  const { b1, b2, baselines, packageCdi } = await fixture();
  const authority = new AtomicActivationAuthority(binding(b1));
  const coordinator = new DomainActivationBindingCoordinator(authority, packageCdi, baselines, sha256);
  const moved = binding(b2, 'pkg-orders-2', 'cdi-orders-2');
  await coordinator.publish(moved);
  assertBindingEquals(await coordinator.resolveForNewInstance('orders'), moved);
});

test('T-014: governance pin is durable before authoritative state publication gate returns', async () => {
  const { b1 } = await fixture();
  const store = new MemoryDurableExecutionStore();
  const coordinator = new GovernanceExecutionCoordinator(store, sha256);
  await coordinator.pinExecution({
    workflowTarget: 'orders.fulfill',
    workflowInstanceId: 'instance-1',
    binding: binding(b1),
  });
  store.events.push('state:instance-1');
  assert.deepEqual(store.events, ['pin:instance-1', 'state:instance-1']);
});

test('T-014: snapshot-before-pin is rejected', async () => {
  const store = new MemoryDurableExecutionStore();
  const coordinator = new GovernanceExecutionCoordinator(store, sha256);
  await assert.rejects(
    coordinator.persistSnapshot({
      workflowInstanceId: 'instance-1',
      governanceBindingDigest: 'not-authority',
      snapshot: { state: 'waiting' },
    }),
    (error: unknown) => error instanceof GovernanceExecutionBindingError
      && error.code === 'SNAPSHOT_BEFORE_GOVERNANCE_PIN',
  );
  assert.deepEqual(store.events, []);
});

test('T-014: recovery uses exact persisted package/CDI/governance pin and snapshot', async () => {
  const { b1, baselines, packageCdi } = await fixture();
  const store = new MemoryDurableExecutionStore();
  const coordinator = new GovernanceExecutionCoordinator(store, sha256);
  const pin = await coordinator.pinExecution({
    workflowTarget: 'orders.fulfill',
    workflowInstanceId: 'instance-1',
    binding: binding(b1),
  });
  await coordinator.persistSnapshot({
    workflowInstanceId: 'instance-1',
    governanceBindingDigest: pin.bindingDigest,
    snapshot: { state: 'waiting' },
  });

  const recovered = await recoverGovernanceExecutionAuthority({
    workflowInstanceId: 'instance-1',
    store,
    packageCdiAuthority: packageCdi,
    baselines,
    sha256,
  });
  assert.equal(recovered.pin.bindingDigest, pin.bindingDigest);
  assert.equal(recovered.governanceBaseline.identity.contentDigest, b1.identity.contentDigest);
  assert.deepEqual(recovered.snapshot?.snapshot, { state: 'waiting' });
  assert.equal(packageCdi.requests.at(-1)?.packageId, 'pkg-orders-1');
});

test('T-014: current/latest/active and floating aliases cannot become execution authority', async () => {
  const { b1 } = await fixture();
  for (const packageId of ['current', 'latest', 'active', 'alias:orders-live', '@current']) {
    await assert.rejects(
      createGovernanceExecutionPin({
        workflowTarget: 'orders.fulfill',
        workflowInstanceId: `instance-${packageId}`,
        binding: binding(b1, packageId),
      }, sha256),
      (error: unknown) => error instanceof GovernanceExecutionBindingError
        && error.code === 'FLOATING_EXECUTION_AUTHORITY_FORBIDDEN',
    );
  }
});

test('T-014: recovery fails closed when governance pin is missing', async () => {
  const { baselines, packageCdi } = await fixture();
  await assert.rejects(
    recoverGovernanceExecutionAuthority({
      workflowInstanceId: 'missing-instance',
      store: new MemoryDurableExecutionStore(),
      packageCdiAuthority: packageCdi,
      baselines,
      sha256,
    }),
    (error: unknown) => error instanceof GovernanceExecutionBindingError
      && error.code === 'GOVERNANCE_EXECUTION_PIN_MISSING',
  );
});

test('T-014: corrupt governance pin fails closed', async () => {
  const { b1, baselines, packageCdi } = await fixture();
  const store = new MemoryDurableExecutionStore();
  const good = await createGovernanceExecutionPin({
    workflowTarget: 'orders.fulfill',
    workflowInstanceId: 'instance-1',
    binding: binding(b1),
  }, sha256);
  store.setRawPin('instance-1', { ...good, bindingDigest: 'corrupt' });

  await assert.rejects(
    recoverGovernanceExecutionAuthority({
      workflowInstanceId: 'instance-1',
      store,
      packageCdiAuthority: packageCdi,
      baselines,
      sha256,
    }),
    (error: unknown) => error instanceof GovernanceExecutionBindingError
      && error.code === 'INVALID_GOVERNANCE_EXECUTION_PIN',
  );
});

test('T-014: package/CDI/governance mismatches fail closed', async () => {
  const { b1, baselines } = await fixture();
  const expected = binding(b1);
  const activation = new AtomicActivationAuthority();
  const missingPackageCdi = new MemoryExactPackageCdiAuthority();
  const activationCoordinator = new DomainActivationBindingCoordinator(
    activation,
    missingPackageCdi,
    baselines,
    sha256,
  );
  await assert.rejects(
    activationCoordinator.publish(expected),
    (error: unknown) => error instanceof GovernanceExecutionBindingError
      && error.code === 'PACKAGE_CDI_BINDING_MISMATCH',
  );

  const packageCdi = new MemoryExactPackageCdiAuthority();
  packageCdi.add(expected);
  const emptyBaselines = new MemoryGovernanceBaselineStore();
  await assert.rejects(
    new DomainActivationBindingCoordinator(
      activation,
      packageCdi,
      emptyBaselines,
      sha256,
    ).publish(expected),
    (error: unknown) => error instanceof GovernanceExecutionBindingError
      && error.code === 'GOVERNANCE_BASELINE_BINDING_MISMATCH',
  );

  await assert.rejects(
    new DomainActivationBindingCoordinator(
      activation,
      packageCdi,
      baselines,
      sha256,
    ).publish({ ...expected, domainId: 'billing' }),
    (error: unknown) => error instanceof GovernanceExecutionBindingError,
  );
});

test('T-014: retained old instance keeps exact old authority after activation moves', async () => {
  const { b1, b2, baselines, packageCdi } = await fixture();
  const oldBinding = binding(b1);
  const authority = new AtomicActivationAuthority(oldBinding);
  const activation = new DomainActivationBindingCoordinator(authority, packageCdi, baselines, sha256);
  const exactAtCreation = await activation.resolveForNewInstance('orders');

  const store = new MemoryDurableExecutionStore();
  const execution = new GovernanceExecutionCoordinator(store, sha256);
  const oldPin = await execution.pinExecution({
    workflowTarget: 'orders.fulfill',
    workflowInstanceId: 'instance-old',
    binding: exactAtCreation,
  });

  await activation.publish(binding(b2, 'pkg-orders-2', 'cdi-orders-2'));
  const recovered = await recoverGovernanceExecutionAuthority({
    workflowInstanceId: 'instance-old',
    store,
    packageCdiAuthority: packageCdi,
    baselines,
    sha256,
  });
  assert.equal(recovered.pin.bindingDigest, oldPin.bindingDigest);
  assert.equal(recovered.pin.packageId, 'pkg-orders-1');
  assert.equal(recovered.governanceBaseline.identity.contentDigest, b1.identity.contentDigest);
});

test('T-014: same exact governance pin is idempotent', async () => {
  const { b1 } = await fixture();
  const store = new MemoryDurableExecutionStore();
  const execution = new GovernanceExecutionCoordinator(store, sha256);
  const request = {
    workflowTarget: 'orders.fulfill',
    workflowInstanceId: 'instance-1',
    binding: binding(b1),
  } as const;
  const first = await execution.pinExecution(request);
  const second = await execution.pinExecution(request);
  assert.equal(second.bindingDigest, first.bindingDigest);
  assert.deepEqual(store.events, ['pin:instance-1', 'pin:instance-1']);
});

test('T-014: conflicting re-pin fails closed and cannot replace old authority', async () => {
  const { b1, b2 } = await fixture();
  const store = new MemoryDurableExecutionStore();
  const execution = new GovernanceExecutionCoordinator(store, sha256);
  const oldPin = await execution.pinExecution({
    workflowTarget: 'orders.fulfill',
    workflowInstanceId: 'instance-1',
    binding: binding(b1),
  });

  await assert.rejects(
    execution.pinExecution({
      workflowTarget: 'orders.fulfill',
      workflowInstanceId: 'instance-1',
      binding: binding(b2, 'pkg-orders-2', 'cdi-orders-2'),
    }),
    (error: unknown) => error instanceof GovernanceExecutionBindingError
      && error.code === 'GOVERNANCE_EXECUTION_PIN_CONFLICT',
  );
  const retained = await execution.requirePinnedExecution('instance-1');
  assert.equal(retained.bindingDigest, oldPin.bindingDigest);
});

test('T-014: snapshot with a different governance binding digest is rejected', async () => {
  const { b1 } = await fixture();
  const store = new MemoryDurableExecutionStore();
  const execution = new GovernanceExecutionCoordinator(store, sha256);
  await execution.pinExecution({
    workflowTarget: 'orders.fulfill',
    workflowInstanceId: 'instance-1',
    binding: binding(b1),
  });
  await assert.rejects(
    execution.persistSnapshot({
      workflowInstanceId: 'instance-1',
      governanceBindingDigest: 'different-binding',
      snapshot: { state: 'waiting' },
    }),
    (error: unknown) => error instanceof GovernanceExecutionBindingError
      && error.code === 'SNAPSHOT_GOVERNANCE_BINDING_MISMATCH',
  );
});

test('T-014: recovery rejects persisted snapshot bound to another authority', async () => {
  const { b1, baselines, packageCdi } = await fixture();
  const store = new MemoryDurableExecutionStore();
  const execution = new GovernanceExecutionCoordinator(store, sha256);
  await execution.pinExecution({
    workflowTarget: 'orders.fulfill',
    workflowInstanceId: 'instance-1',
    binding: binding(b1),
  });
  store.setRawSnapshot('instance-1', {
    workflowInstanceId: 'instance-1',
    governanceBindingDigest: 'other-binding',
    snapshot: { state: 'waiting' },
  });
  await assert.rejects(
    recoverGovernanceExecutionAuthority({
      workflowInstanceId: 'instance-1',
      store,
      packageCdiAuthority: packageCdi,
      baselines,
      sha256,
    }),
    (error: unknown) => error instanceof GovernanceExecutionBindingError
      && error.code === 'SNAPSHOT_GOVERNANCE_BINDING_MISMATCH',
  );
});
