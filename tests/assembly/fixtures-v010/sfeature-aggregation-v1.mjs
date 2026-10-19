/**
 * T00 fixture — selected S feature #2: physically separate data-only
 * Standard feature module (bounded aggregation semantics placeholder).
 */
export const MODULE_ID = 'sfeature-aggregation@v010.1.0.0';
export const PACKAGE_KIND = 'standard-feature';
export const FEATURE_ABI = 'dh.v10.standard-feature/1';
export const FEATURE_KEY = 'standard:aggregation/1';

export function init() {
  return { ok: true, featureKey: FEATURE_KEY };
}

export function sum(values) {
  if (!Array.isArray(values)) return { ok: false, reason: 'not-an-array' };
  let total = 0;
  for (const value of values) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return { ok: false, reason: 'non-finite-entry' };
    }
    total += value;
  }
  return { ok: true, total };
}
