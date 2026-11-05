import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, '..');
const unitDir = path.join(packageRoot, 'domain', 'units');

export class DisExecutionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DisExecutionError';
    this.code = code;
  }
}

function isSafePackageRelativeRef(ref) {
  if (typeof ref !== 'string' || ref.length === 0) return false;
  if (ref.startsWith('/') || ref.includes('\\') || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(ref)) return false;
  const segments = ref.split('/');
  return !segments.some((segment) => segment === '..' || segment === '' || segment === '.');
}

function assertInsidePackage(root, absolutePath) {
  const relative = path.relative(root, absolutePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new DisExecutionError('RESOURCE_PATH_ESCAPE', absolutePath);
}

export function validateUnit(unit) {
  const required = ['schemaVersion', 'id', 'revision', 'role', 'purpose', 'scope', 'owner', 'authority', 'qualification', 'evidence', 'failure'];
  for (const key of required) if (!(key in unit)) throw new DisExecutionError('INVALID_UNIT', 'missing ' + key);
  if (unit.schemaVersion !== 'dis.unit/0.1.0') throw new DisExecutionError('UNSUPPORTED_UNIT_SCHEMA', unit.schemaVersion);
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(unit.revision)) throw new DisExecutionError('INVALID_REVISION', unit.revision);
  if (!['knowledge', 'recognizer', 'decision', 'procedure', 'tool', 'workflow', 'validator'].includes(unit.role)) throw new DisExecutionError('INVALID_ROLE', unit.role);
  if (!unit.scope?.domain || !Array.isArray(unit.scope.appliesTo) || !Array.isArray(unit.scope.excludes)) throw new DisExecutionError('INVALID_SCOPE', unit.id);
  if (!['FROZEN', 'CONTROLLED', 'REFERENCE', 'EXAMPLE', 'DERIVED'].includes(unit.authority)) throw new DisExecutionError('INVALID_AUTHORITY', unit.id);
  if (!Array.isArray(unit.evidence?.sources) || !('absenceReason' in unit.evidence)) throw new DisExecutionError('INVALID_EVIDENCE', unit.id);
  const executable = ['recognizer', 'decision', 'procedure', 'tool', 'workflow', 'validator'].includes(unit.role);
  if (executable && (!isSafePackageRelativeRef(unit.input?.schemaRef) || !isSafePackageRelativeRef(unit.output?.schemaRef) || !unit.implementation?.strategy)) {
    throw new DisExecutionError('MISSING_EXECUTABLE_CONTRACT', unit.id);
  }
  if (unit.role === 'procedure' && unit.implementation.exposure !== 'private') throw new DisExecutionError('PRIVATE_PROCEDURE_EXPOSURE_REQUIRED', unit.id);
  if (unit.role === 'tool' && (unit.implementation.exposure !== 'tool' || unit.implementation.strategy !== 'tool-operation')) throw new DisExecutionError('INVALID_TOOL_EXPOSURE', unit.id);
  if (unit.evidence.consumes !== undefined && (!Array.isArray(unit.evidence.consumes) || new Set(unit.evidence.consumes).size !== unit.evidence.consumes.length)) {
    throw new DisExecutionError('INVALID_EVIDENCE_SLOTS', unit.id);
  }
  return true;
}

export async function resolveSchemaClosure(root, refs) {
  const schemas = new Map();
  const resources = new Map();
  const active = new Set();

  async function visit(ref, baseDir = root) {
    if (typeof ref !== 'string' || ref.length === 0) throw new DisExecutionError('INVALID_SCHEMA_REF', String(ref));
    if (ref.startsWith('#')) return null;
    if (ref.includes('\\') || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(ref) || ref.startsWith('/') || ref.split('#', 1)[0].split('/').some((segment) => segment === '..' || segment === '' || segment === '.')) {
      throw new DisExecutionError('UNSAFE_SCHEMA_REF', ref);
    }
    const [filePart, fragment] = ref.split('#', 2);
    if (fragment && !fragment.startsWith('/')) throw new DisExecutionError('INVALID_SCHEMA_FRAGMENT', ref);
    const absolute = path.resolve(baseDir, filePart);
    assertInsidePackage(root, absolute);
    const relative = path.relative(root, absolute).split(path.sep).join('/');
    if (active.has(relative)) throw new DisExecutionError('SCHEMA_REFERENCE_CYCLE', relative);
    if (schemas.has(relative)) {
      if (fragment) {
        const existing = schemas.get(relative);
        const target = fragment.slice(1).split('/').map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~')).reduce((current, key) => current?.[key], existing);
        if (target === undefined) throw new DisExecutionError('UNRESOLVED_SCHEMA_FRAGMENT', ref);
      }
      return schemas.get(relative);
    }
    active.add(relative);
    let content;
    try {
      content = await fs.readFile(absolute, 'utf8');
    } catch {
      throw new DisExecutionError('MISSING_SCHEMA_RESOURCE', relative);
    }
    let schema;
    try {
      schema = JSON.parse(content);
    } catch {
      throw new DisExecutionError('INVALID_SCHEMA_JSON', relative);
    }
    if (schema.$schema !== 'https://json-schema.org/draft/2020-12/schema') throw new DisExecutionError('UNSUPPORTED_SCHEMA_DIALECT', relative);
    schemas.set(relative, schema);
    resources.set(relative, createHash('sha256').update(content).digest('hex'));

    async function scan(value) {
      if (Array.isArray(value)) {
        for (const item of value) await scan(item);
      } else if (value && typeof value === 'object') {
        for (const [key, child] of Object.entries(value)) {
          if (key === '$ref' && typeof child === 'string') {
            if (child.startsWith('#')) {
              const fragment = child.slice(1);
              if (fragment) {
                const target = fragment.split('/').slice(1).map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~')).reduce((current, part) => current?.[part], schema);
                if (target === undefined) throw new DisExecutionError('UNRESOLVED_SCHEMA_FRAGMENT', relative + child);
              }
            } else {
              await visit(child, path.dirname(absolute));
            }
          } else {
            await scan(child);
          }
        }
      }
    }
    await scan(schema);
    active.delete(relative);
    if (fragment) {
      const target = fragment.slice(1).split('/').map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~')).reduce((current, key) => current?.[key], schema);
      if (target === undefined) throw new DisExecutionError('UNRESOLVED_SCHEMA_FRAGMENT', ref);
    }
    return schema;
  }

  for (const ref of refs) await visit(ref);
  return { schemas, resources };
}

function pointerGet(value, pointer) {
  if (pointer === '') return value;
  if (!pointer.startsWith('/')) throw new DisExecutionError('INVALID_JSON_POINTER', pointer);
  return pointer.slice(1).split('/').map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~')).reduce((current, key) => current?.[key], value);
}

function pointerSet(target, pointer, value) {
  if (pointer === '') throw new DisExecutionError('ROOT_INPUT_BINDING_FORBIDDEN', 'bind root through graph entry contract');
  if (!pointer.startsWith('/')) throw new DisExecutionError('INVALID_JSON_POINTER', pointer);
  const parts = pointer.slice(1).split('/').map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'));
  let current = target;
  for (const part of parts.slice(0, -1)) current = current[part] ??= {};
  current[parts.at(-1)] = value;
  return target;
}

function conditionMatches(output, condition) {
  if (!condition) return true;
  const actual = pointerGet(output, condition.path);
  if (condition.operator === 'equals') return actual === condition.value;
  if (condition.operator === 'notEquals') return actual !== condition.value;
  if (condition.operator === 'exists') return actual !== undefined;
  throw new DisExecutionError('UNSUPPORTED_CONDITION_OPERATOR', condition.operator);
}

function requiredProperties(schema) {
  return Array.isArray(schema?.required) ? schema.required : [];
}

export function validateGraph(graph, unitsById, schemas) {
  if (graph.schemaVersion !== 'dis.graph/0.1.0') throw new DisExecutionError('UNSUPPORTED_GRAPH_SCHEMA', graph.schemaVersion);
  const nodeIds = graph.nodes.map((node) => node.nodeId);
  if (new Set(nodeIds).size !== nodeIds.length) throw new DisExecutionError('DUPLICATE_NODE_ID', 'node IDs must be unique');
  if (!nodeIds.includes(graph.entryNode)) throw new DisExecutionError('MISSING_ENTRY_NODE', graph.entryNode);
  for (const terminal of graph.terminalNodes) if (!nodeIds.includes(terminal)) throw new DisExecutionError('UNKNOWN_TERMINAL_NODE', terminal);

  for (const node of graph.nodes) {
    const unit = unitsById.get(node.unitRef.id);
    if (!unit || unit.revision !== node.unitRef.revision) throw new DisExecutionError('UNRESOLVED_EXACT_UNIT_REF', node.unitRef.id);
  }
  const entryUnit = unitsById.get(graph.nodes.find((node) => node.nodeId === graph.entryNode).unitRef.id);
  if (entryUnit.input.schemaRef !== graph.inputSchemaRef) throw new DisExecutionError('GRAPH_ENTRY_INPUT_MISMATCH', graph.inputSchemaRef);
  for (const terminalId of graph.terminalNodes) {
    const terminalNode = graph.nodes.find((node) => node.nodeId === terminalId);
    const terminalUnit = unitsById.get(terminalNode.unitRef.id);
    if (terminalUnit.output.schemaRef !== graph.outputSchemaRef) throw new DisExecutionError('GRAPH_TERMINAL_OUTPUT_MISMATCH', terminalId);
  }

  const controls = graph.edges.filter((edge) => edge.kind === 'control');
  const data = graph.edges.filter((edge) => edge.kind === 'data');
  const evidence = graph.edges.filter((edge) => edge.kind === 'evidence');
  if (controls.length + data.length + evidence.length !== graph.edges.length) throw new DisExecutionError('INVALID_EDGE_KIND', 'every edge must have exactly one supported kind');

  const adjacency = new Map(nodeIds.map((id) => [id, []]));
  for (const edge of controls) {
    if (!nodeIds.includes(edge.from) || !nodeIds.includes(edge.to)) throw new DisExecutionError('UNKNOWN_CONTROL_NODE', edge.from + '->' + edge.to);
    if (edge.when) {
      if (typeof edge.when.path !== 'string' || (edge.when.path !== '' && !edge.when.path.startsWith('/'))) throw new DisExecutionError('INVALID_CONDITION_POINTER', edge.when.path);
      const sourceNode = graph.nodes.find((node) => node.nodeId === edge.from);
      const sourceUnit = unitsById.get(sourceNode.unitRef.id);
      const sourceSchema = schemas.get(sourceUnit.output.schemaRef);
      if (edge.when.path !== '' && !sourceSchema?.properties?.[edge.when.path.slice(1)]) throw new DisExecutionError('UNKNOWN_CONDITION_OUTPUT_POINTER', edge.from + edge.when.path);
    }
    adjacency.get(edge.from).push(edge.to);
  }
  for (const edge of data) {
    if (!nodeIds.includes(edge.from.node) || !nodeIds.includes(edge.to.node)) throw new DisExecutionError('UNKNOWN_DATA_NODE', edge.from.node + '->' + edge.to.node);
    if (typeof edge.from.pointer !== 'string' || typeof edge.to.pointer !== 'string' || edge.to.pointer === '') throw new DisExecutionError('INVALID_DATA_POINTER', 'data edges require a source pointer and non-root target pointer');
    const sourceNode = graph.nodes.find((node) => node.nodeId === edge.from.node);
    const sourceUnit = unitsById.get(sourceNode.unitRef.id);
    const sourceSchema = schemas.get(sourceUnit.output.schemaRef);
    if (edge.from.pointer !== '' && (!edge.from.pointer.startsWith('/') || !sourceSchema?.properties?.[edge.from.pointer.slice(1)])) throw new DisExecutionError('UNKNOWN_SOURCE_OUTPUT_POINTER', edge.from.node + edge.from.pointer);
    const targetNode = graph.nodes.find((node) => node.nodeId === edge.to.node);
    const targetUnit = unitsById.get(targetNode.unitRef.id);
    const targetSchema = schemas.get(targetUnit.input.schemaRef);
    if (!edge.to.pointer.startsWith('/') || !targetSchema?.properties?.[edge.to.pointer.slice(1)]) throw new DisExecutionError('UNKNOWN_TARGET_INPUT_POINTER', edge.to.node + edge.to.pointer);
  }
  for (const edge of evidence) {
    if (!nodeIds.includes(edge.from.node) || !nodeIds.includes(edge.to.node)) throw new DisExecutionError('UNKNOWN_EVIDENCE_NODE', edge.from.node + '->' + edge.to.node);
    const sourceUnit = unitsById.get(graph.nodes.find((node) => node.nodeId === edge.from.node).unitRef.id);
    const sourceSchema = schemas.get(sourceUnit.output.schemaRef);
    if (!sourceSchema?.properties?.[edge.from.pointer.slice(1)]) throw new DisExecutionError('UNKNOWN_EVIDENCE_SOURCE_POINTER', edge.from.node + edge.from.pointer);
    const targetUnit = unitsById.get(graph.nodes.find((node) => node.nodeId === edge.to.node).unitRef.id);
    if (!(targetUnit.evidence.consumes || []).includes(edge.to.slot)) throw new DisExecutionError('UNDECLARED_EVIDENCE_SLOT', edge.to.slot);
  }

  for (const node of graph.nodes) {
    if (node.nodeId === graph.entryNode) continue;
    const unit = unitsById.get(node.unitRef.id);
    const schema = schemas.get(unit.input.schemaRef);
    for (const property of requiredProperties(schema)) {
      const targetPointer = '/' + property.replaceAll('~', '~0').replaceAll('/', '~1');
      if (!data.some((edge) => edge.to.node === node.nodeId && edge.to.pointer === targetPointer)) {
        throw new DisExecutionError('MISSING_REQUIRED_DATA_BINDING', node.nodeId + targetPointer);
      }
    }
    for (const slot of unit.evidence.consumes || []) {
      if (!evidence.some((edge) => edge.to.node === node.nodeId && edge.to.slot === slot)) throw new DisExecutionError('MISSING_EVIDENCE_BINDING', node.nodeId + ':' + slot);
    }
  }

  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) throw new DisExecutionError('CONTROL_CYCLE', id);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const next of adjacency.get(id)) visit(next);
    visiting.delete(id);
    visited.add(id);
  }
  visit(graph.entryNode);
  if (visited.size !== nodeIds.length) throw new DisExecutionError('UNREACHABLE_CONTROL_NODE', nodeIds.filter((id) => !visited.has(id)).join(','));
  for (const nodeId of nodeIds) {
    if (!graph.terminalNodes.includes(nodeId) && adjacency.get(nodeId).length === 0) throw new DisExecutionError('PATH_WITHOUT_TERMINAL', nodeId);
    if (graph.terminalNodes.includes(nodeId) && adjacency.get(nodeId).length > 0) throw new DisExecutionError('TERMINAL_HAS_CONTROL_EDGE', nodeId);
  }
  return true;
}

export function validateDefinition(definition, unitsById, graph) {
  if (definition.schemaVersion !== 'dis.definition/0.1.0') throw new DisExecutionError('UNSUPPORTED_DEFINITION_SCHEMA', definition.schemaVersion);
  const componentIds = new Set();
  const componentUnitIds = new Set();
  for (const component of definition.components) {
    if (!['semantic', 'tool'].includes(component.family)) throw new DisExecutionError('INVALID_COMPONENT_FAMILY', component.family);
    if (componentIds.has(component.componentId)) throw new DisExecutionError('DUPLICATE_COMPONENT_ID', component.componentId);
    componentIds.add(component.componentId);
    const unit = unitsById.get(component.unitRef.id);
    if (!unit || unit.revision !== component.unitRef.revision) throw new DisExecutionError('UNRESOLVED_COMPONENT_UNIT', component.unitRef.id);
    if (component.family === 'tool' && (unit.role !== 'tool' || unit.implementation.exposure !== 'tool')) throw new DisExecutionError('INVALID_TOOL_COMPONENT_BINDING', component.componentId);
    if (component.family === 'semantic' && unit.implementation.exposure !== 'semantic') throw new DisExecutionError('INVALID_SEMANTIC_COMPONENT_BINDING', component.componentId);
    componentUnitIds.add(unit.id);
  }
  const privateIds = new Set();
  for (const ref of definition.privateUnits) {
    const unit = unitsById.get(ref.id);
    if (!unit || unit.revision !== ref.revision) throw new DisExecutionError('UNRESOLVED_PRIVATE_UNIT', ref.id);
    if (unit.implementation.exposure !== 'private') throw new DisExecutionError('PRIVATE_UNIT_EXPOSED', ref.id);
    if (componentUnitIds.has(unit.id) || privateIds.has(unit.id)) throw new DisExecutionError('PRIVATE_COMPONENT_OVERLAP', ref.id);
    privateIds.add(unit.id);
  }
  if (definition.workflowRef.id !== graph.id || definition.workflowRef.revision !== graph.revision) throw new DisExecutionError('WORKFLOW_REF_MISMATCH', definition.workflowRef.id);
  if (!isSafePackageRelativeRef(definition.workflowRef.path)) throw new DisExecutionError('UNSAFE_WORKFLOW_REF', definition.workflowRef.path);
  return true;
}

export function recognizePlayer(input, context) {
  if (!input || typeof input.url !== 'string' || !/^https?:\/\//.test(input.url) || !Array.isArray(input.signals) || input.signals.some((item) => typeof item !== 'string')) {
    throw new DisExecutionError('INVALID_INPUT', 'PageObservation requires an http(s) url and string signals[]');
  }
  const patterns = context?.catalogs?.signatures?.patterns;
  if (!Array.isArray(patterns)) throw new DisExecutionError('MISSING_SIGNATURE_CATALOG', 'player-signatures catalog is required');
  const haystack = (input.url + '\n' + input.signals.join('\n')).toLowerCase();
  const matches = patterns.flatMap((pattern) => {
    if (typeof pattern.playerId !== 'string' || !Array.isArray(pattern.markers)) throw new DisExecutionError('INVALID_SIGNATURE_CATALOG', 'each pattern needs playerId and markers[]');
    const marker = pattern.markers.find((candidate) => haystack.includes(candidate.toLowerCase()));
    return marker ? [{ playerId: pattern.playerId, marker }] : [];
  });
  const status = matches.length === 1 ? 'recognized' : matches.length > 1 ? 'ambiguous' : 'unknown';
  const evidence = matches.length
    ? matches.map((match) => ({ sourceId: 'page-observation', kind: 'observation', ref: input.url, claim: 'matched marker ' + match.marker }))
    : [{ sourceId: 'page-observation', kind: 'observation', ref: input.url, claim: 'no supported player marker found' }];
  return { status, candidates: matches.map((match) => match.playerId), evidence, sourceUrl: input.url };
}

export function routeRecognition(input) {
  const recognition = input?.recognition;
  if (!recognition || !['recognized', 'ambiguous', 'unknown'].includes(recognition.status)) throw new DisExecutionError('INVALID_INPUT', 'route decision requires a recognition result');
  return { route: recognition.status === 'recognized' ? 'KNOWN' : 'REVIEW' };
}

export function resolvePlayer(input, context) {
  const recognition = input?.recognition;
  if (recognition?.status !== 'recognized' || recognition.candidates?.length !== 1) throw new DisExecutionError('INVALID_INPUT', 'resolve procedure requires exactly one recognized candidate');
  const playerId = recognition.candidates[0];
  const strategyId = context?.catalogs?.strategies?.strategies?.[playerId];
  if (typeof strategyId !== 'string' || strategyId.length === 0) throw new DisExecutionError('UNKNOWN_PLAYER_STRATEGY', playerId);
  return { status: 'READY', playerId, strategyId };
}

export function boundedFallback(input) {
  const recognition = input?.recognition;
  if (!recognition || !['ambiguous', 'unknown'].includes(recognition.status)) throw new DisExecutionError('INVALID_INPUT', 'fallback requires ambiguous or unknown recognition');
  return {
    status: recognition.status === 'ambiguous' ? 'NEEDS_INPUT' : 'NEEDS_REVIEW',
    reason: recognition.status === 'ambiguous' ? 'multiple-player-candidates' : 'no-supported-player-candidate',
    question: recognition.status === 'ambiguous' ? 'Which player is present on this page?' : null,
  };
}

export function validateOutcome(input, context) {
  const resolution = input?.resolution;
  const evidence = context?.evidence?.recognitionEvidence;
  if (!resolution || !['READY', 'NEEDS_INPUT', 'NEEDS_REVIEW'].includes(resolution.status)) throw new DisExecutionError('INVALID_OUTCOME', 'unsupported terminal outcome');
  if (!Array.isArray(evidence) || evidence.length === 0) throw new DisExecutionError('MISSING_EVIDENCE', 'terminal outcome must retain evidence');
  if (resolution.status === 'READY' && (!resolution.playerId || !resolution.strategyId)) throw new DisExecutionError('INCOMPLETE_READY_OUTCOME', 'READY requires playerId and strategyId');
  return { ...resolution, evidence, evidenceCount: evidence.length };
}

export const handlers = {
  'xdownload.player.recognizer': recognizePlayer,
  'xdownload.player.route-decision': routeRecognition,
  'xdownload.player.resolve-procedure': resolvePlayer,
  'xdownload.player.bounded-fallback': boundedFallback,
  'xdownload.player.outcome-validator': validateOutcome,
};

export async function loadDemo() {
  const unitFiles = await fs.readdir(unitDir);
  const units = await Promise.all(unitFiles.filter((name) => name.endsWith('.json')).map(async (name) => {
    const unit = JSON.parse(await fs.readFile(path.join(unitDir, name), 'utf8'));
    validateUnit(unit);
    return unit;
  }));
  const graph = JSON.parse(await fs.readFile(path.join(packageRoot, 'domain', 'player-recognition.graph.json'), 'utf8'));
  const definition = JSON.parse(await fs.readFile(path.join(packageRoot, 'domain', 'definition.json'), 'utf8'));
  const refs = [graph.inputSchemaRef, graph.outputSchemaRef, 'domain/schemas/domain-definition.schema.json'];
  for (const unit of units) {
    if (unit.input) refs.push(unit.input.schemaRef);
    if (unit.output) refs.push(unit.output.schemaRef);
  }
  const closure = await resolveSchemaClosure(packageRoot, refs);
  const catalogs = {
    signatures: JSON.parse(await fs.readFile(path.join(packageRoot, 'fixtures', 'player-signatures.json'), 'utf8')),
    strategies: JSON.parse(await fs.readFile(path.join(packageRoot, 'fixtures', 'player-strategies.json'), 'utf8')),
  };
  const unitsById = new Map(units.map((unit) => [unit.id, unit]));
  validateGraph(graph, unitsById, closure.schemas);
  validateDefinition(definition, unitsById, graph);
  return { graph, definition, unitsById, schemas: closure.schemas, resources: closure.resources, catalogs };
}

export async function runPipeline(input, loaded) {
  const { graph, unitsById, schemas } = loaded;
  const outputs = new Map();
  let nodeId = graph.entryNode;
  const trace = [];
  for (let step = 0; step <= graph.nodes.length; step += 1) {
    const node = graph.nodes.find((item) => item.nodeId === nodeId);
    const unit = unitsById.get(node.unitRef.id);
    const handler = handlers[unit.id];
    if (!handler) throw new DisExecutionError('NO_IMPLEMENTATION', unit.id);

    let nodeInput = nodeId === graph.entryNode ? input : {};
    const incomingData = graph.edges.filter((edge) => edge.kind === 'data' && edge.to.node === nodeId);
    const boundPointers = new Set();
    for (const edge of incomingData) {
      if (!outputs.has(edge.from.node)) continue;
      if (boundPointers.has(edge.to.pointer)) throw new DisExecutionError('DUPLICATE_RUNTIME_DATA_BINDING', nodeId + edge.to.pointer);
      boundPointers.add(edge.to.pointer);
      nodeInput = pointerSet(nodeInput, edge.to.pointer, pointerGet(outputs.get(edge.from.node), edge.from.pointer));
    }
    if (nodeId !== graph.entryNode) {
      const inputSchema = schemas.get(unit.input.schemaRef);
      for (const property of requiredProperties(inputSchema)) {
        if (!Object.hasOwn(nodeInput, property)) throw new DisExecutionError('MISSING_RUNTIME_INPUT', nodeId + '/' + property);
      }
    }
    const evidence = {};
    const incomingEvidence = graph.edges.filter((edge) => edge.kind === 'evidence' && edge.to.node === nodeId);
    for (const edge of incomingEvidence) {
      if (!outputs.has(edge.from.node)) continue;
      const value = pointerGet(outputs.get(edge.from.node), edge.from.pointer);
      evidence[edge.to.slot] = [...(evidence[edge.to.slot] || []), ...(Array.isArray(value) ? value : [value])];
    }
    const output = handler(nodeInput, { evidence, catalogs: loaded.catalogs });
    outputs.set(nodeId, output);
    trace.push({ nodeId, unitId: unit.id, output });
    if (graph.terminalNodes.includes(nodeId)) return { outcome: output, trace };
    const candidates = graph.edges.filter((edge) => edge.kind === 'control' && edge.from === nodeId && conditionMatches(output, edge.when));
    if (candidates.length !== 1) throw new DisExecutionError('AMBIGUOUS_CONTROL_FLOW', nodeId + ' selected ' + candidates.length + ' control edges');
    nodeId = candidates[0].to;
  }
  throw new DisExecutionError('STEP_LIMIT_EXCEEDED', graph.id);
}
