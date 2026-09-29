import assert from 'node:assert/strict';
import test from 'node:test';

import { decodeCompiledWorkflowDefinition } from '../../src/runtime/compiled-workflow-ir.js';
import {
  decodeCompiledWorkflowDefinitionV3,
} from '../../src/runtime/compiled-workflow-ir-v3.js';

function definition(rejected: unknown = [{ target: 'rejected' }]) {
  return {
    initial: 'start',
    states: {
      start: {
        final: false,
        done: [],
        error: [],
        events: {},
        effects: [
          {
            kind: 'domain-message',
            targetExpression: 'childTarget',
            messageType: 'START',
            rejected,
          },
        ],
      },
      retryable: { final: false, done: [], error: [], events: {} },
      rejected: { final: true, done: [], error: [], events: {} },
    },
    limits: { maxSteps: 16 },
  };
}

test('engine3 decodes a mandatory unconditional rejection fallback', () => {
  const decoded = decodeCompiledWorkflowDefinitionV3('parent', definition());
  assert.deepEqual(decoded.states.start?.effects?.[0]?.rejected, [{ target: 'rejected' }]);
});

test('engine3 allows conditional rejected routes followed by one unconditional fallback', () => {
  const decoded = decodeCompiledWorkflowDefinitionV3(
    'parent',
    definition([
      { target: 'retryable', when: 'rejection.code == "target_terminal"' },
      { target: 'rejected' },
    ]),
  );
  assert.equal(decoded.states.start?.effects?.[0]?.rejected.length, 2);
  assert.equal(decoded.states.start?.effects?.[0]?.rejected[0]?.when, 'rejection.code == "target_terminal"');
});

test('engine3 rejects missing rejection routes', () => {
  const raw = definition() as ReturnType<typeof definition> & {
    states: { start: { effects: Array<Record<string, unknown>> } };
  };
  delete raw.states.start.effects[0]?.rejected;
  assert.throws(
    () => decodeCompiledWorkflowDefinitionV3('parent', raw),
    /requires a non-empty rejected route array/,
  );
});

test('engine3 rejects an empty rejection route array', () => {
  assert.throws(
    () => decodeCompiledWorkflowDefinitionV3('parent', definition([])),
    /requires a non-empty rejected route array/,
  );
});

test('engine3 rejects a rejected route targeting an unknown state', () => {
  assert.throws(
    () => decodeCompiledWorkflowDefinitionV3('parent', definition([{ target: 'missing' }])),
    /route targets unknown state "missing"/,
  );
});

test('engine3 requires every non-final rejected route to be conditional', () => {
  assert.throws(
    () =>
      decodeCompiledWorkflowDefinitionV3(
        'parent',
        definition([{ target: 'retryable' }, { target: 'rejected' }]),
      ),
    /expected a non-empty string/,
  );
});

test('engine3 requires the final rejected route to be unconditional', () => {
  assert.throws(
    () =>
      decodeCompiledWorkflowDefinitionV3(
        'parent',
        definition([{ target: 'rejected', when: 'rejection.code == "x"' }]),
      ),
    /final rejected route must be unconditional/,
  );
});

test('retained engine2 decoder ignores successor rejected metadata and keeps its old IR shape', () => {
  const decoded = decodeCompiledWorkflowDefinition('parent', definition());
  const effect = decoded.states.start?.effects?.[0];
  assert.equal(effect?.kind, 'domain-message');
  assert.equal('rejected' in (effect ?? {}), false);
});
