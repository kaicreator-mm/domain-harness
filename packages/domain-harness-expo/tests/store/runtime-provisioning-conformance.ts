import type {
  CommitProcessedMessageRequest,
  DomainMessage,
  MessageAcceptedAck,
  RuntimeStoreLike as RuntimeStore,
  TerminalizeInstanceRequest,
  WorkflowAddress,
  WorkflowInstanceSnapshot,
} from '../../src/store/runtime-store-types.js';
import type {
  EnsureProvisionedWorkflowInstanceOpenResult,
  ProvisionAndOpenWorkflowInstanceRequest,
  RuntimeObservationIntent,
  RuntimeObservationPage,
  RuntimeObservationReadRequest,
  RuntimeObservationRecord,
} from '@kaicreator/domain-harness';
import { RUNTIME_OBSERVATION_INITIAL_EPOCH_ID } from '@kaicreator/domain-harness';

/**
 * Issue #180 / I-OPEN shared atomic provisioning ensure/open conformance
 * corpus. Mirrors the v2 RuntimeStore conformance pattern: this file is
 * host-agnostic and is held to the exact same checks by the Node binding run
 * (packages/domain-harness-node/tests/store/provisioning-conformance.test.ts)
 * and by the real Expo/Hermes + expo-sqlite device validation wave, so Node and
 * Expo can never drift on the frozen one-transaction contract.
 *
 * Every check drives only public store APIs — no direct SQL — so the same
 * corpus is truthful on both adapters and on the device database.
 */

export interface ProvisioningConformanceStore extends RuntimeStore {
  ensureProvisionedWorkflowInstanceOpen(
    request: ProvisionAndOpenWorkflowInstanceRequest,
  ): Promise<EnsureProvisionedWorkflowInstanceOpenResult>;
  ensureProvisionedWorkflowInstanceOpenWithObservation(
    request: ProvisionAndOpenWorkflowInstanceRequest,
    intent: RuntimeObservationIntent | undefined,
  ): Promise<{
    readonly result: EnsureProvisionedWorkflowInstanceOpenResult;
    readonly records: readonly RuntimeObservationRecord[];
  }>;
  readObservations(request: RuntimeObservationReadRequest): Promise<RuntimeObservationPage>;
  close(): Promise<void> | void;
}

export interface ProvisioningConformanceHarness {
  open(): Promise<ProvisioningConformanceStore>;
  reopen(store: ProvisioningConformanceStore): Promise<ProvisioningConformanceStore>;
}

export interface ProvisioningConformanceReport {
  checks: readonly string[];
  concurrentCreatedCount: 1;
  restartPersistence: true;
  observationExactlyOnce: true;
}

export const runtimeProvisioningConformanceChecks: readonly string[] = [
  'provisioning-atomic-create-open',
  'provisioning-exact-replay-idempotent',
  'provisioning-progressed-replay-no-reset',
  'provisioning-terminal-replay-immutable',
  'provisioning-same-key-semantic-conflict',
  'provisioning-address-identity-conflict-rollback',
  'provisioning-new-key-existing-instance-converges',
  'provisioning-reopen-persistence',
  'provisioning-concurrent-same-key-single-instance',
  'provisioning-observation-opened-exactly-once',
];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`RuntimeStore provisioning conformance failed: ${message}`);
  }
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

const REQUESTED_AT = '2026-09-30T08:00:00.000Z';
const PACKAGE_ID = 'pkg-provisioning-conformance';

function makeAddress(instanceKey: string): WorkflowAddress {
  return { workflowId: 'provisioning-conformance', instanceKey };
}

function provisionRequest(
  instanceKey = 'main',
  overrides: {
    provisioningKey?: string;
    correlationId?: string;
    input?: CommitProcessedMessageRequest['nextState'];
    requestedAt?: string;
  } = {},
): ProvisionAndOpenWorkflowInstanceRequest {
  const address = makeAddress(instanceKey);
  const correlationId = overrides.correlationId ?? `corr-${instanceKey}`;
  const input = overrides.input ?? { claimId: '42', amount: 125 };
  const requestedAt = overrides.requestedAt ?? REQUESTED_AT;
  return {
    provisioningKey: overrides.provisioningKey ?? `tenant-a:${instanceKey}`,
    target: address,
    correlationId,
    packageId: PACKAGE_ID,
    input,
    requestedAt,
    // Always rebuilt coherently from the effective identity: the exact
    // revision-0 snapshot a conforming Runtime would compute for THIS request.
    initialInstance: {
      address,
      correlationId,
      packageId: PACKAGE_ID,
      lifecycle: 'waiting',
      stateRevision: 0,
      state: { stateId: 'init', data: input, lastMessage: null, lastResult: null },
      createdAt: requestedAt,
      updatedAt: requestedAt,
    },
  };
}

async function expectReject(action: () => Promise<unknown>, message: string): Promise<void> {
  let rejected = false;
  try {
    await action();
  } catch {
    rejected = true;
  }
  assert(rejected, message);
}

/** Drives one real durable turn so replay checks run against progressed state. */
async function progressOneTurn(
  store: ProvisioningConformanceStore,
  target: WorkflowAddress,
  nextState: unknown,
): Promise<WorkflowInstanceSnapshot> {
  const message: DomainMessage = {
    messageId: 'provisioning-progress-1',
    target,
    type: 'PROGRESS',
    payload: null,
    correlationId: `corr-${target.instanceKey}`,
  };
  const ack: MessageAcceptedAck = await store.acceptMessage(message);
  const marked = await store.markMessageProcessing(target, message.messageId, REQUESTED_AT);
  assert(marked, 'progress turn could not mark the message processing');
  await store.commitProcessedMessage({
    target,
    messageId: message.messageId,
    expectedTargetSequence: ack.targetSequence,
    nextState: nextState as CommitProcessedMessageRequest['nextState'],
    nextLifecycle: 'active',
    updatedAt: REQUESTED_AT,
  });
  const progressed = await store.getInstance(target);
  assert(progressed !== null, 'progress turn lost the instance');
  return progressed;
}

const observationPackage = {
  domainId: 'provisioning-conformance',
  version: '1.0.0',
  packageId: PACKAGE_ID,
  contentDigest: 'sha256:provisioning-conformance-package',
  formatVersion: '0.2',
  runtimeContractMajor: 2,
  executionEngineMajor: 2,
  requiredCapabilities: [] as readonly string[],
};

function observationIntent(observedAt: string): RuntimeObservationIntent {
  return {
    kind: 'INSTANCE_OPENED',
    packageIdentity: observationPackage,
    observedAt,
  };
}

export async function runRuntimeProvisioningConformance(
  harness: ProvisioningConformanceHarness,
): Promise<ProvisioningConformanceReport> {
  const checks: string[] = [];
  let store = await harness.open();
  try {
    // 1. provisioning-atomic-create-open: first call binds the key AND
    //    materializes the exact revision-0 Runtime instance in one transaction.
    const request = provisionRequest();
    const created = await store.ensureProvisionedWorkflowInstanceOpen(request);
    assert(created.provisioningDisposition === 'created', 'first ensure must create the key binding');
    assert(created.instanceDisposition === 'created', 'first ensure must materialize the instance');
    assert(
      jsonEqual(created.instance, request.initialInstance),
      'materialized instance must equal the exact Runtime revision-0 snapshot',
    );
    const durable = await store.getInstance(request.target);
    assert(durable !== null && jsonEqual(durable, request.initialInstance), 'created instance is not durable');
    checks.push('provisioning-atomic-create-open');

    // 2. provisioning-exact-replay-idempotent: identical replay converges to
    //    the existing durable instance without a second logical instance.
    const replay = await store.ensureProvisionedWorkflowInstanceOpen(request);
    assert(replay.provisioningDisposition === 'existing', 'exact replay must see the existing key');
    assert(replay.instanceDisposition === 'existing', 'exact replay must see the existing instance');
    assert(jsonEqual(replay.instance, created.instance), 'exact replay changed the instance snapshot');
    checks.push('provisioning-exact-replay-idempotent');

    // 3. provisioning-progressed-replay-no-reset: replay after a real turn
    //    returns the progressed snapshot unchanged (never resets to initial).
    const progressed = await progressOneTurn(store, request.target, {
      stateId: 'running',
      data: { claimId: '42', amount: 125 },
      lastMessage: null,
      lastResult: null,
    });
    assert(progressed.stateRevision === 1, 'progress turn did not advance stateRevision');
    const progressedReplay = await store.ensureProvisionedWorkflowInstanceOpen(request);
    assert(progressedReplay.instanceDisposition === 'existing', 'progressed replay must be existing');
    assert(
      progressedReplay.instance.stateRevision === 1 &&
        progressedReplay.instance.lifecycle === 'active',
      'progressed replay reset or changed durable progress',
    );
    checks.push('provisioning-progressed-replay-no-reset');

    // 4. provisioning-terminal-replay-immutable: replay after terminalization
    //    returns the terminal snapshot unchanged (no terminal-address reuse).
    const terminalRequest: TerminalizeInstanceRequest = {
      target: request.target,
      lifecycle: 'terminated',
      updatedAt: REQUESTED_AT,
    };
    await store.terminalizeInstance(terminalRequest);
    const terminalReplay = await store.ensureProvisionedWorkflowInstanceOpen(request);
    assert(terminalReplay.instance.lifecycle === 'terminated', 'terminal replay changed lifecycle');
    assert(
      terminalReplay.instance.stateRevision === 2,
      'terminal replay changed the terminal stateRevision',
    );
    checks.push('provisioning-terminal-replay-immutable');

    // 5. provisioning-same-key-semantic-conflict: the same key with different
    //    logical material fails closed and never rewrites the bound record.
    await expectReject(
      () =>
        store.ensureProvisionedWorkflowInstanceOpen(
          provisionRequest('main', { input: { claimId: '42', amount: 999 } }),
        ),
      'same key with different input must fail closed',
    );
    const afterConflict = await store.ensureProvisionedWorkflowInstanceOpen(request);
    assert(afterConflict.instance.lifecycle === 'terminated', 'conflict attempt mutated durable state');
    checks.push('provisioning-same-key-semantic-conflict');

    // 6. provisioning-address-identity-conflict-rollback: an occupied address
    //    with incompatible durable identity fails closed AND the attempted key
    //    binding of the failed transaction is not left behind.
    const occupied = provisionRequest('occupied');
    await store.createInstance({
      address: occupied.target,
      correlationId: 'someone-else',
      packageId: PACKAGE_ID,
      lifecycle: 'active',
      stateRevision: 0,
      state: { stateId: 'foreign' },
      createdAt: REQUESTED_AT,
      updatedAt: REQUESTED_AT,
    });
    await expectReject(
      () => store.ensureProvisionedWorkflowInstanceOpen(occupied),
      'incompatible durable identity at the address must fail closed',
    );
    // Rollback proof without SQL: retry the SAME key with identity-compatible
    // material. If the failed transaction had left the key bound to the
    // incompatible material, this retry would conflict instead of converging.
    const repaired = await store.ensureProvisionedWorkflowInstanceOpen(
      provisionRequest('occupied', { correlationId: 'someone-else' }),
    );
    assert(
      repaired.provisioningDisposition === 'created' &&
        repaired.instanceDisposition === 'existing',
      'failed identity conflict left its key binding behind (rollback violated)',
    );
    checks.push('provisioning-address-identity-conflict-rollback');

    // 7. provisioning-new-key-existing-instance-converges: a NEW key bound to
    //    the same identity-compatible instance converges to it (competing keys,
    //    one logical instance).
    const competing = await store.ensureProvisionedWorkflowInstanceOpen(
      provisionRequest('occupied', {
        provisioningKey: 'tenant-b:occupied',
        correlationId: 'someone-else',
      }),
    );
    assert(
      competing.provisioningDisposition === 'created' &&
        competing.instanceDisposition === 'existing',
      'new key must bind while converging to the existing compatible instance',
    );
    checks.push('provisioning-new-key-existing-instance-converges');

    // 8. provisioning-reopen-persistence: a reopened connection replays to the
    //    existing durable facts (crash/restart repair by repeating the call).
    //    The remaining checks continue on the reopened connection.
    const reopened = await harness.reopen(store);
    const restartReplay = await reopened.ensureProvisionedWorkflowInstanceOpen(request);
    assert(
      restartReplay.provisioningDisposition === 'existing' &&
        restartReplay.instanceDisposition === 'existing',
      'replay after reopen must converge to existing durable facts',
    );
    assert(
      restartReplay.instance.lifecycle === 'terminated' &&
        restartReplay.instance.stateRevision === 2,
      'replay after reopen reset durable progress',
    );
    store = reopened;
    checks.push('provisioning-reopen-persistence');

    // 9. provisioning-concurrent-same-key-single-instance: concurrent identical
    //    ensures converge to exactly one created instance (the adapter's writer
    //    authority serializes the whole check-then-act; no query-then-insert
    //    race window and no duplicate logical instance).
    const concurrentRequest = provisionRequest('concurrent');
    const outcomes = await Promise.all([
      store.ensureProvisionedWorkflowInstanceOpen(concurrentRequest),
      store.ensureProvisionedWorkflowInstanceOpen(concurrentRequest),
      store.ensureProvisionedWorkflowInstanceOpen(concurrentRequest),
    ]);
    const createdCount = outcomes.filter((o) => o.instanceDisposition === 'created').length;
    assert(createdCount === 1, `concurrent ensures created ${createdCount} instances, expected 1`);
    for (const outcome of outcomes) {
      assert(
        jsonEqual(outcome.instance, concurrentRequest.initialInstance),
        'concurrent ensure returned divergent instance snapshots',
      );
    }
    checks.push('provisioning-concurrent-same-key-single-instance');

    // 10. provisioning-observation-opened-exactly-once: the observation-capable
    //     form appends INSTANCE_OPENED inside the SAME transaction only when
    //     the instance is newly materialized; exact and progressed replay emit
    //     no second open observation.
    const observedRequest = provisionRequest('observed');
    const first = await store.ensureProvisionedWorkflowInstanceOpenWithObservation(
      observedRequest,
      observationIntent('2026-09-30T08:00:01.000Z'),
    );
    assert(first.records.length === 1, 'new instance must emit exactly one INSTANCE_OPENED record');
    assert(first.records[0]?.kind === 'INSTANCE_OPENED', 'emitted record is not INSTANCE_OPENED');

    const replayed = await store.ensureProvisionedWorkflowInstanceOpenWithObservation(
      observedRequest,
      observationIntent('2026-09-30T08:00:02.000Z'),
    );
    assert(replayed.records.length === 0, 'exact replay emitted a duplicate open observation');

    await progressOneTurn(store, observedRequest.target, {
      stateId: 'running',
      data: { claimId: '42', amount: 125 },
      lastMessage: null,
      lastResult: null,
    });
    const progressedObserved = await store.ensureProvisionedWorkflowInstanceOpenWithObservation(
      observedRequest,
      observationIntent('2026-09-30T08:00:03.000Z'),
    );
    assert(progressedObserved.records.length === 0, 'progressed replay emitted an open observation');

    const page = await store.readObservations({
      stream: {
        target: observedRequest.target,
        package: observationPackage,
        epochId: RUNTIME_OBSERVATION_INITIAL_EPOCH_ID,
      },
    });
    assert(
      page.records.length === 1 &&
        page.records[0]?.kind === 'INSTANCE_OPENED' &&
        page.highWatermark === 1,
      'durable stream must hold exactly the one committed open observation',
    );
    checks.push('provisioning-observation-opened-exactly-once');
  } finally {
    await store.close();
  }

  return {
    checks,
    concurrentCreatedCount: 1,
    restartPersistence: true,
    observationExactlyOnce: true,
  };
}
