/**
 * Business Domain Package — parts sales v1.0.0 (experiment KPK-01, KPK-08)
 * ========================================================================
 *
 * A materially DIFFERENT business field on the UNCHANGED Microkernel, Kernel
 * and Standard SDK package bytes: internal parts sales reservations.
 *
 * Deliberate behavioral differences vs business-order-approval (all declared
 * here, none in any shared code):
 *   - workflow 'parts-sale', states 'inquiry' → 'reserved' | 'rejected'
 *   - guard:stock-ok = event.payload.qty <= context.stockOnHand (a CONTEXT-
 *     dependent guard — impossible in the approval domain's event-only guard)
 *   - baseline hard invariant inv:qty-positive = NOT(qty < 1)
 *   - effect:reserve-stock is IDEMPOTENT (vs the approval domain's
 *     non-idempotent reserve) with idempotencyKey 'reserve-parts:1'
 *   - caller role 'clerk' (approval requires 'requester')
 *   - event type 'PARTS_REQUESTED' with payload {qty, partNo}
 *
 * Kernel ABI: kpk01-business-abi/1 — `getPolicy()` business-policy endpoint.
 */

export const MODULE_ID = 'business-parts-sale@1.0.0';
export const PACKAGE_KIND = 'business';
export const ABI_VERSION = 'kpk01-business-abi/1';
export const ENDPOINTS = [
  { endpointId: 'business:parts-sale', kind: 'business-policy' },
];

export const INTENT_TYPES = ['requestParts'];
export const EFFECT_TYPES = ['effect:reserve-stock'];

const QTY_POSITIVE_INVARIANT = {
  invariantId: 'inv:qty-positive',
  predicate: {
    op: 'not',
    predicate: {
      op: 'lt',
      left: { source: 'event', path: ['payload', 'qty'] },
      right: { source: 'literal', value: 1 },
    },
  },
};

export function getPolicy() {
  return {
    packageId: MODULE_ID,
    policyId: 'parts-sale',
    domainId: 'parts',
    workflowDefinition: {
      workflowKey: 'parts-sale',
      initialState: 'inquiry',
      initialContext: { stockOnHand: 100 },
      guards: [
        {
          guardId: 'guard:stock-ok',
          predicate: {
            op: 'lte',
            left: { source: 'event', path: ['payload', 'qty'] },
            right: { source: 'context', path: ['stockOnHand'] },
          },
        },
      ],
      states: [
        {
          stateKey: 'inquiry',
          transitions: [
            {
              transitionKey: 'reserve',
              trigger: { kind: 'event', eventType: 'PARTS_REQUESTED' },
              targetState: 'reserved',
              guardId: 'guard:stock-ok',
              effectIntents: [
                {
                  effectType: 'effect:reserve-stock',
                  input: { partNo: 'P-42', qty: 5 },
                  idempotencyKey: 'reserve-parts:1',
                },
              ],
            },
            {
              transitionKey: 'reject',
              trigger: { kind: 'event', eventType: 'PARTS_REQUESTED' },
              targetState: 'rejected',
            },
          ],
        },
        { stateKey: 'reserved', kind: 'final' },
        { stateKey: 'rejected', kind: 'final' },
      ],
    },
    decisionSchema: {
      isValid(value) {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
        const decision = value.decision;
        const event = value.event;
        if (typeof decision !== 'object' || decision === null || Array.isArray(decision)) return false;
        if (typeof event !== 'object' || event === null || Array.isArray(event)) return false;
        return typeof decision.outcome === 'string'
          && typeof event.type === 'string';
      },
    },
    governanceSemantics: { hardInvariants: [QTY_POSITIVE_INVARIANT] },
    initialStateKey: 'inquiry',
    initialContext: { stockOnHand: 100 },
    rules: {
      'rule:parts-request': { ruleId: 'rule:parts-request', eventType: 'PARTS_REQUESTED', payloadFromInput: { qty: 'qty', partNo: 'partNo' } },
    },
    intentBindings: {
      requestParts: {
        trigger: { kind: 'event', eventType: 'PARTS_REQUESTED' },
        ruleId: 'rule:parts-request',
        roles: ['clerk'],
      },
    },
    effectBindings: {
      'effect:reserve-stock': {
        semantics: 'idempotent',
        handler: async ({ input, effectId, resources }) => {
          if (resources === undefined) {
            throw new Error('effect:reserve-stock requires the Host resource port');
          }
          return resources.call('warehouse', 'reserveStock', { ...input, effectId });
        },
      },
    },
  };
}
