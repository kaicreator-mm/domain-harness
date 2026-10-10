/**
 * UX typed clients (experiment KPK-01, falsifier E / KPK-11 / D-05)
 * =================================================================
 *
 * One TYPED user intent, one read/query/observation path per domain app.
 * The UX submits intents ONLY through the Microkernel transport into the
 * physically selected Kernel mechanism; it holds no commit authority, no
 * journal handle, no state handle and no Host port. A UX-side attempt to
 * forge a committed effect/state has no representable route — the transport
 * accepts plain-JSON intents and everything else fails typed.
 */

/** Shared typed-intent constructor (data only, validated by the transport again). */
function makeIntent(intentType) {
  return (fields) => ({
    kind: 'kpk01/intent',
    intentType,
    ...fields,
  });
}

export const approvalIntents = {
  submitQuoteDecision: makeIntent('submitQuoteDecision'),
  submitQuoteDecisionStrict: makeIntent('submitQuoteDecisionStrict'),
  submitQuoteDecisionDynamic: makeIntent('submitQuoteDecisionDynamic'),
};

export const partsIntents = {
  requestParts: makeIntent('requestParts'),
};

export const inventoryIntents = {
  reserveStock: makeIntent('reserveStock'),
};

export function createApprovalUx(runtime, { instanceKey = 'instance:42' } = {}) {
  const target = () => ({ workflowId: 'order-quote', instanceKey });
  return {
    /** Open the approval workflow instance (kernel lifecycle, no business transition). */
    async openInstance({ correlationId } = {}) {
      return runtime.openInstance({ target: target(), correlationId });
    },
    /** Typed user intent: submit a decided quote amount for authoritative admission. */
    async submitQuote({ amount, messageId, role = 'requester', strict = false }) {
      const intentType = strict ? 'submitQuoteDecisionStrict' : 'submitQuoteDecision';
      return runtime.send({
        kind: 'kpk01/intent',
        intentType,
        target: target(),
        messageId,
        input: { amount },
        caller: { role },
      });
    },
    /**
     * [Controller 090 repair] Typed dynamic intent: the per-request
     * amount/requestId flow through rule-authorized admission into the
     * kernel-resolved per-occurrence effect input and idempotency key
     * (the UX still holds no effect authority — it only submits data).
     */
    async submitQuoteDynamic({ amount, requestId, messageId, role = 'requester' }) {
      return runtime.send({
        kind: 'kpk01/intent',
        intentType: 'submitQuoteDecisionDynamic',
        target: target(),
        messageId,
        input: { amount, requestId },
        caller: { role },
      });
    },
    /** Observation surface: subscribe to authoritative occurrence receipts. */
    observe(listener) {
      return runtime.observe(listener);
    },
    /** Query surface: read-only instance projection. */
    async getInstance() {
      return runtime.query({ kind: 'instance', target: target() });
    },
    async getJournal() {
      return runtime.query({ kind: 'journal' });
    },
  };
}

export function createPartsUx(runtime, { instanceKey = 'instance:7' } = {}) {
  const target = () => ({ workflowId: 'parts-sale', instanceKey });
  return {
    async openInstance({ correlationId } = {}) {
      return runtime.openInstance({ target: target(), correlationId });
    },
    async requestParts({ qty, partNo = 'P-42', messageId, role = 'clerk' }) {
      return runtime.send({
        kind: 'kpk01/intent',
        intentType: 'requestParts',
        target: target(),
        messageId,
        input: { qty, partNo },
        caller: { role },
      });
    },
    observe(listener) {
      return runtime.observe(listener);
    },
    async getInstance() {
      return runtime.query({ kind: 'instance', target: target() });
    },
    async getJournal() {
      return runtime.query({ kind: 'journal' });
    },
  };
}

/**
 * [Controller 090 repair] Typed UX client for the inventory-reservation
 * domain: per-request sku/qty/reservationId flow through the same
 * Microkernel transport; the kernel resolves the dynamic effect input and
 * 'inv:{reservationId}' idempotency key after admission. No UX effect
 * authority exists on this path.
 */
export function createInventoryUx(runtime, { instanceKey = 'instance:inv-1' } = {}) {
  const target = () => ({ workflowId: 'inventory-reservation', instanceKey });
  return {
    async openInstance({ correlationId } = {}) {
      return runtime.openInstance({ target: target(), correlationId });
    },
    async reserveStock({ sku, qty, reservationId, messageId, role = 'planner' }) {
      return runtime.send({
        kind: 'kpk01/intent',
        intentType: 'reserveStock',
        target: target(),
        messageId,
        input: { sku, qty, reservationId },
        caller: { role },
      });
    },
    observe(listener) {
      return runtime.observe(listener);
    },
    async getInstance() {
      return runtime.query({ kind: 'instance', target: target() });
    },
    async getJournal() {
      return runtime.query({ kind: 'journal' });
    },
  };
}
