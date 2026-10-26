/**
 * Issue #1379 authoring-template read-only Capability module (C, non-effect).
 * =====================================================================
 *
 * One sealed operation `inventory.get` over the module's own frozen stock
 * table. `externalEffect` is deliberately ABSENT (module-level `false`): the
 * kernel resources port dispatches it directly — no K permit, no external
 * Effect gate. Private helpers stay private: only `getInventory` is sealed
 * as the operation handler.
 *
 * Kernel ABI: v08-capability-abi/1 — MODULE_ID/PACKAGE_KIND/ABI_VERSION/
 * ENDPOINTS identity plus the BUILD-bound handler.
 */
export const MODULE_ID = 'capability-inventory-readonly@v0102.1.0.0';
export const PACKAGE_KIND = 'capability';
export const ABI_VERSION = 'v08-capability-abi/1';
export const ENDPOINTS = [
  { endpointId: 'capability:inventory', kind: 'capability-endpoint' },
];

/** Private frozen stock table — module data, not a Tool and not exported. */
const STOCK = Object.freeze({
  'sku-alpha': Object.freeze({ onHand: 12 }),
  'sku-beta': Object.freeze({ onHand: 0 }),
});

/** PRIVATE helper: normalize and bound the requested sku. */
function normalizeSku(value) {
  return String(value ?? '').slice(0, 32);
}

export function getInventory(input) {
  if (arguments.length !== 1) {
    throw new Error('inventory.get receives exactly one plain-data input; no port or capability rides an operation call');
  }
  const record = input === null || typeof input !== 'object' ? {} : input;
  const sku = normalizeSku(record.sku);
  const entry = STOCK[sku] ?? null;
  return {
    found: entry !== null,
    sku,
    onHand: entry === null ? null : entry.onHand,
  };
}
