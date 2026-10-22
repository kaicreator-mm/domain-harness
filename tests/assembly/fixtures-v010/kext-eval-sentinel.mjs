/**
 * T00 fixture — evaluation sentinel: records itself on a global registry
 * the moment the module is EVALUATED. BUILD must keep this at zero (purely
 * static); a Basic activation that does not select the module must keep it
 * at zero too.
 */
globalThis.__v010EvalLog = [...(globalThis.__v010EvalLog ?? []), 'kext-eval-sentinel@v010.1.0.0'];

export const MODULE_ID = 'kext-eval-sentinel@v010.1.0.0';
export const PACKAGE_KIND = 'kernel-extension';
export const EXTENSION_ABI = 'dh.v10.k-extension/1';
export const PROVIDER_ID = 'advisory-sentinel';
export const HOOK = 'admission-budget-advice/v1';

export function init() {
  return { ok: true, providerId: PROVIDER_ID, hook: HOOK };
}

export function observeSentinel() {
  return { kind: 'observation', providerId: PROVIDER_ID, hook: HOOK };
}
