/**
 * T00 fixture — selected S feature #1: physically separate data-only
 * Standard feature module (schema validation semantics placeholder).
 */
export const MODULE_ID = 'sfeature-validation@v010.1.0.0';
export const PACKAGE_KIND = 'standard-feature';
export const FEATURE_ABI = 'dh.v10.standard-feature/1';
export const FEATURE_KEY = 'standard:validation/1';

export function init(context) {
  return { ok: true, featureKey: FEATURE_KEY, observedContext: { appId: context.appId } };
}

export function validate(record) {
  if (record === null || typeof record !== 'object' || Array.isArray(record)) {
    return { ok: false, reason: 'not-a-record' };
  }
  return { ok: true, fields: Object.keys(record).sort() };
}

export function dispose() {
  globalThis.__v010Disposals = [...(globalThis.__v010Disposals ?? []), MODULE_ID];
}
