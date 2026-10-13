/**
 * Business Domain Package — D3 engineering lineage v1.0.0
 * (#1005 D3-K fixture; NOT PR #1012 bytes).
 * ========================================================
 *
 * A D3-K-Builder-authored test package exercising the selected Kernel's
 * declarative state-context projection (#1005@6130149429). It keeps the
 * engineering lifecycle shape (change-proposed → reviewed →
 * validation-passed → release-qualified, per-intent single-stage
 * definitions, idempotent evidence effects) and adds what the original D3
 * contract lacked:
 *
 *   - each stage's transition declares a data-only `contextProjection` of
 *     its own rule-authorized evidence, which K commits into the next
 *     instance context inside the same state CAS write;
 *   - validation / release guards compare the NEW event with the durably
 *     COMMITTED lineage (`context` operands) instead of with itself.
 *
 * The #1012 Business owner adapts the real examples package separately.
 * This package owns business policy ONLY — no admission/journal/state code.
 *
 * Kernel ABI: v08-business-abi/1 — endpoint export `getPolicy()`.
 */
export const MODULE_ID = 'business-d3-engineering-lineage@v08.1.0.0';
export const PACKAGE_KIND = 'business';
export const ABI_VERSION = 'v08-business-abi/1';
export const ENDPOINTS = [{ endpointId: 'business:d3-engineering-lineage', kind: 'business-policy' }];
export const INTENT_TYPES = ['reviewChange', 'recordValidation', 'qualifyRelease'];
export const EFFECT_TYPES = ['effect:record-engineering-evidence'];

const ev = (key) => ({ source: 'event', path: ['payload', key] });
const ctx = (key) => ({ source: 'context', path: [key] });
const lit = (value) => ({ source: 'literal', value });
const eq = (left, right) => ({ op: 'eq', left, right });
const proj = (key) => ({ source: 'event', path: ['payload', key], type: 'string' });

const REVIEW_APPROVED = {
  guardId: 'guard:review-approved',
  predicate: { op: 'all', predicates: [
    eq(ev('reviewApproved'), lit(true)),
    { op: 'exists', operand: ev('changeId') },
    { op: 'exists', operand: ev('reviewedSha') },
  ] },
};
const VALIDATION_PASSED = {
  guardId: 'guard:validation-passed',
  predicate: { op: 'all', predicates: [
    eq(ev('testsPassed'), lit(true)),
    { op: 'exists', operand: ev('validationId') },
    eq(ev('changeId'), ctx('changeId')),
    eq(ev('testedSha'), ctx('reviewedSha')),
  ] },
};
const RELEASE_QUALIFIED = {
  guardId: 'guard:release-qualified',
  predicate: { op: 'all', predicates: [
    eq(ev('releaseApproved'), lit(true)),
    eq(ev('changeId'), ctx('changeId')),
    eq(ev('validationId'), ctx('validationId')),
    eq(ev('testedSha'), ctx('testedSha')),
    eq(ev('qualifiedSha'), ctx('testedSha')),
  ] },
};

const receiptSchema = {
  isValid(value) {
    return value !== null
      && typeof value === 'object'
      && !Array.isArray(value)
      && typeof value.decision?.outcome === 'string'
      && typeof value.event?.type === 'string';
  },
};

function evidenceIntent(stage, fields) {
  return {
    effectType: 'effect:record-engineering-evidence',
    inputFrom: Object.fromEntries(fields.map((name) => [name, ev(name)])),
    idempotencyKeyFrom: { template: `engineering:${stage}:{changeId}` },
  };
}

function stage(stateKey, transition, targetState, final = false) {
  return {
    workflowKey: 'd3-engineering-lineage',
    initialState: 'change-proposed',
    initialContext: {},
    guards: [REVIEW_APPROVED, VALIDATION_PASSED, RELEASE_QUALIFIED],
    states: [
      { stateKey, transitions: [transition] },
      { stateKey: targetState, ...(final ? { kind: 'final' } : {}) },
    ],
  };
}

const reviewTransition = {
  transitionKey: 'review',
  trigger: { kind: 'event', eventType: 'CHANGE_REVIEWED' },
  targetState: 'reviewed',
  guardId: 'guard:review-approved',
  effectIntents: [evidenceIntent('review', ['changeId', 'reviewedSha'])],
  contextProjection: { changeId: proj('changeId'), reviewedSha: proj('reviewedSha') },
};
const validateTransition = {
  transitionKey: 'validate',
  trigger: { kind: 'event', eventType: 'VALIDATION_PASSED' },
  targetState: 'validation-passed',
  guardId: 'guard:validation-passed',
  effectIntents: [evidenceIntent('validation', ['changeId', 'validationId', 'testedSha'])],
  contextProjection: { changeId: proj('changeId'), validationId: proj('validationId'), testedSha: proj('testedSha') },
};
const qualifyTransition = {
  transitionKey: 'qualify',
  trigger: { kind: 'event', eventType: 'RELEASE_QUALIFIED' },
  targetState: 'release-qualified',
  guardId: 'guard:release-qualified',
  effectIntents: [evidenceIntent('release', ['changeId', 'validationId', 'qualifiedSha'])],
  contextProjection: { qualifiedSha: proj('qualifiedSha') },
};

export function getPolicy() {
  return {
    packageId: MODULE_ID,
    policyId: 'd3-engineering-lineage',
    domainId: 'domainharness-engineering',
    workflowDefinition: stage('change-proposed', reviewTransition, 'reviewed'),
    decisionSchema: receiptSchema,
    governanceSemantics: { hardInvariants: [] },
    initialStateKey: 'change-proposed',
    initialContext: {},
    rules: {
      'rule:review-change': { ruleId: 'rule:review-change', eventType: 'CHANGE_REVIEWED', payloadFromInput: {
        changeId: 'changeId', reviewedSha: 'reviewedSha', reviewApproved: 'reviewApproved',
      } },
      'rule:record-validation': { ruleId: 'rule:record-validation', eventType: 'VALIDATION_PASSED', payloadFromInput: {
        changeId: 'changeId', validationId: 'validationId', testedSha: 'testedSha', testsPassed: 'testsPassed',
      } },
      'rule:qualify-release': { ruleId: 'rule:qualify-release', eventType: 'RELEASE_QUALIFIED', payloadFromInput: {
        changeId: 'changeId', validationId: 'validationId', testedSha: 'testedSha',
        qualifiedSha: 'qualifiedSha', releaseApproved: 'releaseApproved',
      } },
    },
    intentBindings: {
      reviewChange: {
        trigger: { kind: 'event', eventType: 'CHANGE_REVIEWED' },
        ruleId: 'rule:review-change', roles: ['reviewer'],
        definition: stage('change-proposed', reviewTransition, 'reviewed'),
      },
      recordValidation: {
        trigger: { kind: 'event', eventType: 'VALIDATION_PASSED' },
        ruleId: 'rule:record-validation', roles: ['validator'],
        definition: stage('reviewed', validateTransition, 'validation-passed'),
      },
      qualifyRelease: {
        trigger: { kind: 'event', eventType: 'RELEASE_QUALIFIED' },
        ruleId: 'rule:qualify-release', roles: ['release-manager'],
        definition: stage('validation-passed', qualifyTransition, 'release-qualified', true),
      },
    },
    effectBindings: {
      'effect:record-engineering-evidence': {
        semantics: 'idempotent',
        handler: async ({ input, effectId, idempotencyKey, resources }) => {
          if (!resources || typeof resources.call !== 'function') {
            throw new Error('engineering evidence effect requires the physical Host resource port');
          }
          return resources.call('engineering-evidence', 'append', { input, effectId, idempotencyKey });
        },
      },
    },
  };
}
