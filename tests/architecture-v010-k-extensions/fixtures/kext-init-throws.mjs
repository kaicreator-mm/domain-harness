/**
 * v0.10 K-extension research fixture — post-preflight init failure (R5 fault).
 *
 * Bytes and digest are perfectly valid, so the ENTIRE closure passes
 * preflight and both modules are imported; the failure happens only at init
 * time. The loader must close the facade, dispose previously initialized
 * modules in reverse order, leave durable K state untouched and leak no
 * protected Host port.
 */
export const MODULE_ID = 'kext:init-throws@1';
export const PACKAGE_KIND = 'kernel-extension';
export const EXTENSION_ABI = 'dh.v10.k-extension/1';
export const PROVIDER_ID = 'recovery-diagnostics';
export const HOOK = 'recovery-diagnostics/v1';

export function init(_context) {
  throw new Error('kext: deliberate post-preflight init failure');
}

export function diagnoseRecovery(_input) {
  return { kind: 'hints', providerId: PROVIDER_ID, hook: HOOK, hints: [] };
}
