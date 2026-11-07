import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import type { Graph, Selection, Unit, UnitRef } from './types.js';

export function digest(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map((key) => [key, canonical(record[key])]));
  }
  return value;
}

export function canonicalDigest(value: unknown): string {
  return digest(JSON.stringify(canonical(value)));
}
const verifiedSelections = new WeakMap<object, string>();
export function assertVerifiedSelection(selection: Selection): void {
  const pin = verifiedSelections.get(selection);
  if (!pin || canonicalDigest(selection) !== pin) throw new Error('SELECTION_NOT_VERIFIED');
}

function requirePin(actual: string | undefined, expected: string, code: string): void {
  if (!/^[a-f0-9]{64}$/.test(expected) || actual !== expected) throw new Error(code);
}

interface PackageIdentity {
  packageId: string;
  revision: string;
  resourceClosurePath: string;
  resourceClosureSha256: string;
  selectionLockSha256: string;
  runtimeReader?: { knowledgeKind: string; processor: string; resourcePath: string };
  selectionLock: {
    packageId: string;
    packageRevision: string;
    selectedAssets: (UnitRef & { kind: string; sha256: string })[];
    target: string;
    validationEvidence?: { path: string; sha256: string };
    promotionDecision?: {
      kind: string; scope: string; authority: string; authorizationEvidence: string;
      prior: { kind: string; packageId?: string; revision?: string; lockSha256?: string };
      subject: { id: string; revision: string; sha256: string };
      validationEvidence: { path: string; sha256: string };
    };
    selectedCapabilities: { capabilityId: string; owner: string; authorityRef: string; version: string; contractDigest: string; provider: { unitId: string; unitRevision: string; candidateId: string; implementationRef: string; artifactRef: string; artifactDigest: string; target: string; contractDigest: string } }[];
  };
}
interface Manifest {
  packageId: string;
  packageRevision: string;
  graphRef: UnitRef;
  definitionRef: UnitRef;
  units: UnitRef[];
  resources: { path: string; sha256: string }[];
}

function validateProbeGraph(graph: Graph, units: Record<string, Unit>, parse: <T>(ref: string) => T): void {
  type Schema = { properties?: Record<string, unknown>; required?: string[] };
  const reject = (ok: unknown, code: string) => { if (!ok) throw new Error('INVALID_GRAPH:' + code); };
  reject(graph.schemaVersion === 'dis.graph/0.1.0' && graph.cyclePolicy === 'DAG_ONLY', 'SCHEMA');
  reject(Array.isArray(graph.nodes) && graph.nodes.length > 0 && graph.nodes.length <= 32 && Array.isArray(graph.edges) && graph.edges.length <= 128, 'SIZE');
  const nodes = new Map(graph.nodes.map((node) => [node.nodeId, node]));
  reject(nodes.size === graph.nodes.length && nodes.has(graph.entryNode), 'NODES');
  reject(Array.isArray(graph.terminalNodes) && graph.terminalNodes.length > 0 && new Set(graph.terminalNodes).size === graph.terminalNodes.length && graph.terminalNodes.every((id) => nodes.has(id)), 'TERMINALS');
  for (const node of graph.nodes) reject(units[node.unitRef.id]?.revision === node.unitRef.revision, 'UNIT_REF');
  const schema = (id: string, field: 'input' | 'output') => parse<Schema>(units[nodes.get(id)!.unitRef.id][field].schemaRef);
  reject(units[nodes.get(graph.entryNode)!.unitRef.id].input.schemaRef === graph.inputSchemaRef, 'GRAPH_INPUT');
  for (const id of graph.terminalNodes) reject(units[nodes.get(id)!.unitRef.id].output.schemaRef === graph.outputSchemaRef, 'GRAPH_OUTPUT');
  reject(new Set(graph.edges.map((edge) => canonicalDigest(edge))).size === graph.edges.length, 'DUPLICATE_EDGE');
  const controls = graph.edges.filter((edge) => edge.kind === 'control');
  const adjacency = new Map(graph.nodes.map((node) => [node.nodeId, [] as string[]]));
  for (const edge of graph.edges) {
    reject(['control','data','evidence'].includes(edge.kind), 'EDGE_KIND');
    if (edge.kind === 'control') {
      reject(nodes.has(edge.from) && nodes.has(edge.to), 'CONTROL_ENDPOINT');
      if (edge.when) {
        reject(edge.when.operator === 'equals' && Object.hasOwn(edge.when,'value'), 'CONDITION');
        reject(edge.when.path === '' || /^\/[a-zA-Z][a-zA-Z0-9]*$/.test(edge.when.path) && Object.hasOwn(schema(edge.from,'output').properties ?? {},edge.when.path.slice(1)), 'CONDITION_POINTER');
      }
      adjacency.get(edge.from)!.push(edge.to);
    } else {
      reject(nodes.has(edge.from.node) && nodes.has(edge.to.node), 'BINDING_ENDPOINT');
      reject(edge.from.node !== edge.to.node && edge.to.node !== graph.entryNode, 'BINDING_ANCESTRY');
      const source = schema(edge.from.node,'output');
      reject(edge.from.pointer === '' && edge.kind === 'data' || /^\/[a-zA-Z][a-zA-Z0-9]*$/.test(edge.from.pointer) && Object.hasOwn(source.properties ?? {},edge.from.pointer.slice(1)) && (source.required ?? []).includes(edge.from.pointer.slice(1)), 'SOURCE_POINTER');
      if (edge.kind === 'data') reject(/^\/[a-zA-Z][a-zA-Z0-9]*$/.test(edge.to.pointer) && Object.hasOwn(schema(edge.to.node,'input').properties ?? {},edge.to.pointer.slice(1)), 'TARGET_POINTER');
      else reject((units[nodes.get(edge.to.node)!.unitRef.id].evidence?.consumes ?? []).includes(edge.to.slot), 'EVIDENCE_SLOT');
    }
  }
  for (const node of graph.nodes) {
    const outgoing = controls.filter((edge) => edge.kind === 'control' && edge.from === node.nodeId);
    if (outgoing.length === 1) reject(!outgoing[0].when, 'PARTIAL_CONTROL');
    if (outgoing.length > 1) {
      const path = outgoing[0].when?.path;
      reject(typeof path === 'string' && path !== '' && outgoing.every((edge) => edge.when?.operator === 'equals' && edge.when.path === path), 'AMBIGUOUS_CONTROL');
      const field = (schema(node.nodeId,'output').properties ?? {})[path!.slice(1)] as {enum?: unknown[]};
      reject(Array.isArray(field?.enum) && new Set(outgoing.map((edge) => canonicalDigest(edge.when!.value))).size === outgoing.length && canonicalDigest(field.enum.map(canonicalDigest).sort()) === canonicalDigest(outgoing.map((edge) => canonicalDigest(edge.when!.value)).sort()), 'CONTROL_COVERAGE');
    }
  }
  const paths: string[][] = [], visiting = new Set<string>(), reached = new Set<string>();
  const visit = (node: string, path: string[]) => {
    reject(!visiting.has(node), 'CYCLE');
    visiting.add(node); reached.add(node);
    const next = adjacency.get(node)!;
    if (graph.terminalNodes.includes(node)) {
      reject(next.length === 0, 'TERMINAL_CONTROL'); paths.push([...path,node]); reject(paths.length <= 256, 'PATH_LIMIT');
    } else { reject(next.length > 0, 'DEAD_END'); for (const target of next) visit(target,[...path,node]); }
    visiting.delete(node);
  };
  visit(graph.entryNode,[]); reject(reached.size === nodes.size, 'UNREACHABLE');
  for (const edge of graph.edges) if (edge.kind !== 'control') {
    reject(paths.some((path) => path.includes(edge.to.node) && path.indexOf(edge.from.node) >= 0 && path.indexOf(edge.from.node) < path.indexOf(edge.to.node)), 'BINDING_ANCESTRY');
  }
  for (const path of paths) for (const [index,id] of path.entries()) {
    if (index === 0) continue;
    const previous = new Set(path.slice(0,index));
    const target = schema(id,'input');
    const bindings = graph.edges.filter((edge) => edge.kind === 'data' && edge.to.node === id && previous.has(edge.from.node));
    for (const field of Object.keys(target.properties ?? {})) {
      const count = bindings.filter((edge) => edge.kind === 'data' && edge.to.pointer === '/'+field).length;
      reject(count <= 1 && (!(target.required ?? []).includes(field) || count === 1), 'DATA_PATH_BINDING');
    }
    for (const slot of units[nodes.get(id)!.unitRef.id].evidence?.consumes ?? []) {
      const count = graph.edges.filter((edge) => edge.kind === 'evidence' && edge.to.node === id && edge.to.slot === slot && previous.has(edge.from.node)).length;
      reject(count === 1, 'EVIDENCE_PATH_BINDING');
    }
  }
}

export async function selectKnowledge(root: string, expected: { descriptor: string; closure: string; lock: string }): Promise<Selection> {
  root = await realpath(root);
  async function inside(ref: string) {
    if (!/^[a-zA-Z0-9_./-]+$/.test(ref) || ref.split('/').some((part) => ['', '.', '..'].includes(part))) throw new Error('UNSAFE_RESOURCE_PATH');
    const resolved = await realpath(path.join(root, ref));
    const relative = path.relative(root, resolved);
    if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw new Error('RESOURCE_ESCAPE');
    return readFile(resolved);
  }
  const descriptor = await inside('package.json');
  requirePin(digest(descriptor), expected.descriptor, 'DESCRIPTOR_PIN_MISMATCH');
  const identity = (JSON.parse(descriptor.toString('utf8')) as { dis: PackageIdentity }).dis;
  requirePin(identity.resourceClosureSha256, expected.closure, 'CLOSURE_PIN_MISMATCH');
  requirePin(identity.selectionLockSha256, expected.lock, 'LOCK_PIN_MISMATCH');
  requirePin(canonicalDigest(identity.selectionLock), expected.lock, 'LOCK_BYTES_MISMATCH');
  const manifestRaw = await inside(identity.resourceClosurePath);
  requirePin(digest(manifestRaw), expected.closure, 'CLOSURE_BYTES_MISMATCH');
  const manifest = JSON.parse(manifestRaw.toString('utf8')) as Manifest;
  if (manifest.packageId !== identity.packageId || manifest.packageRevision !== identity.revision
      || identity.selectionLock.packageId !== identity.packageId || identity.selectionLock.packageRevision !== identity.revision) throw new Error('PACKAGE_IDENTITY_MISMATCH');
  const raw = new Map<string, Buffer>();
  for (const resource of manifest.resources) {
    if (raw.has(resource.path)) throw new Error('DUPLICATE_RESOURCE');
    const bytes = await inside(resource.path);
    requirePin(digest(bytes), resource.sha256, 'RESOURCE_DIGEST_MISMATCH:' + resource.path);
    raw.set(resource.path, bytes);
  }
  function parse<T>(ref: string): T {
    const bytes = raw.get(ref);
    if (!bytes) throw new Error('UNDECLARED_RESOURCE:' + ref);
    return JSON.parse(bytes.toString('utf8')) as T;
  }
  const resources = Object.fromEntries(manifest.resources.map((r) => [r.path, r.sha256]));
  const graph = parse<Graph>(manifest.graphRef.path);
  const definition = parse<{ domainId: string; revision: string; workflowRef: { unitRef: { id: string; revision: string }; graphRef: UnitRef } }>(manifest.definitionRef.path);
  if (graph.id !== manifest.graphRef.id || graph.revision !== manifest.graphRef.revision || graph.cyclePolicy !== 'DAG_ONLY'
      || definition.domainId !== manifest.definitionRef.id || definition.revision !== manifest.definitionRef.revision
      || canonicalDigest(definition.workflowRef.graphRef) !== canonicalDigest(manifest.graphRef)) throw new Error('GRAPH_DEFINITION_BINDING');
  const asset = identity.selectionLock.selectedAssets.find((a) => a.kind === 'graph');
  if (!asset || asset.id !== graph.id || asset.revision !== graph.revision || asset.path !== manifest.graphRef.path) throw new Error('GRAPH_LOCK_BINDING');
  requirePin(resources[asset.path], asset.sha256, 'GRAPH_LOCK_DIGEST');
  const units: Record<string, Unit> = {};
  const unitRefs: Selection['unitRefs'] = {};
  for (const ref of manifest.units) {
    const unit = parse<Unit>(ref.path);
    if (unit.id !== ref.id || unit.revision !== ref.revision || Object.hasOwn(units, unit.id)) throw new Error('UNIT_REF_MISMATCH');
    const selected = identity.selectionLock.selectedAssets.find((item) => item.kind === 'unit' && item.id === unit.id);
    if (!selected || selected.revision !== unit.revision || selected.path !== ref.path) throw new Error('UNIT_LOCK_MISMATCH');
    requirePin(resources[ref.path], selected.sha256, 'UNIT_LOCK_DIGEST');
    for (const knowledge of unit.knowledgeRefs ?? []) requirePin(resources[knowledge.path], knowledge.sha256, 'KNOWLEDGE_PIN_MISMATCH');
    if (!resources[unit.implementation.artifactRef] || !resources[unit.input.schemaRef] || !resources[unit.output.schemaRef]) throw new Error('UNIT_RESOURCE_MISSING');
    units[unit.id] = unit;
    unitRefs[unit.id] = { ...ref, sha256: selected.sha256 };
  }
  validateProbeGraph(graph, units, parse);
  const workflow = units[definition.workflowRef.unitRef.id];
  if (!workflow || workflow.role !== 'workflow' || workflow.revision !== definition.workflowRef.unitRef.revision
      || workflow.implementation.ref !== 'graph:' + graph.id + '@' + graph.revision || workflow.implementation.artifactRef !== asset.path) throw new Error('WORKFLOW_BINDING');
  const providers = Object.fromEntries(Object.values(units).map((unit) => [unit.id, unit.implementation.ref]));
  if (identity.selectionLock.target !== 'node24' || identity.selectionLock.selectedCapabilities.length !== 1) throw new Error('CAPABILITY_SELECTION_MISMATCH');
  for (const capability of identity.selectionLock.selectedCapabilities) {
    const provider = capability.provider;
    const unit = units[provider.unitId];
    const candidate = unit?.implementation.candidates?.find((item) => item.candidateId === provider.candidateId);
    const contract = unit?.capabilities?.provides.filter((item) => item.capabilityId === capability.capabilityId && item.owner === capability.owner && item.authorityRef === capability.authorityRef && item.version === capability.version && item.contractDigest === capability.contractDigest) ?? [];
    if (!candidate || provider.unitRevision !== unit.revision || candidate.ref !== provider.implementationRef || candidate.artifactRef !== provider.artifactRef
        || candidate.artifactDigest !== provider.artifactDigest || provider.target !== 'node24' || candidate.target !== provider.target
        || candidate.contractDigest !== provider.contractDigest || provider.contractDigest !== capability.contractDigest || contract.length !== 1) throw new Error('PROVIDER_LOCK_MISMATCH');
    requirePin(resources[candidate.artifactRef], candidate.artifactDigest, 'PROVIDER_ARTIFACT_MISMATCH');
    providers[unit.id] = candidate.ref;
  }
  const signaturesRef = units[graph.nodes.find((node) => node.nodeId === graph.entryNode)!.unitRef.id].knowledgeRefs?.[0];
  const resolveUnit = parse<Unit & { evidence: { sources: { sourceId: string; ref: string }[] } }>(unitRefs['xdownload.player.resolve-procedure'].path);
  const runtimeReader = identity.runtimeReader;
  const strategyKnowledge = resolveUnit.knowledgeRefs?.[0];
  let providerArtifact: Selection['providerArtifact'];
  if (runtimeReader) {
    const provider = identity.selectionLock.selectedCapabilities[0].provider;
    const strategiesAsset = identity.selectionLock.selectedAssets.find((item) => item.kind === 'knowledge');
    const definitionAsset = identity.selectionLock.selectedAssets.find((item) => item.kind === 'definition');
    if (!definitionAsset || definitionAsset.id !== definition.domainId || definitionAsset.revision !== definition.revision
        || definitionAsset.path !== manifest.definitionRef.path) throw new Error('DEFINITION_LOCK_MISMATCH');
    requirePin(resources[definitionAsset.path],definitionAsset.sha256,'DEFINITION_LOCK_DIGEST');
    const validation = identity.selectionLock.validationEvidence;
    const decision = identity.selectionLock.promotionDecision;
    if (!validation || !decision || decision.kind !== 'PRIVATE_REFERENCE_SELECTION' || decision.scope !== 'PRIVATE_REFERENCE_ONLY'
        || decision.authority !== 'kaicreator-mm/dis-private-runtime-reference'
        || decision.authorizationEvidence !== 'https://github.com/kaicreator-mm/domain-harness/pull/1498#issuecomment-6714146893'
        || decision.subject.id !== identity.packageId || decision.subject.revision !== identity.revision
        || decision.subject.sha256 !== expected.closure || canonicalDigest(decision.validationEvidence) !== canonicalDigest(validation)
        || !['GENESIS','PREVIOUS_PRIVATE_SELECTION'].includes(decision.prior.kind)) throw new Error('RUNTIME_PRIVATE_QUALIFICATION_MISSING');
    if (decision.prior.kind === 'PREVIOUS_PRIVATE_SELECTION'
        && (decision.prior.packageId !== identity.packageId || decision.prior.revision === identity.revision
          || !/^[a-f0-9]{64}$/.test(decision.prior.lockSha256 ?? ''))) throw new Error('RUNTIME_PRIVATE_PRIOR_SELECTION_INVALID');
    const reportBytes = await inside(validation.path);
    requirePin(digest(reportBytes),validation.sha256,'RUNTIME_VALIDATION_REPORT_DIGEST_MISMATCH');
    const report = JSON.parse(reportBytes.toString('utf8')) as { result: string; subject: typeof decision.subject; dependencyClosure: { sha256: string } };
    if (report.result !== 'PASS' || canonicalDigest(report.subject) !== canonicalDigest(decision.subject)
        || report.dependencyClosure.sha256 !== expected.closure) throw new Error('RUNTIME_VALIDATION_REPORT_MISMATCH');
    if (runtimeReader.knowledgeKind !== 'rule-set' || runtimeReader.processor !== 'exact-player-strategy-map/1'
        || !strategyKnowledge || strategyKnowledge.kind !== runtimeReader.knowledgeKind || resolveUnit.knowledgeRefs?.length !== 1
        || strategyKnowledge.path !== runtimeReader.resourcePath || strategiesAsset?.id !== strategyKnowledge.id
        || strategiesAsset.revision !== strategyKnowledge.revision || strategiesAsset.path !== strategyKnowledge.path
        || strategiesAsset.sha256 !== strategyKnowledge.sha256) throw new Error('RUNTIME_KNOWLEDGE_NOT_SELECTED');
    for (const unit of Object.values(units)) {
      if (unit.role !== 'workflow' && unit.implementation.artifactRef !== provider.artifactRef) {
        throw new Error('RUNTIME_PROVIDER_ARTIFACT_UNBOUND');
      }
    }
    providerArtifact = { path: provider.artifactRef, sha256: provider.artifactDigest, target: provider.target };
  }
  const strategiesRef = runtimeReader ? strategyKnowledge?.path : resolveUnit.evidence.sources.find((source) => source.sourceId === 'strategy-map')?.ref;
  if (!signaturesRef || !strategiesRef) throw new Error('SELECTED_KNOWLEDGE_MISSING');
  const signatures = parse<Selection['signatures'] & { catalogId: string; revision: string }>(signaturesRef.path);
  const strategies = parse<Selection['strategies'] & { catalogId: string; revision: string }>(strategiesRef);
  if (signatures.catalogId !== signaturesRef.id || signatures.revision !== signaturesRef.revision
      || strategies.catalogId !== (strategyKnowledge?.id ?? 'xdownload.player-strategies')
      || strategyKnowledge && strategies.revision !== strategyKnowledge.revision
      || !/^[0-9]+[.][0-9]+[.][0-9]+$/.test(strategies.revision)
      || !strategies.strategies || Array.isArray(strategies.strategies) || typeof strategies.strategies !== 'object'
      || Object.values(strategies.strategies).some((value) => typeof value !== 'string' || !value)) throw new Error('KNOWLEDGE_IDENTITY_MISMATCH');
  const selected = { packageId: identity.packageId, revision: identity.revision, closureSha256: expected.closure, lockSha256: expected.lock, graphSha256: asset.sha256, graph, units, unitRefs, providers, resources, signatures, strategies,
    ...(providerArtifact ? { providerArtifact, strategyKnowledge } : {}) };
  verifiedSelections.set(selected, canonicalDigest(selected));
  return selected;
}
