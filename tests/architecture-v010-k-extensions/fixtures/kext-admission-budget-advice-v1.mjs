/**
 * v0.10 K-extension research fixture — 'admission-budget-advice/v1'.
 *
 * Physically separate self-contained zero-import ESM module sealed as its own
 * kernel-extension package (#1150 R2). It consumes a frozen, redacted
 * proposed-workflow-step projection plus the immutable hard budget profile and
 * returns a bounded data-only suggested step ceiling. It never receives a
 * Host document/CAS/crypto port, never mints a permit, and its return is a
 * suggestion the K Primary independently clamps or ignores.
 *
 * Deterministic useful policy: ordinary intents are advised a conservative
 * two-thirds of the hard step ceiling; '*Strict' intents keep the full
 * admitted ceiling. Same-realm trusted JS is not a sandbox; usefulness and
 * non-authority are what this module demonstrates.
 */
export const MODULE_ID = 'kext:admission-budget-advice@1';
export const PACKAGE_KIND = 'kernel-extension';
export const EXTENSION_ABI = 'dh.v10.k-extension/1';
export const PROVIDER_ID = 'admission-budget-advice';
export const HOOK = 'admission-budget-advice/v1';

export function init(context) {
  // The bounded init context is data-only; this module deliberately never
  // touches any protected port name (the dedicated malicious fixture proves
  // those names deny typed when probed).
  return {
    ok: true,
    providerId: PROVIDER_ID,
    hook: HOOK,
    observedContext: { bounded: true, advisoryKeys: Array.isArray(context.advisoryKeys) ? context.advisoryKeys.length : 0 },
  };
}

export function dispose() {
  // Cooperative disposal hook: no authority, no writes; presence lets the
  // loader demonstrate bounded reverse disposal on a later init failure.
}

export function adviseAdmissionBudget(input) {
  const record = input === null || typeof input !== 'object' ? {} : input;
  const profile = record.hardBudgetProfile;
  const turn = record.turn;
  const hard = profile !== null && typeof profile === 'object'
    && Number.isSafeInteger(profile.maxStepsPerTurn) && profile.maxStepsPerTurn > 0
    ? profile.maxStepsPerTurn
    : 8;
  const conservative = Math.max(1, Math.floor((hard * 2) / 3));
  const suggested = typeof turn === 'object' && turn !== null
    && typeof turn.intentType === 'string' && turn.intentType.endsWith('Strict')
    ? hard
    : conservative;
  return { kind: 'advice', providerId: PROVIDER_ID, hook: HOOK, suggestedCeiling: suggested };
}
