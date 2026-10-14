/**
 * Capability Domain Package — quote tools v1.0.0 (#1023 S04 callable OperationCall proof)
 * ====================================================================
 *
 * A genuinely additional S02a BUILD-admitted capability package for the
 * order-approval Domain App. It owns exactly two callable operations behind
 * the sealed `OPERATIONS` ABI table plus the BUILD-bound module handlers:
 *
 *   quote.preview-total  effectClass 'none'            — PURE: a deterministic
 *     total preview computed from this module's own frozen rate table. It
 *     reads no Kernel state, no Journal, no Host port and no ambient
 *     anything — the dispatch hands it exactly one plain-data input, and the
 *     sealed bytes refuse any second argument structurally.
 *
 *   quote.reserve        effectClass 'non-idempotent'  — EFFECTFUL: this
 *     module's `reserveLedger` is the PHYSICAL ledger adapter. It is never
 *     reachable from an OperationCall directly: the operation maps to the
 *     sealed Business intent `submitQuoteDecisionDynamic`, whose guarded
 *     transition declares the `effect:reserve` dispatch; the selected Kernel
 *     runs Admission → Journal → Effect and only THEN the Business effect
 *     handler calls the Host resource `ledger.reserve`, which the trusted
 *     Host provisioned with THIS package's adapter (BUILD-selected through
 *     the sealed binding — never runtime discovery).
 *
 * Visibility of both operations is governed by the sealed Business policy
 * (the `submitQuoteDecisionDynamic` intent's issuer-signed role set), not by
 * caller data; the agent/LLM surface stays projection-only (HF23/FR15).
 *
 * This package owns its two handlers and their ABI only. It contains no
 * admission/journal/state-transition mechanism, imports nothing, and holds
 * no Host/Kernel private port.
 *
 * Kernel ABI: v08-capability-abi/1 (S02a) — MODULE_ID/PACKAGE_KIND/
 * ABI_VERSION/ENDPOINTS identity plus the optional sealed `OPERATIONS`
 * OperationCall ABI table and the BUILD-bound handlers.
 */

export const MODULE_ID = 'capability-quote-tools@v08.1.0.0';
export const PACKAGE_KIND = 'capability';
export const ABI_VERSION = 'v08-capability-abi/1';
export const ENDPOINTS = [
  { endpointId: 'capability:quote-tools', kind: 'capability-endpoint' },
];

/**
 * The sealed OperationCall ABI (#1023 S04): one entry per callable
 * operation, matched against the BUILD capability binding's exact
 * operation→handler map at wiring time. `effectClass` uses the pre-existing
 * declaration family none | idempotent | non-idempotent; `visibility`
 * (pure) and `intentType` (effectful) reference a SEALED Business intent
 * type whose issuer-bound role set governs who may call the operation; the
 * effectful `resource` names the Host physical resource route the Kernel's
 * effect dispatch (never the caller) reaches this package's handler
 * through. At wiring the effectful claims are CROSS-VALIDATED against the
 * sealed Business policy's own effect-binding declarations (#1023 S04 R1
 * P1-02): the admission intent must dispatch the claimed effect, the effect
 * binding's declared route {key, operation} must equal this claim, and its
 * `semantics` must equal the declared `effectClass` — a wrong route, a
 * false idempotency declaration or a no-effect intent refuses at load.
 */
export const OPERATIONS = [
  {
    operationId: 'quote.preview-total',
    effectClass: 'none',
    visibility: { intentType: 'submitQuoteDecisionDynamic' },
  },
  {
    operationId: 'quote.reserve',
    effectClass: 'non-idempotent',
    intentType: 'submitQuoteDecisionDynamic',
    resource: { key: 'ledger', operation: 'reserve' },
  },
];

const SERVICE_MULTIPLIER = Object.freeze({ standard: 1, expedited: 1.25 });

/**
 * PURE handler for quote.preview-total: deterministic preview from the
 * module's own frozen rate data. Exactly one plain-data argument — a second
 * argument would mean a port or capability rode the OperationCall envelope.
 */
export function previewTotal(input) {
  if (arguments.length !== 1) {
    throw new Error('quote.preview-total receives exactly one plain-data input; no port or capability rides an OperationCall');
  }
  const record = input === null || typeof input !== 'object' ? {} : input;
  const multiplier = SERVICE_MULTIPLIER[record.serviceLevel];
  const amount = Number(record.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('quote.preview-total requires a non-negative finite amount');
  }
  const serviceLevel = multiplier === undefined ? 'standard' : record.serviceLevel;
  const subtotal = Math.round(amount * 100 * (multiplier ?? 1)) / 100;
  return { ok: true, serviceLevel, subtotal, total: subtotal };
}

/**
 * EFFECTFUL physical adapter for quote.reserve: the ledger reservation
 * implementation. Executed ONLY through the Host resource `ledger.reserve`
 * after the selected Kernel's effect dispatch authorizes it — the payload
 * arrives from the Business effect handler (intent-input projection plus
 * the Kernel-assigned durable effectId), never from a raw OperationCall.
 */
export function reserveLedger(payload) {
  if (arguments.length !== 1) {
    throw new Error('quote.reserve adapter receives exactly one plain-data payload');
  }
  const record = payload === null || typeof payload !== 'object' ? {} : payload;
  return {
    reserved: true,
    ledgerEntryId: `ledger:${String(record.effectId ?? 'unknown')}`,
    reservedAmount: Number(record.amount) || 0,
    requestId: record.requestId === undefined ? null : record.requestId,
  };
}
