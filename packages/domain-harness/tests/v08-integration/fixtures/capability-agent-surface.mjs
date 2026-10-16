/**
 * Capability Domain Package — agent surface v1.0.0 (#1003 HF23 T-D fixture)
 * ====================================================================
 *
 * A #1003-T-D-Builder-authored S02a capability package for the FR05/HF17/
 * HF23 selected-seam witness, sealed through the REAL compiler BUILD path
 * against the #1003-T-D Business fixture (business-agent-surface.mjs —
 * self-looping review state) plus the CURRENT selected K/S payload bytes.
 * It owns exactly three callable operations behind the sealed
 * `OPERATIONS` ABI table plus the BUILD-bound module handlers:
 *
 *   agent.order-summary  effectClass 'none'  agent: true  — PURE and
 *     agent-exposed: deterministic summary from the module's own frozen
 *     rate table; reads no Kernel state, no Journal, no Host port.
 *
 *   internal.audit-export  effectClass 'none'  (no agent marking) — PURE
 *     but HIDDEN from the agent surface: callable through the protected
 *     route for a Business-admitted principal, never listed by discovery.
 *
 *   agent.order-reserve  effectClass 'non-idempotent'  — EFFECTFUL: maps to
 *     the sealed Business intent `submitSurfaceReserve` whose guarded
 *     transition declares the `effect:reserve` dispatch (`ledger.reserve`
 *     Host resource route). It can NEVER carry the agent marking (the load
 *     wiring refuses `agent: true` on an effectful entry typed); a mutation
 *     reaches the Kernel only through the central occurrence admission —
 *     exactly the S04 route, not re-run here.
 *
 * Visibility of the pure operations is governed by the sealed Business
 * policy (the referenced intents' issuer-signed role set), never by caller
 * data; the agent surface stays projection-only (HF23).
 *
 * Kernel ABI: v08-capability-abi/1 (S02a) — MODULE_ID/PACKAGE_KIND/
 * ABI_VERSION/ENDPOINTS identity plus the sealed `OPERATIONS` table and
 * BUILD-bound handlers.
 */

export const MODULE_ID = 'capability-agent-surface@v08.1.0.0';
export const PACKAGE_KIND = 'capability';
export const ABI_VERSION = 'v08-capability-abi/1';
export const ENDPOINTS = [
  { endpointId: 'capability:agent-surface', kind: 'capability-endpoint' },
];

/**
 * The sealed OperationCall ABI: `agent: true` is the #1003 HF23 BUILD
 * approval marking — pure operations only (the trusted load wiring refuses
 * an effectful marking typed), never widens dispatch and never bypasses
 * the Business visibility gate.
 */
export const OPERATIONS = [
  {
    operationId: 'agent.order-summary',
    effectClass: 'none',
    agent: true,
    visibility: { intentType: 'submitSurfaceQuote' },
  },
  {
    operationId: 'internal.audit-export',
    effectClass: 'none',
    visibility: { intentType: 'submitSurfaceQuote' },
  },
  {
    operationId: 'agent.order-reserve',
    effectClass: 'non-idempotent',
    intentType: 'submitSurfaceReserve',
    resource: { key: 'ledger', operation: 'reserve' },
  },
];

/**
 * PURE handler for agent.order-summary: deterministic summary from the
 * module's own frozen rate data. Exactly one plain-data argument.
 */
export function orderSummary(input) {
  if (arguments.length !== 1) {
    throw new Error('agent.order-summary receives exactly one plain-data input; no port or capability rides an OperationCall');
  }
  const record = input === null || typeof input !== 'object' ? {} : input;
  const amount = Number(record.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('agent.order-summary requires a non-negative finite amount');
  }
  return { ok: true, tool: 'agent.order-summary', subtotal: amount, total: amount };
}

/**
 * PURE handler for internal.audit-export: callable through the protected
 * route, but never agent-exposed — discovery must not list it.
 */
export function auditExport(input) {
  if (arguments.length !== 1) {
    throw new Error('internal.audit-export receives exactly one plain-data input');
  }
  const record = input === null || typeof input !== 'object' ? {} : input;
  return { ok: true, exported: true, scope: String(record.scope ?? 'default') };
}

/**
 * EFFECTFUL physical adapter for agent.order-reserve (the S04 ledger
 * route): executed ONLY through the Host resource `ledger.reserve` after
 * the selected Kernel's effect dispatch authorizes it.
 */
export function reserveLedger(payload) {
  if (arguments.length !== 1) {
    throw new Error('agent.order-reserve adapter receives exactly one plain-data payload');
  }
  const record = payload === null || typeof payload !== 'object' ? {} : payload;
  return {
    reserved: true,
    ledgerEntryId: `ledger:${String(record.effectId ?? 'unknown')}`,
    reservedAmount: Number(record.amount) || 0,
    requestId: record.requestId === undefined ? null : record.requestId,
  };
}
