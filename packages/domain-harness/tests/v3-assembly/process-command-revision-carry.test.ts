import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  DurableProcessDataSnapshot,
  ProcessedCommandTurnCommit,
} from '../../src/contracts/process-command.js';
import type { CompiledWorkflowCommandResult } from '../../src/runtime/compiled-workflow-runtime.js';
import {
  commitV3ProcessedCommandTurn,
  type V3ProcessCommandStore,
} from '../../src/runtime/process-command-integration.js';
import type { MessageDispositionSnapshot } from '../../src/v2/contracts/message.js';
import type { StoredAcceptedMessage } from '../../src/v2/contracts/store.js';
import type { WorkflowAddress, WorkflowInstanceSnapshot } from '../../src/v2/contracts/workflow.js';

const target: WorkflowAddress = { workflowId: 'review', instanceKey: 'case-1' };

function currentInstance(): WorkflowInstanceSnapshot {
  return {
    address: target,
    correlationId: 'corr-1',
    packageId: 'pkg-1',
    lifecycle: 'waiting',
    stateRevision: 3,
    state: { stateId: 'review', data: {}, lastMessage: {}, lastResult: null },
    createdAt: '2026-09-30T00:00:00.000Z',
    updatedAt: '2026-09-30T00:00:03.000Z',
  };
}

function storedMessage(): StoredAcceptedMessage {
  return {
    message: {
      messageId: 'm-4',
      target,
      type: 'SUBMIT',
      payload: {},
      correlationId: 'corr-1',
    },
    ack: {
      status: 'accepted',
      messageId: 'm-4',
      target,
      targetSequence: 4,
      packageId: 'pkg-1',
      acceptedAt: '2026-09-30T00:00:04.000Z',
    },
  };
}

function processingDisposition(): MessageDispositionSnapshot {
  return {
    messageId: 'm-4',
    target,
    targetSequence: 4,
    packageId: 'pkg-1',
    disposition: 'processing',
    correlationId: 'corr-1',
    acceptedAt: '2026-09-30T00:00:04.000Z',
    processingAt: '2026-09-30T00:00:05.000Z',
  };
}

const rejection: CompiledWorkflowCommandResult = {
  status: 'rejected',
  rejection: {
    code: 'MESSAGE_NOT_ACCEPTED_IN_STATE',
    message: 'stale command',
  },
};

function storeWithProcessData(
  processData: DurableProcessDataSnapshot,
  onCommit: (commit: ProcessedCommandTurnCommit) => void,
): V3ProcessCommandStore {
  return {
    getMessageDisposition: async () => processingDisposition(),
    getProcessData: async () => processData,
    getCommandOutcome: async () => null,
    commitProcessedCommandTurn: async (commit) => onCommit(commit),
  } as unknown as V3ProcessCommandStore;
}

test('#137 carries the last process-data value across non-command instance revisions', async () => {
  let committed: ProcessedCommandTurnCommit | undefined;
  const store = storeWithProcessData(
    {
      target,
      // Revision 1 was the last processed-command commit. Revisions 2 and 3
      // may be technical-failure/recovery/control commits that preserve data.
      instanceStateRevision: 1,
      data: { attempts: 1 },
    },
    (commit) => {
      committed = commit;
    },
  );

  await commitV3ProcessedCommandTurn({
    store,
    current: currentInstance(),
    stored: storedMessage(),
    result: rejection,
    updatedAt: '2026-09-30T00:00:06.000Z',
  });

  assert.ok(committed);
  assert.equal(committed.expectedStateRevision, 3);
  assert.equal(committed.nextStateRevision, 4);
  assert.deepEqual(committed.nextProcessData, { attempts: 1 });
  assert.equal(committed.outcome.status, 'rejected');
});

test('#137 fails closed if process-data claims a future instance revision', async () => {
  const store = storeWithProcessData(
    {
      target,
      instanceStateRevision: 4,
      data: { attempts: 1 },
    },
    () => assert.fail('future process-data revision must not commit'),
  );

  await assert.rejects(
    () => commitV3ProcessedCommandTurn({
      store,
      current: currentInstance(),
      stored: storedMessage(),
      result: rejection,
      updatedAt: '2026-09-30T00:00:06.000Z',
    }),
    /process data revision 4 is invalid for current instance revision 3/,
  );
});
