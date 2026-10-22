/**
 * T00 fixture — Business package with ONE 65-effect transition (#1264 R2).
 * ================================================================================
 * Minimal v08-business-abi/1 policy whose single approve transition carries 65
 * static effect intents (one above the #1264 MAX_TURN_WORK_UNITS default).
 * With a BUILD hardBudget wired (maxWorkUnitsPerTurn < 65) the turn is budget-
 * denied; with NO hardBudget wired (legacy wiring) it must admit exactly as
 * before #1264 — no per-turn work-unit limit exists on that path. Test-only
 * fixture; the Kernel owns every admission decision.
 */

export const MODULE_ID = 'business-many-effects@v010.1.0.0';
export const PACKAGE_KIND = 'business';
export const ABI_VERSION = 'v08-business-abi/1';
export const ENDPOINTS = [
  { endpointId: 'business:many-effects', kind: 'business-policy' },
];

/** Intent types this policy binds. */
export const INTENT_TYPES = ['submitManyEffects'];
/** Effect types this policy declares handlers for. */
export const EFFECT_TYPES = ['effect:reserve'];

/** One above the #1264 default work-unit ceiling. */
export const EFFECT_COUNT = 65;

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
    workflowKey: 'many-effects',
    initialState: 'review',
    initialContext: {},
    guards: [],
    states: [
      {
        stateKey: 'review',
        transitions: [
          {
            transitionKey: 'approve',
            trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
            targetState: 'approved',
            effectIntents: Array.from({ length: EFFECT_COUNT }, (_, index) => ({
              effectType: 'effect:reserve',
              input: { reservation: `many:${index}` },
              idempotencyKey: `reserve:many:${index}`,
            })),
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
    policyId: 'many-effects',
    domainId: 'orders',
    workflowDefinition: definition(),
    strictWorkflowDefinition: definition(),
    decisionSchema,
    governanceSemantics: { hardInvariants: [CAP_INVARIANT] },
    initialStateKey: 'review',
    initialContext: {},
    rules: {
      'rule:many-effects': { ruleId: 'rule:many-effects', eventType: 'QUOTE_DECIDED', payloadFromInput: { amount: 'amount' } },
    },
    intentBindings: {
      submitManyEffects: {
        trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
        ruleId: 'rule:many-effects',
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
