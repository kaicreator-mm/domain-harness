/**
 * T06 fixture — a Business Domain Package whose ONLY intent binding is
 * restricted to the `approver` caller role (#1173).
 * ====================================================================
 *
 * The v0.10 App facade sends public intents with caller role `requester`
 * (activation.ts pins it), so this policy's role gate makes the REAL kernel
 * return its honest `denied` receipt (business-caller-role) on the normal
 * admission path — before any State, Journal or Effect activity. The T06
 * observation bridge reads that genuine denial receipt; nothing here mints or
 * suppresses Kernel authority.
 *
 * The workflow is deliberately minimal: one event-triggered transition to a
 * final state with NO effect intents, so an admitted occurrence also stays a
 * pure semantic turn (schema + journal only) for the observer tests.
 */

export const MODULE_ID = 'business-restricted-approval@v010.1.0.0';
export const PACKAGE_KIND = 'business';
export const ABI_VERSION = 'v08-business-abi/1';
export const ENDPOINTS = [
  { endpointId: 'business:restricted-approval', kind: 'business-policy' },
];

export const INTENT_TYPES = ['submitRestrictedDecision'];
export const EFFECT_TYPES = [];

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

function makeDefinition() {
  return {
    workflowKey: 'restricted-quote',
    initialState: 'review',
    initialContext: {},
    guards: [],
    states: [
      {
        stateKey: 'review',
        transitions: [
          {
            transitionKey: 'decide',
            trigger: { kind: 'event', eventType: 'RESTRICTED_DECIDED' },
            targetState: 'decided',
            effectIntents: [],
          },
        ],
      },
      { stateKey: 'decided', kind: 'final' },
    ],
  };
}

export function getPolicy() {
  return {
    packageId: MODULE_ID,
    policyId: 'restricted-approval',
    domainId: 'restricted',
    workflowDefinition: makeDefinition(),
    decisionSchema,
    governanceSemantics: { hardInvariants: [] },
    initialStateKey: 'review',
    initialContext: {},
    rules: {
      'rule:restricted-decision': {
        ruleId: 'rule:restricted-decision',
        eventType: 'RESTRICTED_DECIDED',
        payloadFromInput: { amount: 'amount', requestId: 'requestId' },
      },
    },
    intentBindings: {
      // The whole point: only an `approver` may submit; the facade's pinned
      // `requester` role is denied by the REAL kernel role gate.
      submitRestrictedDecision: {
        trigger: { kind: 'event', eventType: 'RESTRICTED_DECIDED' },
        ruleId: 'rule:restricted-decision',
        roles: ['approver'],
      },
    },
    effectBindings: {},
  };
}
