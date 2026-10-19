/**
 * v0.10 T07 — optional pure Standard Candidate/Shadow Evidence feature.
 *
 * This is a REPORT VALIDATOR, not the Host's execution sandbox or a
 * promotion/approval engine. Real Shadow L4 runs against a Host-isolated
 * read-only observer; the report here is NEVER physical zero-write proof.
 */
export const MODULE_ID = 'sfeature-candidate-validation@v010.1.0.0';
export const PACKAGE_KIND = 'standard-feature';
export const FEATURE_ABI = 'dh.v10.standard-feature/1';
export const FEATURE_KEY = 'standard:candidate-validation/1';

const KINDS = new Set(['Rule', 'Skill', 'DecisionProcedure', 'Workflow']);
const BLOCKED = new Set([
  '__proto__', 'prototype', 'constructor', 'effectPermit', 'permit',
  'effectIntents', 'effectJournal', 'admissionFence', 'kernelState',
  'kernelReceipt', 'hostPorts', 'resources', 'write', 'activate',
  'selfApprove', 'promote',
]);
class CandidateValidationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CandidateValidationError';
    this.code = code;
  }
}
function refuse(code, message) { throw new CandidateValidationError(code, message); }
function plain(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
}
function id(v, name) {
  if (typeof v !== 'string' || !v || v.length > 256) {
    refuse('CANDIDATE_ID_INVALID', name + ' requires bounded nonempty string');
  }
  return v;
}
function snapshot(v) {
  const seen = new WeakSet();
  let nodes = 0;
  const clone = (x, depth = 0) => {
    if (++nodes > 512 || depth > 24) refuse('CANDIDATE_DATA_INVALID', 'bounded plain data required');
    if (x === null || typeof x === 'string' || typeof x === 'boolean'
      || (typeof x === 'number' && Number.isFinite(x))) return x;
    if (Array.isArray(x)) {
      if (seen.has(x) || x.length > 64 || Object.keys(x).length !== x.length) {
        refuse('CANDIDATE_DATA_INVALID', 'array malformed/too large');
      }
      seen.add(x);
      const result = [];
      for (let i = 0; i < x.length; i++) {
        if (!Object.hasOwn(x, i)) refuse('CANDIDATE_DATA_INVALID', 'sparse array');
        const d = Object.getOwnPropertyDescriptor(x, String(i));
        if (!d || !Object.hasOwn(d, 'value')) refuse('CANDIDATE_DATA_INVALID', 'array accessor');
        result.push(clone(d.value, depth + 1));
      }
      seen.delete(x);
      return result;
    }
    if (!plain(x) || seen.has(x) || Object.keys(x).length > 64) {
      refuse('CANDIDATE_DATA_INVALID', 'plain noncyclic bounded data required');
    }
    seen.add(x);
    const result = Object.create(null);
    for (const key of Object.keys(x)) {
      if (BLOCKED.has(key)) refuse('CANDIDATE_AUTHORITY_FORBIDDEN', 'candidate report cannot carry privileged authority');
      const d = Object.getOwnPropertyDescriptor(x, key);
      if (!d || !Object.hasOwn(d, 'value')) refuse('CANDIDATE_DATA_INVALID', 'accessor property');
      result[key] = clone(d.value, depth + 1);
    }
    seen.delete(x);
    return result;
  };
  const copied = clone(v);
  if (JSON.stringify(copied).length > 32768) refuse('CANDIDATE_DATA_INVALID', 'report byte size exceeds bound');
  return copied;
}
function pin(raw, name) {
  if (!plain(raw)) refuse('CANDIDATE_PIN_INVALID', name + ' pin missing');
  const kind = id(raw.kind, name + '.kind');
  if (!KINDS.has(kind)) refuse('CANDIDATE_PIN_INVALID', 'unsupported candidate kind');
  const sha256 = id(raw.sha256, name + '.sha256');
  if (!/^[a-f0-9]{64}$/.test(sha256)) refuse('CANDIDATE_PIN_INVALID', 'exact 64-hex digest required');
  const approvalState = id(raw.approvalState, name + '.approvalState');
  if (!['candidate', 'approved', 'revoked'].includes(approvalState)) {
    refuse('CANDIDATE_PIN_INVALID', 'approval state must be explicit');
  }
  const revision = id(raw.revision, name + '.revision');
  const provenance = id(raw.provenance, name + '.provenance');
  if (/^(?:latest|\*|head)$/i.test(revision) || /^(?:latest|\*|head)$/i.test(provenance)) {
    refuse('CANDIDATE_PIN_INVALID', 'exact revision and provenance required; latest/HEAD is not a pin');
  }
  return Object.freeze({
    kind, id: id(raw.id, name + '.id'), revision,
    sha256, provenance, approvalState,
  });
}
function pinIdentity(p) {
  return JSON.stringify([p.kind, p.id, p.revision, p.sha256, p.provenance]);
}
function canonical(v) {
  if (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
    return JSON.stringify(v);
  }
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  return '{' + Object.keys(v).sort().map(key => JSON.stringify(key) + ':' + canonical(v[key])).join(',') + '}';
}

export function init(context) {
  return { ok: true, featureKey: FEATURE_KEY, observedContext: { appId: context.appId } };
}

/**
 * Validates bounded *reported* counterexamples against a pinned candidate and
 * an exactly approved baseline. This function NEVER executes/evaluates the
 * candidate; caller-reported results are not physical Shadow L4 proof.
 * Host-only Shadow runner must independently attest immutable production
 * snapshot, zero writes, evaluator result and provenance before promotion.
 */
export function validateCandidateReport(request) {
  if (!plain(request) || !plain(request.budget) || !Array.isArray(request.cases)) {
    refuse('CANDIDATE_REQUEST_INVALID', 'candidate report needs pins, budget and cases');
  }
  const data = snapshot(request);
  const candidate = pin(data.candidate, 'candidate');
  const baseline = pin(data.approvedFallback, 'approvedFallback');
  if (candidate.kind !== baseline.kind) refuse('CANDIDATE_KIND_MISMATCH', 'baseline kind differs');
  if (candidate.approvalState === 'revoked') {
    refuse('CANDIDATE_REVOKED', 'revoked candidate cannot enter shadow evaluation');
  }
  if (baseline.approvalState !== 'approved') {
    refuse('CANDIDATE_FALLBACK_NOT_APPROVED', 'fallback must be exactly approved and pinned');
  }
  const { maxCases, maxComparisons } = data.budget;
  if (!Number.isSafeInteger(maxCases) || maxCases < 1 || maxCases > 32
    || !Number.isSafeInteger(maxComparisons) || maxComparisons < 1 || maxComparisons > 32
    || data.cases.length > maxCases) {
    refuse('CANDIDATE_BUDGET_INVALID', 'bounded case/compare budgets required');
  }
  if (pinIdentity(candidate) === pinIdentity(baseline)) {
    refuse('CANDIDATE_IDENTICAL_TO_BASELINE', 'candidate and baseline must be distinct exact revisions/digests');
  }
  const seen = new Set();
  const mismatches = [];
  const passed = [];
  let comparisons = 0;
  for (const item of data.cases) {
    if (!plain(item) || typeof item.id !== 'string') {
      refuse('CANDIDATE_CASE_INVALID', 'each case needs explicit id');
    }
    const caseId = id(item.id, 'case.id');
    if (seen.has(caseId)) refuse('CANDIDATE_CASE_DUPLICATE', 'case identity must be unique');
    seen.add(caseId);
    if (item.candidatePinSha256 !== candidate.sha256 || item.baselinePinSha256 !== baseline.sha256) {
      refuse('CANDIDATE_CASE_PIN_MISMATCH', 'case outcome does not reference the exact pinned candidate and fallback');
    }
    if (!Object.hasOwn(item, 'candidateOutput') || !Object.hasOwn(item, 'baselineOutput')) {
      refuse('CANDIDATE_CASE_INVALID', 'case requires both reported outputs');
    }
    if (++comparisons > maxComparisons) refuse('CANDIDATE_BUDGET_EXHAUSTED', 'comparison budget exhausted');
    const same = canonical(item.candidateOutput) === canonical(item.baselineOutput);
    (same ? passed : mismatches).push(caseId);
  }
  return Object.freeze({
    kind: 'candidate-evidence-report',
    candidate, approvedFallback: baseline,
    comparisons, matchingCaseIds: Object.freeze(passed),
    differingCaseIds: Object.freeze(mismatches),
    status: mismatches.length === 0 ? 'reported-match' : 'reported-difference',
    evidenceAuthority: 'caller-reported-not-host-verified',
    productionWritesVerifiedZero: false,
    canSelfApprove: false, canPromote: false, kernelEffectPermit: false,
  });
}
