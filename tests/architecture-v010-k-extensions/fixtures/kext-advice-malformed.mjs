/**
 * v0.10 K-extension research fixture — malformed advisory returns.
 *
 * R3 negative provider: every advisory return violates the data-only return
 * contract in a different way (negative, non-integer, string ceiling, a
 * Promise instead of a plain record, missing required fields, and finally a
 * thrown error). Each must be ignored by the K Primary with a typed counter
 * and the turn continues with Basic (no-advice) behavior.
 */
export const MODULE_ID = 'kext:advice-malformed@1';
export const PACKAGE_KIND = 'kernel-extension';
export const EXTENSION_ABI = 'dh.v10.k-extension/1';
export const PROVIDER_ID = 'admission-budget-advice';
export const HOOK = 'admission-budget-advice/v1';

let calls = 0;

export function init(_context) {
  return { ok: true, providerId: PROVIDER_ID, hook: HOOK, observedContext: {} };
}

export function adviseAdmissionBudget(_input) {
  calls += 1;
  if (calls === 1) return { kind: 'advice', providerId: PROVIDER_ID, hook: HOOK, suggestedCeiling: -5 };
  if (calls === 2) return { kind: 'advice', providerId: PROVIDER_ID, hook: HOOK, suggestedCeiling: 3.5 };
  if (calls === 3) return { kind: 'advice', providerId: PROVIDER_ID, hook: HOOK, suggestedCeiling: '9' };
  if (calls === 4) return Promise.resolve({ kind: 'advice', providerId: PROVIDER_ID, hook: HOOK, suggestedCeiling: 2 });
  if (calls === 5) return { kind: 'advice' };
  throw new Error('kext: deliberate advisory evaluation failure');
}
