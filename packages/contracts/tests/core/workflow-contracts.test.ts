/** v0.11.1 T11：真实机器合同 Schema + 手写结构语义双重负例。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Ajv2020 } from 'ajv/dist/2020.js';
import {
  DH_WORKFLOW_SCHEMA_VERSION,
  WORKFLOW_DEFINITION_JSON_SCHEMA,
  validateWorkflowDefinition,
  functionOutcomeRouteLabel,
  childWorkflowRouteLabel,
  selectWorkflowTarget,
  requiredFunctionCallsForNode,
  hasWorkflowCallBudget,
  withinWorkflowAncestorDepth,
  type WorkflowDefinition,
  type WorkflowFunctionNode,
} from '@kaicreator/domain-harness-contracts';

const element = {
  namespace: 'orders', id: 'decision', version: '1.0.0',
  digest: `sha256:${'a'.repeat(64)}` as `sha256:${string}`,
} as const;
const fn = {
  element, functionId: 'assess', contractVersion: '1',
} as const;

const task: WorkflowDefinition = {
  kind: 'Workflow',
  schemaVersion: DH_WORKFLOW_SCHEMA_VERSION,
  id: 'fulfil-order',
  entryNodeId: 'assess',
  maxElementCalls: 12,
  maxDescendantWorkflowDepth: 2,
  nodes: [
    {
      id: 'assess', kind: 'function', function: fn,
      hooks: { start: { ...fn, functionId: 'start' }, end: { ...fn, functionId: 'end' } },
      switch: { exits: [
        { label: 'APPROVED', target: { nodeId: 'child' } },
        { label: 'REJECTED', target: { terminal: 'REJECT' } },
        { label: 'UNKNOWN', target: { terminal: 'UNKNOWN' } },
        { label: 'FAILED', target: { terminal: 'FAILED' } },
      ] },
    },
    {
      id: 'child', kind: 'workflow',
      workflow: { element, contentId: 'sub-task' },
      switch: { exits: [
        { label: 'COMPLETE', target: { terminal: 'COMPLETE' } },
        { label: 'ASK', target: { terminal: 'ASK' } },
        { label: 'WAIT', target: { terminal: 'WAIT' } },
        { label: 'REJECT', target: { terminal: 'REJECT' } },
        { label: 'UNKNOWN', target: { terminal: 'UNKNOWN' } },
        { label: 'FAILED', target: { terminal: 'FAILED' } },
      ] },
    },
  ],
};
const ajv = new Ajv2020({ allErrors: true, strict: true });
const schema = ajv.compile(WORKFLOW_DEFINITION_JSON_SCHEMA as never);
const clone = (): Record<string, any> => structuredClone(task);

function denied(value: unknown, label: string): void {
  assert.equal(schema(value), false, `${label}: JSON Schema must reject`);
  const custom = validateWorkflowDefinition(value);
  assert.equal(custom.ok, false, `${label}: semantic validator must reject`);
}

test('T11: schema version and multi-node workflow with nested child are valid', () => {
  assert.equal(DH_WORKFLOW_SCHEMA_VERSION, 'dh.workflow/0.11');
  assert.equal(schema(clone()), true, JSON.stringify(schema.errors));
  assert.deepEqual(validateWorkflowDefinition(task), { ok: true });
});

test('T11: a single Function node with terminal is legal; no dummy child required', () => {
  const single = clone();
  single.nodes = [{
    id: 'only', kind: 'function', function: fn,
    switch: { exits: [{ label: 'SUCCEEDED', target: { terminal: 'COMPLETE' } }] },
  }];
  single.entryNodeId = 'only';
  assert.equal(schema(single), true);
  assert.equal(validateWorkflowDefinition(single).ok, true);
});

test('T11: closed-world machine schema rejects unknown root, invalid nesting and missing fields', () => {
  const root = clone(); root.nesting = 'Element';
  denied(root, 'root nesting is not a new Element subtype');
  const tag = clone(); tag.nodes[1].kind = 'non-workflow-nesting';
  denied(tag, 'nested type only workflow');
  const node = clone(); delete node.nodes[0].switch;
  denied(node, 'explicit switch mandatory');
  const zeroBudget = clone(); zeroBudget.maxElementCalls = 0;
  denied(zeroBudget, 'root budget positive');
});

test('T11: duplicate exits, dangling target, unreachable node and missing terminal fail', () => {
  const duplicate = clone();
  duplicate.nodes[0].switch.exits.push({ label: 'APPROVED', target: { terminal: 'COMPLETE' } });
  assert.equal(validateWorkflowDefinition(duplicate).ok, false, 'duplicate exit fails semantic validator');
  const badTarget = clone();
  badTarget.nodes[0].switch.exits[0].target = { nodeId: 'absent' };
  assert.equal(validateWorkflowDefinition(badTarget).ok, false, 'unselected target fails before execution');
  const unreachable = clone();
  unreachable.nodes.push({
    id: 'orphan', kind: 'function', function: fn,
    switch: { exits: [{ label: 'SUCCEEDED', target: { terminal: 'COMPLETE' } }] },
  });
  assert.equal(validateWorkflowDefinition(unreachable).ok, false);
  const terminal = clone();
  terminal.nodes[1].switch.exits = [{ label: 'COMPLETE', target: { nodeId: 'assess' } }];
  terminal.nodes[0].switch.exits = [{ label: 'APPROVED', target: { nodeId: 'child' } }];
  assert.equal(validateWorkflowDefinition(terminal).ok, false, 'infinite graph with no exit is illegal');
});

test('T11: sealed JSON/YAML Reader data requires bounded canonical ResourceRef', () => {
  const data = clone();
  data.nodes[0].data = {
    format: 'yaml',
    resource: { packageId: 'orders', path: 'data/one.yml', digest: `sha256:${'b'.repeat(64)}` },
    maxBytes: 8192,
  };
  assert.equal(schema(data), true, JSON.stringify(schema.errors));
  assert.equal(validateWorkflowDefinition(data).ok, true);
  const bad = structuredClone(data);
  bad.nodes[0].data.resource.path = '../private.yml';
  denied(bad, 'no path traversal');
  const tooBig = structuredClone(data);
  tooBig.nodes[0].data.maxBytes = 1048577;
  denied(tooBig, 'reader max bytes');
  const tag = structuredClone(data);
  tag.nodes[0].data.format = 'exec';
  denied(tag, 'unsupported reader format');
});

test('T11: output labels are strict and missing business labels never fall back to SUCCEEDED', () => {
  const exits = [
    { label: 'APPROVED', target: { terminal: 'COMPLETE' as const } },
    { label: 'SUCCEEDED', target: { terminal: 'COMPLETE' as const } },
    { label: 'UNKNOWN', target: { terminal: 'UNKNOWN' as const } },
  ];
  assert.equal(functionOutcomeRouteLabel({ kind: 'SUCCEEDED', value: { route: 'APPROVED' } }), 'APPROVED');
  assert.deepEqual(selectWorkflowTarget(exits, 'APPROVED'), { terminal: 'COMPLETE' });
  assert.equal(functionOutcomeRouteLabel({ kind: 'SUCCEEDED', value: { route: '' } }), null);
  assert.equal(functionOutcomeRouteLabel({ kind: 'SUCCEEDED', value: { route: 5 } }), null);
  assert.equal(functionOutcomeRouteLabel({ kind: 'SUCCEEDED', value: 42 }), 'SUCCEEDED');
  assert.equal(functionOutcomeRouteLabel({
    kind: 'UNKNOWN', unknownReason: { code: 'X', message: 'missing facts' },
  }), 'UNKNOWN');
  assert.equal(childWorkflowRouteLabel({ status: 'WAIT', reason: { code: 'X', message: 'wait' } }), 'WAIT');
  assert.equal(selectWorkflowTarget(exits, 'BAD'), null, 'unmatched label cannot become success');
  assert.equal(selectWorkflowTarget([exits[0]!, exits[0]!], 'APPROVED'), null, 'duplicate label fails closed');
});

test('T11: reserve all selected start/leaf/end credits before first Hook side-effect', () => {
  const node = task.nodes[0] as WorkflowFunctionNode;
  assert.equal(requiredFunctionCallsForNode(node), 3);
  assert.equal(hasWorkflowCallBudget(2, node), false);
  assert.equal(hasWorkflowCallBudget(3, node), true);
  assert.equal(hasWorkflowCallBudget(-1, node), false);
  const plain = { ...node, hooks: undefined };
  assert.equal(requiredFunctionCallsForNode(plain), 1);
  assert.equal(withinWorkflowAncestorDepth([{ maxDescendantWorkflowDepth: 1 }]), true);
  assert.equal(withinWorkflowAncestorDepth([
    { maxDescendantWorkflowDepth: 1 }, { maxDescendantWorkflowDepth: 0 },
  ]), true);
  assert.equal(withinWorkflowAncestorDepth([
    { maxDescendantWorkflowDepth: 1 }, { maxDescendantWorkflowDepth: 0 },
    { maxDescendantWorkflowDepth: 0 },
  ]), false, 'root and inner ancestors both enforce relative subtree depth');
});
