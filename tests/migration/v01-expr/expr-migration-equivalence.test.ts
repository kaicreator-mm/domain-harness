import assert from 'node:assert/strict';
import test from 'node:test';

import { translateV01ExprWorkflow, V01ExprMigrationError } from '../../../packages/domain-harness-compiler/src/compat/v01-expr/index.js';
import type { RawWorkflow } from '../../../packages/domain-harness-compiler/src/raw/types.js';
import { ExpressionRuntime } from '../../../packages/domain-harness/src/expression/expression-runtime.js';
import { ExpressionToolExecutor } from '../../../packages/domain-harness/src/expression/expression-tool.js';
import { RouteEvaluator } from '../../../packages/domain-harness/src/runner/route-evaluator.js';
import { StepDispatcher } from '../../../packages/domain-harness/src/runner/step-dispatcher.js';

const LOGICAL_TIME = '2026-09-18T12:00:00.000Z';
const EXPRESSION = '{"route": input.score >= 80 ? "approved" : "review", "weightedScore": input.score * input.multiplier, "summary": input.name & ":" & (input.score >= 80 ? "A" : "R")}';

function referenceWorkflow(sourcePath = 'workflows/decision.yaml'): RawWorkflow {
  return {
    id: 'decision',
    sourcePath,
    initial: 'evaluate',
    states: {
      evaluate: {
        id: 'evaluate',
        final: false,
        invoke: {
          kind: 'expr',
          expression: EXPRESSION,
          input: 'message.payload',
          timeoutMs: 250,
        },
        done: [
          { target: 'approved', when: 'output.route = "approved"' },
          { target: 'review' },
        ],
        error: [{ target: 'failed' }],
        events: {},
      },
      approved: {
        id: 'approved',
        final: true,
        done: [],
        error: [],
        events: {},
      },
      review: {
        id: 'review',
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

async function executeFrozenV01Expr(input: Record<string, string | number>) {
  const dispatcher = new StepDispatcher(
    new ExpressionRuntime(),
    null as never,
    null as never,
    null as never,
    () => undefined,
  );
  return dispatcher.execute({
    invoke: { kind: 'expr', expression: EXPRESSION, timeoutMs: 250 },
    input,
    expressionScope: { input },
    harnessRoot: '.',
    runId: 'g31-run',
    workflowInstanceId: 'g31-instance',
    stateId: 'evaluate',
    visit: 1,
    attempt: 1,
    idempotencyKey: 'g31-idempotency',
    startedAt: LOGICAL_TIME,
    signal: new AbortController().signal,
  });
}

async function observableRouteAndOutput(
  result: unknown,
  input: Record<string, string | number>,
) {
  assert.ok(result !== null && typeof result === 'object' && !Array.isArray(result));
  const output = result as Record<string, unknown>;
  assert.ok(output.route === 'approved' || output.route === 'review');

  const routes = referenceWorkflow().states.evaluate!.done;
  const selection = await new RouteEvaluator(new ExpressionRuntime()).select(
    'evaluate',
    'done',
    routes,
    {
      input,
      steps: {},
      run: { visits: { evaluate: 1 } },
      output: output as never,
    },
    LOGICAL_TIME,
  );
  const selectedRoute = routes[selection.routeIndex];
  assert.ok(selectedRoute);
  return { state: selectedRoute.target, output };
}

test('build-time translation deterministically replaces v0.1 expr with a synthetic Expression Domain Tool', () => {
  const source = referenceWorkflow();
  const first = translateV01ExprWorkflow(source);
  const second = translateV01ExprWorkflow(referenceWorkflow());
  const relocated = translateV01ExprWorkflow(referenceWorkflow('/tmp/relocated/workflows/decision.yaml'));

  assert.deepEqual(second, first);
  assert.equal(first.tools.length, 1);
  assert.equal(relocated.tools[0]?.toolId, first.tools[0]?.toolId, 'filesystem relocation must not change identity');

  const tool = first.tools[0];
  assert.ok(tool);
  assert.match(tool.toolId, /^__v01_expr_[0-9a-f]{64}$/);
  assert.deepEqual(tool.source, { workflowId: 'decision', stateId: 'evaluate' });
  assert.equal(tool.kind, 'expression');
  assert.equal(tool.effect, 'none');
  assert.equal(tool.descriptor.expression, EXPRESSION);

  const migratedInvoke = first.workflow.states.evaluate?.invoke;
  assert.deepEqual(migratedInvoke, {
    kind: 'tool',
    ref: tool.toolId,
    input: 'message.payload',
    timeoutMs: 250,
  });
  assert.equal(source.states.evaluate?.invoke?.kind, 'expr', 'translation must not mutate frozen v0.1 input');

  const callSiteChanged = referenceWorkflow();
  callSiteChanged.states.evaluate!.invoke = {
    ...callSiteChanged.states.evaluate!.invoke!,
    input: 'other.payload',
    timeoutMs: 999,
  };
  assert.equal(
    translateV01ExprWorkflow(callSiteChanged).tools[0]?.toolId,
    tool.toolId,
    'call-site input/timeout metadata must not change expression source identity',
  );

  const changed = referenceWorkflow();
  changed.states.evaluate!.invoke = {
    ...changed.states.evaluate!.invoke!,
    expression: '{"route": "changed"}',
  };
  assert.notEqual(
    translateV01ExprWorkflow(changed).tools[0]?.toolId,
    tool.toolId,
    'changed expression source must produce a different synthetic Tool identity',
  );
});

test('G31/AC-43: non-trivial route/output behavior is equivalent through the Expression Domain Tool', async () => {
  const migrated = translateV01ExprWorkflow(referenceWorkflow());
  const tool = migrated.tools[0];
  assert.ok(tool);
  const executor = new ExpressionToolExecutor();

  const fixtures = [
    { name: 'alpha', score: 91, multiplier: 1.5 },
    { name: 'beta', score: 63, multiplier: 1.25 },
  ];

  for (const input of fixtures) {
    const legacyResult = await executeFrozenV01Expr(input);
    const migratedResult = await executor.execute(tool.descriptor, input, LOGICAL_TIME);
    assert.deepEqual(
      await observableRouteAndOutput(migratedResult, input),
      await observableRouteAndOutput(legacyResult, input),
      `public route/output mismatch for ${input.name}`,
    );
  }
});

test('malformed legacy expr fails closed during migration', () => {
  const workflow = referenceWorkflow();
  workflow.states.evaluate!.invoke = { kind: 'expr', expression: '   ' };
  assert.throws(
    () => translateV01ExprWorkflow(workflow),
    (error: unknown) => error instanceof V01ExprMigrationError && /missing expression source/.test(error.message),
  );
});
