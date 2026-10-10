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
};

export const partsIntents = {
  requestParts: makeIntent('requestParts'),
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
