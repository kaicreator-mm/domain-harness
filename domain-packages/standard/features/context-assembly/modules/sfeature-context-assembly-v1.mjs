/**
 * T05 optional selected Standard Context Assembly.
 * All inputs are data. This module performs no Memory/Tool/Model call and
 * therefore cannot manufacture Host authorization, measurements, effects
 * or Kernel receipts. An ordinary Business Agent Workflow consumes an
 * assembled context only through the selected K admission route.
 */
export const MODULE_ID = 'sfeature-context-assembly@v010.1.0.0';
export const PACKAGE_KIND = 'standard-feature';
export const FEATURE_ABI = 'dh.v10.standard-feature/1';
export const FEATURE_KEY = 'standard:context-assembly/1';

const ALLOWED_KINDS = new Set(['memory', 'tool', 'rule', 'model', 'user']);
const FORBIDDEN = new Set([
  '__proto__', 'prototype', 'constructor', 'effectPermit', 'permit',
  'effectIntents', 'effectJournal', 'kernelState', 'kernelReceipt',
  'admissionFence', 'hostPorts', 'resources', 'principal',
]);
class ContextAssemblyError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ContextAssemblyError';
    this.code = code;
  }
}
const refuse = (code, message) => { throw new ContextAssemblyError(code, message); };
const record = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
  && (Object.getPrototypeOf(v) === null || Object.getPrototypeOf(v) === Object.prototype);
function text(v, field, limit = 256) {
  if (typeof v !== 'string' || !v || v.length > limit) {
    refuse('CONTEXT_ID_INVALID', field + ' requires bounded nonempty text');
  }
  return v;
}
function sourceScope(scope) {
  if (!record(scope)) refuse('CONTEXT_SCOPE_INVALID', 'complete scope is required');
  const result = {};
  for (const key of ['deployedAppId', 'tenantId', 'appId', 'businessPackageId', 'agentId', 'threadId']) {
    result[key] = text(scope[key], 'scope.' + key);
  }
  return result;
}
function sameScope(a, b) {
  return Object.keys(a).every(key => a[key] === b[key]);
}
function checkSafe(v, depth = 0, seen = new WeakSet()) {
  if (depth > 24) refuse('CONTEXT_DATA_INVALID', 'nested context exceeds depth bound');
  if (v === null || typeof v === 'string' || typeof v === 'boolean'
    || (typeof v === 'number' && Number.isFinite(v))) return;
  if (Array.isArray(v)) {
    if (seen.has(v) || v.length > 64 || Object.keys(v).length !== v.length) {
      refuse('CONTEXT_DATA_INVALID', 'context array is cyclic, sparse or too wide');
    }
    seen.add(v);
    for (let i = 0; i < v.length; i++) {
      if (!Object.hasOwn(v, i)) refuse('CONTEXT_DATA_INVALID', 'context array contains a hole');
      checkSafe(v[i], depth + 1, seen);
    }
    seen.delete(v);
    return;
  }
  if (!record(v) || seen.has(v) || Object.keys(v).length > 64) {
    refuse('CONTEXT_DATA_INVALID', 'context must be bounded plain data');
  }
  seen.add(v);
  for (const key of Object.keys(v)) {
    if (FORBIDDEN.has(key)) refuse('CONTEXT_AUTHORITY_FORBIDDEN', 'context cannot carry protected authority');
    const d = Object.getOwnPropertyDescriptor(v, key);
    if (!d || !Object.hasOwn(d, 'value')) refuse('CONTEXT_DATA_INVALID', 'accessor context input denied');
    checkSafe(d.value, depth + 1, seen);
  }
  seen.delete(v);
}
export function init(context) {
  return { ok: true, featureKey: FEATURE_KEY, observedContext: { appId: context.appId } };
}

/**
 * request = {
 *   scope: deployment+tenant+app+B+agent+thread identity,
 *   observations: [{id,kind,scope,content,provenance:{source,revision,observedBy}}],
 *   budget: {maxEntries:1..32,maxCharacters:1..8192}
 * }
 *
 * No observation is Host-attested by this public feature. The Host must first
 * authorize and gather actual scoped observations. Identity matching here
 * is defense in depth, NOT proof that the caller was allowed to read them.
 */
export function assembleBoundedContext(request) {
  if (!record(request) || !Array.isArray(request.observations) || !record(request.budget)) {
    refuse('CONTEXT_REQUEST_INVALID', 'context requires observations and a bounded budget');
  }
  // This also rejects an attempt to pass authority-shaped nested material.
  checkSafe(request);
  const scope = sourceScope(request.scope);
  const maxEntries = request.budget.maxEntries;
  const maxCharacters = request.budget.maxCharacters;
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > 32
    || !Number.isSafeInteger(maxCharacters) || maxCharacters < 1 || maxCharacters > 8192
    || request.observations.length > 64) {
    refuse('CONTEXT_BUDGET_INVALID', 'explicit count and character limits required');
  }
  const seen = new Set();
  const normalized = [];
  for (const raw of request.observations) {
    if (!record(raw) || !record(raw.provenance)) {
      refuse('CONTEXT_OBSERVATION_INVALID', 'every observation needs bounded provenance');
    }
    const ownScope = sourceScope(raw.scope);
    if (!sameScope(scope, ownScope)) refuse('CONTEXT_SCOPE_DENIED', 'foreign scope cannot enter this context');
    const id = text(raw.id, 'observation.id');
    const kind = text(raw.kind, 'observation.kind', 32);
    if (!ALLOWED_KINDS.has(kind)) refuse('CONTEXT_OBSERVATION_INVALID', 'unselected observation kind');
    if (seen.has(id)) refuse('CONTEXT_DUPLICATE', 'duplicate observation identity');
    seen.add(id);
    const content = text(raw.content, 'observation.content', 8192);
    normalized.push({
      id, kind, content, scope: ownScope,
      provenance: {
        source: text(raw.provenance.source, 'provenance.source'),
        revision: text(raw.provenance.revision, 'provenance.revision'),
        observedBy: text(raw.provenance.observedBy, 'provenance.observedBy'),
      },
      verification: 'caller-reported',
    });
  }
  normalized.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const selected = [];
  let chars = 0;
  for (const observation of normalized) {
    if (selected.length >= maxEntries || chars + observation.content.length > maxCharacters) break;
    selected.push(observation);
    chars += observation.content.length;
  }
  return {
    kind: 'assembled-context',
    scope, entries: selected,
    budget: { maxEntries, maxCharacters, includedEntries: selected.length,
      includedCharacters: chars, omittedEntries: normalized.length - selected.length },
    modelCalls: null, modelCallEvidence: 'unverified',
    trustedHostAuthorization: false,
    kernelEffectPermit: false,
  };
}
