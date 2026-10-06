import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProcessedCommandTurnCommit } from '../../src/contracts/process-command.js';
import { ProcessCommandContractError } from '../../src/contracts/process-command.js';
import {
  assertProcessedCommandTurnRevisionProgression,
  prepareProcessedCommandTurn,
} from '../../src/runtime/process-command.js';
import type { WorkflowAddress, WorkflowInstanceSnapshot } from '../../src/v2/contracts/workflow.js';
import type { MessageDispositionSnapshot } from '../../src/v2/contracts/message.js';

// v0.6 T003 (frozen L2 A9): REVISION_OWNER=RUNTIME_CORE,
// NORMAL_TRANSITION_RULE=EXACT_N_TO_N_PLUS_1,
// STORE_ROLE=DEFENSIVE_CONTRACT_BOUNDARY_NOT_SEMANTIC_OWNER.
// Runtime/core owns semantic derivation; host stores defensively validate the
// structural invariant before any durable write.

const TARGET: WorkflowAddress = { workflowId: 'order-flow', instanceKey: 'order-42' };

function processingState(expectedStateRevision: number): {
  instance: WorkflowInstanceSnapshot;
  disposition: MessageDispositionSnapshot;
} {
  const now = '2026-09-21T00:00:00.000Z';
  return {
    instance: {
      address: TARGET,
      correlationId: 'corr-42',
      packageId: 'pkg-1',
      lifecycle: 'active',
      stateRevision: expectedStateRevision,
      state: { step: 'review' },
      createdAt: now,
      updatedAt: now,
    },
    disposition: {
      messageId: 'cmd-1',
      target: TARGET,
      targetSequence: 7,
      packageId: 'pkg-1',
      disposition: 'processing',
      correlationId: 'corr-42',
      acceptedAt: '2026-09-21T00:00:02.000Z',
      processingAt: '2026-09-21T00:00:03.000Z',
    },
  };
}

function commit(overrides: Partial<ProcessedCommandTurnCommit> = {}): ProcessedCommandTurnCommit {
  return {
    target: TARGET,
    messageId: 'cmd-1',
    expectedTargetSequence: 7,
    expectedStateRevision: 3,
    nextStateRevision: 4,
    nextState: { step: 'approved' },
    nextProcessData: { cursor: 1 },
    nextLifecycle: 'active',
    outcome: {
      status: 'applied',
      messageId: 'cmd-1',
      target: TARGET,
      targetSequence: 7,
      packageId: 'pkg-1',
      correlationId: 'corr-42',
      acceptedAt: '2026-09-21T00:00:02.000Z',
      resolvedAt: '2026-09-21T00:00:05.000Z',
    },
    updatedAt: '2026-09-21T00:00:05.000Z',
    ...overrides,
  };
}

function isStateRevisionMismatch(error: unknown): boolean {
  return error instanceof ProcessCommandContractError && error.code === 'STATE_REVISION_MISMATCH';
}

function rejectsWithStateRevisionMismatch(commitAttempt: ProcessedCommandTurnCommit): void {
  assert.throws(
    () => assertProcessedCommandTurnRevisionProgression(commitAttempt),
    isStateRevisionMismatch,
  );
}

test('T-003 A9: runtime core derives exactly expectedStateRevision + 1 for normal turns', () => {
  for (const expectedStateRevision of [0, 1, 3, 41]) {
    const state = processingState(expectedStateRevision);
    const prepared = prepareProcessedCommandTurn(
      { instance: state.instance, disposition: state.disposition, existingOutcome: null },
      {
        target: TARGET,
        messageId: 'cmd-1',
        expectedTargetSequence: 7,
        expectedStateRevision,
        nextState: { step: 'approved' },
        nextProcessData: { cursor: 1 },
        nextLifecycle: 'active',
        resolution: { status: 'applied', result: { accepted: true } },
        updatedAt: '2026-09-21T00:00:05.000Z',
      },
    );
    assert.equal(prepared.kind, 'commit');
    if (prepared.kind !== 'commit') return;
    assert.equal(
      prepared.commit.nextStateRevision,
      expectedStateRevision + 1,
      'normal transition rule is EXACT_N_TO_N_PLUS_1',
    );
    // The core-derived commit always satisfies the structural store guard.
    assert.doesNotThrow(() =>
      assertProcessedCommandTurnRevisionProgression(prepared.commit),
    );
  }
});

test('T-003 A9: portable guard accepts an exact N -> N+1 progression', () => {
  assert.doesNotThrow(() => assertProcessedCommandTurnRevisionProgression(commit()));
  assert.doesNotThrow(() =>
    assertProcessedCommandTurnRevisionProgression(
      commit({ expectedStateRevision: 0, nextStateRevision: 1 }),
    ),
  );
  assert.doesNotThrow(() =>
    assertProcessedCommandTurnRevisionProgression(
      commit({
        expectedStateRevision: Number.MAX_SAFE_INTEGER - 1,
        nextStateRevision: Number.MAX_SAFE_INTEGER,
      }),
    ),
  );
});

test('T-003 A9: same-revision progression is rejected', () => {
  rejectsWithStateRevisionMismatch(commit({ expectedStateRevision: 3, nextStateRevision: 3 }));
  rejectsWithStateRevisionMismatch(commit({ expectedStateRevision: 0, nextStateRevision: 0 }));
});

test('T-003 A9: forward jumps beyond +1 are rejected', () => {
  rejectsWithStateRevisionMismatch(commit({ expectedStateRevision: 3, nextStateRevision: 5 }));
  rejectsWithStateRevisionMismatch(commit({ expectedStateRevision: 3, nextStateRevision: 10 }));
  rejectsWithStateRevisionMismatch(commit({ expectedStateRevision: 0, nextStateRevision: 2 }));
});

test('T-003 A9: backward progression is rejected', () => {
  rejectsWithStateRevisionMismatch(commit({ expectedStateRevision: 3, nextStateRevision: 2 }));
  rejectsWithStateRevisionMismatch(commit({ expectedStateRevision: 5, nextStateRevision: 4 }));
});

test('T-003 A9: negative or non-safe revision material is rejected', () => {
  rejectsWithStateRevisionMismatch(commit({ expectedStateRevision: -1, nextStateRevision: 0 }));
  rejectsWithStateRevisionMismatch(commit({ expectedStateRevision: 0, nextStateRevision: -1 }));
  rejectsWithStateRevisionMismatch(commit({ expectedStateRevision: 1.5, nextStateRevision: 2.5 }));
  rejectsWithStateRevisionMismatch(commit({ expectedStateRevision: 0, nextStateRevision: 0.5 }));
  rejectsWithStateRevisionMismatch(
    commit({ expectedStateRevision: 2 ** 53, nextStateRevision: 2 ** 53 + 1 }),
  );
  rejectsWithStateRevisionMismatch(
    commit({ expectedStateRevision: Number.NaN, nextStateRevision: Number.NaN }),
  );
});

test('T-003 A9: MAX_SAFE_INTEGER cannot produce an overflowing normal transition', () => {
  // Store-guard view: even an "exact +1" pair is rejected at the boundary
  // because expectedStateRevision must permit one SAFE revision advance.
  rejectsWithStateRevisionMismatch(
    commit({
      expectedStateRevision: Number.MAX_SAFE_INTEGER,
      nextStateRevision: Number.MAX_SAFE_INTEGER + 1,
    }),
  );
  // Core view: prepareProcessedCommandTurn refuses to derive an overflowing
  // commit at all — no normal transition can originate from MAX_SAFE_INTEGER.
  const state = processingState(Number.MAX_SAFE_INTEGER);
  assert.throws(
    () =>
      prepareProcessedCommandTurn(
        { instance: state.instance, disposition: state.disposition, existingOutcome: null },
        {
          target: TARGET,
          messageId: 'cmd-1',
          expectedTargetSequence: 7,
          expectedStateRevision: Number.MAX_SAFE_INTEGER,
          nextState: { step: 'approved' },
          nextProcessData: { cursor: 1 },
          nextLifecycle: 'active',
          resolution: { status: 'applied' },
          updatedAt: '2026-09-21T00:00:05.000Z',
        },
      ),
    isStateRevisionMismatch,
  );
});

test('T-003 A9: rejection category is stable and deterministic', () => {
  const attempt = commit({ expectedStateRevision: 3, nextStateRevision: 7 });
  let first: unknown;
  let second: unknown;
  try {
    assertProcessedCommandTurnRevisionProgression(attempt);
  } catch (error) {
    first = error;
  }
  try {
    assertProcessedCommandTurnRevisionProgression(attempt);
  } catch (error) {
    second = error;
  }
  assert.ok(first instanceof ProcessCommandContractError);
  assert.ok(second instanceof ProcessCommandContractError);
  assert.equal(first.code, 'STATE_REVISION_MISMATCH');
  assert.equal(second.code, 'STATE_REVISION_MISMATCH');
  assert.equal(first.message, second.message, 'identical nonconforming input yields identical diagnosis');
});
