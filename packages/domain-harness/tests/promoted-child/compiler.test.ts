import assert from 'node:assert/strict';
import test from 'node:test';
import { adaptDomainWorkflowToXState } from '../../src/workflow/internal/xstate-adapter.js';
import {
  compilePromotedChild,
  DynamicChildExecutionError,
  parsePromotedChildEnvelope,
  parsePromotedChildWorkflowBody,
} from '../../src/promoted-child/index.js';
import { makeEnvelope, promotedFixture } from './helpers.js';

async function bodyFor(overrides = {}) {
  const fixture = await promotedFixture(overrides);
  return fixture.body;
}

test('compiler: valid envelope compiles to a deterministic executable definition', async () => {
  const body = await bodyFor();
  const first = compilePromotedChild(body);
  const second = compilePromotedChild(body);
  assert.deepEqual(first.definition, second.definition, 'compile must be deterministic for the same exact body');
  assert.equal(
    first.definition.workflowKey,
    `promoted-child/${body.identity.artifactId}@${body.identity.contentDigest}`,
  );
  assert.equal(first.definition.initialState, 'node:fetch');
  assert.equal(first.steps.length, 3);
  assert.deepEqual(first.steps.map((step) => step.node), ['fetch', 'notify', 'finish']);
  assert.deepEqual(first.steps.map((step) => step.operationOrdinal), [1, 2, 3]);
  const terminal = first.definition.states.find((state) => state.stateKey === 'node:finish');
  assert.equal(terminal?.kind, 'final');
  const query = first.definition.states.find((state) => state.stateKey === 'node:fetch');
  assert.equal(query?.invocations?.[0]?.operationKey, 'tool:price@digest-tool:price');
});

test('compiler: compiled definition runs through the selected engine adapter (no peer runtime)', async () => {
  const body = await bodyFor();
  const compiled = compilePromotedChild(body);
  const adapted = adaptDomainWorkflowToXState(compiled.definition);
  assert.equal(adapted.initial, 'node:fetch');
  assert.ok(Object.keys(adapted.states).includes('node:finish'));
});

test('compiler: control-flow cycle fails closed', async () => {
  const body = await bodyFor({
    control: {
      startNode: 'a',
      nodes: ['a', 'b'],
      edges: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'a' },
      ],
      maxSteps: 4,
    },
    bodyNodes: [
      { node: 'a', step: { kind: 'terminal-output', output: { kind: 'literal', value: 'x' } } },
      { node: 'b', step: { kind: 'emit-event', eventType: 'QUOTE_PREPARED' } },
    ],
    events: ['QUOTE_PREPARED'],
  });
  await assert.rejects(
    async () => compilePromotedChild(body),
    (error: unknown) => error instanceof DynamicChildExecutionError && error.code === 'DYNAMIC_CHILD_CYCLE_FORBIDDEN',
  );
});

test('compiler: self cycle fails closed', async () => {
  const body = await bodyFor({
    control: { startNode: 'a', nodes: ['a'], edges: [{ from: 'a', to: 'a' }], maxSteps: 2 },
    bodyNodes: [{ node: 'a', step: { kind: 'terminal-output', output: { kind: 'literal', value: 1 } } }],
  });
  await assert.rejects(
    async () => compilePromotedChild(body),
    (error: unknown) => error instanceof DynamicChildExecutionError && error.code === 'DYNAMIC_CHILD_CYCLE_FORBIDDEN',
  );
});

test('compiler: reasoned step fails closed (L2 §11.6 allowance)', async () => {
  const body = await bodyFor({
    bodyNodes: [
      { node: 'think', step: { kind: 'reasoned', harnessConfig: { kind: 'harness-config', artifactId: 'hc:1', contentDigest: 'digest-hc:1' } } },
      { node: 'finish', step: { kind: 'terminal-output', output: { kind: 'literal', value: 'done' } } },
    ],
    control: { startNode: 'think', nodes: ['think', 'finish'], edges: [{ from: 'think', to: 'finish' }], maxSteps: 3 },
  });
  await assert.rejects(
    async () => compilePromotedChild(body),
    (error: unknown) => error instanceof DynamicChildExecutionError && error.code === 'DYNAMIC_CHILD_REASONED_STEP_UNSUPPORTED',
  );
});

test('compiler: query step outside the tools allowlist fails closed', async () => {
  const body = await bodyFor({
    bodyNodes: [
      { node: 'fetch', step: { kind: 'query', tool: { kind: 'tool', artifactId: 'tool:evil', contentDigest: 'digest-tool:evil' }, input: { kind: 'input', path: 'sku' } } },
      { node: 'finish', step: { kind: 'terminal-output', output: { kind: 'literal', value: 'ok' } } },
    ],
    control: { startNode: 'fetch', nodes: ['fetch', 'finish'], edges: [{ from: 'fetch', to: 'finish' }], maxSteps: 3 },
  });
  await assert.rejects(
    async () => compilePromotedChild(body),
    (error: unknown) => error instanceof DynamicChildExecutionError && error.code === 'DYNAMIC_CHILD_COMPILE_INVALID',
  );
});

test('compiler: mutation-capable binding is forbidden when the envelope mutation is none', async () => {
  const body = await bodyFor({
    bodyNodes: [
      { node: 'mutate', step: { kind: 'effect-intent', effect: { kind: 'tool', artifactId: 'effect:write', contentDigest: 'digest-effect:write' }, input: { kind: 'literal', value: {} } } },
      { node: 'finish', step: { kind: 'terminal-output', output: { kind: 'literal', value: 'ok' } } },
    ],
    control: { startNode: 'mutate', nodes: ['mutate', 'finish'], edges: [{ from: 'mutate', to: 'finish' }], maxSteps: 3 },
  });
  await assert.rejects(
    async () => compilePromotedChild(body),
    (error: unknown) => error instanceof DynamicChildExecutionError && error.code === 'DYNAMIC_CHILD_MUTATION_BINDING_FORBIDDEN',
  );
});

test('compiler: effect outside the declared mutation.effects allowlist fails closed', async () => {
  const body = await bodyFor({
    mutation: { kind: 'durable-effect', effects: [{ kind: 'tool', artifactId: 'effect:reserve', contentDigest: 'digest-effect:reserve' }] },
    bodyNodes: [
      { node: 'mutate', step: { kind: 'effect-intent', effect: { kind: 'tool', artifactId: 'effect:other', contentDigest: 'digest-effect:other' }, input: { kind: 'literal', value: {} } } },
      { node: 'finish', step: { kind: 'terminal-output', output: { kind: 'literal', value: 'ok' } } },
    ],
    control: { startNode: 'mutate', nodes: ['mutate', 'finish'], edges: [{ from: 'mutate', to: 'finish' }], maxSteps: 3 },
  });
  await assert.rejects(
    async () => compilePromotedChild(body),
    (error: unknown) => error instanceof DynamicChildExecutionError && error.code === 'DYNAMIC_CHILD_EFFECT_NOT_ALLOWED',
  );
});

test('compiler: undeclared Domain Event fails closed', async () => {
  const body = await bodyFor({
    bodyNodes: [
      { node: 'emit', step: { kind: 'emit-event', eventType: 'UNDECLARED_EVENT' } },
      { node: 'finish', step: { kind: 'terminal-output', output: { kind: 'literal', value: 'ok' } } },
    ],
    control: { startNode: 'emit', nodes: ['emit', 'finish'], edges: [{ from: 'emit', to: 'finish' }], maxSteps: 3 },
  });
  await assert.rejects(
    async () => compilePromotedChild(body),
    (error: unknown) => error instanceof DynamicChildExecutionError && error.code === 'DYNAMIC_CHILD_EVENT_NOT_ALLOWED',
  );
});

test('compiler: unreachable node and insufficient maxSteps fail closed', async () => {
  const unreachable = await bodyFor({
    bodyNodes: [
      { node: 'a', step: { kind: 'emit-event', eventType: 'QUOTE_PREPARED' } },
      { node: 'orphan', step: { kind: 'emit-event', eventType: 'QUOTE_PREPARED' } },
      { node: 'finish', step: { kind: 'terminal-output', output: { kind: 'literal', value: 'ok' } } },
    ],
    control: {
      startNode: 'a',
      nodes: ['a', 'orphan', 'finish'],
      edges: [{ from: 'a', to: 'finish' }],
      maxSteps: 5,
    },
  });
  await assert.rejects(
    async () => compilePromotedChild(unreachable),
    (error: unknown) => error instanceof DynamicChildExecutionError && error.code === 'DYNAMIC_CHILD_COMPILE_INVALID',
  );

  const tight = await bodyFor({
    control: {
      startNode: 'fetch',
      nodes: ['fetch', 'notify', 'finish'],
      edges: [
        { from: 'fetch', to: 'notify' },
        { from: 'notify', to: 'finish' },
      ],
      maxSteps: 2,
    },
  });
  await assert.rejects(
    async () => compilePromotedChild(tight),
    (error: unknown) => error instanceof DynamicChildExecutionError && error.code === 'DYNAMIC_CHILD_COMPILE_INVALID',
  );
});

test('compiler: a non-terminal sink node fails closed (definition must not dead-end)', async () => {
  const body = await bodyFor({
    bodyNodes: [
      { node: 'a', step: { kind: 'emit-event', eventType: 'QUOTE_PREPARED' } },
      { node: 'sink', step: { kind: 'emit-event', eventType: 'QUOTE_PREPARED' } },
      { node: 'z', step: { kind: 'terminal-output', output: { kind: 'literal', value: 'ok' } } },
    ],
    control: {
      startNode: 'a',
      nodes: ['a', 'sink', 'z'],
      edges: [
        { from: 'a', to: 'sink' },
        { from: 'a', to: 'z' },
      ],
      maxSteps: 5,
    },
  });
  await assert.rejects(
    async () => compilePromotedChild(body),
    (error: unknown) => error instanceof DynamicChildExecutionError && error.code === 'DYNAMIC_CHILD_COMPILE_INVALID',
  );
});

test('compiler: duplicate control edges fail closed at compile, not inside the engine adapter', async () => {
  const body = await bodyFor({
    control: {
      startNode: 'fetch',
      nodes: ['fetch', 'notify', 'finish'],
      edges: [
        { from: 'fetch', to: 'notify' },
        { from: 'fetch', to: 'notify' },
        { from: 'notify', to: 'finish' },
      ],
      maxSteps: 5,
    },
  });
  await assert.rejects(
    async () => compilePromotedChild(body),
    (error: unknown) => error instanceof DynamicChildExecutionError && error.code === 'DYNAMIC_CHILD_COMPILE_INVALID',
  );
});

test('compiler: non-workflow candidate kind and bad body schema fail closed', async () => {
  const wrongKind = makeEnvelope({ candidateKind: 'rule' });
  assert.throws(
    () => parsePromotedChildEnvelope(wrongKind),
    (error: unknown) => error instanceof DynamicChildExecutionError && error.code === 'DYNAMIC_CHILD_BODY_INVALID',
  );
  assert.throws(
    () => parsePromotedChildWorkflowBody({ schemaVersion: 'other/v9', nodes: [] }),
    (error: unknown) => error instanceof DynamicChildExecutionError && error.code === 'DYNAMIC_CHILD_BODY_INVALID',
  );
});

test('compiler: step-output referencing a later step fails closed', async () => {
  const body = await bodyFor({
    bodyNodes: [
      { node: 'a', step: { kind: 'emit-event', eventType: 'QUOTE_PREPARED', payload: { kind: 'step-output', node: 'b', path: 'x' } } },
      { node: 'b', step: { kind: 'query', tool: { kind: 'tool', artifactId: 'tool:price', contentDigest: 'digest-tool:price' }, input: { kind: 'input', path: 'sku' } } },
      { node: 'finish', step: { kind: 'terminal-output', output: { kind: 'literal', value: 'ok' } } },
    ],
    control: {
      startNode: 'a',
      nodes: ['a', 'b', 'finish'],
      edges: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'finish' },
      ],
      maxSteps: 4,
    },
  });
  await assert.rejects(
    async () => compilePromotedChild(body),
    (error: unknown) => error instanceof DynamicChildExecutionError && error.code === 'DYNAMIC_CHILD_COMPILE_INVALID',
  );
});
