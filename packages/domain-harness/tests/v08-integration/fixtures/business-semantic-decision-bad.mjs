/**
 * Business Domain Package — SUBSTITUTED-descriptor quote v1.0.0 (#1003
 * NF05-N-PRE fixture — NEGATIVE ONLY).
 * ==========================================================================
 *
 * Same skeleton as business-semantic-decision.mjs, but its single rule
 * carries a SUBSTITUTED declaration: the `declarationDigest` of the good
 * `rule:sd-fixed-quote` over a tampered body (payloadFromInput projects the
 * undeclared input `secret`). The selected Kernel's trusted load boundary
 * must refuse this app typed (SEMANTIC_DECISION_INVALID — stale or
 * substituted descriptor) BEFORE any instance, journal or effect can exist.
 *
 * Kernel ABI: v08-business-abi/1 — endpoint export `getPolicy()`.
 */

export const MODULE_ID = 'business-semantic-decision-bad@v08.1.0.0';
export const PACKAGE_KIND = 'business';
export const ABI_VERSION = 'v08-business-abi/1';
export const ENDPOINTS = [
  { endpointId: 'business:semantic-decision-quote-bad', kind: 'business-policy' },
];

/** Intent types this policy binds. */
export const INTENT_TYPES = ['submitSdSubstitutedQuote'];
/** Effect types this policy declares handlers for. */
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

function sdQuoteDefinition() {
  return {
    workflowKey: 'sd-quote-bad',
    initialState: 'review',
    initialContext: {},
    guards: [],
    states: [
      {
        stateKey: 'review',
        transitions: [
          {
            transitionKey: 'approve',
            trigger: { kind: 'event', eventType: 'SD_QUOTE_DECIDED' },
            targetState: 'approved',
            effectIntents: [],
          },
        ],
      },
      { stateKey: 'approved', kind: 'final' },
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
 * The substituted declaration: structurally valid, digest pinned to ANOTHER
 * declaration's body (filled by the authoring script with the good
 * `rule:sd-fixed-quote` digest). Any value here fails the Kernel's
 * recomputation; the placeholder keeps the intent explicit.
 */
const RULES = {
  'rule:sd-substituted-quote': {
    kind: 'semantic-decision',
    id: 'rule:sd-substituted-quote',
    declarationDigest: 'cec497dae01dddea7df015a3ecbfb71086095ecb462d714aa80acd8b93fdd986',
    allowedOutcomes: ['approve'],
    allowedEventTypes: ['SD_QUOTE_DECIDED'],
    inputSelection: { amount: 'amount', requestId: 'requestId', secret: 'secret' },
    resultSchema: {
      required: ['amount', 'requestId'],
      properties: { amount: 'number', requestId: 'string' },
    },
    disposition: {
      mode: 'deterministic',
      outcome: 'approve',
      eventType: 'SD_QUOTE_DECIDED',
      payloadFromInput: { amount: 'secret', requestId: 'requestId' },
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
    policyId: 'semantic-decision-quote-bad',
    domainId: 'orders',
    workflowDefinition: sdQuoteDefinition(),
    strictWorkflowDefinition: sdQuoteDefinition(),
    decisionSchema,
    governanceSemantics: { hardInvariants: [CAP_INVARIANT] },
    initialStateKey: 'review',
    initialContext: {},
    rules: RULES,
    intentBindings: {
      submitSdSubstitutedQuote: {
        trigger: { kind: 'event', eventType: 'SD_QUOTE_DECIDED' },
        ruleId: 'rule:sd-substituted-quote',
        roles: ['requester'],
        definition: sdQuoteDefinition(),
      },
    },
    effectBindings: {
      'effect:reserve': {
        semantics: 'non-idempotent',
        handler: async () => ({ reserved: true }),
      },
    },
  };
}
