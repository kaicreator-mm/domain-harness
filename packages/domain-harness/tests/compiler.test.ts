import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compileControlMachine,
  initialControlState,
  transitionControlState,
} from '../src/compiler/index.js';
import type { WorkflowAst } from '../src/loader/ast.js';

function workflow(): WorkflowAst {
  return {
    id: 'example',
    sourcePath: 'workflows/example.yaml',
    initial: 'generate',
    output: 'steps.generate',
    states: {
      generate: {
        id: 'generate',
        final: false,
        invoke: { kind: 'skill', ref: 'generate' },
        done: [
          { when: 'output.score >= 80', target: 'accepted' },
          { target: 'review' },
        ],
        error: [{ target: 'failed' }],
        events: {},
      },
      review: {
        id: 'review',
        final: false,
        done: [],
        error: [],
        events: {
          approve: { routes: [{ target: 'accepted' }] },
          reject: { routes: [{ target: 'failed' }] },
        },
      },
      accepted: {
        id: 'accepted',
        final: true,
        done: [],
        error: [],
        events: {},
      },
      failed: {
        id: 'failed',
        final: true,
        done: [],
        error: [],
        events: {},
      },
    },
  };
}

test('compiler exposes only precomputed indexed routes to XState', () => {
  const machine = compileControlMachine(workflow());
  assert.deepEqual(initialControlState(machine), {
    stateId: 'generate',
    done: false,
  });

  const review = transitionControlState(machine, 'generate', {
    sourceStateId: 'generate',
    routeClass: 'done',
    routeIndex: 1,
  });
  assert.deepEqual(review, { stateId: 'review', done: false });

  const accepted = transitionControlState(machine, 'review', {
    sourceStateId: 'review',
    routeClass: 'event',
    eventType: 'approve',
    routeIndex: 0,
  });
  assert.deepEqual(accepted, { stateId: 'accepted', done: true });
});

test('error route reaches failed final without guard evaluation', () => {
  const machine = compileControlMachine(workflow());
  assert.deepEqual(
    transitionControlState(machine, 'generate', {
      sourceStateId: 'generate',
      routeClass: 'error',
      routeIndex: 0,
    }),
    { stateId: 'failed', done: true },
  );
});

test('route source and index mismatches are rejected', () => {
  const machine = compileControlMachine(workflow());

  assert.throws(
    () =>
      transitionControlState(machine, 'generate', {
        sourceStateId: 'review',
        routeClass: 'done',
        routeIndex: 0,
      }),
    /route source mismatch/,
  );

  assert.throws(
    () =>
      transitionControlState(machine, 'generate', {
        sourceStateId: 'generate',
        routeClass: 'done',
        routeIndex: 99,
      }),
    /no compiled route/,
  );
});
