import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CompiledWorkflowIrError,
  decodeCompiledWorkflowDefinition,
} from '../../src/runtime/compiled-workflow-ir.js';
import type { JsonObject } from '../../src/contracts/json.js';

function validDefinition(overrides: JsonObject = {}): JsonObject {
  return {
    initial: 'start',
    states: {
      start: {
        final: false,
        invoke: { kind: 'expr', expression: 'value + 1' },
        done: [{ target: 'finished' }],
        error: [],
        events: {},
      },
      finished: {
        final: true,
        done: [],
        error: [],
        events: {},
        effects: [
          {
            kind: 'domain-message',
            targetExpression: 'audit.target',
            messageType: 'thing.finished',
            payloadExpression: 'audit.payload',
          },
        ],
      },
    },
    limits: { maxSteps: 32 },
    ...overrides,
  };
}

function invalidDefinitionStates(states: JsonObject): JsonObject {
  return validDefinition({ states });
}

test('IR decoder accepts a valid compiled definition and normalizes optional containers', () => {
  const decoded = decodeCompiledWorkflowDefinition('wf', validDefinition());
  assert.equal(decoded.initial, 'start');
  assert.equal(decoded.limits?.maxSteps, 32);
  assert.equal(decoded.states.start?.final, false);
  assert.equal(decoded.states.start?.invoke?.kind, 'expr');
  assert.deepEqual(decoded.states.start?.done, [{ target: 'finished' }]);
  assert.equal(decoded.states.finished?.effects?.length, 1);
});

test('IR decoder normalizes missing done/error/events to empty containers', () => {
  const decoded = decodeCompiledWorkflowDefinition('wf', {
    initial: 'only',
    states: { only: { final: true } },
  });
  assert.deepEqual(decoded.states.only?.done, []);
  assert.deepEqual(decoded.states.only?.error, []);
  assert.deepEqual(decoded.states.only?.events, {});
  assert.equal(decoded.states.only?.effects, undefined);
});

test('IR decoder rejects every malformed artifact class fail-closed (#168)', () => {
  const cases: Array<[string, unknown, RegExp]> = [
    ['non-object definition', 'not-an-object', /expected an object/u],
    ['missing initial', { states: { a: { final: true } } }, /initial/u],
    [
      'initial not declared in states',
      validDefinition({ initial: 'ghost' }),
      /initial state "ghost" is not declared/u,
    ],
    ['empty states', validDefinition({ states: {} }), /at least one state/u],
    [
      'legacy script invoke kind',
      invalidDefinitionStates({
        start: { final: false, invoke: { kind: 'script', ref: 'x' }, done: [], error: [], events: {} },
      }),
      /not executable by executionEngineMajor 2/u,
    ],
    [
      'legacy workflow invoke kind',
      invalidDefinitionStates({
        start: { final: false, invoke: { kind: 'workflow', ref: 'x' }, done: [], error: [], events: {} },
      }),
      /not executable by executionEngineMajor 2/u,
    ],
    [
      'empty expr expression',
      invalidDefinitionStates({
        start: { final: false, invoke: { kind: 'expr', expression: '' }, done: [], error: [], events: {} },
      }),
      /expression/u,
    ],
    [
      'tool invoke without ref',
      invalidDefinitionStates({
        start: { final: false, invoke: { kind: 'tool' }, done: [], error: [], events: {} },
      }),
      /ref/u,
    ],
    [
      'skill invoke without embedded definition',
      invalidDefinitionStates({
        start: { final: false, invoke: { kind: 'skill', ref: 's' }, done: [], error: [], events: {} },
      }),
      /skill/u,
    ],
    [
      'dangling done route target',
      invalidDefinitionStates({
        start: { final: false, done: [{ target: 'nowhere' }], error: [], events: {} },
        finished: { final: true, done: [], error: [], events: {} },
      }),
      /unknown state "nowhere"/u,
    ],
    [
      'dangling event route target',
      invalidDefinitionStates({
        start: { final: false, done: [], error: [], events: { GO: { routes: [{ target: 'gone' }] } } },
      }),
      /unknown state "gone"/u,
    ],
    [
      'non-array effects (previously silently skipped)',
      invalidDefinitionStates({
        start: { final: true, done: [], error: [], events: {}, effects: { kind: 'domain-message' } },
      }),
      /expected an array of domain-message effects/u,
    ],
    [
      'non-positive maxSteps',
      validDefinition({ limits: { maxSteps: 0 } }),
      /maxSteps/u,
    ],
    [
      'non-numeric maxSteps (previously produced NaN step death)',
      validDefinition({ limits: { maxSteps: 'many' } }),
      /maxSteps/u,
    ],
    ['non-boolean final', invalidDefinitionStates({ start: { final: 'yes' } }), /final/u],
  ];

  for (const [name, definition, expected] of cases) {
    assert.throws(
      () => decodeCompiledWorkflowDefinition('wf', definition),
      (error: unknown) => error instanceof CompiledWorkflowIrError && expected.test(error.message),
      `decoder must reject: ${name}`,
    );
  }
});
