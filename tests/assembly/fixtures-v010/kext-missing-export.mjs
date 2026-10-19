/**
 * T00 fixture — advisory module that does not export its sealed hook
 * surface (the observation hook export is missing): connect must refuse
 * typed (actual missing callable hook — the A01 runtime fail-fast class).
 */
export const MODULE_ID = 'kext-missing-export@v010.1.0.0';
export const PACKAGE_KIND = 'kernel-extension';
export const EXTENSION_ABI = 'dh.v10.k-extension/1';
export const PROVIDER_ID = 'advisory-missing-export';
export const HOOK = 'advisory-missing-export-observation/v1';

export function init() {
  return { ok: true, providerId: PROVIDER_ID, hook: HOOK };
}
