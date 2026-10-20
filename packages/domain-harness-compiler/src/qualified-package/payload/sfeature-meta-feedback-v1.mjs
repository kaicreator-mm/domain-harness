/**
 * v0.10 T09 (#1178) — optional pure Standard proposal normalizer.
 *
 * The Host owns the durable evidence/candidate/Shadow records and the
 * selected Business workflow turn. This feature only turns bounded,
 * already-observed data into at most four deterministic PROPOSAL records.
 * It grants no approval/promotion/activation/publication/Effect authority,
 * accepts no caller callbacks or Host ports, and never reports physical
 * evidence it did not itself observe.
 */
export const MODULE_ID = 'sfeature-meta-feedback@v010.1.0.0';
export const PACKAGE_KIND = 'standard-feature';
export const FEATURE_ABI = 'dh.v10.standard-feature/1';
export const FEATURE_KEY = 'standard:meta-feedback/1';

const MAX_OBSERVATIONS = 8;
const MAX_PROPOSALS = 4;
const MAX_JSON_CHARS = 32_768;
const MAX_NODES = 1024;
const MAX_DEPTH = 24;
const MAX_REFS = 4;
const MAX_REF_CHARS = 256;
const MAX_SUMMARY_CHARS = 240;

/** Keys that would smuggle authority/effect semantics into proposal material. */
const AUTHORITY_KEYS = new Set([
  'approve', 'approved', 'approval', 'promote', 'promotion', 'activate',
  'activation', 'publish', 'publication', 'selfApprove', 'effectIntents',
  'effectPermit', 'permit', 'effectJournal', 'admissionFence', 'kernelState',
  'kernelReceipt', 'hostPorts', 'resources', 'write', 'apply', 'execute',
  'dispatch', 'hotSwap', '__proto__', 'prototype', 'constructor',
]);
/** Explicitly-false negative capability flags are evidence, not authority. */
const SAFE_FALSE_FLAGS = new Set([
  'canSelfApprove', 'canPromote', 'canActivate', 'canPublish', 'kernelEffectPermit',
]);

class MetaFeedbackFeatureError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'MetaFeedbackFeatureError';
    this.code = code;
  }
}

function refuse(code, message) {
  throw new MetaFeedbackFeatureError(code, message);
}

function plain(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map((item) => canonical(item)).join(',') + ']';
  return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
}

function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function snapshot(value, state, depth = 0) {
  state.nodes += 1;
  if (state.nodes > MAX_NODES || depth > MAX_DEPTH) {
    refuse('META_FEEDBACK_DATA_INVALID', 'bounded plain data required');
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value))) return value;
  if (Array.isArray(value)) {
    if (value.length > 64) refuse('META_FEEDBACK_DATA_INVALID', 'array too large');
    const result = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (descriptor === undefined || !Object.hasOwn(descriptor, 'value')) {
        refuse('META_FEEDBACK_DATA_INVALID', 'sparse or accessor array');
      }
      result.push(snapshot(descriptor.value, state, depth + 1));
    }
    return result;
  }
  if (!plain(value)) refuse('META_FEEDBACK_DATA_INVALID', 'plain noncyclic data required');
  const keys = Object.keys(value);
  if (keys.length > 64) refuse('META_FEEDBACK_DATA_INVALID', 'record too large');
  const result = Object.create(null);
  for (const key of keys) {
    if (AUTHORITY_KEYS.has(key)) {
      refuse('META_FEEDBACK_AUTHORITY_FORBIDDEN', 'proposal input cannot carry authority or effect material');
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !Object.hasOwn(descriptor, 'value')) {
      refuse('META_FEEDBACK_DATA_INVALID', 'accessor property');
    }
    if (SAFE_FALSE_FLAGS.has(key) && descriptor.value !== false) {
      refuse('META_FEEDBACK_AUTHORITY_FORBIDDEN', 'a capability flag may only be explicitly false');
    }
    result[key] = snapshot(descriptor.value, state, depth + 1);
  }
  return result;
}

function refsOf(raw) {
  if (!Array.isArray(raw)) return [];
  const refs = [];
  for (const item of raw) {
    if (refs.length >= MAX_REFS) break;
    if (typeof item === 'string' && item.length > 0 && item.length <= MAX_REF_CHARS) refs.push(item);
  }
  return refs;
}

function proposal(kind, summaryText, evidenceRefs) {
  const summary = summaryText.length > MAX_SUMMARY_CHARS
    ? summaryText.slice(0, MAX_SUMMARY_CHARS)
    : summaryText;
  const refs = refsOf(evidenceRefs);
  return Object.freeze({
    proposalId: 'p-' + kind + '-' + fnv1a(canonical([kind, summary, refs])),
    kind,
    summary,
    evidenceRefs: Object.freeze(refs),
    authority: 'proposal-only',
    canApply: false,
  });
}

export function init(context) {
  return { ok: true, featureKey: FEATURE_KEY, observedContext: { appId: context.appId } };
}

/**
 * Pure selected Standard feature entry point.
 * @param {{observations?: unknown, candidate?: unknown, shadow?: unknown}} request
 * @returns proposal-only bounded report
 */
export function proposeMetaFeedback(request) {
  if (!plain(request)) {
    refuse('META_FEEDBACK_REQUEST_INVALID', 'meta feedback request must be a plain record');
  }
  const allowed = new Set(['observations', 'candidate', 'shadow']);
  for (const key of Object.keys(request)) {
    if (!allowed.has(key)) {
      refuse('META_FEEDBACK_REQUEST_INVALID', 'unsupported meta feedback request field ' + key);
    }
  }
  const state = { nodes: 0 };
  const observationsRaw = request.observations === undefined ? [] : request.observations;
  if (!Array.isArray(observationsRaw)) {
    refuse('META_FEEDBACK_REQUEST_INVALID', 'observations must be an array');
  }
  if (observationsRaw.length > MAX_OBSERVATIONS) {
    refuse('META_FEEDBACK_OVERSIZED', 'too many observations');
  }
  const observations = snapshot(observationsRaw, state);
  const candidate = request.candidate === undefined ? null : snapshot(request.candidate, state);
  const shadow = request.shadow === undefined ? null : snapshot(request.shadow, state);
  if (candidate !== null && !plain(candidate)) {
    refuse('META_FEEDBACK_REQUEST_INVALID', 'candidate must be a plain record');
  }
  if (shadow !== null && !plain(shadow)) {
    refuse('META_FEEDBACK_REQUEST_INVALID', 'shadow must be a plain record');
  }
  if (canonical([observations, candidate, shadow]).length > MAX_JSON_CHARS) {
    refuse('META_FEEDBACK_OVERSIZED', 'proposal input exceeds the bounded size');
  }

  const proposals = [];
  for (let index = 0; index < observations.length; index += 1) {
    const observation = observations[index];
    if (!plain(observation)) {
      refuse('META_FEEDBACK_REQUEST_INVALID', 'each observation must be a plain record');
    }
    const kernelOutcome = observation.kernelOutcome;
    const semanticOutcome = observation.semanticOutcome;
    const source = observation.source;
    if (kernelOutcome !== 'admitted' || semanticOutcome === 'unavailable' || source === 'unavailable') {
      const kernelObservation = plain(observation.kernelObservation) ? observation.kernelObservation : {};
      const receiptSha256 = kernelObservation.receiptSha256;
      proposals.push(proposal(
        'observe-gap',
        'observation ' + String(index) + ' reports kernel=' + String(kernelOutcome ?? 'unobserved')
          + ' semantic=' + String(semanticOutcome ?? source ?? 'unknown'),
        [typeof receiptSha256 === 'string' && receiptSha256.length <= MAX_REF_CHARS
          ? receiptSha256 : 'observation:' + String(index)],
      ));
    }
  }

  if (candidate !== null) {
    const differing = Array.isArray(candidate.differingCaseIds) ? candidate.differingCaseIds : [];
    if (candidate.status !== 'reported-match' || differing.length > 0) {
      const pin = plain(candidate.candidate) ? candidate.candidate : {};
      proposals.push(proposal(
        'review-candidate',
        'candidate report status ' + String(candidate.status)
          + ' with ' + String(differing.length) + ' differing case(s)',
        [typeof pin.sha256 === 'string' && pin.sha256.length <= MAX_REF_CHARS
          ? pin.sha256 : 'candidate:reported'],
      ));
    }
  }

  if (shadow !== null) {
    const verified = shadow.productionWritesVerifiedZero === true;
    if (shadow.status !== 'match' || !verified) {
      proposals.push(proposal(
        'shadow-integrity',
        'shadow status ' + String(shadow.status)
          + '; production writes verified zero=' + String(verified),
        [typeof shadow.replayDigest === 'string' && shadow.replayDigest.length <= MAX_REF_CHARS
          ? shadow.replayDigest : 'shadow:reported'],
      ));
    }
  }

  if (proposals.length === 0) {
    proposals.push(proposal(
      'no-action',
      'all consumed observations are admitted and the provided reports are clean',
      [],
    ));
  }
  if (proposals.length > MAX_PROPOSALS) proposals.length = MAX_PROPOSALS;

  const result = {
    kind: 'proposal-only',
    proposals: Object.freeze(proposals),
    counters: Object.freeze({ observations: observations.length, proposals: proposals.length }),
    budget: Object.freeze({ maxProposals: MAX_PROPOSALS }),
    proposalOnly: true,
    canApprove: false,
    canPromote: false,
    canActivate: false,
    canPublish: false,
    kernelEffectPermit: false,
  };
  if (canonical(result).length > MAX_JSON_CHARS) {
    refuse('META_FEEDBACK_OVERSIZED', 'proposal output exceeds the bounded size');
  }
  for (const key of Object.keys(result)) Object.freeze(result[key]);
  return Object.freeze(result);
}
