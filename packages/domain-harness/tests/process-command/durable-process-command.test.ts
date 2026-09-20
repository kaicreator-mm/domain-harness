import assert from 'node:assert/strict';
import test from 'node:test';
import type { JsonObject } from '../../src/contracts/json.js';
import {
  ProcessCommandContractError,
  type CommandOutcomeSnapshot,
  type DurableProcessDataSnapshot,
  type ProcessCommandRuntimeStore,
  type ProcessedCommandTurnCommit,
} from '../../src/contracts/process-command.js';
import {
  assertCommandOutcomeAlignment,
  deriveCommandOutcome,
  normalizeDurableProcessData,
  prepareProcessedCommandTurn,
} from '../../src/runtime/process-command.js';
import type { MessageDispositionSnapshot } from '../../src/v2/contracts/message.js';
import type {
  RuntimeFailure,
  WorkflowAddress,
  WorkflowInstanceSnapshot,
} from '../../src/v2/contracts/workflow.js';

const TARGET: WorkflowAddress = { workflowId: 'order-flow', instanceKey: 'order-42' };

function instance(overrides: Partial<WorkflowInstanceSnapshot> = {}): WorkflowInstanceSnapshot {
  return {
    address: TARGET,
    correlationId: 'corr-42',
    packageId: 'pkg-1',
    lifecycle: 'active',
    stateRevision: 3,
    state: { step: 'review' },
    createdAt: '2026-09-21T00:00:00.000Z',
    updatedAt: '2026-09-21T00:00:01.000Z',
    ...overrides,
  };
}

function disposition(
  kind: MessageDispositionSnapshot['disposition'],
  overrides: Partial<MessageDispositionSnapshot> = {},
): MessageDispositionSnapshot {
  const terminal = kind === 'processed' || kind === 'failed' || kind === 'abandoned';
  return {
    messageId: 'cmd-1',
    target: TARGET,
    targetSequence: 7,
    packageId: 'pkg-1',
    disposition: kind,
    correlationId: 'corr-42',
    acceptedAt: '2026-09-21T00:00:02.000Z',
    ...(kind === 'processing' ? { processingAt: '2026-09-21T00:00:03.000Z' } : {}),
    ...(terminal ? { resolvedAt: '2026-09-21T00:00:04.000Z' } : {}),
    ...overrides,
  };
}

function assertContractError(code: ProcessCommandContractError['code']) {
  return (error: unknown) => error instanceof ProcessCommandContractError && error.code === code;
}

class FakeProcessCommandStore implements ProcessCommandRuntimeStore {
  private currentInstance: WorkflowInstanceSnapshot;
  private currentDisposition: MessageDispositionSnapshot;
  private processSnapshot: DurableProcessDataSnapshot;
  private currentOutcome: CommandOutcomeSnapshot | null = null;

  constructor(
    currentInstance: WorkflowInstanceSnapshot,
    currentDisposition: MessageDispositionSnapshot,
    processData: JsonObject,
  ) {
    this.currentInstance = currentInstance;
    this.currentDisposition = currentDisposition;
    this.processSnapshot = {
      target: currentInstance.address,
      instanceStateRevision: currentInstance.stateRevision,
      data: processData,
    };
  }

  async getInstance(target: WorkflowAddress): Promise<WorkflowInstanceSnapshot | null> {
    return target.workflowId === TARGET.workflowId && target.instanceKey === TARGET.instanceKey
      ? this.currentInstance
      : null;
  }

  async getMessageDisposition(
    target: WorkflowAddress,
    messageId: string,
  ): Promise<MessageDispositionSnapshot | null> {
    if (
      target.workflowId !== TARGET.workflowId ||
      target.instanceKey !== TARGET.instanceKey ||
      messageId !== this.currentDisposition.messageId
    ) {
      return null;
    }
    return this.currentDisposition;
  }

  async getProcessData(target: WorkflowAddress): Promise<DurableProcessDataSnapshot | null> {
    return target.workflowId === TARGET.workflowId && target.instanceKey === TARGET.instanceKey
      ? this.processSnapshot
      : null;
  }

  async getCommandOutcome(
    target: WorkflowAddress,
    messageId: string,
  ): Promise<CommandOutcomeSnapshot | null> {
    if (
      target.workflowId !== TARGET.workflowId ||
      target.instanceKey !== TARGET.instanceKey ||
      messageId !== this.currentDisposition.messageId
    ) {
      return null;
    }
    return this.currentOutcome;
  }

  async commitProcessedCommandTurn(commit: ProcessedCommandTurnCommit): Promise<void> {
    assert.equal(this.currentDisposition.disposition, 'processing');
    assert.equal(this.currentDisposition.messageId, commit.messageId);
    assert.equal(this.currentDisposition.targetSequence, commit.expectedTargetSequence);
    assert.equal(this.currentInstance.stateRevision, commit.expectedStateRevision);

    this.currentDisposition = {
      ...this.currentDisposition,
      disposition: 'processed',
      resolvedAt: commit.updatedAt,
    };
    this.currentInstance = {
      address: this.currentInstance.address,
      correlationId: this.currentInstance.correlationId,
      packageId: this.currentInstance.packageId,
      lifecycle: commit.nextLifecycle,
      stateRevision: commit.nextStateRevision,
      state: commit.nextState,
      createdAt: this.currentInstance.createdAt,
      updatedAt: commit.updatedAt,
      ...(commit.output !== undefined
        ? { output: commit.output }
        : this.currentInstance.output === undefined
          ? {}
          : { output: this.currentInstance.output }),
    };
    this.processSnapshot = {
      target: commit.target,
      instanceStateRevision: commit.nextStateRevision,
      data: commit.nextProcessData,
    };
    this.currentOutcome = commit.outcome;
  }
}

test('T-009: process data is portable JSON object data, not an opaque host value', () => {
  assert.deepEqual(
    normalizeDurableProcessData({ cursor: 3, plan: { z: 2, a: 1 } }),
    { cursor: 3, plan: { a: 1, z: 2 } },
  );

  assert.throws(
    () => normalizeDurableProcessData(['not', 'an', 'object']),
    assertContractError('INVALID_PROCESS_DATA'),
  );
  assert.throws(
    () => normalizeDurableProcessData({ bad: undefined }),
    assertContractError('INVALID_PROCESS_DATA'),
  );

  const circular: Record<string, unknown> = {};
  circular.self = circular;
  assert.throws(
    () => normalizeDurableProcessData(circular),
    assertContractError('INVALID_PROCESS_DATA'),
  );
});

test('T-009: durable mailbox progress and terminal command outcome remain distinct', () => {
  assert.equal(deriveCommandOutcome(disposition('accepted')), null);
  assert.equal(deriveCommandOutcome(disposition('processing')), null);

  const applied = deriveCommandOutcome(disposition('processed'), {
    status: 'applied',
    result: { approved: true },
  });
  assert.equal(applied?.status, 'applied');

  const rejected = deriveCommandOutcome(disposition('processed'), {
    status: 'rejected',
    rejection: { code: 'LIMIT_EXCEEDED', message: 'order limit exceeded' },
  });
  assert.equal(rejected?.status, 'rejected');

  const failure: RuntimeFailure = { code: 'STORE_UNAVAILABLE', message: 'store unavailable' };
  const failed = deriveCommandOutcome(disposition('failed', { failure }));
  assert.equal(failed?.status, 'failed');

  const abandoned = deriveCommandOutcome(disposition('abandoned'));
  assert.equal(abandoned?.status, 'abandoned');
});

test('T-009: applied turn atomically carries next control state, process data and outcome', async () => {
  const current = instance();
  const source = disposition('processing');
  const store = new FakeProcessCommandStore(current, source, { cursor: 0 });

  const prepared = prepareProcessedCommandTurn(
    { instance: current, disposition: source, existingOutcome: null },
    {
      target: TARGET,
      messageId: 'cmd-1',
      expectedTargetSequence: 7,
      expectedStateRevision: 3,
      nextState: { step: 'approved' },
      nextProcessData: { cursor: 1, selectedPlan: { id: 'p-1' } },
      nextLifecycle: 'active',
      resolution: { status: 'applied', result: { accepted: true } },
      updatedAt: '2026-09-21T00:00:05.000Z',
    },
  );

  assert.equal(prepared.kind, 'commit');
  if (prepared.kind !== 'commit') return;
  await store.commitProcessedCommandTurn(prepared.commit);

  assert.equal((await store.getInstance(TARGET))?.stateRevision, 4);
  assert.deepEqual((await store.getProcessData(TARGET))?.data, {
    cursor: 1,
    selectedPlan: { id: 'p-1' },
  });
  assert.equal((await store.getMessageDisposition(TARGET, 'cmd-1'))?.disposition, 'processed');
  assert.equal((await store.getCommandOutcome(TARGET, 'cmd-1'))?.status, 'applied');
});

test('T-009: normal domain rejection is processed and does not poison the instance', async () => {
  const current = instance();
  const source = disposition('processing');
  const store = new FakeProcessCommandStore(current, source, { attempts: 1 });

  const prepared = prepareProcessedCommandTurn(
    { instance: current, disposition: source, existingOutcome: null },
    {
      target: TARGET,
      messageId: 'cmd-1',
      expectedTargetSequence: 7,
      expectedStateRevision: 3,
      nextState: { step: 'review' },
      nextProcessData: { attempts: 2 },
      nextLifecycle: 'active',
      resolution: {
        status: 'rejected',
        rejection: { code: 'POLICY_DENIED', message: 'manual approval is required' },
      },
      updatedAt: '2026-09-21T00:00:05.000Z',
    },
  );

  assert.equal(prepared.kind, 'commit');
  if (prepared.kind !== 'commit') return;
  await store.commitProcessedCommandTurn(prepared.commit);

  assert.equal((await store.getInstance(TARGET))?.lifecycle, 'active');
  assert.equal((await store.getMessageDisposition(TARGET, 'cmd-1'))?.disposition, 'processed');
  assert.equal((await store.getCommandOutcome(TARGET, 'cmd-1'))?.status, 'rejected');
});

test('T-009: applied/rejected outcomes cannot masquerade as runtime recovery failure', () => {
  assert.throws(
    () =>
      prepareProcessedCommandTurn(
        { instance: instance(), disposition: disposition('processing'), existingOutcome: null },
        {
          target: TARGET,
          messageId: 'cmd-1',
          expectedTargetSequence: 7,
          expectedStateRevision: 3,
          nextState: { step: 'review' },
          nextProcessData: { cursor: 2 },
          nextLifecycle: 'recovery_required',
          resolution: {
            status: 'rejected',
            rejection: { code: 'DOMAIN_REJECTED', message: 'normal rejection' },
          },
          updatedAt: '2026-09-21T00:00:05.000Z',
        },
      ),
    assertContractError('NORMAL_OUTCOME_CANNOT_REQUIRE_RECOVERY'),
  );
});

test('T-009: same processed resolution is idempotent; conflicting replay fails closed', () => {
  const processed = disposition('processed');
  const existing = deriveCommandOutcome(processed, {
    status: 'rejected',
    rejection: { code: 'POLICY_DENIED', message: 'manual approval is required' },
  });
  assert.ok(existing !== null);

  const same = prepareProcessedCommandTurn(
    { instance: instance({ stateRevision: 4 }), disposition: processed, existingOutcome: existing },
    {
      target: TARGET,
      messageId: 'cmd-1',
      expectedTargetSequence: 7,
      expectedStateRevision: 3,
      nextState: { step: 'ignored-on-replay' },
      nextProcessData: { cursor: 999 },
      nextLifecycle: 'active',
      resolution: {
        status: 'rejected',
        rejection: { code: 'POLICY_DENIED', message: 'manual approval is required' },
      },
      updatedAt: '2026-09-21T00:00:10.000Z',
    },
  );
  assert.equal(same.kind, 'already_committed');

  assert.throws(
    () =>
      prepareProcessedCommandTurn(
        { instance: instance({ stateRevision: 4 }), disposition: processed, existingOutcome: existing },
        {
          target: TARGET,
          messageId: 'cmd-1',
          expectedTargetSequence: 7,
          expectedStateRevision: 3,
          nextState: { step: 'ignored-on-replay' },
          nextProcessData: { cursor: 999 },
          nextLifecycle: 'active',
          resolution: { status: 'applied', result: { accepted: true } },
          updatedAt: '2026-09-21T00:00:10.000Z',
        },
      ),
    assertContractError('COMMAND_OUTCOME_CONFLICT'),
  );
});

test('T-009: existing reclaim semantics require processing before a new commit attempt', () => {
  assert.throws(
    () =>
      prepareProcessedCommandTurn(
        { instance: instance(), disposition: disposition('accepted'), existingOutcome: null },
        {
          target: TARGET,
          messageId: 'cmd-1',
          expectedTargetSequence: 7,
          expectedStateRevision: 3,
          nextState: { step: 'approved' },
          nextProcessData: { cursor: 1 },
          nextLifecycle: 'active',
          resolution: { status: 'applied' },
          updatedAt: '2026-09-21T00:00:05.000Z',
        },
      ),
    assertContractError('COMMAND_TURN_NOT_PROCESSING'),
  );
});

test('T-009: target-sequence mismatch fails closed before a processed-turn commit', () => {
  assert.throws(
    () =>
      prepareProcessedCommandTurn(
        { instance: instance(), disposition: disposition('processing'), existingOutcome: null },
        {
          target: TARGET,
          messageId: 'cmd-1',
          expectedTargetSequence: 8,
          expectedStateRevision: 3,
          nextState: { step: 'approved' },
          nextProcessData: { cursor: 1 },
          nextLifecycle: 'active',
          resolution: { status: 'applied' },
          updatedAt: '2026-09-21T00:00:05.000Z',
        },
      ),
    assertContractError('TARGET_SEQUENCE_MISMATCH'),
  );
});

test('T-009: state-revision mismatch fails closed before a processed-turn commit', () => {
  assert.throws(
    () =>
      prepareProcessedCommandTurn(
        { instance: instance({ stateRevision: 4 }), disposition: disposition('processing'), existingOutcome: null },
        {
          target: TARGET,
          messageId: 'cmd-1',
          expectedTargetSequence: 7,
          expectedStateRevision: 3,
          nextState: { step: 'approved' },
          nextProcessData: { cursor: 1 },
          nextLifecycle: 'active',
          resolution: { status: 'applied' },
          updatedAt: '2026-09-21T00:00:05.000Z',
        },
      ),
    assertContractError('STATE_REVISION_MISMATCH'),
  );
});

test('T-009: durable outcome must align with terminal mailbox identity and failure class', () => {
  const failure: RuntimeFailure = { code: 'TOOL_FAILED', message: 'tool failed' };
  const failedDisposition = disposition('failed', { failure });
  const failedOutcome = deriveCommandOutcome(failedDisposition);
  assert.ok(failedOutcome !== null);
  assert.doesNotThrow(() => assertCommandOutcomeAlignment(failedDisposition, failedOutcome));

  const rejectedOutcome = deriveCommandOutcome(disposition('processed'), {
    status: 'rejected',
    rejection: { code: 'NO', message: 'normal rejection' },
  });
  assert.ok(rejectedOutcome !== null);
  assert.throws(
    () => assertCommandOutcomeAlignment(failedDisposition, rejectedOutcome),
    assertContractError('COMMAND_OUTCOME_MISMATCH'),
  );

  const abandonedDisposition = disposition('abandoned');
  const abandonedOutcome = deriveCommandOutcome(abandonedDisposition);
  assert.ok(abandonedOutcome !== null);
  assert.doesNotThrow(() => assertCommandOutcomeAlignment(abandonedDisposition, abandonedOutcome));
});
