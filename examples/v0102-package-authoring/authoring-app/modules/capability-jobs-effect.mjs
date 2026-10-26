/**
 * Issue #1379 authoring-template external-effect Capability module (C).
 * =====================================================================
 *
 * One sealed external Effect Operation `jobs.submit` behind the module-wide
 * `externalEffect: true` classification. Every dispatch reaches this module
 * ONLY through the selected K→C external Effect gate holding a live
 * kernel-issued permit; anything less is typed-refused with ZERO adapter
 * dispatch, so `dispatchOrdinal` below only ever advances on a permitted,
 * gate-authorized call — the physical zero-dispatch witness for the
 * permitless negative.
 *
 * It stays physically SEPARATE from the read-only `capability-inventory`
 * module: module-level `externalEffect` cannot be overridden per handler,
 * so read-only and effectful operations belong in different C modules.
 *
 * Kernel ABI: v08-capability-abi/1.
 */
export const MODULE_ID = 'capability-jobs-effect@v0102.1.0.0';
export const PACKAGE_KIND = 'capability';
export const ABI_VERSION = 'v08-capability-abi/1';
export const ENDPOINTS = [
  { endpointId: 'capability:jobs', kind: 'capability-endpoint' },
];

/** Adapter-internal dispatch counter — advances ONLY on a real gate-authorized dispatch. */
let dispatchCount = 0;

/**
 * The external Effect Operation handler. The K→C gate invokes it as
 * (adapterPayload, dispatchContext) — the context is the gate's own truth,
 * not caller input, and is deliberately unused here. The binding's
 * `external.await: 'phase'` grammar makes the handler answer a phase
 * envelope (accepted|running|terminal), the Rich adapter discipline.
 */
export function submitJob(input, _dispatchContext) {
  if (input === null || typeof input !== 'object') {
    throw new Error('jobs.submit receives one plain-data payload');
  }
  dispatchCount += 1;
  return {
    phase: 'accepted',
    // The ordinal suffix is the adapter's own dispatch counter: it advances
    // ONLY on a gate-authorized dispatch, so a permitless attempt that never
    // reached this module leaves the NEXT authorized externalRef unchanged.
    externalRef: `job:${String(input.effectId ?? 'unknown')}#${dispatchCount}`,
  };
}
