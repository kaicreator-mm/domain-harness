/**
 * T14 authored-domain fixture. No runtime/Kernel shortcut: these are ordinary
 * Element content, selected FunctionRefs and real on-disk JSON/YAML resources.
 * The independent consumer BUILDs and Boots this graph from four packed workspaces.
 */
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { contentDigestOf, DH_ELEMENT_SCHEMA_VERSION } from '@kaicreator/domain-harness';

const values = [
  ['json-a', 'json', '{"id":"json-a","result":1}\n'],
  ['json-b', 'json', '{"id":"json-b","result":2}\n'],
  ['yaml-a', 'yaml', 'id: yaml-a\nresult: 3\n'],
  ['yaml-b', 'yaml', 'id: yaml-b\nresult: 4\n'],
];

function ref(rules, functionId) {
  return {
    element: { namespace: 'basic', id: rules.id, version: rules.version, digest: contentDigestOf(rules) },
    functionId, contractVersion: '1',
  };
}
function node(id, source, functionRef, next, hooks) {
  return {
    id, kind: 'function', function: functionRef,
    data: { format: source.format, resource: source.resource, maxBytes: 4096 },
    ...(hooks ? { hooks } : {}),
    switch: { exits: [
      { label: 'SUCCEEDED', target: next },
      { label: 'UNKNOWN', target: { terminal: 'UNKNOWN' } },
      { label: 'FAILED', target: { terminal: 'FAILED' } },
    ] },
  };
}
const workflow = (id, entryNodeId, nodes, maxElementCalls, maxDescendantWorkflowDepth) => ({
  kind: 'Workflow', schemaVersion: 'dh.workflow/0.11', id, entryNodeId, nodes,
  maxElementCalls, maxDescendantWorkflowDepth,
});
const content = (id, value) => ({
  id, contentKind: 'workflow-definition', schemaRef: { inline: { type: 'object' } },
  required: true, value,
});
export async function prepareWorkflowElements(dirs, rules, app, fn) {
  const schema = {
    type: 'object', required: ['format', 'source', 'value'],
    properties: {
      format: { enum: ['json', 'yaml'] }, source: { type: 'string' }, value: { type: 'object' },
    },
  };
  rules.functions.push(
    fn('jsonReader', schema, { type: 'object' }),
    fn('yamlReader', schema, { type: 'object' }),
    fn('startWorkflow', { type: 'object' }, { type: 'object' }),
    fn('endWorkflow', { type: 'object' }, { type: 'object' }),
    { ...fn('workflowDecision', { type: 'object' }, { type: 'object' }),
      outcomes: ['SUCCEEDED', 'UNKNOWN', 'FAILED'] },
  );
  const sources = {};
  for (const [id, format, source] of values) {
    const bytes = Buffer.from(source, 'utf8');
    const relativePath = `content/workflow-${id}.${format === 'json' ? 'json' : 'yml'}`;
    const path = join(dirs['rules-package'], ...relativePath.split('/'));
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
    sources[id] = {
      format, resource: {
        packageId: 'rules-package', path: relativePath,
        digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
      },
    };
  }
  // Four separate public, zero-Function Data Elements expose the exact resource
  // metadata used by the same two selected Reader Functions. YAML raw bytes remain
  // ResourceRef data, never a general structured-data ContentBlock.ref JSON shortcut.
  const dataElements = Object.entries(sources).map(([id, source]) => ({
    kind: 'Element', schemaVersion: DH_ELEMENT_SCHEMA_VERSION,
    id: `basic.data_${id.replaceAll('-', '_')}`, version: '1.0.0',
    description: `Selected ${source.format} data Element ${id}`,
    content: [{
      id: 'source', contentKind: 'structured-data',
      schemaRef: { inline: { type: 'object' } }, required: true,
      value: { format: source.format, resource: source.resource, maxBytes: 4096 },
    }],
    functions: [],
  }));
  const ruleDependency = app.dependencies.find((entry) => entry.element === 'basic.rules');
  if (!ruleDependency || !Array.isArray(ruleDependency.functions)) {
    throw new Error('T14 fixture must preserve direct Element dependency on basic.rules');
  }
  ruleDependency.functions.push('jsonReader', 'yamlReader', 'startWorkflow', 'endWorkflow', 'workflowDecision');
  app.dependencies.push(...dataElements.map((el) => ({ element: el.id, version: el.version })));
  const jsonReader = ref(rules, 'jsonReader');
  const yamlReader = ref(rules, 'yamlReader');
  const hooks = { start: ref(rules, 'startWorkflow'), end: ref(rules, 'endWorkflow') };
  const child = {
    kind: 'Element', schemaVersion: DH_ELEMENT_SCHEMA_VERSION,
    id: 'basic.workflow_child', version: '1.0.0',
    description: 'Selected child Workflow content for real actor nesting.',
    content: [
      content('child-flow', workflow('child-flow', 'json-child', [
        node('json-child', sources['json-b'], jsonReader, { terminal: 'COMPLETE' }),
      ], 1, 0)),
    ],
    functions: [],
    dependencies: [
      { element: 'basic.rules', version: '1.0.0', functions: ['jsonReader'] },
      { element: 'basic.data_json_b', version: '1.0.0' },
    ],
  };
  const childRef = {
    element: {
      namespace: 'basic', id: child.id, version: child.version, digest: contentDigestOf(child),
    }, contentId: 'child-flow',
  };
  const parent = workflow('parent-flow', 'json-parent', [
    node('json-parent', sources['json-a'], jsonReader, { nodeId: 'yaml-parent' }, hooks),
    node('yaml-parent', sources['yaml-a'], yamlReader, { nodeId: 'child-node' }),
    { id: 'child-node', kind: 'workflow', workflow: childRef,
      switch: { exits: [
        { label: 'COMPLETE', target: { nodeId: 'yaml-final' } },
        { label: 'UNKNOWN', target: { terminal: 'UNKNOWN' } },
        { label: 'FAILED', target: { terminal: 'FAILED' } },
      ] } },
    node('yaml-final', sources['yaml-b'], yamlReader, { terminal: 'COMPLETE' }),
  ], 6, 1);
  // 同一 Package.Init 启动的附加选定根：真实命名 Switch 终态、预算和祖先深度。
  const namedSwitch = ['COMPLETE', 'ASK', 'WAIT', 'REJECT', 'UNKNOWN', 'FAILED']
    .map((label) => ({ label, target: { terminal: label } }));
  const additional = {
    'single-flow': workflow('single-flow', 'single',
      [node('single', sources['yaml-b'], yamlReader, { terminal: 'COMPLETE' })], 1, 0),
    'decision-flow': workflow('decision-flow', 'decision', [{
      id: 'decision', kind: 'function', function: ref(rules, 'workflowDecision'),
      switch: { exits: namedSwitch },
    }], 1, 0),
    'budget-flow': workflow('budget-flow', 'budget-leaf',
      [node('budget-leaf', sources['json-a'], jsonReader, { terminal: 'COMPLETE' }, hooks)], 2, 0),
    'shared-budget-flow': workflow('shared-budget-flow', 'first', [
      node('first', sources['json-a'], jsonReader, { nodeId: 'child' }),
      { id: 'child', kind: 'workflow', workflow: childRef, switch: {
        exits: [{ label: 'COMPLETE', target: { terminal: 'COMPLETE' } },
          { label: 'UNKNOWN', target: { terminal: 'UNKNOWN' } },
          { label: 'FAILED', target: { terminal: 'FAILED' } }],
      } },
    ], 1, 1),
    'depth-flow': workflow('depth-flow', 'child', [{
      id: 'child', kind: 'workflow', workflow: childRef,
      switch: { exits: [
        { label: 'COMPLETE', target: { terminal: 'COMPLETE' } },
        { label: 'FAILED', target: { terminal: 'FAILED' } },
      ] },
    }], 6, 0),
  };
  app.content.push(content('parent-flow', parent));
  for (const [id, definition] of Object.entries(additional)) app.content.push(content(id, definition));
  app.dependencies.push({ element: child.id, version: child.version });
  const rootRef = {
    element: { namespace: 'basic', id: app.id, version: app.version, digest: contentDigestOf(app) },
    contentId: 'parent-flow',
  };
  const caseRefs = Object.fromEntries(Object.keys(additional).map((contentId) => [
    contentId, { element: rootRef.element, contentId },
  ]));
  return { child, rootRef, caseRefs, sources, dataElements, readerRefs: [
    jsonReader, yamlReader, hooks.start, hooks.end, ref(rules, 'workflowDecision'),
  ] };
}
