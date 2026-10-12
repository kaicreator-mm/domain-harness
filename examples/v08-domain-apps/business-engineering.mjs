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
 *
 * [#1013 interface adaptation, proven necessary by the fixed integration
 * contract] Base bytes: PR #1012@9f6aaf4 examples/v08-domain-apps/
 * business-engineering.mjs (sha256 d0f84aa6bde4e5a7be85f3f26b0c7b74eed9d70d
 * cb7f655b5446ab677a02afd2). The selected Kernel's one-time dynamic
 * effect-binding wiring validation (kernel-mechanism-v1.mjs
 * wireAdmissionEffectBindings, [Controller 090 repair]) authorizes each
 * intent's inputFrom/idempotencyKeyFrom fields ONLY against THAT intent's
 * rule projection, and reads `binding.definition ?? workflowDefinition` —
 * with the shared three-stage default definition the validate/qualify
 * stages' evidence fields (validationId, testedSha, testsPassed,
 * qualifiedSha, releaseApproved) are outside rule:review-change's
 * projection and the mechanism activation fails typed
 * (ACTIVATION_FAILED). The minimal contract-compatible adaptation — same
 * states, transitions, guards, evidence semantics, roles and projections —
 * is a per-intent single-stage `definition` (the same pattern the Approval
 * package already uses for submitQuoteDecisionDynamic/Strict). The default
 * workflowDefinition above is byte-unchanged. The T-F owner should apply
 * this same adaptation to the examples source before T-F E2E.
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

/**
 * [#1013] Per-intent single-stage definition: each intent's dynamic evidence
 * binding is validated (and executed) against its OWN stage only, keeping
 * every inputFrom field inside that intent's rule-authorized projection.
 * The transition/guard/effect semantics are identical to the default
 * workflowDefinition above.
 */
function stageDefinition(stateKey) {
  const stage = workflowDefinition.states.find((state) => state.stateKey === stateKey);
  const target = workflowDefinition.states.find((state) => state.stateKey === stage.transitions[0].targetState);
  return {
    workflowKey: workflowDefinition.workflowKey,
    initialState: workflowDefinition.initialState,
    initialContext: workflowDefinition.initialContext,
    guards: workflowDefinition.guards,
    states: [
      stage,
      // The target state is reached WITHOUT its outgoing transition: a
      // stage definition carries exactly one admissible transition, so no
      // other stage's evidence fields enter this intent's authorization.
      { stateKey: target.stateKey, ...(target.kind !== undefined ? { kind: target.kind } : {}) },
    ],
  };
}

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
        definition: stageDefinition('change-proposed'),
      },
      recordValidation: {
        trigger: { kind: 'event', eventType: 'VALIDATION_PASSED' },
        ruleId: 'rule:record-validation', roles: ['validator'],
        definition: stageDefinition('reviewed'),
      },
      qualifyRelease: {
        trigger: { kind: 'event', eventType: 'RELEASE_QUALIFIED' },
        ruleId: 'rule:qualify-release', roles: ['release-manager'],
        definition: stageDefinition('validation-passed'),
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
