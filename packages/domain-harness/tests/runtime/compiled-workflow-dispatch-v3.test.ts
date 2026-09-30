import assert from 'node:assert/strict';
import test from 'node:test';

import {
  decodeCompiledWorkflowDefinitionForProfile,
} from '../../src/runtime/compiled-workflow-dispatch.js';
import { decodeCompiledWorkflowDefinitionV3 } from '../../src/runtime/compiled-workflow-ir-v3.js';
import type { CompiledWorkflowIRV2 } from '../../src/runtime/compiled-workflow-ir.js';
import type { CompiledWorkflowIRV3 } from '../../src/runtime/compiled-workflow-ir-v3.js';
import {
  LEGACY_COMPILED_ARTIFACT_PROFILE,
  SUCCESSOR_COMPILED_ARTIFACT_PROFILE,
} from '../../src/v2/contracts/compiled-artifact-profile.js';

function definition() {
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
            targetExpression: '$child',
            messageType: 'START',
            rejected: [{ target: 'rejected' }],
          },
        ],
      },
      rejected: { final: true, done: [], error: [], events: {} },
    },
  };
}

test('successor exact profile decodes through the explicitly installed engine3 decoder', () => {
  const decoded = decodeCompiledWorkflowDefinitionForProfile(
    SUCCESSOR_COMPILED_ARTIFACT_PROFILE,
    'parent',
    definition(),
    { engine3: decodeCompiledWorkflowDefinitionV3 },
  ) as CompiledWorkflowIRV3;

  assert.deepEqual(decoded.states.start?.effects?.[0]?.rejected, [{ target: 'rejected' }]);
});

test('successor exact profile still fails closed when engine3 decoder is absent', () => {
  assert.throws(
    () =>
      decodeCompiledWorkflowDefinitionForProfile(
        SUCCESSOR_COMPILED_ARTIFACT_PROFILE,
        'parent',
        definition(),
      ),
    /successor decoder extension is not installed/,
  );
});

test('legacy exact profile remains on engine2 decoder even when engine3 decoder is available', () => {
  let engine3Calls = 0;
  const decoded = decodeCompiledWorkflowDefinitionForProfile(
    LEGACY_COMPILED_ARTIFACT_PROFILE,
    'parent',
    definition(),
    {
      engine3(workflowId, value) {
        engine3Calls += 1;
        return decodeCompiledWorkflowDefinitionV3(workflowId, value);
      },
    },
  ) as CompiledWorkflowIRV2;

  assert.equal(engine3Calls, 0);
  assert.equal('rejected' in (decoded.states.start?.effects?.[0] ?? {}), false);
});
