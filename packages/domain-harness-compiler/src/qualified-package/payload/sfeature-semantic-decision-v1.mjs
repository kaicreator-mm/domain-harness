/**
 * DomainHarness v0.10 T02 — optional selected Standard semantic-decision feature.
 *
 * Pure bounded resolver; it does not know a Kernel Permit, a Host docs port,
 * a ResourceDispatcher or a privileged admission method. The Kernel alone
 * admits decisions, commits state and dispatches Effects after its live gates.
 */
export const MODULE_ID = 'sfeature-semantic-decision@v010.1.0.0';
export const PACKAGE_KIND = 'standard-feature';
export const FEATURE_ABI = 'dh.v10.standard-feature/1';
export const FEATURE_KEY = 'standard:semantic-decision/1';

const OWNED_AUTHORITY_FIELDS = new Set([
  'effectPermit', 'permit', 'effectIntents', 'admissionFence',
  'effectJournal', 'journal', 'resources', 'hostPorts', 'kernelState',
  'createOccurrenceRuntime', 'submitOccurrence',
]);

class SemanticDecisionRefusal extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SemanticDecisionRefusal';
    this.code = code;
  }
}

const record = (value) => value !== null && typeof value === 'object'
  && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype
    || Object.getPrototypeOf(value) === null);

function refuse(code, reason) {
  throw new SemanticDecisionRefusal(code, reason);
}

function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (record(value)) {
    return '{' + Object.keys(value).sort().map((key) =>
      JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  }
  refuse('SEMANTIC_DATA_INVALID', 'semantic data must be finite plain JSON');
}

function checkedDecision(value) {
  if (!record(value)) refuse('SEMANTIC_DECISION_INVALID', 'decision must be a plain JSON record');
  const visit = (data, depth) => {
    if (depth > 32) refuse('SEMANTIC_DATA_INVALID', 'decision depth exceeds the bound');
    if (Array.isArray(data)) {
      for (const item of data) visit(item, depth + 1);
    } else if (record(data)) {
      for (const key of Object.keys(data)) {
        if (OWNED_AUTHORITY_FIELDS.has(key)) {
          refuse('SEMANTIC_AUTHORITY_FORBIDDEN', 'semantic decisions cannot carry Kernel or external-effect authority');
        }
        visit(data[key], depth + 1);
      }
    } else {
      canonical(data);
    }
  };
  visit(value, 0);
  // The resolver returns caller-owned copies, not mutable policy/cache aliases.
  return JSON.parse(canonical(value));
}

function bounds(request) {
  const maxSteps = request?.limits?.maxSteps ?? 4;
  const maxModelCalls = request?.limits?.maxModelCalls ?? 1;
  const maxToolCalls = request?.limits?.maxToolCalls ?? 1;
  const deadlineEpochMs = request?.limits?.deadlineEpochMs ?? null;
  if (!Number.isSafeInteger(maxSteps) || maxSteps < 1 || maxSteps > 32
    || !Number.isSafeInteger(maxModelCalls) || maxModelCalls < 0 || maxModelCalls > 4
    || !Number.isSafeInteger(maxToolCalls) || maxToolCalls < 0 || maxToolCalls > 4
    || (deadlineEpochMs !== null && (!Number.isFinite(deadlineEpochMs) || deadlineEpochMs < 0))) {
    refuse('SEMANTIC_BUDGET_INVALID', 'semantic budget must be explicitly bounded');
  }
  return { maxSteps, maxModelCalls, maxToolCalls, deadlineEpochMs };
}

function decisionResult(source, decision, evidence) {
  return {
    kind: 'selected', source, decision: checkedDecision(decision),
    evidence: { ...evidence, kernelEffectPermit: false },
  };
}

export function init(context) {
  // A bounded, data-only init return, no protected ports.
  return { ok: true, featureKey: FEATURE_KEY, observedContext: { appId: context.appId } };
}

/**
 * Input:
 * request.input: plain JSON
 * request.schema: {id, revision, provenanceKey}
 * request.rules: [{id, when: plain partial-key predicate, decision}]
 * request.reuse: {schemaId, schemaRevision, provenanceKey, canonicalInput, decision}
 * request.procedure: {id, revision} — actual callable is trusted selected port
 * request.fallback: {kind: 'model'|'tool', operationId}
 * request.limits: maxSteps, maxModelCalls, maxToolCalls, deadlineEpochMs
 * deps: { procedures: Map, model: fn?, tool: fn?, now: fn?,
 *         createTimeoutSignal: fn? } — host-selected boundary only; return data
 *       is never a privileged K admission. createTimeoutSignal, when the host
 *       provides it, yields { signal, abort(reason) }; the signal is passed to
 *       each asynchronous external call and abort is observed on deadline so a
 *       trusted host can cancel for real. Racing a timer is NOT a claim the
 *       external call stopped executing: without a trusted signal the timeout
 *       is recorded as cancellation 'unsupported' and call counts stay honest.
 */

// Optional trusted cancellation handle from the host; anything malformed or
// absent degrades honestly to 'unsupported', never to a fabricated cancel.
function timeoutSignalHandle(deps) {
  if (typeof deps.createTimeoutSignal !== 'function') return null;
  try {
    const handle = deps.createTimeoutSignal();
    if (handle === null || typeof handle !== 'object' || typeof handle.abort !== 'function') return null;
    return handle;
  } catch {
    return null;
  }
}

export async function resolveSemanticDecision(request, deps = {}) {
  if (!record(request) || !record(request.input) || !record(request.schema)) {
    refuse('SEMANTIC_REQUEST_INVALID', 'request requires plain input and schema');
  }
  const schema = request.schema;
  for (const key of ['id', 'revision', 'provenanceKey']) {
    if (typeof schema[key] !== 'string' || schema[key].length === 0) {
      refuse('SEMANTIC_SCHEMA_INVALID', 'exact schema identity and provenance are required');
    }
  }
  const fingerprint = canonical(request.input);
  const limit = bounds(request);
  const now = typeof deps.now === 'function' ? deps.now : () => Date.now();
  const evidence = { steps: 0, modelCalls: 0, toolCalls: 0, modelCallEvidence: 'unmeasured', timedOutCalls: [] };
  // Distinguishes WHY no further step may start: an expired deadline is never
  // reported as a consumed-step budget exhaustion.
  const stepOutcome = () => {
    if (limit.deadlineEpochMs !== null && now() > limit.deadlineEpochMs) return 'deadline-exceeded';
    if (evidence.steps >= limit.maxSteps) return 'budget-exhausted';
    evidence.steps += 1;
    return null;
  };
  const unavailable = (reason) => ({
    kind: 'unavailable', reason,
    evidence: { ...evidence, kernelEffectPermit: false },
  });
  const requestAbort = (handle) => {
    if (handle === null) return 'unsupported';
    try {
      handle.abort('deadline-exceeded');
      return 'requested';
    } catch {
      return 'requested';
    }
  };
  // Real bounded wait: a hanging Procedure/Model/Tool promise settles the
  // resolver at the deadline instead of pending forever. Losing the race does
  // not undo the started call; its counts and this record stay truthful.
  const awaitBounded = async (promise, handle, call) => {
    if (limit.deadlineEpochMs === null) return { ok: true, value: await promise };
    const remainingMs = limit.deadlineEpochMs - now();
    if (remainingMs <= 0) {
      evidence.timedOutCalls.push({ ...call, cancellation: requestAbort(handle) });
      return { ok: false };
    }
    let timer = null;
    try {
      const value = await Promise.race([
        promise,
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            evidence.timedOutCalls.push({ ...call, cancellation: requestAbort(handle) });
            reject(new SemanticDecisionRefusal('SEMANTIC_DEADLINE_EXCEEDED', 'external semantic call exceeded the declared deadline'));
          }, remainingMs);
        }),
      ]);
      return { ok: true, value };
    } catch (error) {
      if (error instanceof SemanticDecisionRefusal && error.code === 'SEMANTIC_DEADLINE_EXCEEDED') {
        return { ok: false };
      }
      throw error;
    } finally {
      if (timer !== null) clearTimeout(timer);
    }
  };

  // 1. Rule: first matching declaration, with no Model or Tool.
  if (!Array.isArray(request.rules ?? [])) refuse('SEMANTIC_RULES_INVALID', 'rules must be an array');
  for (const rule of request.rules ?? []) {
    { const blocked = stepOutcome(); if (blocked !== null) return unavailable(blocked); }
    if (!record(rule) || !record(rule.when) || typeof rule.id !== 'string') {
      refuse('SEMANTIC_RULES_INVALID', 'rule requires id and plain when');
    }
    if (Object.keys(rule.when).every((key) => Object.hasOwn(request.input, key) && canonical(request.input[key]) === canonical(rule.when[key]))) {
      return decisionResult('rule', rule.decision, evidence);
    }
  }

  // 2. Reuse: exact schema/revision/provenance and canonical input; never fuzzy.
  if (request.reuse !== undefined && request.reuse !== null) {
    { const blocked = stepOutcome(); if (blocked !== null) return unavailable(blocked); }
    const cached = request.reuse;
    if (!record(cached)) refuse('SEMANTIC_REUSE_INVALID', 'reuse must be a record');
    if (cached.schemaId === schema.id && cached.schemaRevision === schema.revision
      && cached.provenanceKey === schema.provenanceKey
      && cached.canonicalInput === fingerprint) {
      return decisionResult('reuse', cached.decision, evidence);
    }
  }

  // 3. Procedure: only a named, pinned procedure from a trusted registry.
  if (request.procedure !== undefined && request.procedure !== null) {
    { const blocked = stepOutcome(); if (blocked !== null) return unavailable(blocked); }
    const p = request.procedure;
    if (!record(p) || typeof p.id !== 'string' || typeof p.revision !== 'string') {
      refuse('SEMANTIC_PROCEDURE_INVALID', 'procedure id and revision are required');
    }
    const selected = deps.procedures instanceof Map ? deps.procedures.get(p.id) : undefined;
    if (selected !== undefined && selected.revision === p.revision && typeof selected.resolve === 'function') {
      const handle = timeoutSignalHandle(deps);
      const callArgs = [JSON.parse(fingerprint)];
      if (handle !== null) callArgs.push({ signal: handle.signal });
      const outcome = await awaitBounded(selected.resolve(...callArgs), handle,
        { kind: 'procedure', operationId: p.id });
      if (!outcome.ok) return unavailable('deadline-exceeded');
      return decisionResult('procedure', outcome.value, evidence);
    }
  }

  // 4. Declared bounded fallback; an absent model is a valid no-model mode.
  if (request.fallback === null || request.fallback === undefined) return unavailable('no-declared-fallback');
  { const blocked = stepOutcome(); if (blocked !== null) return unavailable(blocked); }
  const route = request.fallback;
  if (!record(route) || !['model', 'tool'].includes(route.kind)
    || typeof route.operationId !== 'string' || !route.operationId) {
    refuse('SEMANTIC_FALLBACK_INVALID', 'fallback must name one declared model/tool operation');
  }
  const isModel = route.kind === 'model';
  if (isModel && limit.maxModelCalls === 0) return unavailable('model-disabled');
  if (!isModel && limit.maxToolCalls === 0) return unavailable('tool-disabled');
  const fn = isModel ? deps.model : deps.tool;
  if (typeof fn !== 'function') return unavailable(isModel ? 'model-unavailable' : 'tool-unavailable');
  if (isModel) { evidence.modelCalls += 1; evidence.modelCallEvidence = 'measured'; }
  else evidence.toolCalls += 1;
  const handle = timeoutSignalHandle(deps);
  const payload = { operationId: route.operationId, input: JSON.parse(fingerprint),
    schema: { ...schema }, budget: { maxSteps: limit.maxSteps, deadlineEpochMs: limit.deadlineEpochMs } };
  if (handle !== null) payload.signal = handle.signal;
  const outcome = await awaitBounded(fn(payload), handle,
    { kind: route.kind, operationId: route.operationId });
  if (!outcome.ok) return unavailable('deadline-exceeded');
  if (limit.deadlineEpochMs !== null && now() > limit.deadlineEpochMs) return unavailable('deadline-exceeded');
  return decisionResult(route.kind, outcome.value, evidence);
}
