import assert from 'node:assert/strict';
import test from 'node:test';

import type { WorkflowAst } from '../src/loader/ast.js';
import { validateWorkflowStructure } from '../src/loader/static-validation.js';

test('executable state must have a success route', () => {
  const workflow: WorkflowAst = {
    id: 'missing-done',
    sourcePath: 'workflows/missing-done.yaml',
    initial: 'work',
    states: {
      work: {
        id: 'work',
        final: false,
        invoke: { kind: 'expr', expression: '1' },
        done: [],
        error: [{ target: 'failed' }],
        events: {},
      },
      failed: { id: 'failed', final: true, done: [], error: [], events: {} },
    },
  };

  assert.match(
    validateWorkflowStructure(workflow).join('\n'),
    /executable state must declare at least one on\.done route/,
  );
});
