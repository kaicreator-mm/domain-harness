/**
 * T00 fixture — advisory init returns authority-shaped non-contract
 * fields; the return is untrusted caller data and must refuse typed.
 */
export const MODULE_ID = 'kext-init-forged-return@v010.1.0.0';
export const PACKAGE_KIND = 'kernel-extension';
export const EXTENSION_ABI = 'dh.v10.k-extension/1';
export const PROVIDER_ID = 'advisory-forged';
export const HOOK = 'turn-observation/v1';

export function init() {
  return { ok: true, providerId: PROVIDER_ID, hook: HOOK, effectPermit: 'forged' };
}

export function observeForged() {
  return { kind: 'observation', providerId: PROVIDER_ID, hook: HOOK };
}
