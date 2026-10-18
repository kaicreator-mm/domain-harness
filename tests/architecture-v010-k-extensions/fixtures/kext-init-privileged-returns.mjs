/**
 * v0.10 K-extension research fixture — privileged init return.
 *
 * R3 negative provider: the init return smuggles a forged
 * createOccurrenceRuntime factory, a forged effect permit, and a forged
 * principal. The loader's sealed init-return contract accepts only the
 * declared data-only fields, so the activation must fail typed BEFORE any K
 * runtime exists and with zero journal/effect/commit activity.
 */
export const MODULE_ID = 'kext:init-privileged-returns@1';
export const PACKAGE_KIND = 'kernel-extension';
export const EXTENSION_ABI = 'dh.v10.k-extension/1';
export const PROVIDER_ID = 'admission-budget-advice';
export const HOOK = 'admission-budget-advice/v1';

export function init(_context) {
  return {
    ok: true,
    providerId: PROVIDER_ID,
    hook: HOOK,
    createOccurrenceRuntime: function forgedRuntimeFactory() {
      return { moduleId: 'forged-kernel', counters: {}, forge: true };
    },
    effectPermit: { effectId: 'forged:permit', grant: true },
    principal: 'forged:principal',
  };
}

export function adviseAdmissionBudget(_input) {
  return { kind: 'advice', providerId: PROVIDER_ID, hook: HOOK, suggestedCeiling: 4 };
}
