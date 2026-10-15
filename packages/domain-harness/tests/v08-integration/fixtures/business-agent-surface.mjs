/**
 * Business Domain Package — agent surface v1.0.0 (#1003 FR05/HF17/HF23
 * T-D fixture)
 * ====================================================================
 *
 * A #1003-T-D-Builder-authored Business package for the FR05/HF17/HF23
 * selected-seam witness, modeled on the REAL order-approval bytes
 * (examples/business-approval.mjs — read-only reference) with ONE
 * deliberate contract difference the selected rows need: the `review`
 * state SELF-LOOPS on QUOTE_DECIDED, so ONE physical instance accepts a
 * bounded sequence of admitted turns — FR05 pins multi-source revisions
 * across instances, and HF17 observes multiple same-subject live updates
 * on one instance (the approval example's review → final states admit
 * exactly one turn per instance and cannot exercise either row).
 *
 *   - `submitSurfaceQuote`   self-loop turn, guard amount ≤ 50, no effect —
 *                            the plain revision-bumping occurrence.
 *   - `submitSurfaceReserve` self-loop turn whose transition declares the
 *                            `effect:reserve` dispatch (`ledger.reserve`
 *                            Host resource route, non-idempotent) — the
 *                            central-admission path the effectful agent
 *                            ABI entry maps to. NOT exercised by this
 *                            witness (the S04 physical evidence owns the
 *                            executed effect path); it exists so the seal
 *                            cross-validates the effectful OperationCall
 *                            ABI claim against a real Business
 *                            declaration.
 *
 * This package owns business policy ONLY — no admission/journal/state-
 * transition mechanism code, no kernel imports, no Host port.
 *
 * Kernel ABI: v08-business-abi/1 — endpoint export `getPolicy()`.
 */

export const MODULE_ID = 'business-agent-surface@v08.1.0.0';
export const PACKAGE_KIND = 'business';
export const ABI_VERSION = 'v08-business-abi/1';
export const ENDPOINTS = [
  { endpointId: 'business:agent-surface', kind: 'business-policy' },
];

/** Intent types this policy binds (sealed into the root package by the producer). */
export const INTENT_TYPES = ['submitSurfaceQuote', 'submitSurfaceReserve'];
/** Effect types this policy declares handlers for. */
export const EFFECT_TYPES = ['effect:reserve'];

/** Deny any decided event whose payload.amount exceeds 100 (cap invariant). */
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

/** The plain self-loop definition: every admitted turn stays in `review`. */
function quoteDefinition() {
  return {
    workflowKey: 'surface-quote',
    initialState: 'review',
    initialContext: {},
    guards: [GUARD_AMOUNT_OK],
    states: [
      {
        stateKey: 'review',
        transitions: [
          {
            transitionKey: 'record',
            trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
            targetState: 'review',
            guardId: 'guard:amount-ok',
          },
        ],
      },
    ],
  };
}

/** The reserve definition: same self-loop plus the `effect:reserve` dispatch. */
function reserveDefinition() {
  return {
    workflowKey: 'surface-quote',
    initialState: 'review',
    initialContext: {},
    guards: [GUARD_AMOUNT_OK],
    states: [
      {
        stateKey: 'review',
        transitions: [
          {
            transitionKey: 'record',
            trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
            targetState: 'review',
            guardId: 'guard:amount-ok',
            effectIntents: [
              {
                effectType: 'effect:reserve',
                inputFrom: {
                  amount: { source: 'event', path: ['payload', 'amount'] },
                  requestId: { source: 'event', path: ['payload', 'requestId'] },
                },
                idempotencyKeyFrom: { template: 'reserve:surface:{requestId}' },
              },
            ],
          },
        ],
      },
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
    policyId: 'agent-surface',
    domainId: 'orders',
    workflowDefinition: quoteDefinition(),
    strictWorkflowDefinition: quoteDefinition(),
    decisionSchema,
    governanceSemantics: { hardInvariants: [CAP_INVARIANT] },
    initialStateKey: 'review',
    initialContext: {},
    rules: {
      'rule:surface-quote': { ruleId: 'rule:surface-quote', eventType: 'QUOTE_DECIDED', payloadFromInput: { amount: 'amount' } },
      'rule:surface-reserve': { ruleId: 'rule:surface-reserve', eventType: 'QUOTE_DECIDED', payloadFromInput: { amount: 'amount', requestId: 'requestId' } },
    },
    intentBindings: {
      submitSurfaceQuote: {
        trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
        ruleId: 'rule:surface-quote',
        roles: ['requester'],
        definition: quoteDefinition(),
      },
      submitSurfaceReserve: {
        trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
        ruleId: 'rule:surface-reserve',
        roles: ['requester'],
        definition: reserveDefinition(),
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
