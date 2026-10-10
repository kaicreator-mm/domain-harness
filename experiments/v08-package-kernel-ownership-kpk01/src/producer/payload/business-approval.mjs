/**
 * Business Domain Package — order approval v1.0.0 (experiment KPK-01)
 * ====================================================================
 *
 * Domain-specific policy for ONE business field (order-quote approval). The
 * workflow definition, guards, governance hard invariants, decision schema,
 * intent bindings (incl. caller roles) and effect handlers declared here are
 * deliberate mirrors of the accepted v0.7 admission golden fixtures
 * (packages/domain-harness/tests/admission/helpers.ts @ v0.7 blob) so the
 * migrated Kernel mechanism can be golden-compared against the original
 * v0.7 modules side-by-side (KPK-04/KPK-14):
 *   - workflow 'order-quote', state 'review' → 'approved' | 'rejected'
 *   - guard:amount-ok  = event.payload.amount <= 50 (deliberately stricter
 *     than the cap-100 hard invariant so the GUARD denial path is reachable:
 *     amount 75 fails the guard but passes the invariant)
 *   - baseline hard invariant inv:cap-100 = NOT(amount > 100)
 *   - effect:reserve (non-idempotent) input {reservation:'quote', amount}
 *     idempotencyKey 'reserve:quote:1'
 *   - decision schema: {decision:{outcome,data}, event:{type,payload}}
 *
 * [Controller 090 repair, additive] ONE new intent binding
 * `submitQuoteDecisionDynamic` (rule `rule:quote-decision-request`
 * authorizing payload {amount, requestId}) whose approve transition declares
 * the kernel's data-only dynamic effect binding:
 *   inputFrom        {amount, requestId} ← rule-authorized event projection
 *   idempotencyKeyFrom 'reserve:quote:{requestId}'
 * The STATIC definitions above stay untouched so the v0.7 golden anchors
 * (KPK-04/KPK-14) keep comparing against identical declared behavior.
 *
 * This package owns business policy ONLY. It contains no admission/journal/
 * state-transition mechanism code and imports nothing from the kernel: the
 * loaded Kernel Package invokes it through its sealed endpoint.
 *
 * Kernel ABI: kpk01-business-abi/1 — endpoint export `getPolicy()` returning
 * the business-policy endpoint consumed by the kernel occurrence runtime.
 */

export const MODULE_ID = 'business-order-approval@1.0.0';
export const PACKAGE_KIND = 'business';
export const ABI_VERSION = 'kpk01-business-abi/1';
export const ENDPOINTS = [
  { endpointId: 'business:order-approval', kind: 'business-policy' },
];

/** Intent types this policy binds (sealed into the root package by the producer). */
export const INTENT_TYPES = ['submitQuoteDecision', 'submitQuoteDecisionStrict', 'submitQuoteDecisionDynamic'];
/** Effect types this policy declares handlers for. */
export const EFFECT_TYPES = ['effect:reserve'];

/** Deny any proposed event whose payload.amount exceeds 100 (v0.7 golden CAP_INVARIANT). */
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

function makeDefinition({ omitReject } = { omitReject: false }) {
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
          ...(omitReject
            ? []
            : [{
                transitionKey: 'reject',
                trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
                targetState: 'rejected',
              }]),
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
 * [Controller 090 repair] Dynamic-binding definition: same workflow family
 * as makeDefinition({omitReject:true}) — the unguarded 'reject' fallback
 * transition is deliberately OMITTED so the GUARD denial path stays
 * reachable for the dynamic intent (amount 75 must deny on
 * guard:amount-ok, not fall through to 'rejected'). The approve
 * transition's effect intent declares inputFrom/idempotencyKeyFrom instead
 * of static input/idempotencyKey; the kernel validates this declaration
 * once at wiring against rule:quote-decision-request's authorized payload
 * projection {amount, requestId} and resolves the per-occurrence values
 * after admission, before the journal. The STATIC definitions above stay
 * untouched so the v0.7 golden anchors (KPK-04/KPK-14) keep comparing
 * against identical declared behavior.
 */
function makeDynamicDefinition() {
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
                inputFrom: {
                  amount: { source: 'event', path: ['payload', 'amount'] },
                  requestId: { source: 'event', path: ['payload', 'requestId'] },
                },
                idempotencyKeyFrom: { template: 'reserve:quote:{requestId}' },
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

export function getPolicy() {
  return {
    packageId: MODULE_ID,
    policyId: 'order-approval',
    domainId: 'orders',
    workflowDefinition: makeDefinition({ omitReject: false }),
    strictWorkflowDefinition: makeDefinition({ omitReject: true }),
    decisionSchema,
    governanceSemantics: { hardInvariants: [CAP_INVARIANT] },
    initialStateKey: 'review',
    initialContext: {},
    rules: {
      'rule:quote-decision': { ruleId: 'rule:quote-decision', eventType: 'QUOTE_DECIDED', payloadFromInput: { amount: 'amount' } },
      'rule:quote-decision-request': { ruleId: 'rule:quote-decision-request', eventType: 'QUOTE_DECIDED', payloadFromInput: { amount: 'amount', requestId: 'requestId' } },
    },
    intentBindings: {
      submitQuoteDecision: {
        trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
        ruleId: 'rule:quote-decision',
        roles: ['requester'],
      },
      submitQuoteDecisionStrict: {
        trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
        ruleId: 'rule:quote-decision',
        roles: ['requester'],
        definition: makeDefinition({ omitReject: true }),
      },
      submitQuoteDecisionDynamic: {
        trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
        ruleId: 'rule:quote-decision-request',
        roles: ['requester'],
        definition: makeDynamicDefinition(),
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
