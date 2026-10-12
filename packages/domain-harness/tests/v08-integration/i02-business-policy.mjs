/**
 * I02 integration business Domain Package fixture (v0.8, #1013).
 * ====================================================================
 *
 * A minimal, REAL business policy for the physical selected Kernel payload
 * (`kernel-mechanism-v1.mjs`) and the real Standard SDK payload
 * (`standard-sdk-v1.mjs`): one 'order-quote' workflow, review →
 * approved | rejected, guard amount ≤ 50, cap-100 hard invariant, no effect
 * handlers (I02 owns the identity routing, not the effect plane — I04/FR08
 * and the T-F effect tests cover that).
 *
 * TWO intent bindings with DISJOINT caller roles:
 *   - submitQuoteDecision  → roles ['requester']
 *   - submitManagerApproval → roles ['approver']
 * so the tests can prove the Kernel's business-owned role gate evaluates the
 * ISSUER-SIGNED role of the H principal (never a declared payload role).
 *
 * This file is BOTH the sealed module source (read as bytes by the test and
 * sealed through the real qualify → issue → BUILD path) and the import the
 * provisioning handle uses for its businessEndpoint — the same bytes on both
 * sides, no hand-minted policy object.
 */

export const MODULE_ID = 'biz:i02-order-approval@1.0.0';
export const PACKAGE_KIND = 'business';
export const ABI_VERSION = 'v08-business-abi/1';
export const ENDPOINTS = [
  { endpointId: 'business-policy', kind: 'business-policy' },
];

/** Intent types this policy binds (sealed into the root by the producer). */
export const INTENT_TYPES = ['submitQuoteDecision', 'submitManagerApproval'];

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

const WORKFLOW_DEFINITION = {
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
        },
        {
          transitionKey: 'reject',
          trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
          targetState: 'rejected',
        },
      ],
    },
    { stateKey: 'approved', kind: 'final' },
    { stateKey: 'rejected', kind: 'final' },
  ],
};

export function getPolicy() {
  return {
    packageId: MODULE_ID,
    policyId: 'i02-order-approval',
    domainId: 'orders',
    workflowDefinition: WORKFLOW_DEFINITION,
    decisionSchema: {
      isValid(value) {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
        return typeof value.decision?.outcome === 'string' && typeof value.event?.type === 'string';
      },
    },
    governanceSemantics: { hardInvariants: [CAP_INVARIANT] },
    initialStateKey: 'review',
    initialContext: {},
    rules: {
      'rule:quote-decision': {
        ruleId: 'rule:quote-decision',
        eventType: 'QUOTE_DECIDED',
        payloadFromInput: { amount: 'amount' },
      },
    },
    intentBindings: {
      submitQuoteDecision: {
        trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
        ruleId: 'rule:quote-decision',
        roles: ['requester'],
      },
      submitManagerApproval: {
        trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
        ruleId: 'rule:quote-decision',
        roles: ['approver'],
      },
    },
    effectBindings: {},
  };
}
