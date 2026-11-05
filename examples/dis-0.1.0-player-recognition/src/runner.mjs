import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, '..');

export class DisExecutionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DisExecutionError';
    this.code = code;
  }
}

export function isSafePackageRelativeRef(ref) {
  if (typeof ref !== 'string' || ref.length === 0) return false;
  if (ref.startsWith('/') || ref.includes('\\') || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(ref)) return false;
  return !ref.split('/').some((segment) => segment === '..' || segment === '' || segment === '.');
}

export function isExternalProvenanceRef(ref) {
  if (typeof ref !== 'string' || /\s/.test(ref)) return false;
  return /^https:\/\/[^\s]+$/i.test(ref) ||
    /^doi:10\.[0-9]{4,9}\/[^\s]+$/i.test(ref) ||
    /^urn:[A-Za-z0-9][A-Za-z0-9-]{0,31}:[^\s]+$/i.test(ref);
}

export async function assertInsidePackage(root, absolutePath) {
  let rootReal;
  let targetReal;
  try {
    rootReal = await fs.realpath(root);
    targetReal = await fs.realpath(absolutePath);
  } catch {
    throw new DisExecutionError('MISSING_PACKAGE_RESOURCE', absolutePath);
  }
  const relative = path.relative(rootReal, targetReal);
  if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
    throw new DisExecutionError('RESOURCE_PATH_ESCAPE', absolutePath);
  }
  return targetReal;
}

async function readPackageResource(root, relativePath) {
  if (!isSafePackageRelativeRef(relativePath)) throw new DisExecutionError('UNSAFE_PACKAGE_RESOURCE_PATH', String(relativePath));
  const absolute = path.resolve(root, relativePath);
  const realPath = await assertInsidePackage(root, absolute);
  return fs.readFile(realPath);
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

export function validateUnit(unit) {
  const required = ['schemaVersion', 'id', 'revision', 'role', 'purpose', 'scope', 'owner', 'authority', 'qualification', 'evidence', 'failure'];
  for (const key of required) if (!(key in unit)) throw new DisExecutionError('INVALID_UNIT', 'missing ' + key);
  if (unit.schemaVersion !== 'dis.unit/0.1.0') throw new DisExecutionError('UNSUPPORTED_UNIT_SCHEMA', unit.schemaVersion);
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(unit.revision)) throw new DisExecutionError('INVALID_REVISION', unit.revision);
  if (!['knowledge', 'recognizer', 'decision', 'procedure', 'tool', 'workflow', 'validator'].includes(unit.role)) throw new DisExecutionError('INVALID_ROLE', unit.role);
  if (!unit.scope?.domain || !Array.isArray(unit.scope.appliesTo) || !Array.isArray(unit.scope.excludes)) throw new DisExecutionError('INVALID_SCOPE', unit.id);
  if (!['FROZEN', 'CONTROLLED', 'REFERENCE', 'EXAMPLE', 'DERIVED'].includes(unit.authority)) throw new DisExecutionError('INVALID_AUTHORITY', unit.id);
  if (!unit.qualification || typeof unit.qualification.profile !== 'string' || 'stage' in unit.qualification) throw new DisExecutionError('MUTABLE_QUALIFICATION_STAGE_FORBIDDEN', unit.id);
  if ('supported' in (unit.failure || {}) || !unit.failure?.handling || typeof unit.failure.handling !== 'object' || Array.isArray(unit.failure.handling)) throw new DisExecutionError('INVALID_FAILURE_PROFILE', unit.id);
  const failureStatuses = new Set(['UNKNOWN', 'AMBIGUOUS', 'CONFLICT', 'OUT_OF_SCOPE', 'INVALID_INPUT', 'PARTIAL', 'FAILED', 'NEEDS_INPUT', 'NEEDS_REVIEW']);
  const handlingActions = new Set(['REJECT', 'PRESERVE_UNKNOWN', 'CLARIFY', 'WAIT', 'REVIEW', 'BOUNDED_FALLBACK', 'BOUNDED_RETRY', 'ESCALATE', 'RETURN_PARTIAL', 'FAIL']);
  for (const [status, policy] of Object.entries(unit.failure.handling)) {
    if (!failureStatuses.has(status) || !policy || typeof policy !== 'object' || !handlingActions.has(policy.action)) throw new DisExecutionError('INVALID_FAILURE_HANDLING_POLICY', unit.id + ':' + status);
    if (policy.action === 'BOUNDED_RETRY' && (!Number.isInteger(policy.retryLimit) || policy.retryLimit < 0 || policy.retryLimit > 3)) throw new DisExecutionError('INVALID_FAILURE_RETRY_LIMIT', unit.id + ':' + status);
  }
  if (!Array.isArray(unit.evidence?.sources) || !('absenceReason' in unit.evidence)) throw new DisExecutionError('INVALID_EVIDENCE', unit.id);
  for (const source of unit.evidence.sources) {
    if (!source || typeof source.ref !== 'string' || (!isSafePackageRelativeRef(source.ref) && !isExternalProvenanceRef(source.ref))) throw new DisExecutionError('UNSAFE_PROVENANCE_REF', unit.id);
  }
  if (!unit.validation || typeof unit.validation.profile !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(unit.validation.profileRevision || '') || !unit.validation.validator?.id || !unit.validation.validator?.version || 'lastResult' in unit.validation) throw new DisExecutionError('INVALID_VALIDATION_REQUIREMENT', unit.id);
  const executable = ['recognizer', 'decision', 'procedure', 'tool', 'workflow', 'validator'].includes(unit.role);
  if (executable) {
    if (!isSafePackageRelativeRef(unit.input?.schemaRef) || !isSafePackageRelativeRef(unit.output?.schemaRef) || !unit.implementation?.strategy || !unit.implementation?.ref) throw new DisExecutionError('MISSING_EXECUTABLE_CONTRACT', unit.id);
    if (unit.role === 'workflow') {
      if (unit.implementation.strategy !== 'workflow-graph' || !unit.implementation.ref.startsWith('graph:') || !isSafePackageRelativeRef(unit.implementation.artifactRef)) throw new DisExecutionError('INVALID_WORKFLOW_BINDING', unit.id);
    } else if (unit.role === 'tool') {
      if (unit.implementation.exposure !== 'tool' || unit.implementation.strategy !== 'tool-operation' || !unit.implementation.ref.startsWith('tool:')) throw new DisExecutionError('INVALID_TOOL_EXPOSURE', unit.id);
    } else if (unit.implementation.exposure === 'tool' || !isSafePackageRelativeRef(unit.implementation.artifactRef)) {
      throw new DisExecutionError('UNTRUSTED_IMPLEMENTATION_BINDING', unit.id);
    }
  }
  if (unit.role === 'procedure' && unit.implementation.exposure !== 'private') throw new DisExecutionError('PRIVATE_PROCEDURE_EXPOSURE_REQUIRED', unit.id);
  if (unit.implementation?.candidates !== undefined) {
    const candidates = unit.implementation.candidates;
    if (!Array.isArray(candidates) || candidates.length < 1 || unit.implementation.selectionPolicy?.mode !== 'PACKAGE_LOCK_EXACT') throw new DisExecutionError('INVALID_IMPLEMENTATION_CANDIDATES', unit.id);
    const ids = candidates.map((candidate) => candidate.candidateId);
    if (new Set(ids).size !== ids.length) throw new DisExecutionError('DUPLICATE_IMPLEMENTATION_CANDIDATE', unit.id);
    for (const candidate of candidates) {
      if (!candidate.candidateId || !candidate.ref || !isSafePackageRelativeRef(candidate.artifactRef) || !/^[a-f0-9]{64}$/.test(candidate.artifactDigest || '') || !candidate.target || !/^[a-f0-9]{64}$/.test(candidate.contractDigest || '')) throw new DisExecutionError('INVALID_IMPLEMENTATION_CANDIDATE', unit.id);
    }
  }
  if (unit.preconditions) {
    if (unit.preconditions.inputSchemaRef !== unit.input?.schemaRef || !Array.isArray(unit.preconditions.all) || unit.preconditions.all.length === 0) throw new DisExecutionError('INVALID_PRECONDITIONS_PROFILE', unit.id);
    for (const condition of unit.preconditions.all) {
      if (!['exists', 'equals', 'notEquals'].includes(condition.operator) || typeof condition.path !== 'string' || (condition.operator === 'exists' && Object.hasOwn(condition, 'value')) || (condition.operator !== 'exists' && !Object.hasOwn(condition, 'value'))) throw new DisExecutionError('INVALID_PRECONDITION', unit.id);
      if (condition.path !== '' && !/^\/[A-Za-z0-9_~-]+$/.test(condition.path)) throw new DisExecutionError('INVALID_PRECONDITION_POINTER', unit.id);
    }
  }
  if (unit.knowledgeRefs !== undefined) {
    if (!Array.isArray(unit.knowledgeRefs)) throw new DisExecutionError('INVALID_KNOWLEDGE_REFS', unit.id);
    for (const ref of unit.knowledgeRefs) {
      if (!ref.id || !ref.revision || !ref.kind || !isSafePackageRelativeRef(ref.path) || !/^[a-f0-9]{64}$/.test(ref.sha256 || '')) throw new DisExecutionError('INVALID_KNOWLEDGE_REF', unit.id);
    }
  }
  if (unit.evidence.consumes !== undefined && (!Array.isArray(unit.evidence.consumes) || new Set(unit.evidence.consumes).size !== unit.evidence.consumes.length)) throw new DisExecutionError('INVALID_EVIDENCE_SLOTS', unit.id);
  return true;
}

export function validatePreconditions(unit, input) {
  for (const condition of unit.preconditions?.all || []) {
    const actual = pointerGet(input, condition.path);
    const matches = condition.operator === 'exists'
      ? actual !== MISSING
      : condition.operator === 'equals'
        ? actual !== MISSING && jsonValueEqual(actual, condition.value)
        : actual === MISSING || !jsonValueEqual(actual, condition.value);
    if (!matches) throw new DisExecutionError('PRECONDITION_FAILED', unit.id + ':' + condition.path);
  }
  return true;
}

export function validateCapabilityContracts(unitsById) {
  const providers = [];
  for (const unit of unitsById.values()) {
    for (const contract of unit.capabilities?.provides || []) providers.push({ unit, contract });
  }
  for (const unit of unitsById.values()) {
    for (const requirement of unit.capabilities?.requires || []) {
      const candidates = providers.filter(({ contract }) => contract.capabilityId === requirement.capabilityId);
      if (candidates.length === 0) throw new DisExecutionError('MISSING_CAPABILITY_PROVIDER', requirement.capabilityId);
      if (candidates.length !== 1) throw new DisExecutionError('AMBIGUOUS_CAPABILITY_PROVIDER', requirement.capabilityId);
      const provider = candidates[0].contract;
      const sameIdentity = provider.owner === requirement.owner && provider.authorityRef === requirement.authorityRef &&
        provider.inputSchemaRef === requirement.inputSchemaRef && provider.inputSchemaDigest === requirement.inputSchemaDigest &&
        provider.outputSchemaRef === requirement.outputSchemaRef && provider.outputSchemaDigest === requirement.outputSchemaDigest;
      const accepted = requirement.compatibility?.accepted || [];
      const exactAccepted = accepted.some((item) => item.version === provider.version && item.contractDigest === provider.contractDigest);
      const compatible = requirement.compatibility?.policy === 'EXACT'
        ? provider.version === requirement.version && provider.contractDigest === requirement.contractDigest && exactAccepted
        : requirement.compatibility?.policy === 'EXPLICIT_ALLOWLIST' && exactAccepted;
      if (!sameIdentity || !compatible) throw new DisExecutionError('INCOMPATIBLE_CAPABILITY_PROVIDER', requirement.capabilityId);
    }
  }
  return true;
}

export function resolveProviderSelection(unit, selectionLock, target, resources) {
  const matches = (selectionLock?.selectedCapabilities || []).filter((item) => item.capabilityId === unit.capabilities?.provides?.[0]?.capabilityId && item.provider?.unitId === unit.id);
  if (matches.length === 0) throw new DisExecutionError('MISSING_PACKAGE_PROVIDER_SELECTION', unit.id);
  if (matches.length !== 1) throw new DisExecutionError('AMBIGUOUS_PACKAGE_PROVIDER_SELECTION', unit.id);
  const lock = matches[0], provider = lock.provider;
  const candidates = unit.implementation?.candidates || [];
  const found = candidates.filter((candidate) => candidate.candidateId === provider.candidateId);
  if (found.length === 0) throw new DisExecutionError('MISSING_IMPLEMENTATION_PROVIDER', provider.candidateId);
  if (found.length !== 1) throw new DisExecutionError('AMBIGUOUS_IMPLEMENTATION_PROVIDER', provider.candidateId);
  const candidate = found[0];
  if (provider.target !== target || candidate.target !== target || provider.target !== candidate.target) throw new DisExecutionError('INCOMPATIBLE_PROVIDER_TARGET', provider.candidateId);
  if (candidate.contractDigest !== lock.contractDigest || provider.contractDigest !== candidate.contractDigest) throw new DisExecutionError('INCOMPATIBLE_PROVIDER_CONTRACT', provider.candidateId);
  if (provider.unitRevision !== unit.revision || provider.implementationRef !== candidate.ref || provider.artifactRef !== candidate.artifactRef || provider.artifactDigest !== candidate.artifactDigest) throw new DisExecutionError('PACKAGE_PROVIDER_PIN_MISMATCH', provider.candidateId);
  if (unit.implementation.ref !== candidate.ref || unit.implementation.artifactRef !== candidate.artifactRef || unit.implementation.strategy !== candidate.strategy || unit.implementation.exposure !== candidate.exposure) throw new DisExecutionError('UNIT_PROVIDER_BINDING_MISMATCH', provider.candidateId);
  if (resources.get(candidate.artifactRef) !== candidate.artifactDigest) throw new DisExecutionError('PROVIDER_ARTIFACT_DIGEST_MISMATCH', candidate.artifactRef);
  return { candidate, lock };
}

export function validateLifecycleRecords(packageIdentity, unitsById, unitPaths, resources, closureDigest) {
  const records = packageIdentity.lifecycleRecords;
  const selection = packageIdentity.selectionLock;
  if (!Array.isArray(records) || records.length < 3 || !selection) throw new DisExecutionError('MISSING_LIFECYCLE_OR_SELECTION_LOCK', packageIdentity.packageId);
  if (selection.packageId !== packageIdentity.packageId || selection.packageRevision !== packageIdentity.revision || selection.standardVersion !== packageIdentity.standardVersion) throw new DisExecutionError('SELECTION_PACKAGE_IDENTITY_MISMATCH', packageIdentity.packageId);
  if (!selection.consumerProfile?.id || !selection.consumerProfile?.revision || !selection.target || !Array.isArray(selection.selectedAssets) || !Array.isArray(selection.selectedCapabilities)) throw new DisExecutionError('INVALID_PACKAGE_SELECTION_LOCK', packageIdentity.packageId);
  const byId = new Map();
  for (const record of records) {
    if (!record.recordId || byId.has(record.recordId) || !['CANDIDATE', 'VALIDATED', 'PROMOTED', 'REJECTED', 'WITHDRAWN', 'EXPIRED', 'SUPERSEDED'].includes(record.transition)) throw new DisExecutionError('INVALID_LIFECYCLE_RECORD', record.recordId || 'missing');
    if (record.dependencyClosureDigest !== closureDigest || !record.subject?.id || !/^[a-f0-9]{64}$/.test(record.subject.sha256 || '')) throw new DisExecutionError('LIFECYCLE_SUBJECT_OR_CLOSURE_MISMATCH', record.recordId);
    byId.set(record.recordId, record);
  }
  const unitAsset = selection.selectedAssets.find((asset) => asset.kind === 'unit' && asset.id === 'xdownload.player.recognizer');
  if (!unitAsset) throw new DisExecutionError('SELECTED_RECOGNIZER_ASSET_MISSING', packageIdentity.packageId);
  const unit = unitsById.get(unitAsset.id), unitPath = unitPaths.get(unitAsset.id);
  if (!unit || unit.revision !== unitAsset.revision || resources.get(unitPath) !== unitAsset.sha256) throw new DisExecutionError('SELECTED_ASSET_DIGEST_MISMATCH', unitAsset.id);
  const chain = records.filter((record) => record.subject.id === unit.id && record.subject.revision === unit.revision && record.subject.sha256 === unitAsset.sha256);
  const candidate = chain.find((record) => record.transition === 'CANDIDATE');
  const validated = chain.find((record) => record.transition === 'VALIDATED');
  const promoted = chain.find((record) => record.transition === 'PROMOTED');
  if (!candidate || !validated || !promoted || validated.previousRecordId !== candidate.recordId || promoted.previousRecordId !== validated.recordId) throw new DisExecutionError('INCOMPLETE_LIFECYCLE_CHAIN', unit.id);
  if (chain.some((record) => record.dependencyClosureDigest !== closureDigest)) throw new DisExecutionError('STALE_LIFECYCLE_DEPENDENCY_CLOSURE', unit.id);
  const validation = validated.validation;
  if (!validation || validation.result !== 'PASS' || validation.subjectDigest !== unitAsset.sha256 || validation.dependencyClosureDigest !== closureDigest || !validation.profile?.id || !validation.profile?.revision || !validation.validator?.id || !validation.validator?.version || !validation.baseline?.sha256 || !validation.coverage) throw new DisExecutionError('INVALID_LIFECYCLE_VALIDATION', validated.recordId);
  for (const key of ['positive', 'negative', 'boundary', 'heldOut']) if (!Number.isInteger(validation.coverage[key]) || validation.coverage[key] < 0) throw new DisExecutionError('INVALID_LIFECYCLE_COVERAGE', validated.recordId);
  for (const evidence of validation.evidenceRefs || []) if (resources.get(evidence.path) !== evidence.sha256) throw new DisExecutionError('LIFECYCLE_EVIDENCE_DIGEST_MISMATCH', evidence.path);
  const promotion = promoted.promotion;
  if (!promotion || promotion.decision !== 'PROMOTE' || promotion.validationRecordId !== validated.recordId || !promoted.actor?.id || !promoted.actor?.authorityRef || !promotion.policy?.id || !promotion.policy?.revision) throw new DisExecutionError('UNAUTHORIZED_PROMOTION_RECORD', promoted.recordId);
  if (unitAsset.promotionRecordId !== promoted.recordId || unitAsset.validationRecordId !== validated.recordId) throw new DisExecutionError('PACKAGE_PROMOTION_PIN_MISMATCH', unit.id);
  for (const asset of selection.selectedAssets) {
    if (asset.kind === 'rule') {
      if (!unit.knowledgeRefs?.some((ref) => ref.id === asset.id && ref.revision === asset.revision && ref.path === asset.path && ref.sha256 === asset.sha256)) throw new DisExecutionError('SELECTED_KNOWLEDGE_PIN_MISMATCH', asset.id);
      if (asset.promotionRecordId !== promoted.recordId || asset.validationRecordId !== validated.recordId || resources.get(asset.path) !== asset.sha256) throw new DisExecutionError('SELECTED_KNOWLEDGE_NOT_PROMOTED', asset.id);
    }
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
    const [filePart, fragment] = ref.split('#', 2);
    if (!isSafePackageRelativeRef(filePart)) throw new DisExecutionError('UNSAFE_SCHEMA_REF', ref);
    if (fragment && !fragment.startsWith('/')) throw new DisExecutionError('INVALID_SCHEMA_FRAGMENT', ref);
    const absolute = path.resolve(baseDir, filePart);
    let realPath;
    try {
      realPath = await assertInsidePackage(root, absolute);
    } catch (error) {
      if (error instanceof DisExecutionError && error.code === 'MISSING_PACKAGE_RESOURCE') {
        throw new DisExecutionError('MISSING_SCHEMA_RESOURCE', path.relative(root, absolute).split(path.sep).join('/'));
      }
      throw error;
    }
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
      content = await fs.readFile(realPath, 'utf8');
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
    resources.set(relative, sha256(content));

    async function scan(value) {
      if (Array.isArray(value)) {
        for (const item of value) await scan(item);
      } else if (value && typeof value === 'object') {
        for (const [key, child] of Object.entries(value)) {
          if (key === '$ref' && typeof child === 'string') {
            if (child.startsWith('#')) {
              const localFragment = child.slice(1);
              if (localFragment) {
                const target = localFragment.split('/').slice(1).map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~')).reduce((current, part) => current?.[part], schema);
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

function isTopLevelPointer(pointer, allowRoot = false) {
  if (allowRoot && pointer === '') return true;
  return typeof pointer === 'string' && /^\/(?:[^~/]|~[01])+$/.test(pointer);
}

function pointerProperty(pointer) {
  if (!isTopLevelPointer(pointer, false)) throw new DisExecutionError('INVALID_TOP_LEVEL_POINTER', String(pointer));
  return pointer.slice(1).replaceAll('~1', '/').replaceAll('~0', '~');
}

function jsonValueEqual(left, right) {
  if (left === right) return true;
  if (typeof left !== typeof right || left === null || right === null) return false;
  if (typeof left === 'number') return left === right;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length &&
      left.every((value, index) => jsonValueEqual(value, right[index]));
  }
  if (typeof left === 'object') {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return leftKeys.length === rightKeys.length &&
      leftKeys.every((key) => Object.hasOwn(right, key) && jsonValueEqual(left[key], right[key]));
  }
  return false;
}

export function conditionMatches(output, condition) {
  if (!condition) return true;
  const actual = pointerGet(output, condition.path);
  if (condition.operator === 'equals') return actual !== undefined && jsonValueEqual(actual, condition.value);
  if (condition.operator === 'notEquals') return actual === undefined || !jsonValueEqual(actual, condition.value);
  if (condition.operator === 'exists') return actual !== undefined;
  throw new DisExecutionError('UNSUPPORTED_CONDITION_OPERATOR', condition.operator);
}

function requiredProperties(schema) {
  return Array.isArray(schema?.required) ? schema.required : [];
}

function canReach(from, to, adjacency) {
  if (from === to) return false;
  const pending = [from];
  const seen = new Set();
  while (pending.length) {
    const current = pending.pop();
    if (seen.has(current)) continue;
    seen.add(current);
    for (const next of adjacency.get(current) || []) {
      if (next === to) return true;
      pending.push(next);
    }
  }
  return false;
}

function topologicalOrder(nodeIds, adjacency) {
  const indegree = new Map(nodeIds.map((id) => [id, 0]));
  for (const from of nodeIds) for (const to of adjacency.get(from) || []) indegree.set(to, indegree.get(to) + 1);
  const pending = nodeIds.filter((id) => indegree.get(id) === 0);
  const order = [];
  while (pending.length) {
    const current = pending.shift();
    order.push(current);
    for (const next of adjacency.get(current) || []) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) pending.push(next);
    }
  }
  if (order.length !== nodeIds.length) throw new DisExecutionError('CONTROL_CYCLE', 'DIS 0.1.0 graphs are DAG-only');
  return order;
}

function pathBindingRange(entryNode, targetNode, sourceNodes, order, adjacency) {
  const minimum = new Map(order.map((id) => [id, Number.POSITIVE_INFINITY]));
  const maximum = new Map(order.map((id) => [id, Number.NEGATIVE_INFINITY]));
  const initial = sourceNodes.has(entryNode) ? 1 : 0;
  minimum.set(entryNode, initial);
  maximum.set(entryNode, initial);
  for (const current of order) {
    if (!Number.isFinite(minimum.get(current))) continue;
    for (const next of adjacency.get(current) || []) {
      const increment = sourceNodes.has(next) ? 1 : 0;
      minimum.set(next, Math.min(minimum.get(next), minimum.get(current) + increment));
      maximum.set(next, Math.max(maximum.get(next), maximum.get(current) + increment));
    }
  }
  return { minimum: minimum.get(targetNode), maximum: maximum.get(targetNode) };
}

export function validateGraph(graph, unitsById, schemas) {
  if (graph.schemaVersion !== 'dis.graph/0.1.0') throw new DisExecutionError('UNSUPPORTED_GRAPH_SCHEMA', graph.schemaVersion);
  if (graph.cyclePolicy !== 'DAG_ONLY') throw new DisExecutionError('UNSUPPORTED_CYCLE_POLICY', String(graph.cyclePolicy));
  const nodeIds = graph.nodes.map((node) => node.nodeId);
  const nodesById = new Map(graph.nodes.map((node) => [node.nodeId, node]));
  if (new Set(nodeIds).size !== nodeIds.length) throw new DisExecutionError('DUPLICATE_NODE_ID', 'node IDs must be unique');
  if (!nodeIds.includes(graph.entryNode)) throw new DisExecutionError('MISSING_ENTRY_NODE', graph.entryNode);
  for (const terminal of graph.terminalNodes) if (!nodeIds.includes(terminal)) throw new DisExecutionError('UNKNOWN_TERMINAL_NODE', terminal);

  for (const node of graph.nodes) {
    const unit = unitsById.get(node.unitRef.id);
    if (!unit || unit.revision !== node.unitRef.revision) throw new DisExecutionError('UNRESOLVED_EXACT_UNIT_REF', node.unitRef.id);
  }
  const entryUnit = unitsById.get(nodesById.get(graph.entryNode).unitRef.id);
  if (entryUnit.input.schemaRef !== graph.inputSchemaRef) throw new DisExecutionError('GRAPH_ENTRY_INPUT_MISMATCH', graph.inputSchemaRef);
  for (const terminalId of graph.terminalNodes) {
    const terminalUnit = unitsById.get(nodesById.get(terminalId).unitRef.id);
    if (terminalUnit.output.schemaRef !== graph.outputSchemaRef) throw new DisExecutionError('GRAPH_TERMINAL_OUTPUT_MISMATCH', terminalId);
  }

  const controls = graph.edges.filter((edge) => edge.kind === 'control');
  const data = graph.edges.filter((edge) => edge.kind === 'data');
  const evidence = graph.edges.filter((edge) => edge.kind === 'evidence');
  if (controls.length + data.length + evidence.length !== graph.edges.length) throw new DisExecutionError('INVALID_EDGE_KIND', 'every edge must have exactly one supported kind');

  const adjacency = new Map(nodeIds.map((id) => [id, []]));
  for (const edge of controls) {
    if (!nodesById.has(edge.from) || !nodesById.has(edge.to)) throw new DisExecutionError('UNKNOWN_CONTROL_NODE', edge.from + '->' + edge.to);
    if (edge.when) {
      if (!['equals', 'notEquals', 'exists'].includes(edge.when.operator)) throw new DisExecutionError('UNSUPPORTED_CONDITION_OPERATOR', String(edge.when.operator));
      if (!isTopLevelPointer(edge.when.path, true)) throw new DisExecutionError('INVALID_CONDITION_POINTER', edge.when.path);
      const sourceUnit = unitsById.get(nodesById.get(edge.from).unitRef.id);
      const sourceSchema = schemas.get(sourceUnit.output.schemaRef);
      if (edge.when.path !== '') {
        const conditionProperty = pointerProperty(edge.when.path);
        if (!sourceSchema?.properties?.[conditionProperty]) throw new DisExecutionError('UNKNOWN_CONDITION_OUTPUT_POINTER', edge.from + edge.when.path);
      }
      if (['equals', 'notEquals'].includes(edge.when.operator) && !Object.hasOwn(edge.when, 'value')) throw new DisExecutionError('CONDITION_VALUE_REQUIRED', edge.from);
      if (edge.when.operator === 'exists' && Object.hasOwn(edge.when, 'value')) throw new DisExecutionError('EXISTS_CONDITION_FORBIDS_VALUE', edge.from);
    }
    adjacency.get(edge.from).push(edge.to);
  }

  const dataEdgeKeys = new Set();
  for (const edge of data) {
    if (!nodesById.has(edge.from.node) || !nodesById.has(edge.to.node)) throw new DisExecutionError('UNKNOWN_DATA_NODE', edge.from.node + '->' + edge.to.node);
    if (!isTopLevelPointer(edge.from.pointer, true) || !isTopLevelPointer(edge.to.pointer, false)) throw new DisExecutionError('INVALID_DATA_POINTER', edge.from.node + '->' + edge.to.node);
    const sourceUnit = unitsById.get(nodesById.get(edge.from.node).unitRef.id);
    const sourceSchema = schemas.get(sourceUnit.output.schemaRef);
    if (edge.from.pointer !== '') {
      const sourceProperty = pointerProperty(edge.from.pointer);
      if (!sourceSchema?.properties?.[sourceProperty]) throw new DisExecutionError('UNKNOWN_SOURCE_OUTPUT_POINTER', edge.from.node + edge.from.pointer);
      if (!requiredProperties(sourceSchema).includes(sourceProperty)) throw new DisExecutionError('SOURCE_OUTPUT_NOT_REQUIRED', edge.from.node + edge.from.pointer);
    }
    const targetUnit = unitsById.get(nodesById.get(edge.to.node).unitRef.id);
    const targetSchema = schemas.get(targetUnit.input.schemaRef);
    if (!targetSchema?.properties?.[pointerProperty(edge.to.pointer)]) throw new DisExecutionError('UNKNOWN_TARGET_INPUT_POINTER', edge.to.node + edge.to.pointer);
    if (edge.to.node === graph.entryNode) throw new DisExecutionError('ENTRY_NODE_CANNOT_RECEIVE_DATA_EDGE', edge.to.node);
    const duplicateKey = edge.to.node + '|' + edge.to.pointer + '|' + edge.from.node;
    if (dataEdgeKeys.has(duplicateKey)) throw new DisExecutionError('DUPLICATE_DATA_BINDING', duplicateKey);
    dataEdgeKeys.add(duplicateKey);
  }

  for (const edge of evidence) {
    if (!nodesById.has(edge.from.node) || !nodesById.has(edge.to.node)) throw new DisExecutionError('UNKNOWN_EVIDENCE_NODE', edge.from.node + '->' + edge.to.node);
    if (!isTopLevelPointer(edge.from.pointer, false)) throw new DisExecutionError('INVALID_EVIDENCE_SOURCE_POINTER', edge.from.pointer);
    const sourceUnit = unitsById.get(nodesById.get(edge.from.node).unitRef.id);
    const sourceSchema = schemas.get(sourceUnit.output.schemaRef);
    const evidenceProperty = pointerProperty(edge.from.pointer);
    if (!sourceSchema?.properties?.[evidenceProperty]) throw new DisExecutionError('UNKNOWN_EVIDENCE_SOURCE_POINTER', edge.from.node + edge.from.pointer);
    if (!requiredProperties(sourceSchema).includes(evidenceProperty)) throw new DisExecutionError('EVIDENCE_SOURCE_NOT_REQUIRED', edge.from.node + edge.from.pointer);
    const targetUnit = unitsById.get(nodesById.get(edge.to.node).unitRef.id);
    if (!(targetUnit.evidence.consumes || []).includes(edge.to.slot)) throw new DisExecutionError('UNDECLARED_EVIDENCE_SLOT', edge.to.slot);
  }

  const order = topologicalOrder(nodeIds, adjacency);
  const reachable = new Set([graph.entryNode]);
  const queue = [graph.entryNode];
  while (queue.length) {
    const current = queue.shift();
    for (const next of adjacency.get(current)) if (!reachable.has(next)) { reachable.add(next); queue.push(next); }
  }
  if (reachable.size !== nodeIds.length) throw new DisExecutionError('UNREACHABLE_CONTROL_NODE', nodeIds.filter((id) => !reachable.has(id)).join(','));

  for (const node of graph.nodes) {
    const unit = unitsById.get(node.unitRef.id);
    const schema = schemas.get(unit.input.schemaRef);
    if (node.nodeId !== graph.entryNode) {
      for (const property of requiredProperties(schema)) {
        const targetPointer = '/' + property.replaceAll('~', '~0').replaceAll('/', '~1');
        const bindings = data.filter((edge) => edge.to.node === node.nodeId && edge.to.pointer === targetPointer);
        if (bindings.length === 0) throw new DisExecutionError('MISSING_REQUIRED_DATA_BINDING', node.nodeId + targetPointer);
        const sources = new Set(bindings.map((edge) => edge.from.node));
        for (const source of sources) if (!canReach(source, node.nodeId, adjacency)) throw new DisExecutionError('DATA_SOURCE_NOT_BEFORE_TARGET', source + '->' + node.nodeId);
        const range = pathBindingRange(graph.entryNode, node.nodeId, sources, order, adjacency);
        if (range.minimum !== 1 || range.maximum !== 1) throw new DisExecutionError('REQUIRED_INPUT_BINDING_NOT_EXACTLY_ONE_ON_EVERY_PATH', node.nodeId + targetPointer + ' min=' + range.minimum + ' max=' + range.maximum);
      }
      for (const edge of data.filter((item) => item.to.node === node.nodeId)) {
        const property = pointerProperty(edge.to.pointer);
        if (!requiredProperties(schema).includes(property)) {
          if (!canReach(edge.from.node, node.nodeId, adjacency)) throw new DisExecutionError('DATA_SOURCE_NOT_BEFORE_TARGET', edge.from.node + '->' + node.nodeId);
          const sources = new Set(data.filter((item) => item.to.node === node.nodeId && item.to.pointer === edge.to.pointer).map((item) => item.from.node));
          const range = pathBindingRange(graph.entryNode, node.nodeId, sources, order, adjacency);
          if (range.maximum > 1) throw new DisExecutionError('OPTIONAL_INPUT_DUPLICATE_BINDING_ON_PATH', node.nodeId + edge.to.pointer);
        }
      }
    }
    for (const slot of unit.evidence.consumes || []) {
      const slotEdges = evidence.filter((edge) => edge.to.node === node.nodeId && edge.to.slot === slot);
      if (slotEdges.length === 0) throw new DisExecutionError('MISSING_EVIDENCE_BINDING', node.nodeId + ':' + slot);
      const sources = new Set(slotEdges.map((edge) => edge.from.node));
      for (const source of sources) if (!canReach(source, node.nodeId, adjacency)) throw new DisExecutionError('EVIDENCE_SOURCE_NOT_BEFORE_TARGET', source + '->' + node.nodeId);
      const range = pathBindingRange(graph.entryNode, node.nodeId, sources, order, adjacency);
      if (range.minimum < 1) throw new DisExecutionError('EVIDENCE_NOT_AVAILABLE_ON_EVERY_PATH', node.nodeId + ':' + slot);
    }
  }

  for (const nodeId of nodeIds) {
    if (!graph.terminalNodes.includes(nodeId) && adjacency.get(nodeId).length === 0) throw new DisExecutionError('PATH_WITHOUT_TERMINAL', nodeId);
    if (graph.terminalNodes.includes(nodeId) && adjacency.get(nodeId).length > 0) throw new DisExecutionError('TERMINAL_HAS_CONTROL_EDGE', nodeId);
  }
  return true;
}

export function validateDefinition(definition, unitsById, graph, graphPath) {
  if (definition.schemaVersion !== 'dis.definition/0.1.0') throw new DisExecutionError('UNSUPPORTED_DEFINITION_SCHEMA', definition.schemaVersion);
  const componentIds = new Set();
  const declared = new Map();
  for (const component of definition.components) {
    if (!['semantic', 'tool'].includes(component.family)) throw new DisExecutionError('INVALID_COMPONENT_FAMILY', component.family);
    if (componentIds.has(component.componentId)) throw new DisExecutionError('DUPLICATE_COMPONENT_ID', component.componentId);
    componentIds.add(component.componentId);
    const unit = unitsById.get(component.unitRef.id);
    if (!unit || unit.revision !== component.unitRef.revision) throw new DisExecutionError('UNRESOLVED_COMPONENT_UNIT', component.unitRef.id);
    if (declared.has(unit.id)) throw new DisExecutionError('DUPLICATE_DECLARED_UNIT', unit.id);
    if (component.family === 'tool' && (unit.role !== 'tool' || unit.implementation.exposure !== 'tool')) throw new DisExecutionError('INVALID_TOOL_COMPONENT_BINDING', component.componentId);
    if (component.family === 'semantic' && (unit.role === 'tool' || unit.implementation.exposure !== 'semantic')) throw new DisExecutionError('INVALID_SEMANTIC_COMPONENT_BINDING', component.componentId);
    declared.set(unit.id, { revision: unit.revision, family: component.family });
  }
  for (const ref of definition.privateUnits) {
    const unit = unitsById.get(ref.id);
    if (!unit || unit.revision !== ref.revision) throw new DisExecutionError('UNRESOLVED_PRIVATE_UNIT', ref.id);
    if (unit.implementation?.exposure && unit.implementation.exposure !== 'private') throw new DisExecutionError('PRIVATE_UNIT_EXPOSED', ref.id);
    if (declared.has(unit.id)) throw new DisExecutionError('PRIVATE_COMPONENT_OVERLAP', ref.id);
    declared.set(unit.id, { revision: unit.revision, family: 'private' });
  }
  for (const node of graph.nodes) {
    const declaredRef = declared.get(node.unitRef.id);
    if (!declaredRef || declaredRef.revision !== node.unitRef.revision) throw new DisExecutionError('UNDECLARED_GRAPH_UNIT', node.unitRef.id + '@' + node.unitRef.revision);
  }
  const workflowUnitRef = definition.workflowRef?.unitRef;
  const graphRef = definition.workflowRef?.graphRef;
  const workflowUnit = workflowUnitRef && unitsById.get(workflowUnitRef.id);
  if (!workflowUnit || workflowUnit.revision !== workflowUnitRef.revision || workflowUnit.role !== 'workflow') throw new DisExecutionError('WORKFLOW_UNIT_REF_MISMATCH', workflowUnitRef?.id || 'missing');
  if (declared.get(workflowUnit.id)?.family !== 'semantic') throw new DisExecutionError('WORKFLOW_UNIT_NOT_SEMANTIC_COMPONENT', workflowUnit.id);
  if (!graphRef || graphRef.id !== graph.id || graphRef.revision !== graph.revision || graphRef.path !== graphPath) throw new DisExecutionError('WORKFLOW_GRAPH_REF_MISMATCH', graphRef?.id || 'missing');
  if (workflowUnit.implementation.ref !== 'graph:' + graph.id + '@' + graph.revision || workflowUnit.implementation.artifactRef !== graphPath) throw new DisExecutionError('WORKFLOW_IMPLEMENTATION_BINDING_MISMATCH', workflowUnit.id);
  return true;
}

function recognizePlayerWithMode(input, context, normalize) {
  if (!input || typeof input.url !== 'string' || !/^https?:\/\//.test(input.url) || !Array.isArray(input.signals) || input.signals.some((item) => typeof item !== 'string')) {
    throw new DisExecutionError('INVALID_INPUT', 'PageObservation requires an http(s) url and string signals[]');
  }
  const patterns = context?.knowledge?.['xdownload.player-signatures']?.patterns || context?.catalogs?.signatures?.patterns;
  if (!Array.isArray(patterns)) throw new DisExecutionError('MISSING_SIGNATURE_CATALOG', 'player-signatures knowledgeRef is required');
  const rawHaystack = input.url + '\n' + input.signals.join('\n');
  const haystack = normalize ? rawHaystack.toLowerCase() : rawHaystack;
  const matches = patterns.flatMap((pattern) => {
    if (typeof pattern.playerId !== 'string' || !Array.isArray(pattern.markers)) throw new DisExecutionError('INVALID_SIGNATURE_CATALOG', 'each pattern needs playerId and markers[]');
    const marker = pattern.markers.find((candidate) => haystack.includes(normalize ? candidate.toLowerCase() : candidate));
    return marker ? [{ playerId: pattern.playerId, marker }] : [];
  });
  const candidates = [...new Set(matches.map((match) => match.playerId))];
  const status = candidates.length === 1 ? 'recognized' : candidates.length > 1 ? 'ambiguous' : 'unknown';
  const evidence = matches.length
    ? matches.map((match) => ({ sourceId: 'page-observation', kind: 'observation', ref: input.url, claim: 'matched marker ' + match.marker }))
    : [{ sourceId: 'page-observation', kind: 'observation', ref: input.url, claim: 'no supported player marker found' }];
  const evidenceRefs = evidence.map((item) => item.sourceId);
  const values = status === 'recognized'
    ? { playerId: { value: candidates[0], source: 'DERIVED', status: 'INFERRED', evidence: evidenceRefs } }
    : status === 'ambiguous'
      ? { playerCandidates: { value: candidates, source: 'DERIVED', status: 'CANDIDATE', evidence: evidenceRefs } }
      : { playerId: { value: null, source: 'SYSTEM_OBSERVED', status: 'UNKNOWN', evidence: evidenceRefs } };
  return {
    status, candidates, evidence, sourceUrl: input.url, values,
    missingFields: status === 'recognized' ? [] : ['playerId'],
    ambiguities: status === 'ambiguous' ? [{ field: 'playerId', candidates }] : [],
    conflicts: [],
    uncertainty: {
      level: status === 'recognized' ? 'LOW' : status === 'ambiguous' ? 'HIGH' : 'UNKNOWN',
      reason: status === 'recognized' ? 'one supported deterministic signature matched' : status === 'ambiguous' ? 'multiple supported player identities matched' : 'no supported player signature matched',
    },
  };
}

export function recognizePlayer(input, context) {
  return recognizePlayerWithMode(input, context, false);
}

export function recognizePlayerNormalized(input, context) {
  return recognizePlayerWithMode(input, context, true);
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
  'registry:xdownload.player.recognizer@1.0.0': recognizePlayer,
  'registry:xdownload.player.recognizer-normalized@1.0.0': recognizePlayerNormalized,
  'registry:xdownload.player.route-decision@1.0.0': routeRecognition,
  'registry:xdownload.player.resolve-procedure@1.0.0': resolvePlayer,
  'registry:xdownload.player.bounded-fallback@1.0.0': boundedFallback,
  'registry:xdownload.player.outcome-validator@1.0.0': validateOutcome,
};

export async function loadDemo() {
  const descriptor = JSON.parse(await fs.readFile(path.join(packageRoot, 'package.json'), 'utf8'));
  const packageIdentity = descriptor.dis;
  if (!packageIdentity || packageIdentity.standardVersion !== '0.1.0' ||
      !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(packageIdentity.revision || '') ||
      !/^[a-f0-9]{64}$/.test(packageIdentity.resourceClosureSha256 || '') ||
      !isSafePackageRelativeRef(packageIdentity.resourceClosurePath)) {
    throw new DisExecutionError('INVALID_PACKAGE_DESCRIPTOR', 'DIS package identity and closure binding are required');
  }
  const manifestBytes = await readPackageResource(packageRoot, packageIdentity.resourceClosurePath);
  const manifestDigest = sha256(manifestBytes);
  if (manifestDigest !== packageIdentity.resourceClosureSha256) throw new DisExecutionError('RESOURCE_MANIFEST_DIGEST_MISMATCH', packageIdentity.resourceClosurePath);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (manifest.schemaVersion !== 'dis.resource-closure/0.1.0' || manifest.packageId !== packageIdentity.packageId || manifest.packageRevision !== packageIdentity.revision || manifest.standardVersion !== packageIdentity.standardVersion) {
    throw new DisExecutionError('PACKAGE_MANIFEST_IDENTITY_MISMATCH', packageIdentity.packageId);
  }

  const resourceEntries = new Map();
  const resourceContents = new Map();
  const resources = new Map();
  for (const item of manifest.resources) {
    if (!isSafePackageRelativeRef(item.path)) throw new DisExecutionError('UNSAFE_PACKAGE_RESOURCE_PATH', item.path);
    if (resourceEntries.has(item.path)) throw new DisExecutionError('DUPLICATE_RESOURCE_CLOSURE_ENTRY', item.path);
    const bytes = await readPackageResource(packageRoot, item.path);
    const digest = sha256(bytes);
    if (digest !== item.sha256) throw new DisExecutionError('RESOURCE_DIGEST_MISMATCH', item.path);
    resourceEntries.set(item.path, item);
    resourceContents.set(item.path, bytes.toString('utf8'));
    resources.set(item.path, digest);
  }

  const units = manifest.units.map((ref) => {
    const resource = resourceEntries.get(ref.path);
    if (!resource || resource.kind !== 'unit') throw new DisExecutionError('UNIT_RESOURCE_NOT_CLOSED', ref.path);
    const unit = JSON.parse(resourceContents.get(ref.path));
    validateUnit(unit);
    if (unit.id !== ref.id || unit.revision !== ref.revision) throw new DisExecutionError('UNIT_RESOURCE_IDENTITY_MISMATCH', ref.id);
    return unit;
  });
  const unitsById = new Map(units.map((unit) => [unit.id, unit]));
  if (unitsById.size !== units.length) throw new DisExecutionError('DUPLICATE_UNIT_ID', 'Unit IDs must be unique');
  validateCapabilityContracts(unitsById);
  const unitPaths = new Map(manifest.units.map((item) => [item.id, item.path]));

  const graphResource = resourceEntries.get(manifest.graphRef.path);
  const definitionResource = resourceEntries.get(manifest.definitionRef.path);
  if (!graphResource || graphResource.kind !== 'graph' || !definitionResource || definitionResource.kind !== 'definition') {
    throw new DisExecutionError('PACKAGE_ROOT_RESOURCE_NOT_CLOSED', 'Graph and Definition must be in Resource Closure');
  }
  const graph = JSON.parse(resourceContents.get(manifest.graphRef.path));
  const definition = JSON.parse(resourceContents.get(manifest.definitionRef.path));
  if (graph.id !== manifest.graphRef.id || graph.revision !== manifest.graphRef.revision || definition.domainId !== manifest.definitionRef.id || definition.revision !== manifest.definitionRef.revision) {
    throw new DisExecutionError('PACKAGE_ROOT_RESOURCE_IDENTITY_MISMATCH', packageIdentity.packageId);
  }

  const refs = [graph.inputSchemaRef, graph.outputSchemaRef];
  for (const unit of units) {
    if (unit.input) refs.push(unit.input.schemaRef);
    if (unit.output) refs.push(unit.output.schemaRef);
    if (unit.implementation?.artifactRef && !resourceEntries.has(unit.implementation.artifactRef)) throw new DisExecutionError('IMPLEMENTATION_ARTIFACT_NOT_CLOSED', unit.implementation.artifactRef);
    for (const source of unit.evidence.sources || []) {
      if (isSafePackageRelativeRef(source.ref)) {
        if (!resourceEntries.has(source.ref)) throw new DisExecutionError('EVIDENCE_SOURCE_NOT_CLOSED', source.ref);
      } else if (!isExternalProvenanceRef(source.ref)) {
        throw new DisExecutionError('UNSAFE_PROVENANCE_REF', source.ref);
      }
    }
    if (unit.validation?.casesRef && isSafePackageRelativeRef(unit.validation.casesRef) && !resourceEntries.has(unit.validation.casesRef)) throw new DisExecutionError('VALIDATION_CASES_NOT_CLOSED', unit.validation.casesRef);
  }
  const schemaClosure = await resolveSchemaClosure(packageRoot, refs);
  for (const [relative, digest] of schemaClosure.resources) {
    if (!resourceEntries.has(relative) || resourceEntries.get(relative).kind !== 'schema' || resourceEntries.get(relative).sha256 !== digest) {
      throw new DisExecutionError('SCHEMA_RESOURCE_NOT_CLOSED', relative);
    }
  }
  const schemas = schemaClosure.schemas;
  const expectedResources = new Map();
  function expectResource(resourcePath, kind, owner) {
    if (!isSafePackageRelativeRef(resourcePath)) throw new DisExecutionError('UNSAFE_PACKAGE_RESOURCE_PATH', String(resourcePath));
    const existing = expectedResources.get(resourcePath);
    if (existing && existing.kind !== kind) throw new DisExecutionError('RESOURCE_KIND_CONFLICT', resourcePath);
    const owners = new Set(existing?.owners || []);
    owners.add(owner || packageIdentity.packageId);
    expectedResources.set(resourcePath, { kind, owners });
  }
  expectResource(manifest.definitionRef.path, 'definition', definition.domainId);
  expectResource(manifest.graphRef.path, 'graph', graph.id);
  for (const unitRef of manifest.units) expectResource(unitRef.path, 'unit', unitRef.id);
  for (const resourcePath of schemaClosure.resources.keys()) expectResource(resourcePath, 'schema', packageIdentity.packageId);
  for (const unit of units) {
    if (unit.implementation?.artifactRef) expectResource(unit.implementation.artifactRef, unit.role === 'workflow' ? 'graph' : 'implementation', unit.id);
    for (const source of unit.evidence.sources || []) {
      const sourcePath = source.ref;
      if (isExternalProvenanceRef(sourcePath)) continue;
      if (!isSafePackageRelativeRef(sourcePath)) throw new DisExecutionError('UNSAFE_EVIDENCE_SOURCE_REF', sourcePath);
      const sourceKind = expectedResources.get(sourcePath)?.kind ||
        (sourcePath.startsWith('fixtures/') ? 'fixture' :
          sourcePath.startsWith('domain/schemas/') ? 'schema' :
            sourcePath.startsWith('domain/units/') ? 'unit' : 'conformance');
      expectResource(sourcePath, sourceKind, unit.id);
    }
    if (unit.validation?.casesRef) expectResource(unit.validation.casesRef, 'conformance', unit.id);
    for (const ref of unit.knowledgeRefs || []) expectResource(ref.path, 'fixture', unit.id);
  }
  if (!Array.isArray(packageIdentity.conformanceResources)) throw new DisExecutionError('MISSING_CONFORMANCE_RESOURCE_DECLARATIONS', packageIdentity.packageId);
  for (const resourcePath of packageIdentity.conformanceResources) expectResource(resourcePath, 'conformance', packageIdentity.packageId);
  const signaturesPath = 'fixtures/player-signatures.json';
  const strategiesPath = 'fixtures/player-strategies.json';
  expectResource(signaturesPath, 'fixture', packageIdentity.packageId);
  expectResource(strategiesPath, 'fixture', packageIdentity.packageId);
  for (const [resourcePath, expected] of expectedResources) {
    const entry = resourceEntries.get(resourcePath);
    if (!entry) throw new DisExecutionError('RESOURCE_CLOSURE_MISSING_REQUIRED_RESOURCE', resourcePath);
    if (entry.kind !== expected.kind || entry.required !== true) throw new DisExecutionError('RESOURCE_CLOSURE_KIND_OR_REQUIRED_MISMATCH', resourcePath);
    for (const owner of expected.owners) if (!entry.owners.includes(owner)) throw new DisExecutionError('RESOURCE_CLOSURE_OWNER_MISMATCH', resourcePath + ':' + owner);
  }
  for (const entry of manifest.resources) {
    if (entry.required && !expectedResources.has(entry.path)) throw new DisExecutionError('RESOURCE_CLOSURE_HAS_UNREFERENCED_REQUIRED_RESOURCE', entry.path);
  }
  const knowledge = {};
  for (const unit of units) {
    for (const ref of unit.knowledgeRefs || []) {
      const resource = resourceEntries.get(ref.path);
      if (!resource || resource.kind !== 'fixture' || resource.sha256 !== ref.sha256) throw new DisExecutionError('KNOWLEDGE_RESOURCE_PIN_MISMATCH', ref.path);
      const value = JSON.parse(resourceContents.get(ref.path));
      if (value.catalogId !== ref.id || value.revision !== ref.revision) throw new DisExecutionError('KNOWLEDGE_RESOURCE_IDENTITY_MISMATCH', ref.id);
      knowledge[ref.id] = value;
    }
  }
  validateLifecycleRecords(packageIdentity, unitsById, unitPaths, resources, manifestDigest);
  const selectedProviders = new Map();
  for (const unit of units) {
    if (unit.capabilities?.provides?.length) {
      const selected = resolveProviderSelection(unit, packageIdentity.selectionLock, packageIdentity.selectionLock.target, resources);
      selectedProviders.set(unit.id, selected.candidate);
    }
  }
  const catalogs = {
    signatures: knowledge['xdownload.player-signatures'],
    strategies: JSON.parse(resourceContents.get(strategiesPath)),
  };
  if (!catalogs.signatures) throw new DisExecutionError('MISSING_SELECTED_KNOWLEDGE', 'xdownload.player-signatures');
  validateGraph(graph, unitsById, schemas);
  validateDefinition(definition, unitsById, graph, manifest.graphRef.path);
  return { graph, definition, unitsById, schemas, resources, catalogs, knowledge, selectedProviders, closureManifest: manifest, packageIdentity: { ...packageIdentity, resourceClosureSha256: manifestDigest } };
}

export async function runPipeline(input, loaded) {
  const { graph, unitsById, schemas } = loaded;
  const outputs = new Map();
  let nodeId = graph.entryNode;
  const trace = [];
  for (let step = 0; step <= graph.nodes.length; step += 1) {
    const node = graph.nodes.find((item) => item.nodeId === nodeId);
    const unit = unitsById.get(node.unitRef.id);
    const handler = handlers[unit.implementation.ref];
    if (!handler) throw new DisExecutionError('NO_TRUSTED_IMPLEMENTATION_BINDING', unit.implementation.ref);

    let nodeInput = nodeId === graph.entryNode ? structuredClone(input) : {};
    const incomingData = graph.edges.filter((edge) => edge.kind === 'data' && edge.to.node === nodeId);
    const boundPointers = new Set();
    for (const edge of incomingData) {
      if (!outputs.has(edge.from.node)) continue;
      if (boundPointers.has(edge.to.pointer)) throw new DisExecutionError('DUPLICATE_RUNTIME_DATA_BINDING', nodeId + edge.to.pointer);
      boundPointers.add(edge.to.pointer);
      const value = pointerGet(outputs.get(edge.from.node), edge.from.pointer);
      if (value === undefined) throw new DisExecutionError('MISSING_RUNTIME_DATA_VALUE', edge.from.node + edge.from.pointer);
      nodeInput = pointerSet(nodeInput, edge.to.pointer, structuredClone(value));
    }
    if (nodeId !== graph.entryNode) {
      const inputSchema = schemas.get(unit.input.schemaRef);
      for (const property of requiredProperties(inputSchema)) {
        if (!Object.hasOwn(nodeInput, property)) throw new DisExecutionError('MISSING_RUNTIME_INPUT', nodeId + '/' + property);
      }
    }
    validatePreconditions(unit, nodeInput);
    const evidence = {};
    const incomingEvidence = graph.edges.filter((edge) => edge.kind === 'evidence' && edge.to.node === nodeId);
    for (const edge of incomingEvidence) {
      if (!outputs.has(edge.from.node)) continue;
      const value = pointerGet(outputs.get(edge.from.node), edge.from.pointer);
      if (value === undefined) throw new DisExecutionError('MISSING_RUNTIME_EVIDENCE_VALUE', edge.from.node + edge.from.pointer);
      evidence[edge.to.slot] = [...(evidence[edge.to.slot] || []), ...(Array.isArray(value) ? structuredClone(value) : [structuredClone(value)])];
    }
    const output = handler(nodeInput, { evidence, catalogs: loaded.catalogs, knowledge: loaded.knowledge });
    outputs.set(nodeId, output);
    trace.push({ nodeId, unitId: unit.id, unitRevision: unit.revision, implementationRef: unit.implementation.ref, implementationCandidateId: loaded.selectedProviders.get(unit.id)?.candidateId || null, input: structuredClone(nodeInput), evidence: structuredClone(evidence), output: structuredClone(output) });
    if (graph.terminalNodes.includes(nodeId)) return { outcome: output, trace, packageIdentity: loaded.packageIdentity };
    const candidates = graph.edges.filter((edge) => edge.kind === 'control' && edge.from === nodeId && conditionMatches(output, edge.when));
    if (candidates.length !== 1) throw new DisExecutionError('AMBIGUOUS_CONTROL_FLOW', nodeId + ' selected ' + candidates.length + ' control edges');
    nodeId = candidates[0].to;
  }
  throw new DisExecutionError('STEP_LIMIT_EXCEEDED', graph.id);
}
