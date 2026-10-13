/**
 * Business Domain Package — #1018 T-F FR07 selected-path harness oracle v1.0.0
 * ============================================================================
 *
 * Test-only Business package authored for the #1003 / PR #1018 selected-path
 * rebind of the WEB-ORACLE-1 FR07 sentinels (V08-FR07-P-F01, N-F02, N-F03,
 * N-F04). It re-expresses the v0.7 `business-harness-machine.test.ts`
 * (@86110c6, blob 0c5622b5) oracle scenario on the CURRENT selected K/S/H
 * path: a sealed, data-only `harness` policy on a `model-decision` rule.
 *
 *   v0.7 oracle                         current selected-path adaptation
 *   ----------------------------------  -----------------------------------------
 *   allowedDecisionOutcomes QUOTE/REJECT  harness.allowedOutcomes (same values)
 *   allowedEventTypes QUOTE_REQUESTED/…   harness.allowedEvents (same values)
 *   query binding `lookup_catalog`        read descriptor `catalog.lookup` (K
 *                                         identifier grammar has no `_`); K-owned
 *                                         projection of the instance context
 *   query binding `flaky_read` (throws)   read descriptor `catalog.flakyRead`
 *                                         over a context key Genesis never sets
 *                                         ⇒ ordinary QUERY_SOURCE_MISSING
 *   query binding `bad_read` (undefined)  read descriptor `catalog.badRead` whose
 *                                         sealed outputSchema the K-attested
 *                                         context violates ⇒ QUERY_OUTPUT_INVALID
 *   mutation binding `charge_customer`    mutation descriptor `customer.charge`
 *                                         (mode only, no callable anywhere)
 *   maxSteps 4 (baseInput) / 1            harness.maxSteps 4 / 1
 *
 * No callable exists in the harness policy for any capability; K alone
 * authorizes and executes the read. This package owns business policy ONLY —
 * no admission/journal/state mechanism code and no imports.
 *
 * Kernel ABI: v08-business-abi/1 — endpoint export `getPolicy()`.
 */

export const MODULE_ID = 'business-tf-fr07-harness@v08.1.0.0';
export const PACKAGE_KIND = 'business';
export const ABI_VERSION = 'v08-business-abi/1';
export const ENDPOINTS = [
  { endpointId: 'business:tf-fr07-harness', kind: 'business-policy' },
];

/** Intent types this policy binds. */
export const INTENT_TYPES = ['requestQuote', 'requestQuoteOneStep'];
/** Effect types this policy declares handlers for. */
export const EFFECT_TYPES = ['effect:reserve-quote'];

function harnessDefinition() {
  return {
    workflowKey: 'tf-fr07-harness',
    initialState: 'evaluating',
    initialContext: {},
    guards: [],
    states: [
      {
        stateKey: 'evaluating',
        transitions: [
          {
            transitionKey: 'quote',
            trigger: { kind: 'event', eventType: 'QUOTE_REQUESTED' },
            targetState: 'quoted',
            effectIntents: [
              {
                effectType: 'effect:reserve-quote',
                input: { reservation: 'tf-fr07-quote', sku: 'P-1' },
                idempotencyKey: 'reserve:tf-fr07:1',
              },
            ],
          },
        ],
      },
      { stateKey: 'quoted', kind: 'final' },
    ],
  };
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Business-owned structural schema evaluated inside K central admission. */
const decisionSchema = {
  isValid(value) {
    if (!isRecord(value) || !isRecord(value.decision) || !isRecord(value.event)) return false;
    return typeof value.decision.outcome === 'string' && typeof value.event.type === 'string';
  },
};

function capabilities() {
  return {
    'catalog.lookup': {
      mode: 'read',
      source: 'instance-context',
      fields: { available: 'catalogAvailable', sku: 'catalogSku' },
      outputSchema: { available: 'boolean', sku: 'string' },
    },
    'catalog.flakyRead': {
      mode: 'read',
      source: 'instance-context',
      fields: { history: 'quoteHistory' },
    },
    'catalog.badRead': {
      mode: 'read',
      source: 'instance-context',
      fields: { available: 'catalogAvailable' },
      outputSchema: { available: 'string' },
    },
    // Declared ONLY so K denies it explicitly; never advertised, never run.
    'customer.charge': { mode: 'mutation' },
  };
}

function harnessRule(id, maxSteps) {
  return {
    kind: 'model-decision',
    id,
    modelOperation: 'quote.harness',
    harness: {
      maxSteps,
      capabilities: capabilities(),
      allowedOutcomes: ['QUOTE', 'REJECT'],
      allowedEvents: ['QUOTE_REQUESTED', 'REJECTED'],
    },
  };
}

function binding(ruleId) {
  return {
    trigger: { kind: 'event', eventType: 'QUOTE_REQUESTED' },
    ruleId,
    roles: ['requester'],
    definition: harnessDefinition(),
  };
}

export function getPolicy() {
  return {
    packageId: MODULE_ID,
    policyId: 'tf-fr07-harness',
    domainId: 'quotes',
    workflowDefinition: harnessDefinition(),
    strictWorkflowDefinition: harnessDefinition(),
    decisionSchema,
    governanceSemantics: { hardInvariants: [] },
    initialStateKey: 'evaluating',
    initialContext: { catalogAvailable: true, catalogSku: 'P-1' },
    rules: {
      'rule:tf-fr07-quote': harnessRule('rule:tf-fr07-quote', 4),
      'rule:tf-fr07-quote-one-step': harnessRule('rule:tf-fr07-quote-one-step', 1),
    },
    intentBindings: {
      requestQuote: binding('rule:tf-fr07-quote'),
      requestQuoteOneStep: binding('rule:tf-fr07-quote-one-step'),
    },
    effectBindings: {
      'effect:reserve-quote': {
        semantics: 'non-idempotent',
        handler: async ({ input, effectId, resources }) => {
          if (resources === undefined) {
            throw new Error('effect:reserve-quote requires the Host resource port');
          }
          return resources.call('ledger', 'reserve', { ...input, effectId });
        },
      },
    },
  };
}
