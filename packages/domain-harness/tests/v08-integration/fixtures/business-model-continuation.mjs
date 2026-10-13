/**
 * Business Domain Package — FR07 model continuation quote v1.0.0
 * (#1003 FR07-KH2 fixture).
 * ==============================================================
 *
 * A KH2-Builder-authored Business package whose intents are bound to
 * `model-decision` rule declarations carrying a sealed, data-only `harness`
 * policy (#1003@6122627750 §4.1). The selected Kernel owns everything the
 * policy implies:
 *
 *   authenticated send → K lane → K bounded continuation loop
 *     → S host-bound resolver `invokeStep` (ONE physical ModelPort turn)
 *     → {kind:'query'}: K authorizes the capability against THIS sealed
 *       policy, executes the K-owned read-only instance-context read,
 *       appends a canonical observation + K-attested dependency, and
 *       invokes S again (bounded by `maxSteps`, recovery turns included);
 *     → {kind:'final'}: K checks the outcome/event allowlist, then the
 *       existing central admission (schema → invariant → guard →
 *       transition → durable Journal/Effect) runs exactly once.
 *
 * Capability descriptors are DATA ONLY. A `read` descriptor names the
 * instance-context fields K may project; a `mutation` descriptor exists only
 * so K can deny it explicitly — it is never advertised to the model and no
 * callable exists anywhere in this policy for either kind.
 *
 * This package owns business policy ONLY — no admission/journal/state
 * mechanism code, no kernel imports.
 *
 * Kernel ABI: v08-business-abi/1 — endpoint export `getPolicy()`.
 */

export const MODULE_ID = 'business-model-continuation@v08.1.0.0';
export const PACKAGE_KIND = 'business';
export const ABI_VERSION = 'v08-business-abi/1';
export const ENDPOINTS = [
  { endpointId: 'business:model-continuation-quote', kind: 'business-policy' },
];

/** Intent types this policy binds. */
export const INTENT_TYPES = [
  'submitContinuationQuote',
  'submitContinuationQuoteOneStep',
  'submitContinuationQuoteBadSchema',
];
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

const GUARD_AMOUNT_OK = {
  guardId: 'guard:amount-ok',
  predicate: {
    op: 'lte',
    left: { source: 'event', path: ['payload', 'amount'] },
    right: { source: 'literal', value: 50 },
  },
};

function continuationDefinition() {
  return {
    workflowKey: 'continuation-quote',
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
                input: { reservation: 'continuation-quote', amount: 9 },
                idempotencyKey: 'reserve:continuation:1',
              },
            ],
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

/** Sealed data-only capability descriptors shared by every harness rule. */
function capabilities(customerSchema) {
  return {
    'quote.readCustomer': {
      mode: 'read',
      source: 'instance-context',
      fields: { tier: 'customerTier', creditLimit: 'creditLimit' },
      outputSchema: customerSchema,
    },
    // Declares a context key the Genesis context never carries: an ordinary
    // read failure that becomes an observation (FR07-P2 recovery).
    'quote.readHistory': {
      mode: 'read',
      source: 'instance-context',
      fields: { priorQuotes: 'priorQuotes' },
    },
    // Declared ONLY so K denies it explicitly; never advertised, never run.
    'quote.reserveFunds': { mode: 'mutation' },
  };
}

function harnessRule(id, modelOperation, maxSteps, customerSchema) {
  return {
    kind: 'model-decision',
    id,
    modelOperation,
    harness: {
      maxSteps,
      capabilities: capabilities(customerSchema),
      allowedOutcomes: ['approve-quote', 'reject-quote'],
      allowedEvents: ['QUOTE_DECIDED'],
    },
  };
}

function binding(ruleId) {
  return {
    trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
    ruleId,
    roles: ['requester'],
    definition: continuationDefinition(),
  };
}

export function getPolicy() {
  return {
    packageId: MODULE_ID,
    policyId: 'model-continuation-quote',
    domainId: 'orders',
    workflowDefinition: continuationDefinition(),
    strictWorkflowDefinition: continuationDefinition(),
    decisionSchema,
    governanceSemantics: { hardInvariants: [CAP_INVARIANT] },
    initialStateKey: 'review',
    initialContext: { customerTier: 'gold', creditLimit: 40 },
    rules: {
      'rule:continuation-quote': harnessRule(
        'rule:continuation-quote', 'quote.continue', 3, { tier: 'string', creditLimit: 'number' },
      ),
      'rule:continuation-quote-one-step': harnessRule(
        'rule:continuation-quote-one-step', 'quote.continue', 1, { tier: 'string', creditLimit: 'number' },
      ),
      // The read output contract disagrees with the K-attested context
      // (creditLimit is a number): a query output violation, terminal.
      'rule:continuation-quote-bad-schema': harnessRule(
        'rule:continuation-quote-bad-schema', 'quote.continue', 3, { tier: 'string', creditLimit: 'string' },
      ),
    },
    intentBindings: {
      submitContinuationQuote: binding('rule:continuation-quote'),
      submitContinuationQuoteOneStep: binding('rule:continuation-quote-one-step'),
      submitContinuationQuoteBadSchema: binding('rule:continuation-quote-bad-schema'),
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
