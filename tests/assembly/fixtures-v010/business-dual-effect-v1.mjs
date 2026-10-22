/**
 * T00 fixture — Business package with ONE two-effect transition (#1264).
 * ================================================================
 *
 * A minimal v08-business-abi/1 Business policy whose single approve
 * transition carries TWO static effect intents, so a K advisory
 * `admission-budget-advice/v1` hook can observably tighten the per-turn
 * work-unit bound (Kernel hard limit min BUILD hardBudget min honored
 * advice): advising `{maxWorkUnits: 1}` must deny this turn typed with zero
 * journal/effect activity, while `{maxWorkUnits: 2}` admits both dispatches.
 * Test-only fixture; the Kernel owns every admission decision.
 */

export const MODULE_ID = 'business-dual-effect@v010.1.0.0';
export const PACKAGE_KIND = 'business';
export const ABI_VERSION = 'v08-business-abi/1';
export const ENDPOINTS = [
  { endpointId: 'business:dual-effect', kind: 'business-policy' },
];

/** Intent types this policy binds. */
export const INTENT_TYPES = ['submitDualEffect'];
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

function definition() {
  return {
    workflowKey: 'dual-effect',
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
              { effectType: 'effect:reserve', input: { reservation: 'dual:1' }, idempotencyKey: 'reserve:dual:1' },
              { effectType: 'effect:reserve', input: { reservation: 'dual:2' }, idempotencyKey: 'reserve:dual:2' },
            ],
          },
        ],
      },
      { stateKey: 'approved', kind: 'final' },
      { stateKey: 'rejected', kind: 'final' },
    ],
  };
}

export function getPolicy() {
  return {
    packageId: MODULE_ID,
    policyId: 'dual-effect',
    domainId: 'orders',
    workflowDefinition: definition(),
    strictWorkflowDefinition: definition(),
    decisionSchema,
    governanceSemantics: { hardInvariants: [CAP_INVARIANT] },
    initialStateKey: 'review',
    initialContext: {},
    rules: {
      'rule:dual-effect': { ruleId: 'rule:dual-effect', eventType: 'QUOTE_DECIDED', payloadFromInput: { amount: 'amount' } },
    },
    intentBindings: {
      submitDualEffect: {
        trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
        ruleId: 'rule:dual-effect',
        roles: ['requester'],
      },
    },
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
