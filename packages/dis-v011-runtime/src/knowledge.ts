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
  selectionLock: {
    packageId: string;
    packageRevision: string;
    selectedAssets: (UnitRef & { kind: string; sha256: string })[];
    target: string;
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
  const strategiesRef = resolveUnit.evidence.sources.find((source) => source.sourceId === 'strategy-map')?.ref;
  if (!signaturesRef || !strategiesRef) throw new Error('SELECTED_KNOWLEDGE_MISSING');
  const signatures = parse<Selection['signatures'] & { catalogId: string; revision: string }>(signaturesRef.path);
  const strategies = parse<Selection['strategies'] & { catalogId: string; revision: string }>(strategiesRef);
  if (signatures.catalogId !== signaturesRef.id || signatures.revision !== signaturesRef.revision || strategies.catalogId !== 'xdownload.player-strategies' || !/^[0-9]+[.][0-9]+[.][0-9]+$/.test(strategies.revision)) throw new Error('KNOWLEDGE_IDENTITY_MISMATCH');
  const selected = { packageId: identity.packageId, revision: identity.revision, closureSha256: expected.closure, lockSha256: expected.lock, graphSha256: asset.sha256, graph, units, unitRefs, providers, resources, signatures, strategies };
  verifiedSelections.set(selected, canonicalDigest(selected));
  return selected;
}
