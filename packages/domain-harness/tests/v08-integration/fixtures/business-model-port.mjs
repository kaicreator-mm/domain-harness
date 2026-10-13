/**
 * Business Domain Package — model-port quote v1.0.0 (#1013 R1 F-03 fixture).
 * ==========================================================================
 *
 * A #1013-Builder-authored Business package (NOT PR #1012 bytes) whose ONLY
 * intent is bound to a `model-decision` rule declaration. Under the recorded
 * ABI ruling (#1013@6118426531) the production composition is:
 *
 *   authenticated send → K submit lane → K awaits the composite sdkEndpoint
 *   → S host-bound resolver `invokeDecision` → the Host ModelPort.invoke is
 *   PHYSICALLY called once → the model's `{decision, event}` becomes the
 *   structured decision K admits (guard → transition → static effect).
 *
 * The workflow deliberately mirrors the approval app's shape (guard
 * amount <= 50, cap invariant at 100, static effect intent with literal
 * input/idempotencyKey — no dynamic inputFrom/idempotencyKeyFrom so no
 * rule-projection wiring validation is involved). Everything the model
 * returns flows through the standard admission gates: the guard can deny,
 * the invariant holds, the effect journal records the tenant-qualified
 * turn, and the decision schema validates `{decision:{outcome}, event:{type}}`.
 *
 * This package owns business policy ONLY — no admission/journal/state
 * mechanism code, no kernel imports.
 *
 * Kernel ABI: v08-business-abi/1 — endpoint export `getPolicy()`.
 */

export const MODULE_ID = 'business-model-port@v08.1.0.0';
export const PACKAGE_KIND = 'business';
export const ABI_VERSION = 'v08-business-abi/1';
export const ENDPOINTS = [
  { endpointId: 'business:model-port-quote', kind: 'business-policy' },
];

/** Intent types this policy binds. */
export const INTENT_TYPES = ['submitModelQuoteDecision'];
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

function modelQuoteDefinition() {
  return {
    workflowKey: 'model-quote',
    initialState: 'review',
    initialContext: {},
    guards: [GUARD_AMOUNT_OK],
    states: [
      {
        stateKey: 'review',
        transitions: [
          {
            transitionKey: 'approve',
            trigger: { kind: 'event', eventType: 'MODEL_QUOTE_DECIDED' },
            targetState: 'approved',
            guardId: 'guard:amount-ok',
            effectIntents: [
              {
                effectType: 'effect:reserve',
                input: { reservation: 'model-quote', amount: 7 },
                idempotencyKey: 'reserve:model:1',
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

export function getPolicy() {
  return {
    packageId: MODULE_ID,
    policyId: 'model-port-quote',
    domainId: 'orders',
    workflowDefinition: modelQuoteDefinition(),
    strictWorkflowDefinition: modelQuoteDefinition(),
    decisionSchema,
    governanceSemantics: { hardInvariants: [CAP_INVARIANT] },
    initialStateKey: 'review',
    initialContext: {},
    rules: {
      // The model-decision rule declaration the composite endpoint routes
      // to the REAL Host ModelPort (`kind:'model-decision'`).
      'rule:model-quote-advice': {
        kind: 'model-decision',
        id: 'rule:model-quote-advice',
        modelOperation: 'quote.advise',
      },
    },
    intentBindings: {
      submitModelQuoteDecision: {
        trigger: { kind: 'event', eventType: 'MODEL_QUOTE_DECIDED' },
        ruleId: 'rule:model-quote-advice',
        roles: ['requester'],
        definition: modelQuoteDefinition(),
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
