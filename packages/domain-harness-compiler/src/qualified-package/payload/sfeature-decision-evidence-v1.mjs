/**
 * v0.10 T06 — optional Standard DecisionEvidence feature.
 *
 * Observes a genuine SemanticDecision result; it NEVER acts as the K receipt,
 * K State, Effect, Permit, admission authority or an external Tool executor.
 * Recording is advisory. Publicly supplied evidence is NEVER an attested
 * Kernel receipt or a trusted measurement. A failed optional observation
 * sink cannot change the original semantic decision or Kernel state.
 */
export const MODULE_ID = 'sfeature-decision-evidence@v010.1.0.0';
export const PACKAGE_KIND = 'standard-feature';
export const FEATURE_ABI = 'dh.v10.standard-feature/1';
export const FEATURE_KEY = 'standard:decision-evidence/1';

const AUTHORITY_KEYS = new Set([
  'effectPermit', 'permit', 'effectIntents', 'effectJournal', 'admissionFence',
  'hostPorts', 'resources', 'kernelState', 'createOccurrenceRuntime', 'submitOccurrence',
]);
const SOURCE_KINDS = new Set(['rule', 'reuse', 'procedure', 'model', 'tool']);
const OUTCOME_KINDS = new Set(['admitted', 'denied', 'unknown']);
const LIMIT_DEPENDENCIES = 32;

class EvidenceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'EvidenceError';
    this.code = code;
  }
}
function refuse(code, message) { throw new EvidenceError(code, message); }
function isRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
function boundedText(value, key, max = 256) {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) {
    refuse('EVIDENCE_ID_INVALID', key + ' must be a bounded nonempty identifier');
  }
  return value;
}
function copyData(data) {
  const seen = new WeakSet();
  let nodes = 0;
  const visit = (v, depth) => {
    if (++nodes > 512 || depth > 24) refuse('EVIDENCE_DATA_INVALID', 'evidence data limits exceeded');
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (Array.isArray(v)) {
      if (seen.has(v)) refuse('EVIDENCE_DATA_INVALID', 'cyclic evidence arrays are forbidden');
      seen.add(v);
      if (v.length > 128) refuse('EVIDENCE_DATA_INVALID', 'evidence array too long');
      const result = v.map(item => visit(item, depth + 1));
      seen.delete(v);
      return result;
    }
    if (!isRecord(v)) refuse('EVIDENCE_DATA_INVALID', 'plain JSON evidence is required');
    if (seen.has(v)) refuse('EVIDENCE_DATA_INVALID', 'cyclic evidence is forbidden');
    seen.add(v);
    const keys = Object.keys(v);
    if (keys.length > 64) refuse('EVIDENCE_DATA_INVALID', 'evidence object too wide');
    const result = Object.create(null);
    for (const key of keys) {
      if (AUTHORITY_KEYS.has(key) || key === '__proto__' || key === 'constructor' || key === 'prototype') {
        refuse('EVIDENCE_AUTHORITY_FORBIDDEN', 'evidence must not carry Kernel authority or unsafe object keys');
      }
      result[key] = visit(v[key], depth + 1);
    }
    seen.delete(v);
    return result;
  };
  return visit(data, 0);
}

export function init(context) {
  return { ok: true, featureKey: FEATURE_KEY, observedContext: { appId: context.appId } };
}

/**
 * @param request {observationId,schema:{id,revision,provenanceKey},
 *   decisionResult: resolver result from a selected T02 semantic feature,
 *   observedDependencies:[{kind,id,revision,provenanceKey,observation:'measured'|'unmeasured'}]}
 * @param deps {persistObservation?:fn, observationTimeoutMs?:number}.
 * The public selected-S facade currently permits caller-supplied dependency
 * functions. Such inputs are NOT Host-attested. Consequently this pure layer
 * never claims a Kernel admission or verified measured Model usage. Those
 * require an actual trusted Host integration in the follow-up T06 slice.
 */
export async function recordDecisionEvidence(request, deps = {}) {
  if (!isRecord(request) || !isRecord(request.schema) || !isRecord(request.decisionResult)) {
    refuse('EVIDENCE_REQUEST_INVALID', 'bounded schema and selected decision result required');
  }
  const schema = request.schema;
  const selectedSchema = {
    id: boundedText(schema.id, 'schema.id'),
    revision: boundedText(schema.revision, 'schema.revision'),
    provenanceKey: boundedText(schema.provenanceKey, 'schema.provenanceKey'),
  };
  const observationId = boundedText(request.observationId, 'observationId');
  const decisionResult = request.decisionResult;
  if (!['selected', 'unavailable'].includes(decisionResult.kind)) {
    refuse('EVIDENCE_DECISION_INVALID', 'decision result kind must be selected or unavailable');
  }
  let source = null;
  if (decisionResult.kind === 'selected') {
    if (!SOURCE_KINDS.has(decisionResult.source)) refuse('EVIDENCE_DECISION_INVALID', 'undeclared decision source');
    source = decisionResult.source;
  }
  if (!isRecord(decisionResult.evidence)) {
    refuse('EVIDENCE_DECISION_INVALID', 'actual resolver evidence must be present');
  }
  const decisionProof = decisionResult.evidence;
  if (decisionProof.kernelEffectPermit !== false) {
    refuse('EVIDENCE_AUTHORITY_FORBIDDEN', 'semantic result must have no Kernel effect authority');
  }
  const counterEvidence = decisionProof.modelCallEvidence;
  if (!['measured', 'unmeasured'].includes(counterEvidence)) {
    refuse('EVIDENCE_COUNTER_INVALID', 'unknown model call evidence status');
  }
  const modelCalls = Number.isSafeInteger(decisionProof.modelCalls) && decisionProof.modelCalls >= 0
    ? decisionProof.modelCalls : null;
  const toolCalls = Number.isSafeInteger(decisionProof.toolCalls) && decisionProof.toolCalls >= 0
    ? decisionProof.toolCalls : null;
  if (counterEvidence === 'measured' && modelCalls === null) {
    refuse('EVIDENCE_COUNTER_INVALID', 'measured Model calls require a measured count');
  }
  if ((source === 'rule' || source === 'reuse' || source === 'procedure') && modelCalls !== 0) {
    refuse('EVIDENCE_COUNTER_INVALID', 'deterministic source must not claim Model calls');
  }
  if (source === 'model' && (counterEvidence !== 'measured' || modelCalls === null || modelCalls < 1)) {
    refuse('EVIDENCE_COUNTER_INVALID', 'selected Model source requires a measured started call');
  }

  const dependencies = request.observedDependencies ?? [];
  if (!Array.isArray(dependencies) || dependencies.length > LIMIT_DEPENDENCIES) {
    refuse('EVIDENCE_DEPENDENCY_INVALID', 'bounded ObservedDependencySet required');
  }
  const seen = new Set();
  const observedDependencies = dependencies.map(raw => {
    if (!isRecord(raw)) refuse('EVIDENCE_DEPENDENCY_INVALID', 'observed dependency must be a record');
    const item = {
      kind: boundedText(raw.kind, 'dependency.kind', 64),
      id: boundedText(raw.id, 'dependency.id'),
      revision: boundedText(raw.revision, 'dependency.revision'),
      provenanceKey: boundedText(raw.provenanceKey, 'dependency.provenanceKey'),
      observation: raw.observation,
    };
    if (!['measured', 'unmeasured'].includes(item.observation)) {
      refuse('EVIDENCE_DEPENDENCY_INVALID', 'dependency observation is measured or unmeasured');
    }
    const key = JSON.stringify([item.kind,item.id,item.revision,item.provenanceKey]);
    if (seen.has(key)) refuse('EVIDENCE_DEPENDENCY_DUPLICATE', 'same dependency declared twice');
    seen.add(key);
    return item;
  });

  const decision = decisionResult.kind === 'selected'
    ? copyData(decisionResult.decision)
    : null;
  const reason = decisionResult.kind === 'unavailable'
    ? boundedText(decisionResult.reason, 'unavailable.reason')
    : null;
  // No caller-supplied callback may attest K admission/denial. Only a
  // trusted deployment-bound Host adapter may add that in a future slice.
  const kernelOutcome = 'unobserved';

  const trace = {
    observationId,
    schema: selectedSchema,
    semanticOutcome: decisionResult.kind,
    source,
    reason,
    decision,
    evidence: {
      modelCalls: null,
      modelCallStatus: 'unverified',
      reportedModelCallStatus: counterEvidence,
      reportedModelCalls: modelCalls,
      toolCalls,
      steps: Number.isSafeInteger(decisionProof.steps) ? decisionProof.steps : null,
    },
    kernelOutcome,
    observedDependencies,
  };

  // The optional caller-provided sink is NOT a privileged K or C capability,
  // and its return never proves physical durability. Timeout leaves the write
  // result unknown rather than blocking the immutable primary outcome.
  let observationStore = 'not-selected';
  if (typeof deps.persistObservation === 'function') {
    const ms = Number.isSafeInteger(deps.observationTimeoutMs)
      && deps.observationTimeoutMs >= 1 && deps.observationTimeoutMs <= 10_000
      ? deps.observationTimeoutMs : 1000;
    let timer = null;
    try {
      const write = Promise.resolve().then(() => deps.persistObservation(copyData(trace)));
      const outcome = await Promise.race([
        write.then(() => 'callback-reported-success', () => 'failed'),
        new Promise(resolve => {
          timer = setTimeout(() => resolve('unknown-timeout'), ms);
        }),
      ]);
      observationStore = outcome;
    } catch {
      observationStore = 'failed';
    } finally {
      if (timer !== null) clearTimeout(timer);
    }
  }
  return { decisionResult, decisionTrace: trace, observationStore };
}
