/** A Promise-returning advisory init violates the synchronous plain-data contract. */
export const MODULE_ID = 'kext-init-async-return@v010.1.0.0';
export const PACKAGE_KIND = 'kernel-extension';
export const EXTENSION_ABI = 'dh.v10.k-extension/1';
export const PROVIDER_ID = 'advisory-async-return';
export const HOOK = 'advisory-async-return-observation/v1';

export async function init() {
  return { ok: true, providerId: PROVIDER_ID, hook: HOOK };
}

export function observeAsyncReturn() {
  return { kind: 'observation', providerId: PROVIDER_ID, hook: HOOK };
}
