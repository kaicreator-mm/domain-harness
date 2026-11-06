import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, '..');
const lockedProviders = new WeakMap();
const lockedExecutionResources = new WeakMap();

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
  if ('supported' in (unit.failure || {}) || !unit.failure?.handling || typeof unit.failure.handling !== 'object' || Array.isArray(unit.failure.handling) || Object.keys(unit.failure.handling).length === 0) throw new DisExecutionError('INVALID_FAILURE_PROFILE', unit.id);
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
    const knowledgeIds = new Set();
    for (const ref of unit.knowledgeRefs) {
      if (!ref.id || knowledgeIds.has(ref.id) || !ref.revision || !ref.kind || !isSafePackageRelativeRef(ref.path) || !/^[a-f0-9]{64}$/.test(ref.sha256 || '')) throw new DisExecutionError('INVALID_KNOWLEDGE_REF', unit.id);
      knowledgeIds.add(ref.id);
    }
  }
  if (unit.evidence.consumes !== undefined && (!Array.isArray(unit.evidence.consumes) || new Set(unit.evidence.consumes).size !== unit.evidence.consumes.length)) throw new DisExecutionError('INVALID_EVIDENCE_SLOTS', unit.id);
  return true;
}

export function validatePreconditions(unit, input) {
  for (const condition of unit.preconditions?.all || []) {
    const actual = pointerGet(input, condition.path);
    const matches = condition.operator === 'exists'
      ? actual !== undefined
      : condition.operator === 'equals'
        ? actual !== undefined && jsonValueEqual(actual, condition.value)
        : actual === undefined || !jsonValueEqual(actual, condition.value);
    if (!matches) throw new DisExecutionError('PRECONDITION_FAILED', unit.id + ':' + condition.path);
  }
  return true;
}

// The reference graph implements this limited, observable failure profile.
// Any other policy must be implemented explicitly rather than silently ignored.
export function referenceFailureAction(unit, status) {
  const action = unit.failure?.handling?.[status]?.action;
  if (!action) throw new DisExecutionError('UNDECLARED_FAILURE_STATUS', unit.id + ':' + status);
  if (action === 'REJECT' || action === 'FAIL') return action;
  if ((status === 'UNKNOWN' && action === 'PRESERVE_UNKNOWN') || (['AMBIGUOUS', 'CONFLICT'].includes(status) && action === 'CLARIFY')) return action;
  if ((status === 'UNKNOWN' && action === 'BOUNDED_FALLBACK') || (status === 'NEEDS_INPUT' && action === 'WAIT') || (status === 'NEEDS_REVIEW' && action === 'REVIEW')) return action;
  throw new DisExecutionError('UNSUPPORTED_FAILURE_POLICY', unit.id + ':' + status + ':' + action);
}

// Feedback is an immutable intake envelope, never a lifecycle transition.
export function validateReferenceFeedback(feedback, trustedOrigin) {
  const allowed = ['SYSTEM_OBSERVED', 'USER_CONFIRMED', 'MODEL_INFERRED'];
  const strings = ['sourceRuntime', 'executionId', 'journalId', 'traceId', 'redaction', 'retention', 'outcome', 'validationStatus', 'uncertainty', 'scope', 'finding'];
  const keys = [...strings, 'packageLockSha256', 'intelligencePins', 'evidenceProvenance', 'provenance', 'claimedProvenance', 'limitations', 'intake', 'disposition'];
  const trusted = keys.filter((key) => !['finding', 'disposition', 'claimedProvenance'].includes(key));
  const nonempty = (value) => typeof value === 'string' && value.length > 0;
  if (!exactKeys(feedback, keys) || !trustedOrigin || strings.some((key) => !nonempty(feedback[key])) || !/^[a-f0-9]{64}$/.test(feedback.packageLockSha256 || '') || trusted.some((key) => !jsonValueEqual(feedback[key], trustedOrigin[key])) ||
      !Array.isArray(feedback.intelligencePins) || !feedback.intelligencePins.length || feedback.intelligencePins.some((pin) => !exactKeys(pin, ['kind', 'id', 'revision', 'sha256']) || !nonempty(pin.kind) || !nonempty(pin.id) || !nonempty(pin.revision) || !/^[a-f0-9]{64}$/.test(pin.sha256 || '')) ||
      !Array.isArray(feedback.evidenceProvenance) || !feedback.evidenceProvenance.length || feedback.evidenceProvenance.some((item) => !nonempty(item)) || !Array.isArray(feedback.limitations) || !feedback.limitations.length || feedback.limitations.some((item) => !nonempty(item)) ||
      !exactKeys(feedback.intake, ['status', 'consent', 'policy']) || Object.values(feedback.intake).some((item) => !nonempty(item)) || !allowed.includes(feedback.provenance) || feedback.claimedProvenance !== feedback.provenance || feedback.disposition !== 'PROPOSAL_ONLY') throw new DisExecutionError('INVALID_RUNTIME_FEEDBACK', feedback?.traceId || 'missing');
  return structuredClone(feedback);
}

export function validateCapabilityContracts(unitsById, resources = null) {
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
      const contractPayload = {
        capabilityId: provider.capabilityId,
        owner: provider.owner,
        authorityRef: provider.authorityRef,
        version: provider.version,
        inputSchemaRef: provider.inputSchemaRef,
        inputSchemaDigest: provider.inputSchemaDigest,
        outputSchemaRef: provider.outputSchemaRef,
        outputSchemaDigest: provider.outputSchemaDigest,
      };
      const canonicalContract = JSON.stringify(Object.fromEntries(Object.entries(contractPayload).sort(([a], [b]) => a.localeCompare(b))));
      if (sha256(Buffer.from(canonicalContract, 'utf8')) !== provider.contractDigest) throw new DisExecutionError('CAPABILITY_CONTRACT_DIGEST_MISMATCH', requirement.capabilityId);
      if (resources && (resources.get(provider.inputSchemaRef) !== provider.inputSchemaDigest || resources.get(provider.outputSchemaRef) !== provider.outputSchemaDigest)) throw new DisExecutionError('CAPABILITY_SCHEMA_DIGEST_MISMATCH', requirement.capabilityId);
      const sameIdentity = provider.owner === requirement.owner && provider.authorityRef === requirement.authorityRef &&
        provider.inputSchemaRef === requirement.inputSchemaRef && provider.inputSchemaDigest === requirement.inputSchemaDigest &&
        provider.outputSchemaRef === requirement.outputSchemaRef && provider.outputSchemaDigest === requirement.outputSchemaDigest;
      const accepted = requirement.compatibility?.accepted || [];
      const exactAccepted = accepted.some((item) => item.version === provider.version && item.contractDigest === provider.contractDigest);
      const compatible = requirement.compatibility?.policy === 'EXACT'
        ? accepted.length === 1 && accepted[0].version === requirement.version && accepted[0].contractDigest === requirement.contractDigest && provider.version === requirement.version && provider.contractDigest === requirement.contractDigest && exactAccepted
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
  if (unit.implementation.strategy !== candidate.strategy || unit.implementation.exposure !== candidate.exposure) throw new DisExecutionError('UNIT_PROVIDER_BINDING_MISMATCH', provider.candidateId);
  if (resources.get(candidate.artifactRef) !== candidate.artifactDigest) throw new DisExecutionError('PROVIDER_ARTIFACT_DIGEST_MISMATCH', candidate.artifactRef);
  return { candidate, lock };
}

export function validateSelectedGraph(selectionLock, graphRef, graph, resources) {
  const matches = (selectionLock?.selectedAssets || []).filter((asset) => asset.kind === 'graph');
  if (matches.length !== 1) throw new DisExecutionError('SELECTED_GRAPH_IDENTITY_MISMATCH', 'expected exactly one selected graph');
  const selected = matches[0];
  if (!graphRef || !graph || selected.id !== graphRef.id || selected.revision !== graphRef.revision ||
      selected.path !== graphRef.path || selected.id !== graph.id || selected.revision !== graph.revision ||
      !resources.has(graphRef.path) || selected.sha256 !== resources.get(graphRef.path)) {
    throw new DisExecutionError('SELECTED_GRAPH_IDENTITY_MISMATCH', selected.id || 'missing');
  }
  return true;
}

function canonicalLifecycleValue(value) {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new DisExecutionError('UNSUPPORTED_CANONICAL_NUMBER', 'lifecycle and lock numbers must be safe integers');
  if (typeof value === 'string' && !value.isWellFormed()) throw new DisExecutionError('INVALID_CANONICAL_STRING', 'unpaired surrogate');
  if (Array.isArray(value)) return value.map(canonicalLifecycleValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [canonicalLifecycleValue(key), canonicalLifecycleValue(value[key])]));
  return value;
}

function lifecycleRecordDigest(record) {
  const payload = { ...record };
  delete payload.recordDigest;
  return sha256(Buffer.from(JSON.stringify(canonicalLifecycleValue(payload)), 'utf8'));
}

function exactKeys(value, required, optional = []) {
  return value && typeof value === 'object' && !Array.isArray(value) && required.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => required.includes(key) || optional.includes(key));
}

function validUtcTimestamp(value) {
  return typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().replace('.000Z', 'Z') === value;
}

function validReferenceReportShape(report) {
  const nonempty = (value) => typeof value === 'string' && value.length > 0;
  const semver = (value) => typeof value === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value);
  const digest = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
  return exactKeys(report, ['reportId', 'standard', 'demo', 'environment', 'command', 'result', 'tests', 'findings', 'validatedAt', 'subject', 'dependencyClosure', 'profile', 'validator', 'baseline', 'coverage', 'scenarios', 'counterexamples', 'limitations']) &&
    nonempty(report.reportId) && exactKeys(report.standard, ['version', 'revision']) && report.standard.version === '0.1.0' && nonempty(report.standard.revision) &&
    exactKeys(report.demo, ['id', 'revision'], ['commit']) && nonempty(report.demo.id) && nonempty(report.demo.revision) && (!Object.hasOwn(report.demo, 'commit') || typeof report.demo.commit === 'string') &&
    exactKeys(report.environment, ['runtime', 'platform']) && nonempty(report.environment.runtime) && nonempty(report.environment.platform) && nonempty(report.command) && report.result === 'PASS' && validUtcTimestamp(report.validatedAt) &&
    Array.isArray(report.tests) && report.tests.length > 0 && report.tests.every((item) => exactKeys(item, ['id', 'result'], ['detail']) && nonempty(item.id) && ['PASS', 'FAIL', 'EXPECTED_GAP', 'NOT_RUN'].includes(item.result) && (!Object.hasOwn(item, 'detail') || typeof item.detail === 'string')) &&
    Array.isArray(report.findings) && report.findings.every((item) => exactKeys(item, ['id', 'severity', 'description', 'resolution']) && typeof item.id === 'string' && ['P0', 'P1', 'P2', 'P3'].includes(item.severity) && typeof item.description === 'string' && typeof item.resolution === 'string') &&
    Array.isArray(report.scenarios) && report.scenarios.length > 0 && report.scenarios.every((item) => exactKeys(item, ['id', 'category', 'dataset', 'result']) && nonempty(item.id) && ['positive', 'negative', 'boundary', 'ambiguous', 'out_of_scope'].includes(item.category) && ['AUTHORING', 'HELD_OUT'].includes(item.dataset) && ['PASS', 'FAIL', 'NOT_RUN'].includes(item.result)) &&
    Array.isArray(report.counterexamples) && report.counterexamples.every((item) => typeof item === 'string') && Array.isArray(report.limitations) && report.limitations.length > 0 && report.limitations.every(nonempty) &&
    exactKeys(report.subject, ['kind', 'id', 'revision', 'sha256']) && ['unit', 'knowledge', 'rule', 'graph', 'package'].includes(report.subject.kind) && nonempty(report.subject.id) && semver(report.subject.revision) && digest(report.subject.sha256) &&
    exactKeys(report.dependencyClosure, ['sha256', 'resources']) && digest(report.dependencyClosure.sha256) && Array.isArray(report.dependencyClosure.resources) && report.dependencyClosure.resources.every((item) => exactKeys(item, ['path', 'sha256']) && nonempty(item.path) && digest(item.sha256)) &&
    exactKeys(report.profile, ['id', 'revision']) && nonempty(report.profile.id) && semver(report.profile.revision) && exactKeys(report.validator, ['id', 'version']) && nonempty(report.validator.id) && semver(report.validator.version) && exactKeys(report.baseline, ['id', 'path', 'sha256']) && nonempty(report.baseline.id) && nonempty(report.baseline.path) && digest(report.baseline.sha256) && exactKeys(report.coverage, ['positive', 'negative', 'boundary', 'heldOut']) && Object.values(report.coverage).every((item) => Number.isInteger(item) && item >= 0);
}

function reportCoverageConsistent(report) {
  const ids = new Set(report.scenarios.map((scenario) => scenario.id));
  const tests = new Map(report.tests.map((test) => [test.id, test.result]));
  const count = (category) => report.scenarios.filter((item) => category.includes(item.category)).length;
  return ids.size === report.scenarios.length && tests.size === report.tests.length && tests.size === ids.size &&
    report.scenarios.every((item) => item.result === 'PASS' && tests.get(item.id) === item.result) &&
    report.coverage.positive === count(['positive']) && report.coverage.negative === count(['negative', 'ambiguous', 'out_of_scope']) &&
    report.coverage.boundary === count(['boundary']) && report.coverage.heldOut === report.scenarios.filter((item) => item.dataset === 'HELD_OUT').length;
}

// Histories are keyed by the complete immutable subject. A terminal disposition
// cannot be undone by appending a name-only record; rollback selects another
// still-promoted exact subject through a new Package lock.
export function replayLifecycle(records, resources, closureDigest, historicalClosures = new Map(), binaryBindings = new Set()) {
  const histories = new Map(), ids = new Set(), revisions = new Map(), latestPromoted = new Map();
  for (const record of records) {
    const subject = record?.subject;
    const key = JSON.stringify([subject?.kind, subject?.id, subject?.revision, subject?.sha256]);
    const state = histories.get(key) || { state: null, previous: null, candidate: null, validated: null, promoted: null, lastPromoted: null };
    const logicalKey = JSON.stringify([subject?.kind, subject?.id]);
    const revisionKey = JSON.stringify([subject?.kind, subject?.id, subject?.revision]);
    const recordClosure = record.dependencyClosureDigest;
    const evidenceResources = recordClosure === closureDigest ? resources : historicalClosures.get(recordClosure);
    const actor = record.actor || {}, policy = record.policy || record.promotion?.policy;
    if (!record.recordId || ids.has(record.recordId) || !['unit', 'knowledge', 'rule', 'graph', 'package'].includes(subject?.kind) || !subject.id || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(subject.revision || '') || !/^[a-f0-9]{64}$/.test(subject.sha256 || '') || !evidenceResources || !isSafePackageRelativeRef(record.subjectPath) || evidenceResources.get(record.subjectPath) !== subject.sha256) throw new DisExecutionError('LIFECYCLE_SUBJECT_OR_CLOSURE_MISMATCH', record.recordId || 'missing');
    const hasJson = Object.hasOwn(record, 'subjectJson'), hasBytes = Object.hasOwn(record, 'subjectBase64');
    if (hasJson === hasBytes || (hasJson && typeof record.subjectJson !== 'string') || (hasBytes && typeof record.subjectBase64 !== 'string')) throw new DisExecutionError('LIFECYCLE_SUBJECT_OR_CLOSURE_MISMATCH', record.recordId);
    let subjectDocument = null;
    if (hasJson) {
      if (sha256(Buffer.from(record.subjectJson, 'utf8')) !== subject.sha256) throw new DisExecutionError('LIFECYCLE_SUBJECT_OR_CLOSURE_MISMATCH', record.recordId);
      try { subjectDocument = JSON.parse(record.subjectJson); } catch { throw new DisExecutionError('LIFECYCLE_SUBJECT_OR_CLOSURE_MISMATCH', record.recordId); }
      if (!subjectDocument || typeof subjectDocument !== 'object' || Array.isArray(subjectDocument)) throw new DisExecutionError('LIFECYCLE_SUBJECT_OR_CLOSURE_MISMATCH', record.recordId);
      const packageDescriptor = subject.kind === 'package' && subjectDocument.dis && typeof subjectDocument.dis === 'object' && !Array.isArray(subjectDocument.dis);
      const contentId = subject.kind === 'rule' ? subjectDocument.catalogId : packageDescriptor ? subjectDocument.dis.packageId : subjectDocument.id;
      const contentRevision = packageDescriptor ? subjectDocument.dis.revision : subjectDocument.revision;
      if (contentId !== subject.id || contentRevision !== subject.revision) throw new DisExecutionError('LIFECYCLE_SUBJECT_OR_CLOSURE_MISMATCH', record.recordId);
    } else {
      const bytes = Buffer.from(record.subjectBase64, 'base64');
      const binaryKey = JSON.stringify([subject.kind, subject.id, subject.revision, subject.sha256, record.subjectPath, recordClosure]);
      if (subject.kind === 'unit' || !binaryBindings.has(binaryKey) || bytes.toString('base64') !== record.subjectBase64 || sha256(bytes) !== subject.sha256) throw new DisExecutionError('LIFECYCLE_SUBJECT_OR_CLOSURE_MISMATCH', record.recordId);
    }
    if (revisions.has(revisionKey) && revisions.get(revisionKey) !== subject.sha256) throw new DisExecutionError('LIFECYCLE_SUBJECT_OR_CLOSURE_MISMATCH', record.recordId);
    revisions.set(revisionKey, subject.sha256);
    if (lifecycleRecordDigest(record) !== record.recordDigest) throw new DisExecutionError('LIFECYCLE_RECORD_DIGEST_MISMATCH', record.recordId);
    if (!actor.id || !actor.role || !exactKeys(policy, ['id', 'revision']) || !policy.id || !policy.revision || !validUtcTimestamp(record.recordedAt) || (state.previous && Date.parse(record.recordedAt) < Date.parse(state.previous.recordedAt))) throw new DisExecutionError('INVALID_LIFECYCLE_ACTOR_OR_POLICY', record.recordId);
    if ((record.previousRecordId ?? null) !== (state.previous?.recordId ?? null) || (record.previousRecordDigest ?? null) !== (state.previous?.recordDigest ?? null)) throw new DisExecutionError('INCOMPLETE_LIFECYCLE_CHAIN', record.recordId);
    const transition = record.transition;
    const allowed = !state.state ? ['OBSERVED', 'CANDIDATE'] : state.state === 'OBSERVED' ? ['OBSERVED', 'CANDIDATE'] : state.state === 'CANDIDATE' ? ['VALIDATED', 'REJECTED', 'WITHDRAWN', 'EXPIRED', 'SUPERSEDED'] : state.state === 'VALIDATED' ? ['VALIDATED', 'PROMOTED', 'REJECTED', 'WITHDRAWN', 'EXPIRED', 'SUPERSEDED'] : state.state === 'PROMOTED' ? ['VALIDATED', 'REJECTED', 'WITHDRAWN', 'EXPIRED', 'SUPERSEDED'] : [];
    if (!allowed.includes(transition)) throw new DisExecutionError('INCOMPLETE_LIFECYCLE_CHAIN', record.recordId);
    const checkEvidence = (refs) => Array.isArray(refs) && refs.length > 0 && refs.every((item) => item && evidenceResources.has(item.path) && evidenceResources.get(item.path) === item.sha256);
    if (transition === 'OBSERVED') {
      if (actor.id !== 'xdownload-demo-observer' || actor.role !== 'observation-source' || actor.authorityRef !== 'xdownload-demo/domain-authority@1.0.0' || policy.id !== 'xdownload-demo/observation-policy' || policy.revision !== '1.0.0' || !checkEvidence(record.evidenceRefs) || !['SYSTEM_OBSERVED', 'USER_CONFIRMED', 'MODEL_INFERRED'].includes(record.provenance)) throw new DisExecutionError('INVALID_LIFECYCLE_ACTOR_OR_POLICY', record.recordId);
    } else if (transition === 'CANDIDATE') {
      if (actor.id !== 'xdownload-domain-forge-reference' || actor.role !== 'candidate-producer' || actor.authorityRef !== 'xdownload-demo/domain-authority@1.0.0' || policy.id !== 'xdownload-demo/candidate-policy' || policy.revision !== '1.0.0' || !checkEvidence(record.evidenceRefs)) throw new DisExecutionError('INVALID_LIFECYCLE_ACTOR_OR_POLICY', record.recordId);
      const production = record.candidateProvenance;
      const nonempty = (value) => typeof value === 'string' && value.length > 0;
      if (!exactKeys(production, ['sourceClosureSha256', 'sourceRefs', 'schemaRevision', 'method', 'target', 'profile', 'parent', 'changeRef']) || production.sourceClosureSha256 !== recordClosure || !checkEvidence(production.sourceRefs) || production.sourceRefs.some((source) => !exactKeys(source, ['path', 'sha256']) || !record.evidenceRefs.some((ref) => ref.path === source.path && ref.sha256 === source.sha256)) || production.schemaRevision !== '0.1.0' || !exactKeys(production.method, ['id', 'toolchain']) || !nonempty(production.method.id) || !nonempty(production.method.toolchain) || !nonempty(production.target) || !exactKeys(production.profile, ['id', 'revision']) || !nonempty(production.profile.id) || !nonempty(production.profile.revision) || !nonempty(production.changeRef) || (production.parent?.kind === 'GENESIS' ? !exactKeys(production.parent, ['kind', 'reason']) || !nonempty(production.parent.reason) : !exactKeys(production.parent, ['kind', 'subject']) || production.parent.kind !== 'SUBJECT' || !exactKeys(production.parent.subject, ['kind', 'id', 'revision', 'sha256']) || !nonempty(production.parent.subject.kind) || !nonempty(production.parent.subject.id) || !nonempty(production.parent.subject.revision) || !/^[a-f0-9]{64}$/.test(production.parent.subject.sha256 || ''))) throw new DisExecutionError('INVALID_CANDIDATE_PROVENANCE', record.recordId);
      if (production.parent.kind === 'SUBJECT') {
        const parent = production.parent.subject;
        const parentState = histories.get(JSON.stringify([parent.kind, parent.id, parent.revision, parent.sha256]));
        if (!parentState?.candidate || Date.parse(record.recordedAt) < Date.parse(parentState.candidate.recordedAt)) throw new DisExecutionError('INVALID_CANDIDATE_PROVENANCE', record.recordId);
      }
      state.candidate = record;
    } else if (transition === 'VALIDATED') {
      const validation = record.validation;
      if (actor.id !== 'xdownload-dis-independent-conformance' || actor.role !== 'validator' || actor.authorityRef !== 'xdownload-demo/domain-authority@1.0.0' || actor.id !== validation?.validator?.id || policy.id !== 'xdownload-demo/validation-profile' || policy.revision !== '0.1.0' || validation.result !== 'PASS' || validation.subjectDigest !== subject.sha256 || validation.dependencyClosureDigest !== recordClosure || !validation.profile?.id || !validation.profile.revision || !validation.validator?.version || !checkEvidence(validation.evidenceRefs)) throw new DisExecutionError('INVALID_LIFECYCLE_VALIDATION', record.recordId);
      if (!validation.baseline?.id || !checkEvidence([validation.baseline]) || !validation.evidenceRefs.some((ref) => ref.path === validation.baseline.path && ref.sha256 === validation.baseline.sha256)) throw new DisExecutionError('INVALID_LIFECYCLE_VALIDATION', record.recordId);
      if (subject.kind === 'unit' && (validation.profile.id !== subjectDocument.validation?.profile || validation.profile.revision !== subjectDocument.validation?.profileRevision || !jsonValueEqual(validation.validator, subjectDocument.validation?.validator))) throw new DisExecutionError('VALIDATION_PROFILE_MISMATCH', record.recordId);
      const report = validation.report;
      if (validation.reportSchema !== 'https://kaicreator-mm.github.io/domain-harness/dis/0.1.0/validation-report.schema.json' || !validReferenceReportShape(report) || !reportCoverageConsistent(report) || Date.parse(report.validatedAt) > Date.parse(record.recordedAt) || Date.parse(report.validatedAt) < Date.parse(state.candidate.recordedAt) || sha256(Buffer.from(JSON.stringify(canonicalLifecycleValue(report)), 'utf8')) !== validation.reportSha256 ||
          !jsonValueEqual(report.subject, subject) || report.dependencyClosure?.sha256 !== recordClosure || !jsonValueEqual(report.dependencyClosure.resources, validation.evidenceRefs) || !jsonValueEqual(report.profile, validation.profile) || !jsonValueEqual(report.validator, validation.validator) || !jsonValueEqual(report.baseline, validation.baseline) || !jsonValueEqual(report.coverage, validation.coverage) ||
          report.result !== 'PASS' || report.standard?.version !== '0.1.0' || !report.standard?.revision || !report.demo?.id || !report.demo?.revision || !report.environment?.runtime || !report.environment?.platform || !report.command || !report.validatedAt || !Array.isArray(report.tests) || !report.tests.length || report.tests.some((test) => !test.id || !['PASS', 'FAIL', 'EXPECTED_GAP', 'NOT_RUN'].includes(test.result)) ||
          !Array.isArray(report.scenarios) || !report.scenarios.length || report.scenarios.some((scenario) => !scenario.id || !['positive', 'negative', 'boundary', 'ambiguous', 'out_of_scope'].includes(scenario.category) || !['AUTHORING', 'HELD_OUT'].includes(scenario.dataset) || !['PASS', 'FAIL', 'NOT_RUN'].includes(scenario.result)) || !Array.isArray(report.findings) || !Array.isArray(report.counterexamples) || report.counterexamples.some((item) => typeof item !== 'string') || !Array.isArray(report.limitations) || !report.limitations.length) throw new DisExecutionError('INVALID_VALIDATION_REPORT', record.recordId);
      state.validated = record;
      state.promoted = null;
    } else if (transition === 'PROMOTED') {
      if (actor.id !== 'xdownload-demo-governance' || actor.role !== 'promotion-authority' || actor.authorityRef !== 'xdownload-demo/domain-authority@1.0.0' || actor.id === state.candidate.actor.id || actor.id === state.validated.actor.id || record.promotion?.decision !== 'PROMOTE' || record.promotion.validationRecordId !== state.validated.recordId || record.promotion.validationRecordDigest !== state.validated.recordDigest) throw new DisExecutionError('UNAUTHORIZED_PROMOTION_RECORD', record.recordId);
      const promotion = record.promotion, grant = promotion.authorizationEvidence, baseline = promotion.priorPromotedBaseline, prior = latestPromoted.get(logicalKey);
      if (!exactKeys(grant, ['id', 'issuer', 'subject', 'authorityRef', 'scope', 'outcome']) || grant.id !== 'synthetic-reference-governance-grant' || grant.issuer !== 'xdownload-demo' || grant.subject !== actor.id || grant.authorityRef !== actor.authorityRef || grant.scope !== 'REFERENCE_DEMO_ONLY' || grant.outcome !== 'AUTHORIZED' || sha256(Buffer.from(JSON.stringify(canonicalLifecycleValue(grant)), 'utf8')) !== promotion.authorizationEvidenceSha256 ||
          policy.id !== 'xdownload-demo/promotion-policy' || policy.revision !== '1.0.0' || !jsonValueEqual(policy, promotion.policy) || promotion.scope !== grant.scope || typeof promotion.rationale !== 'string' || !promotion.rationale || !Array.isArray(promotion.limitations) || !promotion.limitations.length || promotion.limitations.some((item) => typeof item !== 'string' || !item) || recordClosure !== state.validated.dependencyClosureDigest || (prior ? baseline?.kind !== 'PROMOTED' || baseline.recordId !== prior.recordId || baseline.recordDigest !== prior.recordDigest || Date.parse(record.recordedAt) < Date.parse(prior.recordedAt) : baseline?.kind !== 'GENESIS' || !baseline.reason)) throw new DisExecutionError('UNAUTHORIZED_PROMOTION_RECORD', record.recordId);
      state.promoted = record;
      state.lastPromoted = record;
      latestPromoted.set(logicalKey, record);
    } else {
      if (actor.id !== 'xdownload-demo-governance' || actor.role !== 'promotion-authority' || actor.authorityRef !== 'xdownload-demo/domain-authority@1.0.0' || policy.id !== 'xdownload-demo/promotion-policy' || policy.revision !== '1.0.0' || !checkEvidence(record.evidenceRefs) || record.decision !== transition) throw new DisExecutionError('INVALID_LIFECYCLE_DISPOSITION', record.recordId);
      if (transition === 'SUPERSEDED') {
        const successor = record.successor, nextSubject = successor?.subject;
        const nextKey = JSON.stringify([nextSubject?.kind, nextSubject?.id, nextSubject?.revision, nextSubject?.sha256]);
        const next = histories.get(nextKey);
        if (!nextSubject || nextSubject.kind !== subject.kind || nextSubject.id !== subject.id || nextSubject.revision === subject.revision || next?.state !== 'PROMOTED' || successor.promotionRecordId !== next.promoted?.recordId || successor.promotionRecordDigest !== next.promoted?.recordDigest || Date.parse(record.recordedAt) < Date.parse(next.promoted.recordedAt)) throw new DisExecutionError('INVALID_LIFECYCLE_DISPOSITION', record.recordId);
      }
      state.promoted = null;
    }
    state.state = transition;
    state.previous = record;
    histories.set(key, state);
    ids.add(record.recordId);
  }
  return histories;
}

export function validateLifecycleRecords(packageIdentity, unitsById, unitPaths, resources, closureDigest, expectedSelectionLockSha256) {
  const records = packageIdentity.lifecycleRecords;
  const selection = packageIdentity.selectionLock;
  if (!Array.isArray(records) || !selection) throw new DisExecutionError('MISSING_LIFECYCLE_OR_SELECTION_LOCK', packageIdentity.packageId);
  if (selection.packageId !== packageIdentity.packageId || selection.packageRevision !== packageIdentity.revision || selection.standardVersion !== packageIdentity.standardVersion) throw new DisExecutionError('SELECTION_PACKAGE_IDENTITY_MISMATCH', packageIdentity.packageId);
  if (!selection.consumerProfile?.id || !selection.consumerProfile?.revision || !selection.target || !Array.isArray(selection.selectedAssets) || !Array.isArray(selection.selectedCapabilities)) throw new DisExecutionError('INVALID_PACKAGE_SELECTION_LOCK', packageIdentity.packageId);
  if (selection.selectedCapabilities.length !== 1 || selection.selectedAssets.length !== unitsById.size + 2) throw new DisExecutionError('PACKAGE_SELECTION_CARDINALITY_INVALID', packageIdentity.packageId);
  const selectionDigest = sha256(Buffer.from(JSON.stringify(canonicalLifecycleValue(selection)), 'utf8'));
  if (!/^[a-f0-9]{64}$/.test(expectedSelectionLockSha256 || '') || selectionDigest !== expectedSelectionLockSha256 || selectionDigest !== packageIdentity.selectionLockSha256) throw new DisExecutionError('PACKAGE_SELECTION_DIGEST_MISMATCH', packageIdentity.packageId);
  const historicalClosures = new Map();
  const historyList = selection.historicalClosures === undefined ? [] : selection.historicalClosures;
  if (!Array.isArray(historyList)) throw new DisExecutionError('INVALID_HISTORICAL_CLOSURE', packageIdentity.packageId);
  for (const history of historyList) {
    if (typeof history?.manifestJson !== 'string' || !/^[a-f0-9]{64}$/.test(history.sha256 || '') || sha256(Buffer.from(history.manifestJson, 'utf8')) !== history.sha256 || history.sha256 === closureDigest || historicalClosures.has(history.sha256)) throw new DisExecutionError('INVALID_HISTORICAL_CLOSURE', packageIdentity.packageId);
    let manifest;
    try { manifest = JSON.parse(history.manifestJson); } catch { throw new DisExecutionError('INVALID_HISTORICAL_CLOSURE', history.sha256); }
    if (manifest.schemaVersion !== 'dis.resource-closure/0.1.0' || manifest.standardVersion !== '0.1.0' || !Array.isArray(manifest.resources)) throw new DisExecutionError('INVALID_HISTORICAL_CLOSURE', history.sha256);
    const entries = new Map(), declared = new Set();
    const supplied = history.resourceBase64 === undefined ? {} : history.resourceBase64;
    if (!supplied || typeof supplied !== 'object' || Array.isArray(supplied)) throw new DisExecutionError('INVALID_HISTORICAL_CLOSURE', history.sha256);
    for (const item of manifest.resources) {
      if (!isSafePackageRelativeRef(item.path) || declared.has(item.path) || !/^[a-f0-9]{64}$/.test(item.sha256 || '')) throw new DisExecutionError('INVALID_HISTORICAL_CLOSURE', history.sha256);
      declared.add(item.path);
      if (Object.hasOwn(supplied, item.path)) {
        const encoded = supplied[item.path];
        if (typeof encoded !== 'string') throw new DisExecutionError('INVALID_HISTORICAL_CLOSURE', history.sha256);
        const bytes = Buffer.from(encoded, 'base64');
        if (bytes.toString('base64') !== encoded || sha256(bytes) !== item.sha256) throw new DisExecutionError('INVALID_HISTORICAL_CLOSURE', history.sha256);
      }
      if (resources.get(item.path) === item.sha256 || Object.hasOwn(supplied, item.path)) entries.set(item.path, item.sha256);
    }
    if (Object.keys(supplied).some((item) => !declared.has(item)) || entries.size !== declared.size) throw new DisExecutionError('INVALID_HISTORICAL_CLOSURE', history.sha256);
    historicalClosures.set(history.sha256, entries);
  }
  const binaryBindings = new Set();
  const bindings = selection.subjectBindings === undefined ? [] : selection.subjectBindings;
  if (!Array.isArray(bindings)) throw new DisExecutionError('INVALID_SUBJECT_BINDING', packageIdentity.packageId);
  for (const binding of bindings) {
    const { kind, id, revision, sha256: digest, path: subjectPath, closureDigest: digestOfClosure } = binding || {};
    const source = digestOfClosure === closureDigest ? resources : historicalClosures.get(digestOfClosure);
    const key = JSON.stringify([kind, id, revision, digest, subjectPath, digestOfClosure]);
    if (!exactKeys(binding, ['kind', 'id', 'revision', 'sha256', 'path', 'closureDigest']) || !['knowledge', 'rule', 'graph', 'package'].includes(kind) || !id || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(revision || '') || !/^[a-f0-9]{64}$/.test(digest || '') || !isSafePackageRelativeRef(subjectPath) || source?.get(subjectPath) !== digest || binaryBindings.has(key)) throw new DisExecutionError('INVALID_SUBJECT_BINDING', id || 'missing');
    binaryBindings.add(key);
  }
  const byId = new Map();
  for (const record of records) {
    if (!record.recordId || byId.has(record.recordId) || !['OBSERVED', 'CANDIDATE', 'VALIDATED', 'PROMOTED', 'REJECTED', 'WITHDRAWN', 'EXPIRED', 'SUPERSEDED'].includes(record.transition)) throw new DisExecutionError('INVALID_LIFECYCLE_RECORD', record.recordId || 'missing');
    if (!/^[a-f0-9]{64}$/.test(record.recordDigest || '') || lifecycleRecordDigest(record) !== record.recordDigest) throw new DisExecutionError('LIFECYCLE_RECORD_DIGEST_MISMATCH', record.recordId);
    if ((record.dependencyClosureDigest !== closureDigest && !historicalClosures.has(record.dependencyClosureDigest)) || !['unit', 'knowledge', 'rule', 'graph', 'package'].includes(record.subject?.kind) || !record.subject?.id || !record.subject?.revision || !/^[a-f0-9]{64}$/.test(record.subject.sha256 || '')) throw new DisExecutionError('LIFECYCLE_SUBJECT_OR_CLOSURE_MISMATCH', record.recordId);
    byId.set(record.recordId, record);
  }
  const histories = replayLifecycle(records, resources, closureDigest, historicalClosures, binaryBindings);
  const unitAsset = selection.selectedAssets.find((asset) => asset.kind === 'unit' && asset.id === 'xdownload.player.recognizer');
  if (!unitAsset) throw new DisExecutionError('SELECTED_RECOGNIZER_ASSET_MISSING', packageIdentity.packageId);
  const unit = unitsById.get(unitAsset.id), unitPath = unitPaths.get(unitAsset.id);
  if (!unit || unit.revision !== unitAsset.revision || resources.get(unitPath) !== unitAsset.sha256) throw new DisExecutionError('SELECTED_ASSET_DIGEST_MISMATCH', unitAsset.id);
  if (selection.consumerProfile.id !== unit.implementation?.selectionPolicy?.consumerProfileId || selection.consumerProfile.revision !== unit.implementation?.selectionPolicy?.consumerProfileRevision || selection.target !== unit.implementation?.selectionPolicy?.target) throw new DisExecutionError('PACKAGE_CONSUMER_PROFILE_OR_TARGET_MISMATCH', unit.id);
  const subjectKey = (subject) => JSON.stringify([subject.kind, subject.id, subject.revision, subject.sha256]);
  const unitHistory = histories.get(subjectKey(unitAsset));
  const candidate = unitHistory?.candidate, validated = unitHistory?.validated, promoted = unitHistory?.promoted;
  if (!candidate || !validated || !promoted || unitHistory.state !== 'PROMOTED') {
    throw new DisExecutionError('INCOMPLETE_LIFECYCLE_CHAIN', unit.id);
  }
  if (!candidate.actor?.id || !candidate.actor?.role || !candidate.policy?.id || !candidate.policy?.revision ||
      !validated.actor?.id || !validated.actor?.role) throw new DisExecutionError('INVALID_LIFECYCLE_ACTOR_OR_POLICY', unit.id);
  if (!Array.isArray(candidate.evidenceRefs) || candidate.evidenceRefs.length === 0) throw new DisExecutionError('CANDIDATE_EVIDENCE_MISSING', candidate.recordId);
  const candidateResources = candidate.dependencyClosureDigest === closureDigest ? resources : historicalClosures.get(candidate.dependencyClosureDigest);
  for (const evidence of candidate.evidenceRefs) if (candidateResources?.get(evidence.path) !== evidence.sha256) throw new DisExecutionError('CANDIDATE_EVIDENCE_DIGEST_MISMATCH', evidence.path);
  const validation = validated.validation;
  if (!validation || validation.result !== 'PASS' || validation.subjectDigest !== unitAsset.sha256 || validation.dependencyClosureDigest !== closureDigest ||
      !validation.profile?.id || !validation.profile?.revision || !validation.validator?.id || !validation.validator?.version ||
      !validation.baseline?.id || !validation.baseline?.path || !validation.baseline?.sha256 ||
      !Array.isArray(validation.evidenceRefs) || validation.evidenceRefs.length === 0 || !validation.coverage) {
    throw new DisExecutionError('INVALID_LIFECYCLE_VALIDATION', validated.recordId);
  }
  if (resources.get(validation.baseline.path) !== validation.baseline.sha256 ||
      !validation.evidenceRefs.some((evidence) => evidence.path === validation.baseline.path && evidence.sha256 === validation.baseline.sha256)) {
    throw new DisExecutionError('VALIDATION_BASELINE_PIN_MISMATCH', validated.recordId);
  }
  for (const key of ['positive', 'negative', 'boundary', 'heldOut']) if (!Number.isInteger(validation.coverage[key]) || validation.coverage[key] < (key === 'heldOut' ? 0 : 1)) throw new DisExecutionError('INVALID_LIFECYCLE_COVERAGE', validated.recordId);
  for (const evidence of validation.evidenceRefs) if (resources.get(evidence.path) !== evidence.sha256) throw new DisExecutionError('LIFECYCLE_EVIDENCE_DIGEST_MISMATCH', evidence.path);
  const promotion = promoted.promotion;
  if (!promotion || promotion.decision !== 'PROMOTE' || promotion.validationRecordId !== validated.recordId ||
      promotion.validationRecordDigest !== validated.recordDigest || !promoted.actor?.id || !promoted.actor?.authorityRef ||
      !promotion.policy?.id || !promotion.policy?.revision) throw new DisExecutionError('UNAUTHORIZED_PROMOTION_RECORD', promoted.recordId);
  if (promoted.actor.id !== 'xdownload-demo-governance' || promoted.actor.role !== 'promotion-authority' || promoted.actor.authorityRef !== 'xdownload-demo/domain-authority@1.0.0' || promoted.actor.id === candidate.actor.id || promoted.actor.id === validated.actor.id) throw new DisExecutionError('UNAUTHORIZED_PROMOTION_RECORD', promoted.recordId);
  for (const requiredPath of ['test/runner.test.mjs', 'scripts/validate.py', 'src/runner.mjs']) if (!validation.evidenceRefs.some((item) => item.path === requiredPath && item.sha256 === resources.get(requiredPath))) throw new DisExecutionError('VALIDATION_EVIDENCE_INCOMPLETE', validated.recordId);
  if (validation.profile.id !== unit.validation.profile || validation.profile.revision !== unit.validation.profileRevision || validation.validator.id !== unit.validation.validator.id || validation.validator.version !== unit.validation.validator.version) throw new DisExecutionError('VALIDATION_PROFILE_MISMATCH', validated.recordId);
  if (unitAsset.promotionRecordId !== promoted.recordId || unitAsset.promotionRecordDigest !== promoted.recordDigest ||
      unitAsset.validationRecordId !== validated.recordId || unitAsset.validationRecordDigest !== validated.recordDigest) {
    throw new DisExecutionError('PACKAGE_PROMOTION_PIN_MISMATCH', unit.id);
  }
  const selectedCapabilities = selection.selectedCapabilities.filter((item) => item.capabilityId === unit.capabilities?.provides?.[0]?.capabilityId && item.provider?.unitId === unit.id);
  if (selectedCapabilities.length !== 1) throw new DisExecutionError('SELECTED_CAPABILITY_PROVIDER_MISSING_OR_AMBIGUOUS', unit.id);
  const selectedCapability = selectedCapabilities[0];
  if (selectedCapability.promotionRecordId !== promoted.recordId || selectedCapability.promotionRecordDigest !== promoted.recordDigest ||
      selectedCapability.validationRecordId !== validated.recordId || selectedCapability.validationRecordDigest !== validated.recordDigest) {
    throw new DisExecutionError('SELECTED_CAPABILITY_LIFECYCLE_PIN_MISMATCH', unit.id);
  }
  const providedContract = unit.capabilities?.provides?.[0];
  if (!providedContract || ['owner', 'authorityRef', 'version', 'contractDigest'].some((key) => selectedCapability[key] !== providedContract[key])) throw new DisExecutionError('SELECTED_CAPABILITY_CONTRACT_PIN_MISMATCH', unit.id);
  resolveProviderSelection(unit, selection, selection.target, resources);
  const selectedRuleAssets = selection.selectedAssets.filter((asset) => asset.kind === 'rule');
  if (selectedRuleAssets.length !== 1) throw new DisExecutionError('SELECTED_KNOWLEDGE_ASSET_MISSING_OR_AMBIGUOUS', unit.id);
  for (const asset of selection.selectedAssets) {
    if (asset.kind === 'rule') {
      if (!unit.knowledgeRefs?.some((ref) => ref.id === asset.id && ref.revision === asset.revision && ref.path === asset.path && ref.sha256 === asset.sha256)) throw new DisExecutionError('SELECTED_KNOWLEDGE_PIN_MISMATCH', asset.id);
      if (resources.get(asset.path) !== asset.sha256) throw new DisExecutionError('SELECTED_KNOWLEDGE_NOT_PROMOTED', asset.id);
    }
  }
  const assetKeys = new Set();
  for (const asset of selection.selectedAssets) {
    const key = asset.kind + ':' + asset.id;
    if (assetKeys.has(key)) throw new DisExecutionError('DUPLICATE_SELECTED_ASSET', key);
    assetKeys.add(key);
    const selectedUnit = asset.kind === 'unit' ? unitsById.get(asset.id) : null;
    const assetPath = selectedUnit ? unitPaths.get(asset.id) : asset.path;
    if (!assetPath || resources.get(assetPath) !== asset.sha256 || (asset.kind === 'unit' && (!selectedUnit || selectedUnit.revision !== asset.revision))) throw new DisExecutionError('SELECTED_ASSET_DIGEST_MISMATCH', key);
    const history = histories.get(subjectKey(asset));
    const c = history?.candidate, v = history?.validated, p = history?.promoted;
    if (history?.state !== 'PROMOTED' || !c || !v || !p) throw new DisExecutionError('INCOMPLETE_LIFECYCLE_CHAIN', key);
    const candidateResources = c.dependencyClosureDigest === closureDigest ? resources : historicalClosures.get(c.dependencyClosureDigest);
    if (!c.actor?.id || c.actor.role !== 'candidate-producer' || !c.actor.authorityRef || !c.policy?.id || !c.policy?.revision || !Array.isArray(c.evidenceRefs) || !c.evidenceRefs.length || c.evidenceRefs.some((item) => candidateResources?.get(item.path) !== item.sha256) || !v.actor?.id || v.actor.role !== 'validator') throw new DisExecutionError('INVALID_LIFECYCLE_ACTOR_OR_POLICY', key);
    if (p.actor?.id !== 'xdownload-demo-governance' || p.actor?.role !== 'promotion-authority' || p.actor?.authorityRef !== 'xdownload-demo/domain-authority@1.0.0' || p.actor.id === c.actor?.id || p.actor.id === v.actor?.id || p.promotion?.decision !== 'PROMOTE' || p.promotion.validationRecordId !== v.recordId || p.promotion.validationRecordDigest !== v.recordDigest) throw new DisExecutionError('UNAUTHORIZED_PROMOTION_RECORD', key);
    if (v.validation?.result !== 'PASS' || v.validation.subjectDigest !== asset.sha256 || v.validation.dependencyClosureDigest !== closureDigest || !v.validation.profile?.id || !v.validation.profile?.revision || !v.validation.validator?.id || !v.validation.validator?.version || !Array.isArray(v.validation.evidenceRefs)) throw new DisExecutionError('INVALID_LIFECYCLE_VALIDATION', key);
    for (const name of ['positive', 'negative', 'boundary', 'heldOut']) if (!Number.isInteger(v.validation.coverage?.[name]) || v.validation.coverage[name] < (name === 'heldOut' ? 0 : 1)) throw new DisExecutionError('INVALID_LIFECYCLE_COVERAGE', key);
    for (const path of ['test/runner.test.mjs', 'scripts/validate.py', 'src/runner.mjs']) if (!v.validation.evidenceRefs.some((item) => item.path === path && item.sha256 === resources.get(path))) throw new DisExecutionError('VALIDATION_EVIDENCE_INCOMPLETE', key);
    if (selectedUnit && (v.validation.profile.id !== selectedUnit.validation.profile || v.validation.profile.revision !== selectedUnit.validation.profileRevision || v.validation.validator.id !== selectedUnit.validation.validator.id || v.validation.validator.version !== selectedUnit.validation.validator.version)) throw new DisExecutionError('VALIDATION_PROFILE_MISMATCH', key);
    if (asset.promotionRecordId !== p.recordId || asset.promotionRecordDigest !== p.recordDigest || asset.validationRecordId !== v.recordId || asset.validationRecordDigest !== v.recordDigest) throw new DisExecutionError('PACKAGE_PROMOTION_PIN_MISMATCH', key);
  }
  for (const id of unitsById.keys()) if (!assetKeys.has('unit:' + id)) throw new DisExecutionError('SELECTED_UNIT_MISSING', id);
  if (!assetKeys.has('rule:xdownload.player-signatures') || !assetKeys.has('graph:xdownload.player-recognition')) throw new DisExecutionError('SELECTED_GRAPH_OR_RULE_MISSING', packageIdentity.packageId);
  const selectedGraph = selection.selectedAssets.find((asset) => asset.kind === 'graph' && asset.id === 'xdownload.player-recognition');
  if (selectedGraph.path !== 'domain/player-recognition.graph.json' || selectedGraph.revision !== '1.0.0') throw new DisExecutionError('SELECTED_GRAPH_IDENTITY_MISMATCH', selectedGraph.id);
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

export function referenceUriProtocol(value) {
  if (typeof value !== 'string' || !value.length || /[^\x21-\x7e]/.test(value) || /%(?![0-9A-Fa-f]{2})/.test(value)) return null;
  const parsed = /^([A-Za-z][A-Za-z0-9+.-]*):([^\s]*)$/.exec(value);
  if (!parsed) return null;
  if (!/^[A-Za-z0-9._~!$&'()*+,;=:@%/\-]*(?:\?[A-Za-z0-9._~!$&'()*+,;=:@%/?\-]*)?(?:#[A-Za-z0-9._~!$&'()*+,;=:@%/?\-]*)?$/.test(parsed[2])) return null;
  const scheme = parsed[1].toLowerCase();
  if (['http', 'https', 'ftp'].includes(scheme)) {
    const authority = /^\/\/([A-Za-z0-9.-]+)(?::([0-9]{1,5}))?(?:[/?#]|$)/.exec(parsed[2]);
    if (!authority || (authority[2] !== undefined && Number(authority[2]) > 65535)) return null;
  } else if (parsed[2].startsWith('//') && !(scheme === 'file' && parsed[2].startsWith('///'))) {
    return null;
  }
  return scheme + ':';
}

function recognizePlayerWithMode(input, context, normalize) {
  if (!input || typeof input.url !== 'string' || !Array.isArray(input.signals) || input.signals.some((item) => typeof item !== 'string') ||
      (input.claims !== undefined && (!Array.isArray(input.claims) || input.claims.some((claim) => !claim || typeof claim.sourceId !== 'string' || !claim.sourceId || typeof claim.playerId !== 'string' || !claim.playerId))) ||
      (input.encryptedPlayer !== undefined && typeof input.encryptedPlayer !== 'boolean') ||
      (input.unsupportedPlayerFamily !== undefined && typeof input.unsupportedPlayerFamily !== 'boolean')) {
    throw new DisExecutionError('INVALID_INPUT', 'PageObservation has malformed URL, signals, claims or scope flags');
  }
  const protocol = referenceUriProtocol(input.url);
  if (!protocol) throw new DisExecutionError('INVALID_INPUT', 'PageObservation URL is outside the reference URI profile');
  const scope = context?.unit?.scope;
  if (!scope || scope.domain !== 'web-media' || JSON.stringify(scope.appliesTo) !== JSON.stringify(['http-or-https-page-observation']) ||
      !Array.isArray(scope.excludes) || scope.excludes.length !== 2 || !scope.excludes.includes('encrypted-player-decryption') || !scope.excludes.includes('unsupported-player-families')) {
    throw new DisExecutionError('UNSUPPORTED_RECOGNIZER_SCOPE', 'unknown applicability or exclusion semantics');
  }
  const excluded = !['http:', 'https:'].includes(protocol) ? 'non-http-page' : input.encryptedPlayer ? 'encrypted-player-decryption' : input.unsupportedPlayerFamily ? 'unsupported-player-families' : null;
  const patterns = context?.knowledge?.['xdownload.player-signatures']?.patterns || context?.catalogs?.signatures?.patterns;
  if (!Array.isArray(patterns)) throw new DisExecutionError('MISSING_SIGNATURE_CATALOG', 'player-signatures knowledgeRef is required');
  const rawHaystack = input.url + '\n' + input.signals.join('\n');
  const haystack = normalize ? rawHaystack.toLowerCase() : rawHaystack;
  const matches = excluded ? [] : patterns.flatMap((pattern) => {
    if (typeof pattern.playerId !== 'string' || !Array.isArray(pattern.markers)) throw new DisExecutionError('INVALID_SIGNATURE_CATALOG', 'each pattern needs playerId and markers[]');
    const marker = pattern.markers.find((candidate) => haystack.includes(normalize ? candidate.toLowerCase() : candidate));
    return marker ? [{ playerId: pattern.playerId, marker }] : [];
  });
  const candidates = [...new Set(matches.map((match) => match.playerId))];
  const claims = [...(input.claims || []), ...matches.map((match) => ({ sourceId: 'signature:' + match.marker, playerId: match.playerId }))];
  const claimConflict = (input.claims || []).length > 0 && new Set(claims.map((claim) => claim.playerId)).size > 1;
  const status = excluded ? 'out_of_scope' : claimConflict ? 'conflict' : candidates.length === 1 ? 'recognized' : candidates.length > 1 ? 'ambiguous' : 'unknown';
  const evidence = excluded ? [{ sourceId: 'page-observation', kind: 'observation', ref: input.url, claim: 'excluded by scope: ' + excluded }] : matches.length
    ? matches.map((match) => ({ sourceId: 'page-observation', kind: 'observation', ref: input.url, claim: 'matched marker ' + match.marker }))
    : [{ sourceId: 'page-observation', kind: 'observation', ref: input.url, claim: 'no supported player marker found' }];
  for (const claim of input.claims || []) evidence.push({ sourceId: claim.sourceId, kind: 'observation', ref: input.url, claim: 'observed player claim ' + claim.playerId });
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
    conflicts: claimConflict && !excluded ? [{ field: 'playerId', claims }] : [],
    uncertainty: {
      level: status === 'recognized' ? 'LOW' : status === 'ambiguous' ? 'HIGH' : 'UNKNOWN',
      reason: status === 'recognized' ? 'one supported deterministic signature matched' : status === 'ambiguous' ? 'multiple supported player identities matched' : status === 'conflict' ? 'incompatible observed player claims' : excluded ? 'excluded by scope: ' + excluded : 'no supported player signature matched',
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
  if (!recognition || !['recognized', 'ambiguous', 'unknown', 'conflict'].includes(recognition.status)) throw new DisExecutionError('INVALID_INPUT', 'route decision requires a recognition result');
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
  if (!recognition || !['ambiguous', 'unknown', 'conflict'].includes(recognition.status)) throw new DisExecutionError('INVALID_INPUT', 'fallback requires ambiguous, conflicting or unknown recognition');
  return {
    status: recognition.status !== 'unknown' ? 'NEEDS_INPUT' : 'NEEDS_REVIEW',
    reason: recognition.status === 'conflict' ? 'conflicting-player-claims' : recognition.status === 'ambiguous' ? 'multiple-player-candidates' : 'no-supported-player-candidate',
    question: recognition.status !== 'unknown' ? 'Which player is present on this page?' : null,
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

export const handlers = Object.freeze({
  'registry:xdownload.player.recognizer@1.0.0': recognizePlayer,
  'registry:xdownload.player.recognizer-normalized@1.0.0': recognizePlayerNormalized,
  'registry:xdownload.player.route-decision@1.0.0': routeRecognition,
  'registry:xdownload.player.resolve-procedure@1.0.0': resolvePlayer,
  'registry:xdownload.player.bounded-fallback@1.0.0': boundedFallback,
  'registry:xdownload.player.outcome-validator@1.0.0': validateOutcome,
});

export async function loadDemo({ expectedSelectionLockSha256 } = {}) {
  const descriptor = JSON.parse(await fs.readFile(path.join(packageRoot, 'package.json'), 'utf8'));
  const packageIdentity = descriptor.dis;
  if (!/^[a-f0-9]{64}$/.test(expectedSelectionLockSha256 || '') || expectedSelectionLockSha256 !== packageIdentity?.selectionLockSha256) throw new DisExecutionError('EXTERNAL_SELECTION_PIN_MISMATCH', 'a caller-supplied trusted lock pin is required');
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
  for (const unit of units) for (const candidate of unit.implementation?.candidates || []) if (resources.get(candidate.artifactRef) !== candidate.artifactDigest) throw new DisExecutionError('IMPLEMENTATION_CANDIDATE_ARTIFACT_DIGEST_MISMATCH', candidate.candidateId);
  validateCapabilityContracts(unitsById, resources);
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
  validateSelectedGraph(packageIdentity.selectionLock, manifest.graphRef, graph, resources);

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
    for (const candidate of unit.implementation?.candidates || []) expectResource(candidate.artifactRef, 'implementation', unit.id);
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
  validateLifecycleRecords(packageIdentity, unitsById, unitPaths, resources, manifestDigest, expectedSelectionLockSha256);
  const selectedProviders = new Map();
  for (const unit of units) {
    if (unit.capabilities?.provides?.length) {
      const selected = resolveProviderSelection(unit, packageIdentity.selectionLock, packageIdentity.selectionLock.target, resources);
      selectedProviders.set(unit.id, selected.candidate);
    }
  }
  lockedProviders.set(selectedProviders, new Map(units.map((unit) => [unit.id, { ref: selectedProviders.get(unit.id)?.ref || unit.implementation.ref, revision: unit.revision, candidateId: selectedProviders.get(unit.id)?.candidateId || null }])));
  const catalogs = {
    signatures: knowledge['xdownload.player-signatures'],
    strategies: JSON.parse(resourceContents.get(strategiesPath)),
  };
  if (!catalogs.signatures) throw new DisExecutionError('MISSING_SELECTED_KNOWLEDGE', 'xdownload.player-signatures');
  validateGraph(graph, unitsById, schemas);
  validateDefinition(definition, unitsById, graph, manifest.graphRef.path);
  const loaded = { graph, definition, unitsById, schemas, resources, catalogs, knowledge, selectedProviders, closureManifest: manifest, packageIdentity: { ...packageIdentity, resourceClosureSha256: manifestDigest } };
  lockedExecutionResources.set(selectedProviders, structuredClone({ graph, unitsById, schemas, catalogs, knowledge, packageIdentity: loaded.packageIdentity }));
  return loaded;
}

export function bindAvailableData(graph, outputs, nodeId, initialInput) {
  let nodeInput = initialInput;
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
  return nodeInput;
}

export async function runPipeline(input, loaded) {
  const selection = loaded?.selectedProviders;
  const snapshot = lockedExecutionResources.get(selection);
  if (!snapshot) throw new DisExecutionError('SELECTED_RESOURCE_CHANGED', 'verified execution resources are required');
  const { graph, unitsById, schemas, catalogs, knowledge, packageIdentity } = snapshot;
  const outputs = new Map();
  let nodeId = graph.entryNode;
  const trace = [];
  let expectedOutcome;
  function applyFailurePolicy(unit, status) {
    const action = referenceFailureAction(unit, status);
    if (action === 'REJECT' || action === 'FAIL') {
      const error = new DisExecutionError('FAILURE_POLICY_' + action, unit.id + ':' + status);
      error.failurePolicy = { unitId: unit.id, nodeId, status, action };
      throw error;
    }
    const terminal = ['CLARIFY', 'WAIT'].includes(action) ? 'NEEDS_INPUT' : 'NEEDS_REVIEW';
    if (expectedOutcome && expectedOutcome !== terminal) throw new DisExecutionError('FAILURE_POLICY_GRAPH_MISMATCH', unit.id + ':' + status);
    expectedOutcome = terminal;
  }
  try {
  for (let step = 0; step <= graph.nodes.length; step += 1) {
    const node = graph.nodes.find((item) => item.nodeId === nodeId);
    const unit = unitsById.get(node.unitRef.id);
    const binding = lockedProviders.get(selection)?.get(unit?.id);
    if (!binding || binding.revision !== unit.revision || (!binding.candidateId && binding.ref !== unit.implementation?.ref)) throw new DisExecutionError('SELECTED_IMPLEMENTATION_CHANGED', unit?.id || nodeId);
    const handler = handlers[binding.ref];
    if (!handler) throw new DisExecutionError('NO_TRUSTED_IMPLEMENTATION_BINDING', binding.ref);

    let nodeInput = nodeId === graph.entryNode ? structuredClone(input) : {};
    nodeInput = bindAvailableData(graph, outputs, nodeId, nodeInput);
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
      if (value === undefined) throw new DisExecutionError('MISSING_RUNTIME_EVIDENCE_VALUE', edge.from.node + edge.from.pointer);
      evidence[edge.to.slot] = [...(evidence[edge.to.slot] || []), ...(Array.isArray(value) ? structuredClone(value) : [structuredClone(value)])];
    }
    try {
      validatePreconditions(unit, nodeInput);
    } catch (error) {
      if (!(error instanceof DisExecutionError) || error.code !== 'PRECONDITION_FAILED') throw error;
      trace.push({ nodeId, unitId: unit.id, unitRevision: unit.revision, implementationRef: binding.ref, implementationCandidateId: binding.candidateId, input: structuredClone(nodeInput), evidence: structuredClone(evidence), failure: { code: error.code } });
      const action = referenceFailureAction(unit, 'INVALID_INPUT');
      if (action === 'REJECT' || action === 'FAIL') { error.failurePolicy = { unitId: unit.id, nodeId, status: 'INVALID_INPUT', action }; throw error; }
      throw new DisExecutionError('UNSUPPORTED_FAILURE_POLICY', unit.id + ':INVALID_INPUT:' + action);
    }
    let output;
    try {
      output = handler(nodeInput, { evidence, catalogs, knowledge, unit });
    } catch (error) {
      const failureCode = error instanceof DisExecutionError ? error.code : 'HANDLER_FAILED';
      trace.push({ nodeId, unitId: unit.id, unitRevision: unit.revision, implementationRef: binding.ref, implementationCandidateId: binding.candidateId, input: structuredClone(nodeInput), evidence: structuredClone(evidence), failure: { code: failureCode } });
      if (!(error instanceof DisExecutionError)) throw new DisExecutionError(failureCode, unit.id);
      if (!unit.failure?.handling?.[error.code]) throw error;
      const action = referenceFailureAction(unit, error.code);
      if (action === 'REJECT' || action === 'FAIL') { error.failurePolicy = { unitId: unit.id, nodeId, status: error.code, action }; throw error; }
      throw new DisExecutionError('UNSUPPORTED_FAILURE_POLICY', unit.id + ':' + error.code + ':' + action);
    }
    outputs.set(nodeId, output);
    trace.push({ nodeId, unitId: unit.id, unitRevision: unit.revision, implementationRef: binding.ref, implementationCandidateId: binding.candidateId, input: structuredClone(nodeInput), evidence: structuredClone(evidence), output: structuredClone(output) });
    if (unit.role === 'recognizer' && ['unknown', 'ambiguous', 'conflict', 'out_of_scope'].includes(output?.status)) {
      applyFailurePolicy(unit, output.status.toUpperCase());
    }
    if (unit.role === 'decision' && ['unknown', 'ambiguous', 'conflict'].includes(nodeInput.recognition?.status)) applyFailurePolicy(unit, nodeInput.recognition.status.toUpperCase());
    if (['procedure', 'validator'].includes(unit.role) && ['NEEDS_INPUT', 'NEEDS_REVIEW'].includes(output?.status)) applyFailurePolicy(unit, output.status);
    if (graph.terminalNodes.includes(nodeId)) {
      const workflow = [...unitsById.values()].find((item) => item.role === 'workflow' && item.implementation.ref === 'graph:' + graph.id + '@' + graph.revision);
      if (['NEEDS_INPUT', 'NEEDS_REVIEW'].includes(output.status)) {
        if (!workflow) throw new DisExecutionError('WORKFLOW_UNIT_REF_MISMATCH', graph.id);
        applyFailurePolicy(workflow, output.status);
      }
      if (expectedOutcome && output.status !== expectedOutcome) throw new DisExecutionError('FAILURE_POLICY_GRAPH_MISMATCH', nodeId + ':' + expectedOutcome);
      return { outcome: output, trace, packageIdentity: structuredClone(packageIdentity) };
    }
    const candidates = graph.edges.filter((edge) => edge.kind === 'control' && edge.from === nodeId && conditionMatches(output, edge.when));
    if (candidates.length !== 1) throw new DisExecutionError('AMBIGUOUS_CONTROL_FLOW', nodeId + ' selected ' + candidates.length + ' control edges');
    nodeId = candidates[0].to;
  }
  throw new DisExecutionError('STEP_LIMIT_EXCEEDED', graph.id);
  } catch (error) {
    if (error instanceof DisExecutionError) error.trace = structuredClone(trace);
    throw error;
  }
}
