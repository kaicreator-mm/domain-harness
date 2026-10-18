/**
 * T00 fixture — K advisory extension #2 (physically distinct module, no
 * dispose export: disposal is optional and best-effort).
 */
export const MODULE_ID = 'kext-advisory-beta@v010.1.0.0';
export const PACKAGE_KIND = 'kernel-extension';
export const EXTENSION_ABI = 'dh.v10.k-extension/1';
export const PROVIDER_ID = 'advisory-beta';
export const HOOK = 'advisory-beta-observation/v1';

export function init() {
  return { ok: true, providerId: PROVIDER_ID, hook: HOOK };
}

export function observeBeta(turn) {
  return { kind: 'observation', providerId: PROVIDER_ID, hook: HOOK, turn };
}
