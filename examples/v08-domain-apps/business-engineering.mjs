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
 * workflowDefinition above is byte-unchanged.
 *
 * [#1005 D3 lineage, after Kernel PR #1034] Each stage transition now
 * declares a `contextProjection` of its own rule-authorized evidence
 * (changeId, reviewedSha, validationId, testedSha, qualifiedSha). The
 * selected Kernel validates the declarations once at wiring, resolves them
 * after guard/invariant admission and before any Journal write or Effect
 * dispatch, and commits the projected fields into the NEXT instance
 * context inside the SAME state CAS write that moves the state
 * (write-once: only the identical committed value may be re-projected).
 * The validation and release guards therefore no longer compare fields of
 * the submitted event with each other (a self-consistent FORGED envelope
 * passed them, #1005@6127134676); they compare the NEW event with the
 * durably COMMITTED lineage through `context` operands — validation must
 * carry the reviewed changeId and exactly the reviewedSha it tests, and
 * release must carry the same changeId, the same validationId and test
 * exactly the committed testedSha it qualifies. No K/Journal/State
 * mechanism lives in B; the projections are pure data-only declarations.
 */
export const MODULE_ID = 'business-domainharness-engineering@v08.1.0.0';
export const PACKAGE_KIND = 'business';
export const ABI_VERSION = 'v08-business-abi/1';
export const ENDPOINTS = [{ endpointId: 'business:engineering-lifecycle', kind: 'business-policy' }];
export const INTENT_TYPES = ['reviewChange', 'recordValidation', 'qualifyRelease'];
export const EFFECT_TYPES = ['effect:record-engineering-evidence'];

const ref = (path) => ({ source: 'event', path: ['payload', path] });
const ctx = (path) => ({ source: 'context', path: [path] });
const lit = (value) => ({ source: 'literal', value });
const eq = (left, right) => ({ op: 'eq', left, right });
const proj = (key) => ({ source: 'event', path: ['payload', key], type: 'string' });

const REVIEW_APPROVED = {
  guardId: 'guard:review-approved',
  predicate: { op: 'all', predicates: [
    eq(ref('reviewApproved'), lit(true)),
    { op: 'exists', operand: ref('reviewId') },
    { op: 'exists', operand: ref('changeId') },
  ] },
};
// [#1005 D3 lineage] The tested change must BE the reviewed change: both the
// changeId and the exact reviewedSha are compared with the lineage K
// committed into the instance context by the review transition.
const VALIDATION_PASSED = {
  guardId: 'guard:validation-passed',
  predicate: { op: 'all', predicates: [
    eq(ref('testsPassed'), lit(true)),
    eq(ref('changeId'), ctx('changeId')),
    eq(ref('testedSha'), ctx('reviewedSha')),
    { op: 'exists', operand: ref('validationId') },
    { op: 'exists', operand: ref('changeId') },
  ] },
};
// [#1005 D3 lineage] A release attests the EXACT validated artifact: the
// same changeId, the very validationId K committed, and a qualifiedSha
// equal to the committed testedSha of that validation.
const RELEASE_QUALIFIED = {
  guardId: 'guard:release-qualified',
  predicate: { op: 'all', predicates: [
    eq(ref('releaseApproved'), lit(true)),
    eq(ref('changeId'), ctx('changeId')),
    eq(ref('validationId'), ctx('validationId')),
    eq(ref('testedSha'), ctx('testedSha')),
    eq(ref('qualifiedSha'), ctx('testedSha')),
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
        // [#1005 D3 lineage] K commits the reviewed change identity into the
        // next instance context with the same CAS write that moves the state.
        contextProjection: { changeId: proj('changeId'), reviewedSha: proj('reviewedSha') },
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
        // [#1005 D3 lineage] changeId re-projects the identical committed
        // value (write-once); the validated artifact identity becomes durable.
        contextProjection: { changeId: proj('changeId'), validationId: proj('validationId'), testedSha: proj('testedSha') },
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
        // [#1005 D3 lineage] The qualified SHA is pinned into the terminal
        // context so the release attestation itself is durable lineage.
        contextProjection: { qualifiedSha: proj('qualifiedSha') },
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
        resource: { key: 'engineering-evidence', operation: 'append' },
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
