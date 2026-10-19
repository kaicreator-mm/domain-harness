/**
 * T00 fixture — K advisory extension #1 (physically distinct module).
 * Data-only advisory surface: init confirms its sealed provider/hook
 * identity; the observation hook returns plain data only; dispose records
 * itself for reverse-disposal assertions. No authority, no ports.
 */
export const MODULE_ID = 'kext-advisory-alpha@v010.1.0.0';
export const PACKAGE_KIND = 'kernel-extension';
export const EXTENSION_ABI = 'dh.v10.k-extension/1';
export const PROVIDER_ID = 'advisory-alpha';
export const HOOK = 'advisory-alpha-observation/v1';

export function init(context) {
  return {
    ok: true,
    providerId: PROVIDER_ID,
    hook: HOOK,
    observedContext: { appId: context.appId, hardBudget: context.hardBudget },
  };
}

export function observeAlpha(turn) {
  return { kind: 'observation', providerId: PROVIDER_ID, hook: HOOK, turn };
}

export function dispose() {
  globalThis.__v010Disposals = [...(globalThis.__v010Disposals ?? []), MODULE_ID];
}
