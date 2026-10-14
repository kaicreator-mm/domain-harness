/**
 * Business Domain Package — SemanticDecision quote v1.0.0 (#1003 FR08
 * SD1/SD2 + NF05 fixture).
 * ==========================================================================
 *
 * A #1003-Builder-authored Business package (NOT PR #1012 bytes) whose
 * intents are bound to `semantic-decision` rule declarations — the compiled
 * SemanticDecision descriptor vocabulary BUILD produces
 * (compileSemanticDecisions), embedded here as sealed policy rules. Each
 * rule carries its canonical `declarationDigest`; the selected Kernel
 * verifies that digest once at its trusted load boundary (#1003 wiring),
 * the Standard SDK interprets the declaration model-free, and the Kernel
 * alone admits/refuses/records through the standard guard/transition/
 * journal gates:
 *
 *   - `rule:sd-fixed-quote`    FR08-P-SD1: deterministic disposition, zero
 *                              fresh-model Single Admission.
 *   - `rule:sd-route-quote`    FR08-P-SD2 + NF05-P: declared-event routing
 *                              (input-proposed outcome/eventType against the
 *                              declaration allowlists) with a required
 *                              supplied promoted reference.
 *   - `rule:sd-unavailable`    FR08-N-SD1: declared semantic-unavailability
 *                              (typed zero-effect terminal before admission).
 *   - `rule:sd-post-violation` NF05-N-POST: internally inconsistent
 *                              declaration — the projected payload violates
 *                              the declared resultSchema after resolution.
 *   - `rule:sd-promotion-missing` NF05-N: required promoted reference that
 *                              the trusted context never supplies.
 *
 * This package owns business policy ONLY — no admission/journal/state
 * mechanism code, no kernel imports, no model calls.
 *
 * Kernel ABI: v08-business-abi/1 — endpoint export `getPolicy()`.
 */

export const MODULE_ID = 'business-semantic-decision@v08.1.0.0';
export const PACKAGE_KIND = 'business';
export const ABI_VERSION = 'v08-business-abi/1';
export const ENDPOINTS = [
  { endpointId: 'business:semantic-decision-quote', kind: 'business-policy' },
];

/** Intent types this policy binds. */
export const INTENT_TYPES = [
  'submitSdFixedQuote',
  'submitSdRouteQuote',
  'submitSdUnavailable',
  'submitSdPostViolation',
  'submitSdPromotionMissing',
];
/** Effect types this policy declares handlers for. */
export const EFFECT_TYPES = ['effect:reserve'];

/** Deny any proposed event whose payload.amount exceeds 100 (cap invariant). */
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

function sdQuoteDefinition() {
  return {
    workflowKey: 'sd-quote',
    initialState: 'review',
    initialContext: {},
    guards: [GUARD_AMOUNT_OK],
    states: [
      {
        stateKey: 'review',
        transitions: [
          {
            transitionKey: 'approve',
            trigger: { kind: 'event', eventType: 'SD_QUOTE_DECIDED' },
            targetState: 'approved',
            guardId: 'guard:amount-ok',
            effectIntents: [
              {
                effectType: 'effect:reserve',
                input: { reservation: 'sd-quote', amount: 7 },
                idempotencyKey: 'reserve:sd:1',
              },
            ],
          },
          {
            transitionKey: 'reject',
            trigger: { kind: 'event', eventType: 'SD_QUOTE_REJECTED' },
            targetState: 'rejected',
          },
        ],
      },
      { stateKey: 'approved', kind: 'final' },
      { stateKey: 'rejected', kind: 'final' },
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
    return typeof decision.outcome === 'string'
      && typeof event.type === 'string';
  },
};

/**
 * The compiled SemanticDecision descriptor vocabulary (BUILD
 * compileSemanticDecisions): inputSelection, resultSchema, allowedOutcomes,
 * allowedEventTypes, queryCapabilityIds, dependencyMaterial, cachePolicy,
 * promotedReference, policy.maxSteps, unavailable — plus `declarationDigest`,
 * the canonical content identity the selected Kernel verifies at its
 * trusted load boundary.
 */
const RULES = {
  'rule:sd-fixed-quote': {
    kind: 'semantic-decision',
    id: 'rule:sd-fixed-quote',
    declarationDigest: 'cec497dae01dddea7df015a3ecbfb71086095ecb462d714aa80acd8b93fdd986',
    allowedOutcomes: ['approve'],
    allowedEventTypes: ['SD_QUOTE_DECIDED'],
    inputSelection: { amount: 'amount', requestId: 'requestId' },
    resultSchema: {
      required: ['amount', 'requestId'],
      properties: { amount: 'number', requestId: 'string' },
    },
    disposition: {
      mode: 'deterministic',
      outcome: 'approve',
      eventType: 'SD_QUOTE_DECIDED',
      payloadFromInput: { amount: 'amount', requestId: 'requestId' },
    },
    queryCapabilityIds: [],
    dependencyMaterial: { requiredProjectionIds: [], requiredRevisionSourceIds: [] },
    cachePolicy: { mode: 'eligible' },
    policy: { maxSteps: 1 },
  },
  'rule:sd-route-quote': {
    kind: 'semantic-decision',
    id: 'rule:sd-route-quote',
    declarationDigest: 'af594fd0179f1fc1ca4c5f2fed9ae6bf9f0f8fea465479e3f51520bc8b8cd0e7',
    allowedOutcomes: ['approve', 'reject'],
    allowedEventTypes: ['SD_QUOTE_DECIDED', 'SD_QUOTE_REJECTED'],
    inputSelection: {
      amount: 'amount',
      requestId: 'requestId',
      proposedOutcome: 'proposedOutcome',
      proposedEventType: 'proposedEventType',
    },
    resultSchema: {
      required: ['amount', 'requestId'],
      properties: { amount: 'number', requestId: 'string' },
    },
    disposition: {
      mode: 'route',
      outcomeFrom: 'proposedOutcome',
      eventTypeFrom: 'proposedEventType',
      payloadFromInput: { amount: 'amount', requestId: 'requestId' },
    },
    promotedReference: {
      artifactId: 'promoted:quote-policy',
      contentDigest: 'sha256:sd-quote-policy-v1',
      required: true,
    },
    queryCapabilityIds: [],
    dependencyMaterial: { requiredProjectionIds: [], requiredRevisionSourceIds: [] },
    cachePolicy: { mode: 'eligible' },
    policy: { maxSteps: 1 },
  },
  'rule:sd-unavailable': {
    kind: 'semantic-decision',
    id: 'rule:sd-unavailable',
    declarationDigest: 'ad603e0514d11919d129e0e8ad6c9f66a4a6d5b8f58d44c1ac0ddc3e6d48d936',
    allowedOutcomes: ['approve'],
    allowedEventTypes: ['SD_QUOTE_DECIDED'],
    inputSelection: { amount: 'amount', requestId: 'requestId' },
    resultSchema: {
      required: ['amount', 'requestId'],
      properties: { amount: 'number', requestId: 'string' },
    },
    unavailable: {
      disposition: 'semantic-unavailable',
      reason: 'quote semantics are not deployed for this tenant',
    },
    queryCapabilityIds: [],
    dependencyMaterial: { requiredProjectionIds: [], requiredRevisionSourceIds: [] },
    cachePolicy: { mode: 'ineligible' },
    policy: { maxSteps: 1 },
  },
  'rule:sd-post-violation': {
    kind: 'semantic-decision',
    id: 'rule:sd-post-violation',
    declarationDigest: '88bcb98563e9ef72cfb046ec06b9716371883f76b5103f91ae38ea50f9564f1d',
    allowedOutcomes: ['approve'],
    allowedEventTypes: ['SD_QUOTE_DECIDED'],
    inputSelection: { amount: 'amount', requestId: 'requestId' },
    resultSchema: {
      required: ['amount', 'requestId'],
      properties: { amount: 'number', requestId: 'string' },
    },
    disposition: {
      mode: 'deterministic',
      outcome: 'approve',
      eventType: 'SD_QUOTE_DECIDED',
      payloadFromInput: { amount: 'amount', requestId: 'requestId' },
    },
    queryCapabilityIds: [],
    dependencyMaterial: { requiredProjectionIds: [], requiredRevisionSourceIds: [] },
    cachePolicy: { mode: 'eligible' },
    policy: { maxSteps: 1 },
  },
  'rule:sd-promotion-missing': {
    kind: 'semantic-decision',
    id: 'rule:sd-promotion-missing',
    declarationDigest: '3cd338149e732981398f4bf694817028cbe6a050150e09248c430c15aca159a0',
    allowedOutcomes: ['approve'],
    allowedEventTypes: ['SD_QUOTE_DECIDED'],
    inputSelection: { amount: 'amount', requestId: 'requestId' },
    resultSchema: {
      required: ['amount', 'requestId'],
      properties: { amount: 'number', requestId: 'string' },
    },
    disposition: {
      mode: 'deterministic',
      outcome: 'approve',
      eventType: 'SD_QUOTE_DECIDED',
      payloadFromInput: { amount: 'amount', requestId: 'requestId' },
    },
    promotedReference: {
      artifactId: 'promoted:absent-policy',
      contentDigest: 'sha256:never-supplied',
      required: true,
    },
    queryCapabilityIds: [],
    dependencyMaterial: { requiredProjectionIds: [], requiredRevisionSourceIds: [] },
    cachePolicy: { mode: 'eligible' },
    policy: { maxSteps: 1 },
  },
};

export function getPolicy() {
  return {
    packageId: MODULE_ID,
    policyId: 'semantic-decision-quote',
    domainId: 'orders',
    workflowDefinition: sdQuoteDefinition(),
    strictWorkflowDefinition: sdQuoteDefinition(),
    decisionSchema,
    governanceSemantics: { hardInvariants: [CAP_INVARIANT] },
    initialStateKey: 'review',
    initialContext: {
      // The trusted Kernel context supplies the declared required promoted
      // reference (business-pinned, never caller input).
      promotedReferences: {
        'promoted:quote-policy': {
          artifactId: 'promoted:quote-policy',
          contentDigest: 'sha256:sd-quote-policy-v1',
        },
      },
    },
    rules: RULES,
    intentBindings: {
      submitSdFixedQuote: {
        trigger: { kind: 'event', eventType: 'SD_QUOTE_DECIDED' },
        ruleId: 'rule:sd-fixed-quote',
        roles: ['requester'],
        definition: sdQuoteDefinition(),
      },
      submitSdRouteQuote: {
        trigger: { kind: 'event', eventType: 'SD_QUOTE_DECIDED' },
        ruleId: 'rule:sd-route-quote',
        roles: ['requester'],
        definition: sdQuoteDefinition(),
      },
      submitSdUnavailable: {
        trigger: { kind: 'event', eventType: 'SD_QUOTE_DECIDED' },
        ruleId: 'rule:sd-unavailable',
        roles: ['requester'],
        definition: sdQuoteDefinition(),
      },
      submitSdPostViolation: {
        trigger: { kind: 'event', eventType: 'SD_QUOTE_DECIDED' },
        ruleId: 'rule:sd-post-violation',
        roles: ['requester'],
        definition: sdQuoteDefinition(),
      },
      submitSdPromotionMissing: {
        trigger: { kind: 'event', eventType: 'SD_QUOTE_DECIDED' },
        ruleId: 'rule:sd-promotion-missing',
        roles: ['requester'],
        definition: sdQuoteDefinition(),
      },
    },
    effectBindings: {
      'effect:reserve': {
        semantics: 'non-idempotent',
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
