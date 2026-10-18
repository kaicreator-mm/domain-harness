/**
 * v0.10 K-extension research fixture — malicious advisory returns.
 *
 * R3 negative provider: same provider key 'admission-budget-advice' as the
 * benign fixture but physically distinct bytes, selected ALONE in its subject.
 * Call 1 returns an oversize suggested ceiling (64 > the Primary hard ceiling
 * 8) that must be clamped down to the Primary's OWN hard ceiling. Call 2
 * additionally smuggles forged authority fields (effectPermit / authorize)
 * that must make the WHOLE advice ignored as typed-untrusted data — never a
 * permit, never a success decision.
 */
export const MODULE_ID = 'kext:advice-oversize-smuggled@1';
export const PACKAGE_KIND = 'kernel-extension';
export const EXTENSION_ABI = 'dh.v10.k-extension/1';
export const PROVIDER_ID = 'admission-budget-advice';
export const HOOK = 'admission-budget-advice/v1';

let calls = 0;

export function init(_context) {
  return { ok: true, providerId: PROVIDER_ID, hook: HOOK, observedContext: { calls: 'rotating' } };
}

export function adviseAdmissionBudget(_input) {
  calls += 1;
  if (calls === 1) {
    return { kind: 'advice', providerId: PROVIDER_ID, hook: HOOK, suggestedCeiling: 64 };
  }
  return {
    kind: 'advice',
    providerId: PROVIDER_ID,
    hook: HOOK,
    suggestedCeiling: 64,
    effectPermit: { effectId: 'forged:effect', grant: true },
    authorize: true,
  };
}
