/** v0.11.1：Workflow Content 专用语义校验，不改变 v0.11.0 Element 根定义。 */
import type { ValidationIssue, ValidationResult } from './validate.js';
import { isRelativeResourcePath } from './validate.js';
import { isContentDigest } from './digest.js';
import { DH_WORKFLOW_SCHEMA_VERSION } from './schema-versions.js';

const ID = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9_])?$/u;
const SEMVER = /^\d+\.\d+\.\d+$/u;
const MAX_WORKFLOW_NODES = 10000;
const TERMINALS = new Set(['COMPLETE', 'REJECT', 'ASK', 'WAIT', 'UNKNOWN', 'FAILED']);
type ObjectValue = Record<string, unknown>;

function record(value: unknown): value is ObjectValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function id(value: unknown): value is string {
  return typeof value === 'string' && ID.test(value);
}

function positiveBound(value: unknown, max: number, min = 1): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}

export function validateWorkflowDefinition(value: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  const fail = (path: string, message: string): void => {
    issues.push({ code: 'DH_BUILD_SCHEMA_INVALID', path, message });
  };
  const keys = (obj: ObjectValue, allowed: readonly string[], path: string): void => {
    for (const key of Object.keys(obj)) {
      if (!allowed.includes(key)) fail(`${path}.${key}`, `unknown Workflow contract field '${key}'`);
    }
  };
  const checkElement = (value: unknown, path: string): void => {
    if (!record(value)) { fail(path, 'expected ElementRef object'); return; }
    keys(value, ['namespace', 'id', 'version', 'digest'], path);
    if (!id(value['namespace']) || !id(value['id']) ||
        typeof value['version'] !== 'string' || !SEMVER.test(value['version']) ||
        !isContentDigest(value['digest'])) {
      fail(path, 'ElementRef requires namespace, id, SemVer and exact sha256 digest');
    }
  };
  const checkFunction = (value: unknown, path: string): void => {
    if (!record(value)) { fail(path, 'expected FunctionRef object'); return; }
    keys(value, ['element', 'functionId', 'contractVersion'], path);
    checkElement(value['element'], `${path}.element`);
    if (!id(value['functionId']) ||
        typeof value['contractVersion'] !== 'string' || value['contractVersion'].length === 0) {
      fail(path, 'FunctionRef requires exact functionId and contractVersion');
    }
  };
  const checkWorkflowRef = (value: unknown, path: string): void => {
    if (!record(value)) { fail(path, 'expected WorkflowRef object'); return; }
    keys(value, ['element', 'contentId'], path);
    checkElement(value['element'], `${path}.element`);
    if (!id(value['contentId'])) fail(`${path}.contentId`, 'WorkflowRef requires a content block id');
  };
  const checkData = (value: unknown, path: string): void => {
    if (!record(value)) { fail(path, 'expected sealed data resource declaration'); return; }
    keys(value, ['format', 'resource', 'maxBytes'], path);
    if (value['format'] !== 'json' && value['format'] !== 'yaml')
      fail(`${path}.format`, 'format must be json or yaml');
    if (!positiveBound(value['maxBytes'], 1048576)) fail(`${path}.maxBytes`, 'maxBytes must be 1..1048576');
    const resource = value['resource'];
    if (!record(resource)) {
      fail(`${path}.resource`, 'expected ResourceRef object');
    } else {
      keys(resource, ['packageId', 'path', 'digest'], `${path}.resource`);
      if (typeof resource['packageId'] !== 'string' || !id(resource['packageId']) ||
          !isRelativeResourcePath(resource['path']) || !isContentDigest(resource['digest'])) {
        fail(`${path}.resource`, 'data must reference a BUILD-sealed package-root file with digest');
      }
    }
  };

  if (!record(value)) return { ok: false, issues: [{ code: 'DH_BUILD_SCHEMA_INVALID', path: 'workflow', message: 'expected Workflow object' }] };
  keys(value, ['kind', 'schemaVersion', 'id', 'entryNodeId',
    'maxElementCalls', 'maxDescendantWorkflowDepth', 'nodes'], 'workflow');
  if (value['kind'] !== 'Workflow') fail('workflow.kind', "kind must be 'Workflow'");
  if (value['schemaVersion'] !== DH_WORKFLOW_SCHEMA_VERSION)
    fail('workflow.schemaVersion', `schemaVersion must be '${DH_WORKFLOW_SCHEMA_VERSION}'`);
  if (!id(value['id'])) fail('workflow.id', 'Workflow id must be a valid identifier');
  if (!id(value['entryNodeId'])) fail('workflow.entryNodeId', 'entryNodeId must be an identifier');
  if (!positiveBound(value['maxElementCalls'], 100000))
    fail('workflow.maxElementCalls', 'root call budget must be an integer 1..100000');
  if (!positiveBound(value['maxDescendantWorkflowDepth'], 32, 0))
    fail('workflow.maxDescendantWorkflowDepth', 'per-Workflow descendant depth must be an integer 0..32');

  const nodes = value['nodes'];
  if (!Array.isArray(nodes) || nodes.length < 1 || nodes.length > MAX_WORKFLOW_NODES) {
    fail('workflow.nodes', 'nodes must contain 1..10000 entries');
    return { ok: false, issues };
  }

  const ids = new Set<string>();
  const targets: { source: string; destination: string }[] = [];
  let terminalCount = 0;
  nodes.forEach((item: unknown, i: number) => {
    const path = `workflow.nodes[${i}]`;
    if (!record(item)) { fail(path, 'expected Workflow node object'); return; }
    const nodeId = item['id'];
    if (!id(nodeId)) fail(`${path}.id`, 'invalid node id');
    else {
      if (ids.has(nodeId)) fail(`${path}.id`, 'duplicate node id');
      ids.add(nodeId);
    }
    if (item['kind'] === 'function') {
      keys(item, ['id', 'kind', 'function', 'data', 'hooks', 'switch'], path);
      checkFunction(item['function'], `${path}.function`);
      if (item['data'] !== undefined) checkData(item['data'], `${path}.data`);
      if (item['hooks'] !== undefined) {
        const hooks = item['hooks'];
        if (!record(hooks) || (!('start' in hooks) && !('end' in hooks))) {
          fail(`${path}.hooks`, 'hooks must declare start or end');
        } else {
          keys(hooks, ['start', 'end'], `${path}.hooks`);
          if (hooks['start'] !== undefined) checkFunction(hooks['start'], `${path}.hooks.start`);
          if (hooks['end'] !== undefined) checkFunction(hooks['end'], `${path}.hooks.end`);
        }
      }
    } else if (item['kind'] === 'workflow') {
      keys(item, ['id', 'kind', 'workflow', 'switch'], path);
      checkWorkflowRef(item['workflow'], `${path}.workflow`);
    } else {
      fail(`${path}.kind`, 'only function nodes and workflow child nodes are supported');
    }

    const selection = item['switch'];
    if (!record(selection)) { fail(`${path}.switch`, 'missing explicit Switch'); return; }
    keys(selection, ['exits'], `${path}.switch`);
    const exits = selection['exits'];
    if (!Array.isArray(exits) || exits.length === 0 || exits.length > 256) {
      fail(`${path}.switch.exits`, 'Switch must contain 1..256 named exits');
      return;
    }
    const labels = new Set<string>();
    exits.forEach((exit: unknown, j: number) => {
      const ep = `${path}.switch.exits[${j}]`;
      if (!record(exit)) { fail(ep, 'expected named exit object'); return; }
      keys(exit, ['label', 'target'], ep);
      const label = exit['label'];
      if (!id(label)) fail(`${ep}.label`, 'invalid Switch label');
      else {
        if (labels.has(label)) fail(`${ep}.label`, 'duplicate named exit');
        labels.add(label);
      }
      const target = exit['target'];
      if (!record(target)) { fail(`${ep}.target`, 'missing explicit target'); return; }
      if ('nodeId' in target && !('terminal' in target)) {
        keys(target, ['nodeId'], `${ep}.target`);
        if (!id(target['nodeId'])) fail(`${ep}.target.nodeId`, 'invalid target node id');
        else if (id(nodeId)) targets.push({ source: nodeId, destination: target['nodeId'] });
      } else if ('terminal' in target && !('nodeId' in target)) {
        keys(target, ['terminal'], `${ep}.target`);
        if (!TERMINALS.has(target['terminal'] as string)) fail(`${ep}.target.terminal`, 'invalid Workflow terminal');
        else terminalCount++;
      } else fail(`${ep}.target`, 'exactly one nodeId or terminal is required');
    });
  });
  if (!ids.has(value['entryNodeId'] as string)) fail('workflow.entryNodeId', 'entry node is missing');
  for (const edge of targets) {
    if (!ids.has(edge.destination)) fail(`workflow.nodes.${edge.source}.switch`, `unselected destination '${edge.destination}'`);
  }
  if (terminalCount === 0) fail('workflow.nodes', 'Workflow has no explicit terminal');
  if (ids.has(value['entryNodeId'] as string)) {
    const visited = new Set<string>();
    const frontier: string[] = [value['entryNodeId'] as string];
    while (frontier.length > 0) {
      const current = frontier.pop()!;
      if (visited.has(current)) continue;
      visited.add(current);
      for (const edge of targets) if (edge.source === current && !visited.has(edge.destination))
        frontier.push(edge.destination);
    }
    for (const nodeId of ids) {
      if (!visited.has(nodeId)) fail(`workflow.nodes.${nodeId}`, 'node is unreachable from entry');
    }
    const explicitTerminalReached = nodes.some((item: unknown) =>
      record(item) && visited.has(item['id'] as string) && record(item['switch']) &&
      Array.isArray(item['switch']['exits']) &&
      item['switch']['exits'].some((exit: unknown) =>
        record(exit) && record(exit['target']) && TERMINALS.has(exit['target']['terminal'] as string)));
    if (!explicitTerminalReached) fail('workflow.nodes', 'no explicit terminal is reachable from entry');
  }
  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}
