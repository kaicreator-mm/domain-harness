/**
 * Business Domain Package — BUILD-bound feature decision v1.0.0 (#1267).
 * ========================================================================
 *
 * A #1267 fixture Business package whose `submitFeatureDecision` and
 * `submitFeatureReview` intents are the BUILD-bound decision routes: their
 * compiled `semantic-decision` rules carry the canonical `declarationDigest`
 * the selected Kernel verifies at its trusted load boundary, and the policy
 * carries the `featureDecisions` material the trusted activation seam wires
 * into the S Primary's dispatcher — the T02 feature request material and the
 * finite outcome→event map (AW-01). Each declaration holds NO inline
 * disposition: it declares `unavailable` (its resolution is reserved to the
 * bound feature), so removing the delegation fails closed to the typed
 * zero-effect SEMANTIC_UNAVAILABLE terminal instead of silently falling back
 * to the S Primary interpreter.
 *
 * The two intents carry DIFFERENT binding triggers (QUOTE_DECIDED /
 * QUOTE_REVIEWED), so the finite outcome→event mapping is OBSERVABLE: an
 * 'approved' outcome must land the approve transition, a 'review' outcome
 * the escalate transition. The approve transition is guarded at amount <= 50
 * and NO ungated QUOTE_DECIDED fallback exists, so the guard-denial receipt
 * stays reachable for an 'approved' outcome above 50.
 *
 * `submitPlainDecision` stays a historical UNBOUND plain-rule intent so the
 * base-vs-head receipt equivalence of unbound turns is provable inside one
 * dispatcher-wired App.
 *
 * This package owns business policy ONLY — no admission/journal/state
 * mechanism code, no kernel imports, no model calls.
 *
 * Kernel ABI: v08-business-abi/1 — endpoint export `getPolicy()`.
 */

export const MODULE_ID = 'business-feature-decision@v010.1.0.0';
export const PACKAGE_KIND = 'business';
export const ABI_VERSION = 'v08-business-abi/1';
export const ENDPOINTS = [
  { endpointId: 'business:feature-decision', kind: 'business-policy' },
];

export const INTENT_TYPES = ['submitFeatureDecision', 'submitFeatureReview', 'submitPlainDecision'];
export const EFFECT_TYPES = ['effect:reserve'];

const CAP_INVARIANT = {
  invariantId: 'inv:cap-100',
  predicate: {
    op: 'not',
    predicate: {
      op: 'gt',
      left: { source: 'event', path: ['payload', 'amount'] },
      right: { source: 'literal', value: 100 },
    },
  },
};

const GUARD_AMOUNT_OK = {
  guardId: 'guard:amount-ok',
  predicate: {
    op: 'lte',
    left: { source: 'event', path: ['payload', 'amount'] },
    right: { source: 'literal', value: 50 },
  },
};

function makeDefinition() {
  return {
    workflowKey: 'order-quote',
    initialState: 'review',
    initialContext: {},
    guards: [GUARD_AMOUNT_OK],
    states: [
      {
        stateKey: 'review',
        transitions: [
          {
            transitionKey: 'approve',
            trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
            targetState: 'approved',
            guardId: 'guard:amount-ok',
            effectIntents: [
              {
                effectType: 'effect:reserve',
                input: { reservation: 'quote', amount: 42 },
                idempotencyKey: 'reserve:quote:1',
              },
            ],
          },
          {
            // The distinct QUOTE_REVIEWED trigger makes the finite
            // outcome→event map OBSERVABLE: a 'review' outcome must land
            // here, never on the QUOTE_DECIDED transition.
            transitionKey: 'escalate',
            trigger: { kind: 'event', eventType: 'QUOTE_REVIEWED' },
            targetState: 'escalated',
          },
        ],
      },
      { stateKey: 'approved', kind: 'final' },
      { stateKey: 'escalated', kind: 'final' },
    ],
  };
}

const decisionSchema = {
  isValid(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const decision = value.decision;
    const event = value.event;
    if (typeof decision !== 'object' || decision === null || Array.isArray(decision)) return false;
    if (typeof event !== 'object' || event === null || Array.isArray(event)) return false;
    return typeof decision.outcome === 'string' && typeof event.type === 'string';
  },
};

/**
 * The compiled BUILD-bound semantic-decision declarations. `declarationDigest`
 * is the canonical content identity of each body WITHOUT the digest field
 * (recursively key-sorted canonical JSON, sha256), verified by the selected
 * Kernel once at its trusted load boundary. Each rule reserves its resolution
 * to the bound feature by declaring the unavailable disposition (a fallback
 * to the plain S interpreter would then terminate, never invent a decision).
 */
const RULES = {
  'rule:fd-approve': {
    kind: 'semantic-decision',
    id: 'rule:fd-approve',
    declarationDigest: 'a2bfaf799693d9b1f2d3ac36748b6f76e3bdca91309d71532c53c07d141a300e',
    allowedOutcomes: ['approved'],
    allowedEventTypes: ['QUOTE_DECIDED'],
    inputSelection: { amount: 'amount', requestId: 'requestId' },
    unavailable: { disposition: 'semantic-unavailable', reason: 'decision-reserved-to-bound-feature' },
    policy: { maxSteps: 8 },
  },
  'rule:fd-review': {
    kind: 'semantic-decision',
    id: 'rule:fd-review',
    declarationDigest: '1cfdc68cc4641e1f3bf76a45249bfa8d7ee4d2ec5ec797d2b3458031f884719d',
    allowedOutcomes: ['review'],
    allowedEventTypes: ['QUOTE_REVIEWED'],
    inputSelection: { amount: 'amount', requestId: 'requestId' },
    unavailable: { disposition: 'semantic-unavailable', reason: 'decision-reserved-to-bound-feature' },
    policy: { maxSteps: 8 },
  },
  'rule:pd-quote': {
    ruleId: 'rule:pd-quote',
    eventType: 'QUOTE_DECIDED',
    payloadFromInput: { amount: 'amount', requestId: 'requestId' },
  },
};

/**
 * The Business-declared T02 feature request material — IDENTICAL for both
 * bound intents (the decision logic does not depend on which outcome
 * vocabulary consumes it): the selected T02 feature's request minus the
 * occurrence input (which the dispatcher projects through each declaration's
 * exact inputSelection).
 */
const FEATURE_REQUEST = {
  schema: { id: 'schema:fd-quote', revision: 'r1', provenanceKey: 'approved:2026-10' },
  rules: [
    { id: 'fd-approve', when: { amount: 30 }, decision: { disposition: 'approved' } },
    { id: 'fd-approve-high', when: { amount: 75 }, decision: { disposition: 'approved' } },
  ],
  reuse: {
    schemaId: 'schema:fd-quote',
    schemaRevision: 'r1',
    provenanceKey: 'approved:2026-10',
    canonicalInput: '{"amount":12,"requestId":"R-reuse"}',
    decision: { disposition: 'review' },
  },
  procedure: { id: 'fd-proc', revision: 'approved:r1' },
  fallback: { kind: 'model', operationId: 'model:fd-quote' },
  limits: { maxSteps: 8, maxModelCalls: 1, maxToolCalls: 1 },
};

/**
 * [v0.10 #1267] The Business-declared feature decision material, keyed by
 * intent. `outcomeField` names the selected outcome inside the feature's
 * decision record; `outcomeEvents` is the finite AW-01 outcome→event map (its
 * event types must each match the intent's own binding trigger);
 * `eventPayloadFromInput` projects the admitted event payload from the SAME
 * declared input selection (the exact NF05 exact-input-selection discipline).
 */
const FEATURE_DECISIONS = {
  submitFeatureDecision: {
    featureRequest: FEATURE_REQUEST,
    outcomeField: 'disposition',
    outcomeEvents: { approved: 'QUOTE_DECIDED' },
    eventPayloadFromInput: { amount: 'amount', requestId: 'requestId' },
    // [v0.10 #1267 F2] MANDATORY relative per-turn dispatch timeout: the
    // absolute deadline is computed at each dispatch (never sealed), so a
    // hanging feature can never hold the K admission lane past this bound.
    timeoutMs: 1000,
  },
  submitFeatureReview: {
    featureRequest: FEATURE_REQUEST,
    outcomeField: 'disposition',
    outcomeEvents: { review: 'QUOTE_REVIEWED' },
    eventPayloadFromInput: { amount: 'amount', requestId: 'requestId' },
    timeoutMs: 1000,
  },
};

export function getPolicy() {
  return {
    packageId: MODULE_ID,
    policyId: 'feature-decision',
    domainId: 'orders',
    workflowDefinition: makeDefinition(),
    decisionSchema,
    governanceSemantics: { hardInvariants: [CAP_INVARIANT] },
    initialStateKey: 'review',
    initialContext: {},
    rules: RULES,
    intentBindings: {
      submitFeatureDecision: {
        trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
        ruleId: 'rule:fd-approve',
        roles: ['requester'],
      },
      submitFeatureReview: {
        trigger: { kind: 'event', eventType: 'QUOTE_REVIEWED' },
        ruleId: 'rule:fd-review',
        roles: ['requester'],
      },
      submitPlainDecision: {
        trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
        ruleId: 'rule:pd-quote',
        roles: ['requester'],
      },
    },
    featureDecisions: FEATURE_DECISIONS,
    effectBindings: {
      'effect:reserve': {
        semantics: 'non-idempotent',
        resource: { key: 'ledger', operation: 'reserve' },
        handler: async ({ input, effectId, resources }) => {
          if (resources === undefined) {
            throw new Error('effect:reserve requires the Host resource port');
          }
          return resources.call('ledger', 'reserve', { ...input, effectId });
        },
      },
    },
  };
}
