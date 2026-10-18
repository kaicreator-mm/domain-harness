/**
 * v0.10 K-extension research fixture — evaluation side-effect sentinel.
 *
 * Used as a required transitive dependency of an extension in R4: a
 * top-level statement appends to a global registry the moment this module is
 * ESM-evaluated. It is zero-import clean (passes the real v0.9 AST gate), so
 * the ONLY way its sentinel fires is an actual `import()` by the loader. A
 * refused preflight must leave the sentinel count at ZERO across the entire
 * closure; a valid activation of the same subject must show exactly one.
 */
const registry = (globalThis.__v10kextEvals ??= []);
registry.push('kext:side-effect-sentinel@1');

export const MODULE_ID = 'kext:side-effect-sentinel@1';
export const PACKAGE_KIND = 'kernel-extension';
export const EXTENSION_ABI = 'dh.v10.k-extension/1';
export const PROVIDER_ID = 'telemetry-sentinel';
export const HOOK = 'telemetry-sentinel/v1';

export function init(_context) {
  return { ok: true, providerId: PROVIDER_ID, hook: HOOK, observedContext: {} };
}

export function telemetryPing(_input) {
  return { kind: 'telemetry', providerId: PROVIDER_ID, hook: HOOK };
}
