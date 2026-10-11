/**
 * DomainHarness v0.8 — real ENGINEERING SELF-DOGFOOD Business Domain Package.
 *
 * Not Inventory/Parts renamed: this independent domain governs the SDK's own
 * proposed change → reviewed → validation-passed → release-qualified path.
 * Only business policy, workflow, guards, hard invariant, data-only Rule
 * projections and typed effect handler declarations live here.
 *
 * K owns state/admission/guard/effect/Journal/replay/UNKNOWN, S interprets
 * declared Rules, H owns physical resource dispatch/CAS/authenticated callers.
 * Evidence effects require an H-provisioned resource handler and are not
 * proof of a release until their durable Journal and state are observed.
 */
export const MODULE_ID = 'business-domainharness-engineering@v08.1.0.0';
export const PACKAGE_KIND = 'business';
export const ABI_VERSION = 'v08-business-abi/1';
export const ENDPOINTS = [{ endpointId: 'business:engineering-lifecycle', kind: 'business-policy' }];
export const INTENT_TYPES = ['reviewChange', 'recordValidation', 'qualifyRelease'];
export const EFFECT_TYPES = ['effect:record-engineering-evidence'];

const ref = (path) => ({ source: 'event', path: ['payload', path] });
const lit = (value) => ({ source: 'literal', value });
const eq = (left, right) => ({ op: 'eq', left, right });

const REVIEW_APPROVED = {
  guardId: 'guard:review-approved',
  predicate: { op: 'all', predicates: [
    eq(ref('reviewApproved'), lit(true)),
    { op: 'exists', operand: ref('reviewId') },
    { op: 'exists', operand: ref('changeId') },
  ] },
};
const VALIDATION_PASSED = {
  guardId: 'guard:validation-passed',
  predicate: { op: 'all', predicates: [
    eq(ref('testsPassed'), lit(true)),
    eq(ref('reviewedSha'), ref('testedSha')),
    { op: 'exists', operand: ref('validationId') },
    { op: 'exists', operand: ref('changeId') },
  ] },
};
const RELEASE_QUALIFIED = {
  guardId: 'guard:release-qualified',
  predicate: { op: 'all', predicates: [
    eq(ref('releaseApproved'), lit(true)),
    eq(ref('qualifiedSha'), ref('testedSha')),
    { op: 'exists', operand: ref('validationId') },
    { op: 'exists', operand: ref('changeId') },
  ] },
};
const NO_REVOKED_EVIDENCE = {
  invariantId: 'inv:no-revoked-evidence',
  predicate: { op: 'not', predicate: eq(ref('revoked'), lit(true)) },
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
  const inputFrom = Object.fromEntries(fields.map((name) => [name, ref(name)]));
  return {
    effectType: 'effect:record-engineering-evidence',
    inputFrom,
    idempotencyKeyFrom: { template: `engineering:${stage}:{changeId}` },
  };
}

const workflowDefinition = {
  workflowKey: 'domainharness-engineering',
  initialState: 'change-proposed',
  initialContext: {},
  guards: [REVIEW_APPROVED, VALIDATION_PASSED, RELEASE_QUALIFIED],
  states: [
    {
      stateKey: 'change-proposed',
      transitions: [{
        transitionKey: 'review',
        trigger: { kind: 'event', eventType: 'CHANGE_REVIEWED' },
        targetState: 'reviewed',
        guardId: 'guard:review-approved',
        effectIntents: [evidenceIntent('review', ['changeId', 'reviewId', 'reviewApproved', 'reviewedSha'])],
      }],
    },
    {
      stateKey: 'reviewed',
      transitions: [{
        transitionKey: 'validate',
        trigger: { kind: 'event', eventType: 'VALIDATION_PASSED' },
        targetState: 'validation-passed',
        guardId: 'guard:validation-passed',
        effectIntents: [evidenceIntent('validation', ['changeId', 'validationId', 'testedSha', 'testsPassed'])],
      }],
    },
    {
      stateKey: 'validation-passed',
      transitions: [{
        transitionKey: 'qualify',
        trigger: { kind: 'event', eventType: 'RELEASE_QUALIFIED' },
        targetState: 'release-qualified',
        guardId: 'guard:release-qualified',
        effectIntents: [evidenceIntent('release', ['changeId', 'validationId', 'testedSha', 'qualifiedSha', 'releaseApproved'])],
      }],
    },
    { stateKey: 'release-qualified', kind: 'final' },
  ],
};

export function getPolicy() {
  return {
    packageId: MODULE_ID,
    policyId: 'domainharness-engineering-qualification',
    domainId: 'domainharness-engineering',
    workflowDefinition,
    decisionSchema: receiptSchema,
    governanceSemantics: { hardInvariants: [NO_REVOKED_EVIDENCE] },
    initialStateKey: 'change-proposed',
    initialContext: {},
    rules: {
      'rule:review-change': { ruleId: 'rule:review-change', eventType: 'CHANGE_REVIEWED', payloadFromInput: {
        changeId: 'changeId', reviewId: 'reviewId', reviewedSha: 'reviewedSha',
        reviewApproved: 'reviewApproved', revoked: 'revoked',
      } },
      'rule:record-validation': { ruleId: 'rule:record-validation', eventType: 'VALIDATION_PASSED', payloadFromInput: {
        changeId: 'changeId', validationId: 'validationId', reviewedSha: 'reviewedSha',
        testedSha: 'testedSha', testsPassed: 'testsPassed', revoked: 'revoked',
      } },
      'rule:qualify-release': { ruleId: 'rule:qualify-release', eventType: 'RELEASE_QUALIFIED', payloadFromInput: {
        changeId: 'changeId', validationId: 'validationId', testedSha: 'testedSha',
        qualifiedSha: 'qualifiedSha', releaseApproved: 'releaseApproved', revoked: 'revoked',
      } },
    },
    intentBindings: {
      reviewChange: {
        trigger: { kind: 'event', eventType: 'CHANGE_REVIEWED' },
        ruleId: 'rule:review-change', roles: ['reviewer'],
      },
      recordValidation: {
        trigger: { kind: 'event', eventType: 'VALIDATION_PASSED' },
        ruleId: 'rule:record-validation', roles: ['validator'],
      },
      qualifyRelease: {
        trigger: { kind: 'event', eventType: 'RELEASE_QUALIFIED' },
        ruleId: 'rule:qualify-release', roles: ['release-manager'],
      },
    },
    effectBindings: {
      'effect:record-engineering-evidence': {
        semantics: 'idempotent',
        handler: async ({ input, effectId, idempotencyKey, resources }) => {
          if (!resources || typeof resources.call !== 'function') {
            throw new Error('engineering evidence effect requires authenticated physical Host resource port');
          }
          return resources.call('engineering-evidence', 'append', { input, effectId, idempotencyKey });
        },
      },
    },
  };
}
