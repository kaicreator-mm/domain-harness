/**
 * T00 fixture — a late advisory module whose init throws: activation must
 * fail closed, dispose ONLY the successfully initialized advisory modules
 * in reverse order and leave K documents untouched.
 */
export const MODULE_ID = 'kext-init-throws@v010.1.0.0';
export const PACKAGE_KIND = 'kernel-extension';
export const EXTENSION_ABI = 'dh.v10.k-extension/1';
export const PROVIDER_ID = 'advisory-throws';
export const HOOK = 'turn-observation/v1';

export function init() {
  throw new Error('fixture: intentional init failure');
}

export function observeThrows() {
  return { kind: 'observation', providerId: PROVIDER_ID, hook: HOOK };
}
