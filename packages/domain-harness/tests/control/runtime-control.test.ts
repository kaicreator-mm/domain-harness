// Issue #313 focused tests — generic public Runtime cancel/interrupt control
// semantics on real Runtime/store boundaries (portable in-memory reference
// stores; host durability is proven by the Node/Expo adapter waves).
import assert from 'node:assert/strict';
import test from 'node:test';
import { createDomainRuntime } from '../../src/runtime/index.js';
import { StaticPackageRegistry } from '../../src/package/registry.js';
import { computeCompiledPackageId } from '../../src/package/validation.js';
import type { ScriptExecutorPort } from '../../src/v2/contracts/host.js';
import type {
  DomainRuntime,
  RuntimeHostBindings,
  TargetCompiledDomainPackage,
} from '../../src/v2/index.js';
import type {
  RuntimeControlAuthorizationDecision,
  RuntimeControlCapability,
  RuntimeControlRequest,
  RuntimeControlStore,
} from '../../src/control/index.js';
import { createRuntimeHostFake } from '../helpers/runtime-host-fake.js';
import { InMemoryControlRuntimeStore } from './in-memory-control-runtime-store.js';
import { InMemoryRuntimeControlStore } from './in-memory-runtime-control-store.js';

const DOMAIN_ID = 't313-control';
const ADDRESS = { workflowId: 'idle', instanceKey: 'u1' } as const;
const WORKING_ADDRESS = { workflowId: 'working', instanceKey: 'w1' } as const;

type ToolSemantics = 'none' | 'idempotent' | 'non-idempotent';

function workflow(
  workflowId: string,
  definition: TargetCompiledDomainPackage['manifest']['workflows'][string]['definition'],
  messageTypes: readonly string[],
) {
  return {
    workflowId,
    definition,
    messageContracts: Object.fromEntries(
      messageTypes.map((type) => [type, { type, payloadSchema: {} }]),
    ),
  };
}

function buildPackage(toolEffect: ToolSemantics): TargetCompiledDomainPackage {
  return {
    manifest: {
      formatVersion: '0.2',
      runtimeContractMajor: 2,
      executionEngineMajor: 2,
      domainId: DOMAIN_ID,
      domainVersion: '1.0.0-t313',
      packageId: 'pending',
      targetProfileId: 't313-host@1',
      requiredCapabilities: [],
      workflows: {
        idle: workflow('idle', {
          initial: 'waiting',
          states: {
            waiting: {
              final: false,
              done: [],
              error: [],
              events: { FINISH: { routes: [{ target: 'done' }] } },
            },
            done: { final: true, done: [], error: [], events: {} },
          },
          limits: { maxSteps: 32 },
        }, ['FINISH']),
        working: workflow('working', {
          initial: 'waiting',
          states: {
            waiting: {
              final: false,
              done: [],
              error: [],
              events: { GO: { routes: [{ target: 'running' }] } },
            },
            running: {
              final: false,
              invoke: { kind: 'tool', ref: 'work' },
              done: [{ target: 'done' }],
              error: [],
              events: {},
            },
            done: { final: true, done: [], error: [], events: {} },
          },
          limits: { maxSteps: 32 },
        }, ['GO']),
        ping: workflow('ping', {
          initial: 'waiting',
          states: {
            waiting: {
              final: false,
              done: [],
              error: [],
              events: { PING: { routes: [{ target: 'running' }] } },
            },
            running: {
              final: false,
              invoke: { kind: 'tool', ref: 'work' },
              done: [{ target: 'paused' }],
              error: [],
              events: {},
            },
            paused: { final: false, done: [], error: [], events: {} },
          },
          limits: { maxSteps: 32 },
        }, ['PING']),
      },
      tools: {
        work: {
          toolId: 'work',
          inputSchema: { type: 'object' },
          outputSchema: {
            type: 'object',
            required: ['ok'],
            additionalProperties: false,
            properties: { ok: { type: 'boolean' } },
          },
          effect: toolEffect,
          execution: { kind: 'script@1', bindingId: 'work-binding', digest: 'sha256:work-v1' },
          requiredCapabilities: [],
        },
      },
      projections: {},
      schemas: {},
      bindingDigests: { 'work-binding': 'sha256:work-v1' },
    },
    bindings: { 'work-binding': { kind: 'script@1', opaque: true } },
  };
}

/** Deterministic script executor that blocks until released; optionally honors AbortSignal. */
class ControllableScript implements ScriptExecutorPort {
  readonly started: Promise<void>;
  readonly signalObserved: Promise<void>;
  lastSignal: AbortSignal | undefined;
  calls = 0;
  #startedResolve: (() => void) | undefined;
  #signalResolve: (() => void) | undefined;
  #released: Promise<void>;

  constructor(readonly honorSignal: boolean) {
    this.started = new Promise((resolve) => {
      this.#startedResolve = resolve;
    });
    this.signalObserved = new Promise((resolve) => {
      this.#signalResolve = resolve;
    });
    this.#released = new Promise((resolve) => {
      this.release = resolve;
    });
  }

  release: () => void = () => {};

  async execute(request: { signal?: AbortSignal; input: unknown }): Promise<{ ok: boolean }> {
    this.calls += 1;
    this.lastSignal = request.signal;
    this.#startedResolve?.();
    if (this.honorSignal && request.signal !== undefined) {
      await Promise.race([
        this.#released,
        new Promise<never>((_, reject) => {
          request.signal!.addEventListener('abort', () => {
            this.#signalResolve?.();
            reject(new Error('aborted by runtime control signal'));
          });
        }),
      ]);
    } else {
      this.#signalResolve?.();
      await this.#released;
    }
    return { ok: true };
  }
}

class FakeAuthorizer {
  calls = 0;

  constructor(
    readonly decision: RuntimeControlAuthorizationDecision = {
      status: 'AUTHORIZED',
      authorizationRef: 'auth-t313',
      policyRevision: 'policy-t313',
    },
  ) {}

  authorize(): Promise<RuntimeControlAuthorizationDecision> {
    this.calls += 1;
    return Promise.resolve(this.decision);
  }
}

interface SetupOptions {
  readonly control?: boolean;
  readonly authorizer?: FakeAuthorizer;
  readonly controlStore?: RuntimeControlStore;
  readonly runtimeStore?: InMemoryControlRuntimeStore;
  readonly toolEffect?: ToolSemantics;
  readonly honorSignal?: boolean;
}

interface TestSetup {
  readonly runtime: DomainRuntime;
  readonly control: RuntimeControlCapability;
  readonly store: InMemoryControlRuntimeStore;
  readonly controlStore: InMemoryRuntimeControlStore;
  readonly authorizer: FakeAuthorizer;
  readonly script: ControllableScript;
}

async function setup(options: SetupOptions = {}): Promise<TestSetup> {
  const runtimeStore = options.runtimeStore ?? new InMemoryControlRuntimeStore();
  const controlStore = options.controlStore ?? new InMemoryRuntimeControlStore();
  const authorizer = options.authorizer ?? new FakeAuthorizer();
  const script = new ControllableScript(options.honorSignal ?? true);
  const bindings: RuntimeHostBindings = { ...createRuntimeHostFake(), script };
  const compiledPackage = buildPackage(options.toolEffect ?? 'idempotent');
  compiledPackage.manifest.packageId = await computeCompiledPackageId(
    compiledPackage.manifest,
    bindings.sha256,
  );
  const registry = new StaticPackageRegistry([compiledPackage], compiledPackage.manifest.packageId);
  const runtime = await createDomainRuntime({
    packageRegistry: registry,
    store: runtimeStore,
    bindings,
    ...(options.control === false
      ? {}
      : { control: { mode: 'enabled' as const, authorizer, store: controlStore } }),
  });
  return {
    runtime,
    control: runtime.control as RuntimeControlCapability,
    store: runtimeStore,
    controlStore: controlStore as InMemoryRuntimeControlStore,
    authorizer,
    script,
  };
}

function request(overrides: Partial<RuntimeControlRequest> = {}): RuntimeControlRequest {
  return {
    controlRequestId: 'ctl-1',
    callerRef: 'simulator:t126',
    action: 'CANCEL',
    target: { target: ADDRESS },
    reason: 'operator requested cancellation',
    ...overrides,
  };
}

function controlOf(runtime: DomainRuntime): RuntimeControlCapability {
  assert.ok(runtime.control !== undefined, 'runtime control capability must exist');
  return runtime.control;
}

async function openIdle(runtime: DomainRuntime): Promise<void> {
  await runtime.openInstance({ address: ADDRESS, correlationId: 'c1', input: {} });
}

async function openWorking(runtime: DomainRuntime): Promise<void> {
  await runtime.openInstance({ address: WORKING_ADDRESS, correlationId: 'c1', input: {} });
}

/** Starts one working turn and waits until the tool executor is in flight. */
async function startWorkingTurn(
  runtime: DomainRuntime,
  script: ControllableScript,
  messageId = 'go-1',
): Promise<void> {
  await runtime.send({ messageId, target: WORKING_ADDRESS, type: 'GO', payload: {} });
  await script.started;
}

// ---------------------------------------------------------------- P2 default deny

test('t313 P2a: no authorizer -> UNSUPPORTED capability, request causes no mutation', async () => {
  const { runtime, store } = await setup({ control: false });
  assert.ok(runtime.control !== undefined);
  assert.equal(runtime.control.status, 'UNSUPPORTED');
  await openIdle(runtime);
  const before = await store.getInstance(ADDRESS);
  const receipt = await controlOf(runtime).requestControl(request());
  assert.equal(receipt.disposition, 'UNSUPPORTED');
  assert.equal(receipt.outcome, 'UNSUPPORTED');
  assert.deepEqual(await store.getInstance(ADDRESS), before);
  assert.equal(store.terminalizations.length, 0);
  assert.equal(store.committedTurns.length, 0);
  await runtime.dispose();
});

test('t313 P2b: DENIED and UNKNOWN authorization -> REJECTED, no mutation, durable denial evidence', async () => {
  for (const decision of [
    { status: 'DENIED' as const, code: 'not_allowed' },
    { status: 'UNKNOWN' as const, code: 'policy_unavailable' },
  ]) {
    const { runtime, store, controlStore } = await setup({ authorizer: new FakeAuthorizer(decision) });
    await openIdle(runtime);
    const receipt = await controlOf(runtime).requestControl(request());
    assert.equal(receipt.disposition, 'REJECTED');
    assert.equal(receipt.outcome, 'REJECTED');
    const record = await controlStore.getRequest('ctl-1');
    assert.ok(record !== null && record.authorization.decision === decision.status);
    assert.notEqual((await store.getInstance(ADDRESS))?.lifecycle, 'cancelled');
    assert.equal(store.terminalizations.length, 0);
    await runtime.dispose();
  }
});

// ---------------------------------------------------------------- P1 idle cancel

test('t313 P1: authorized idle CANCEL -> durable cancelled + queued work can never run', async () => {
  const { runtime, store, controlStore } = await setup();
  await openIdle(runtime);
  await store.acceptMessage({ messageId: 'queued-1', target: ADDRESS, type: 'FINISH', payload: {} });

  const receipt = await controlOf(runtime).requestControl(request());
  assert.equal(receipt.disposition, 'ACCEPTED');
  assert.equal(receipt.outcome, 'CANCELLED_AT_SAFE_BOUNDARY');

  const instance = await store.getInstance(ADDRESS);
  assert.equal(instance?.lifecycle, 'cancelled');
  assert.equal((await store.getMessageDisposition(ADDRESS, 'queued-1'))?.disposition, 'abandoned');
  // A terminal instance accepts no new work, and no queued turn ever ran.
  await assert.rejects(
    runtime.send({ messageId: 'queued-2', target: ADDRESS, type: 'FINISH', payload: {} }),
  );
  await runtime.awaitIdle();
  assert.equal(store.committedTurns.length, 0);
  assert.equal((await store.getInstance(ADDRESS))?.lifecycle, 'cancelled');
  // Authorization evidence binds caller/request/target/action/policy revision.
  const record = await controlStore.getRequest('ctl-1');
  assert.deepEqual(record?.authorization, {
    decision: 'AUTHORIZED',
    callerRef: 'simulator:t126',
    authorizationRef: 'auth-t313',
    policyRevision: 'policy-t313',
  });
  await runtime.dispose();
});

// ---------------------------------------------------------------- P3 idempotency

test('t313 P3: exact duplicate is idempotent; conflicting reuse fails closed', async () => {
  const { runtime, controlStore, authorizer } = await setup();
  await openIdle(runtime);
  const first = await controlOf(runtime).requestControl(request());
  assert.equal(first.outcome, 'CANCELLED_AT_SAFE_BOUNDARY');
  const authorizedCalls = authorizer.calls;

  const duplicate = await controlOf(runtime).requestControl(request());
  assert.equal(duplicate.disposition, 'DUPLICATE');
  assert.equal(duplicate.outcome, 'CANCELLED_AT_SAFE_BOUNDARY');
  // The replay resolves against the ORIGINAL authorization evidence.
  assert.equal(authorizer.calls, authorizedCalls);
  assert.equal((await controlStore.getRequest('ctl-1'))?.outcome, 'CANCELLED_AT_SAFE_BOUNDARY');

  const conflicting = await controlOf(runtime).requestControl(
    request({ reason: 'different intent entirely' }),
  );
  assert.equal(conflicting.disposition, 'REJECTED');
  assert.equal(authorizer.calls, authorizedCalls);
  assert.equal((await controlStore.getRequest('ctl-1'))?.reason, 'operator requested cancellation');
  await runtime.dispose();
});

// ---------------------------------------------------------------- P4 interrupt wins

test('t313 P4: honored INTERRUPT before commit -> no turn commit + INTERRUPTED_TO_RECOVERY_REQUIRED', async () => {
  const { runtime, store, script } = await setup({ toolEffect: 'idempotent', honorSignal: true });
  await openWorking(runtime);
  const before = await store.getInstance(WORKING_ADDRESS);
  await startWorkingTurn(runtime, script);

  const receipt = await controlOf(runtime).requestControl(
    request({ action: 'INTERRUPT', target: { target: WORKING_ADDRESS } }),
  );
  assert.equal(receipt.disposition, 'ACCEPTED');
  assert.equal(receipt.outcome, 'INTERRUPTED_TO_RECOVERY_REQUIRED');

  const instance = await store.getInstance(WORKING_ADDRESS);
  assert.equal(instance?.lifecycle, 'recovery_required');
  assert.equal(instance?.failure?.code, 'runtime_control_interrupted');
  assert.equal(
    (instance?.failure?.details as { controlRequestId?: string } | undefined)?.controlRequestId,
    'ctl-1',
  );
  const disposition = await store.getMessageDisposition(WORKING_ADDRESS, 'go-1');
  assert.equal(disposition?.disposition, 'failed');
  // The interrupted transition was never committed.
  assert.equal(store.committedTurns.filter((turn) => turn.messageId === 'go-1').length, 0);
  assert.notEqual(instance?.state, before?.state);
  await runtime.dispose();
});

// ---------------------------------------------------------------- P6/P7 commit wins the race

test('t313 P6a/P7: ignored AbortSignal -> turn commits -> truthful TOO_LATE_TURN_COMMITTED', async () => {
  const { runtime, store, script } = await setup({ toolEffect: 'idempotent', honorSignal: false });
  await openWorking(runtime);
  await startWorkingTurn(runtime, script);

  const controlPromise = controlOf(runtime).requestControl(
    request({ action: 'INTERRUPT', target: { target: WORKING_ADDRESS } }),
  );
  await script.signalObserved; // signal reached the callee; it ignores it
  script.release();
  const receipt = await controlPromise;
  assert.equal(receipt.disposition, 'ACCEPTED');
  assert.equal(receipt.outcome, 'TOO_LATE_TURN_COMMITTED');

  const instance = await store.getInstance(WORKING_ADDRESS);
  assert.equal(instance?.lifecycle, 'completed');
  assert.equal(store.committedTurns.filter((turn) => turn.messageId === 'go-1').length, 1);
  // No fabricated stop: instance completed, control evidence tells the truth.
  assert.notEqual(instance?.lifecycle, 'cancelled');
  await runtime.dispose();
});

// ---------------------------------------------------------------- P8 ambiguity

test('t313 P8: unresolved non-idempotent effect -> REQUIRES_RECONCILIATION, never cancelled', async () => {
  const { runtime, store, controlStore, script } = await setup({
    toolEffect: 'non-idempotent',
    honorSignal: true,
  });
  await openWorking(runtime);
  await startWorkingTurn(runtime, script);

  const receipt = await controlOf(runtime).requestControl(
    request({ action: 'INTERRUPT', target: { target: WORKING_ADDRESS } }),
  );
  assert.equal(receipt.outcome, 'REQUIRES_RECONCILIATION');

  const instance = await store.getInstance(WORKING_ADDRESS);
  assert.equal(instance?.lifecycle, 'recovery_required');
  assert.notEqual(instance?.lifecycle, 'cancelled');
  // Effect ambiguity refs remain visible in the control outcome.
  const record = await controlStore.getRequest('ctl-1');
  assert.ok(record?.effectEvidence !== undefined && record.effectEvidence.length > 0);
  const evidence = record.effectEvidence[0]!;
  assert.equal(evidence.semantics, 'non-idempotent');
  // The effect journal remains authoritative and preserved.
  const journal = await store.getEffect(evidence.effectId);
  assert.ok(journal !== null);
  assert.equal(journal.status, 'started');
  assert.equal(journal.effectSemantics, 'non-idempotent');
  await runtime.dispose();
});

// ---------------------------------------------------------------- P9 committed effect refs

test('t313 P9: committed effects remain visible after a later CANCEL (cancel != rollback)', async () => {
  const PING_ADDRESS = { workflowId: 'ping', instanceKey: 'p1' } as const;
  const { runtime, store, script } = await setup({ toolEffect: 'idempotent', honorSignal: false });
  await runtime.openInstance({ address: PING_ADDRESS, correlationId: 'c1', input: {} });
  await runtime.send({ messageId: 'ping-1', target: PING_ADDRESS, type: 'PING', payload: {} });
  await script.started;
  script.release();
  await runtime.awaitIdle();
  // One committed turn with one completed journaled effect; instance non-terminal.
  const afterTurn = await store.getInstance(PING_ADDRESS);
  assert.equal(afterTurn?.lifecycle, 'waiting');
  assert.equal(store.committedTurns.length, 1);
  const committedEffectId = store.listEffectIds()[0];
  assert.ok(committedEffectId !== undefined);

  const receipt = await controlOf(runtime).requestControl(
    request({ action: 'CANCEL', target: { target: PING_ADDRESS } }),
  );
  assert.equal(receipt.outcome, 'CANCELLED_AT_SAFE_BOUNDARY');
  assert.equal((await store.getInstance(PING_ADDRESS))?.lifecycle, 'cancelled');
  // The committed effect journal fact remains visible and unchanged: a Runtime
  // cancel is NOT external-effect rollback.
  const journal = await store.getEffect(committedEffectId);
  assert.ok(journal !== null && journal.status === 'completed');
  await runtime.dispose();
});

// ---------------------------------------------------------------- P5 stale selectors

test('t313 P5: stale revision and stale turn selector -> no effect', async () => {
  const { runtime, store, script } = await setup({ toolEffect: 'idempotent', honorSignal: true });
  await openIdle(runtime);
  const instance = await store.getInstance(ADDRESS);
  const staleRevision = await controlOf(runtime).requestControl(
    request({ target: { target: ADDRESS, expectedStateRevision: (instance?.stateRevision ?? 0) + 40 } }),
  );
  assert.equal(staleRevision.disposition, 'STALE_TARGET');
  assert.equal(staleRevision.outcome, 'STALE_TARGET');
  assert.notEqual((await store.getInstance(ADDRESS))?.lifecycle, 'cancelled');
  assert.equal(store.terminalizations.length, 0);

  // Stale exact-turn selector: a different turn is active; no retargeting.
  await openWorking(runtime);
  await startWorkingTurn(runtime, script, 'go-9');
  const staleTurnReceipt = await controlOf(runtime).requestControl(
    request({
      controlRequestId: 'ctl-stale-turn',
      action: 'INTERRUPT',
      target: { target: WORKING_ADDRESS, expectedTurn: { messageId: 'bogus-turn' } },
    }),
  );
  assert.equal(staleTurnReceipt.disposition, 'STALE_TARGET');
  assert.equal(staleTurnReceipt.outcome, 'STALE_TARGET');
  // No signal was issued; the real turn completes normally.
  assert.equal(script.lastSignal?.aborted, false);
  script.release();
  await runtime.awaitIdle();
  assert.equal((await store.getInstance(WORKING_ADDRESS))?.lifecycle, 'completed');
  await runtime.dispose();
});

// ---------------------------------------------------------------- P10 restart reconciliation

test('t313 P10a: restart reconciles an accepted CANCEL from authoritative facts, no blind reissue', async () => {
  const runtimeStore = new InMemoryControlRuntimeStore();
  const controlStore = new InMemoryRuntimeControlStore();
  const { runtime } = await setup({ runtimeStore, controlStore });
  await openIdle(runtime);
  await runtimeStore.acceptMessage({
    messageId: 'queued-1',
    target: ADDRESS,
    type: 'FINISH',
    payload: {},
  });
  // Emulate the pre-crash durable fact: an admitted-but-unresolved CANCEL.
  const controlStoreRaw = controlStore as InMemoryRuntimeControlStore;
  await controlStoreRaw.createRequest({
    controlRequestId: 'ctl-crash',
    action: 'CANCEL',
    target: ADDRESS,
    callerRef: 'simulator:t126',
    authorization: {
      decision: 'AUTHORIZED',
      callerRef: 'simulator:t126',
      authorizationRef: 'auth-t313',
      policyRevision: 'policy-t313',
    },
    status: 'accepted',
    receiptDisposition: 'ACCEPTED',
    outcome: 'PENDING',
    requestedAt: '2026-01-01T00:00:00.000Z',
  });
  await runtime.dispose();

  // Restart over the same durable stores.
  const freshAuthorizer = new FakeAuthorizer();
  const second = await setup({
    runtimeStore,
    controlStore,
    authorizer: freshAuthorizer,
  });
  const record = await (second.controlStore as InMemoryRuntimeControlStore).getRequest('ctl-crash');
  assert.equal(record?.status, 'resolved');
  assert.equal(record?.outcome, 'CANCELLED_AT_SAFE_BOUNDARY');
  assert.equal((await runtimeStore.getInstance(ADDRESS))?.lifecycle, 'cancelled');
  assert.equal(
    (await runtimeStore.getMessageDisposition(ADDRESS, 'queued-1'))?.disposition,
    'abandoned',
  );
  // Reconciliation never re-authorizes and never creates a new intent.
  assert.equal(freshAuthorizer.calls, 0);
  const all = await controlStore.listUnresolvedRequests();
  assert.equal(all.length, 0);
  // Duplicate poll after restart reads the reconciled durable result.
  const poll = await controlOf(second.runtime).requestControl({
    controlRequestId: 'ctl-crash',
    action: 'CANCEL',
    target: { target: ADDRESS },
    callerRef: 'simulator:t126',
  });
  assert.equal(poll.disposition, 'DUPLICATE');
  assert.equal(poll.outcome, 'CANCELLED_AT_SAFE_BOUNDARY');
  await second.runtime.dispose();
});

test('t313 P10b: restart classifies committed-turn INTERRUPT as TOO_LATE_TURN_COMMITTED', async () => {
  const runtimeStore = new InMemoryControlRuntimeStore();
  const controlStore = new InMemoryRuntimeControlStore();
  const first = await setup({ runtimeStore, controlStore, toolEffect: 'idempotent', honorSignal: false });
  await openWorking(first.runtime);
  await first.runtime.send({ messageId: 'go-1', target: WORKING_ADDRESS, type: 'GO', payload: {} });
  await first.script.started;
  first.script.release();
  await first.runtime.awaitIdle();
  // Emulate crash after the turn committed but before the control resolved:
  // a resolving INTERRUPT with the committed turn claimed.
  await (controlStore).createRequest({
    controlRequestId: 'ctl-crash',
    action: 'INTERRUPT',
    target: WORKING_ADDRESS,
    callerRef: 'simulator:t126',
    authorization: {
      decision: 'AUTHORIZED',
      callerRef: 'simulator:t126',
      authorizationRef: 'auth-t313',
      policyRevision: 'policy-t313',
    },
    status: 'resolving',
    claimedTurn: { messageId: 'go-1' },
    signalIssued: true,
    requestedAt: '2026-01-01T00:00:00.000Z',
  });
  await first.runtime.dispose();

  const second = await setup({ runtimeStore, controlStore });
  const record = await (second.controlStore).getRequest('ctl-crash');
  assert.equal(record?.status, 'resolved');
  assert.equal(record?.outcome, 'TOO_LATE_TURN_COMMITTED');
  // History is not rewritten.
  assert.equal((await runtimeStore.getInstance(WORKING_ADDRESS))?.lifecycle, 'completed');
  await second.runtime.dispose();
});

// ---------------------------------------------------------------- P11 pause/resume

test('t313 P11: PAUSE/RESUME are explicit UNSUPPORTED with no mutation', async () => {
  const { runtime, store } = await setup();
  await openIdle(runtime);
  const before = await store.getInstance(ADDRESS);
  for (const action of ['PAUSE', 'RESUME'] as const) {
    const receipt = await controlOf(runtime).requestControl(
      request({ action, controlRequestId: `ctl-${action.toLowerCase()}` }),
    );
    assert.equal(receipt.disposition, 'UNSUPPORTED_ACTION');
    assert.equal(receipt.outcome, 'UNSUPPORTED');
  }
  assert.deepEqual(await store.getInstance(ADDRESS), before);
  await runtime.dispose();
});

// ---------------------------------------------------------------- auxiliary semantics

test('t313: INTERRUPT with no active turn -> NO_ACTIVE_TURN, no fabricated state change', async () => {
  const { runtime, store } = await setup();
  await openIdle(runtime);
  const before = await store.getInstance(ADDRESS);
  const receipt = await controlOf(runtime).requestControl(
    request({ action: 'INTERRUPT', target: { target: ADDRESS } }),
  );
  assert.equal(receipt.disposition, 'NO_ACTIVE_TURN');
  assert.equal(receipt.outcome, 'NO_ACTIVE_TURN');
  assert.deepEqual(await store.getInstance(ADDRESS), before);
  await runtime.dispose();
});

test('t313: CANCEL during an active turn -> in-flight turn commits, then safe-boundary cancel', async () => {
  const PING_ADDRESS = { workflowId: 'ping', instanceKey: 'p2' } as const;
  const { runtime, store, script } = await setup({ toolEffect: 'idempotent', honorSignal: false });
  await runtime.openInstance({ address: PING_ADDRESS, correlationId: 'c1', input: {} });
  await runtime.send({ messageId: 'ping-1', target: PING_ADDRESS, type: 'PING', payload: {} });
  await script.started;

  const cancelPromise = controlOf(runtime).requestControl(
    request({ action: 'CANCEL', target: { target: PING_ADDRESS } }),
  );
  script.release();
  const receipt = await cancelPromise;
  assert.equal(receipt.outcome, 'CANCELLED_AT_SAFE_BOUNDARY');
  const instance = await store.getInstance(PING_ADDRESS);
  assert.equal(instance?.lifecycle, 'cancelled');
  // The in-flight turn completed to its durable commit boundary (deterministic
  // winner: the commit won its turn; the cancel applied at the next boundary).
  assert.equal(store.committedTurns.filter((turn) => turn.messageId === 'ping-1').length, 1);
  await runtime.dispose();
});

test('t313: control of a non-existent instance -> REJECTED, no mutation', async () => {
  const { runtime } = await setup();
  const receipt = await controlOf(runtime).requestControl(
    request({ target: { target: { workflowId: 'idle', instanceKey: 'ghost' } } }),
  );
  assert.equal(receipt.disposition, 'REJECTED');
  assert.equal(receipt.outcome, 'REJECTED');
  await runtime.dispose();
});

test('t313: getControlOutcome reads durable evidence by id (public surface)', async () => {
  const { runtime, control } = await setup();
  await openIdle(runtime);
  await controlOf(runtime).requestControl(request());
  assert.equal(control.status, 'ENABLED');
  const record = await control.getControlOutcome('ctl-1');
  assert.ok(record !== null);
  assert.equal(record.status, 'resolved');
  assert.equal(record.outcome, 'CANCELLED_AT_SAFE_BOUNDARY');
  assert.equal(await control.getControlOutcome('missing'), null);
  await runtime.dispose();
});
