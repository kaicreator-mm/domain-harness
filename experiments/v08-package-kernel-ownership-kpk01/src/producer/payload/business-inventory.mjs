/**
 * Business Domain Package — inventory reservation v1.0.0 (experiment KPK-01
 * / KPK-08 / Controller 090 dynamic-binding acceptance)
 * ============================================================================
 *
 * A THIRD materially distinct business field on the UNCHANGED Microkernel,
 * Kernel and Standard SDK package bytes: warehouse inventory reservation.
 * Added by the Controller 090 bounded repair so the per-occurrence dynamic
 * effect binding is proven on TWO genuinely different domains (approval
 * amounts/requestIds AND inventory sku/qty/reservationIds), mirroring the
 * #972@6098188937 INV1 falsifier shape that reproduced the STATIC-payload
 * contract limitation on the sealed v1.0.0 kernel.
 *
 * Deliberate differences vs business-order-approval / business-parts-sale:
 *   - workflow 'inventory-reservation', states 'available' → 'reserved' |
 *     'rejected'
 *   - guard:inv-within-stock = event.payload.qty <= context.onHand
 *     (context-dependent stock ceiling)
 *   - baseline hard invariant inv:inv-qty-positive = NOT(qty < 1)
 *   - effect:book-reservation (non-idempotent) carries NO static payload:
 *     it declares the kernel's data-only dynamic binding
 *       inputFrom        {sku, qty, reservationId} ← rule-authorized event
 *                        projection (rule:inv-request payloadFromInput)
 *       idempotencyKeyFrom 'inv:{reservationId}'
 *   - caller role 'planner'; event type 'STOCK_RESERVED'
 *   - booking resource port ('booking' / 'postReservation') — the approval
 *     domain's ledger port is not even provisioned here.
 *
 * This package owns business policy ONLY: no admission/journal/state
 * mechanism code, no kernel imports. The dynamic binding declaration is
 * data-only and is validated/pinned by the Kernel at wiring; this module
 * never composes effect payloads itself.
 *
 * Kernel ABI: kpk01-business-abi/1 — `getPolicy()` business-policy endpoint.
 */

export const MODULE_ID = 'business-inventory-reservation@1.0.0';
export const PACKAGE_KIND = 'business';
export const ABI_VERSION = 'kpk01-business-abi/1';
export const ENDPOINTS = [
  { endpointId: 'business:inventory-reservation', kind: 'business-policy' },
];

export const INTENT_TYPES = ['reserveStock'];
export const EFFECT_TYPES = ['effect:book-reservation'];

const QTY_POSITIVE_INVARIANT = {
  invariantId: 'inv:inv-qty-positive',
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
    policyId: 'inventory-reservation',
    domainId: 'inventory',
    workflowDefinition: {
      workflowKey: 'inventory-reservation',
      initialState: 'available',
      initialContext: { onHand: 10 },
      guards: [
        {
          guardId: 'guard:inv-within-stock',
          predicate: {
            op: 'lte',
            left: { source: 'event', path: ['payload', 'qty'] },
            right: { source: 'context', path: ['onHand'] },
          },
        },
      ],
      states: [
        {
          stateKey: 'available',
          transitions: [
            {
              transitionKey: 'reserve',
              trigger: { kind: 'event', eventType: 'STOCK_RESERVED' },
              targetState: 'reserved',
              guardId: 'guard:inv-within-stock',
              effectIntents: [
                {
                  effectType: 'effect:book-reservation',
                  inputFrom: {
                    sku: { source: 'event', path: ['payload', 'sku'] },
                    qty: { source: 'event', path: ['payload', 'qty'] },
                    reservationId: { source: 'event', path: ['payload', 'reservationId'] },
                  },
                  idempotencyKeyFrom: { template: 'inv:{reservationId}' },
                },
              ],
            },
            // No unguarded 'reject' fallback on the same trigger: the
            // over-stock GUARD denial path must stay reachable (an
            // over-stock request denies on guard:inv-within-stock instead
            // of falling through to an admitted 'rejected' state).
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
    initialStateKey: 'available',
    initialContext: { onHand: 10 },
    rules: {
      'rule:inv-request': { ruleId: 'rule:inv-request', eventType: 'STOCK_RESERVED', payloadFromInput: { sku: 'sku', qty: 'qty', reservationId: 'reservationId' } },
    },
    intentBindings: {
      reserveStock: {
        trigger: { kind: 'event', eventType: 'STOCK_RESERVED' },
        ruleId: 'rule:inv-request',
        roles: ['planner'],
      },
    },
    effectBindings: {
      'effect:book-reservation': {
        semantics: 'non-idempotent',
        handler: async ({ input, effectId, resources }) => {
          if (resources === undefined) {
            throw new Error('effect:book-reservation requires the Host resource port');
          }
          return resources.call('booking', 'postReservation', { ...input, effectId });
        },
      },
    },
  };
}
