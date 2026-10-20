/**
 * T07 (#1174) physical-shadow baseline fixture — an ACTUALLY SELECTED pure
 * Standard feature. The Host pins its exact source bytes as the approved
 * fallback; the shadow runner compiles these same bytes in its isolated
 * read-only context. Kept intentionally trivial and deterministic.
 */
export const MODULE_ID = 'sfeature-shadow-baseline@v010.1.0.0';
export const PACKAGE_KIND = 'standard-feature';
export const FEATURE_ABI = 'dh.v10.standard-feature/1';
export const FEATURE_KEY = 'standard:shadow-baseline/1';

export function init(context) {
  return { ok: true, featureKey: FEATURE_KEY, observedContext: { appId: context.appId } };
}

/** Deterministic projection of one selected K observation. */
export function evaluate(input) {
  const value = input && typeof input.value === 'object' && input.value !== null ? input.value : {};
  return {
    key: input && input.key,
    revision: input && input.revision,
    state: typeof value.state === 'string' ? value.state : null,
    phase: typeof value.phase === 'string' ? value.phase : null,
    outcome: typeof value.outcome === 'string' ? value.outcome : null,
  };
}
