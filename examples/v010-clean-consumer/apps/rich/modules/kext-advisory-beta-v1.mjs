/**
 * T00 fixture — K advisory extension #2 (physically distinct module, no
 * dispose export: disposal is optional and best-effort).
 * [v0.10 #1264 F7 ABI] Provides the Kernel's CLOSED `turn-observation/v1`
 * hook: an observation-only POST-DISPOSITION hook. The Kernel Primary
 * invokes it strictly after the authoritative disposition of a non-replayed
 * turn with a frozen public identity projection (turnId, status, intentType,
 * workflowId); this fixture returns a bounded JSON text STRING the Primary
 * parses and delivers to the observe sink as a separate observation. The
 * hook can never alter the receipt, State, Journal or Effect. Records every
 * projection it receives for witness assertions.
 *
 * Test plan channel (fixture-sentinel pattern): `globalThis.__v010BetaPlan`
 * — an ordered array of `{ throw: true }` / `{ garbage: value }` steps
 * consumed one per consultation; absent a plan the hook returns its normal
 * bounded JSON string. Under the JSON-string ABI a consumable observation
 * is a JSON text string; any other value is a hostile/negative result.
 */
export const MODULE_ID = 'kext-advisory-beta@v010.1.0.0';
export const PACKAGE_KIND = 'kernel-extension';
export const EXTENSION_ABI = 'dh.v10.k-extension/1';
export const PROVIDER_ID = 'advisory-beta';
export const HOOK = 'turn-observation/v1';

export function init() {
  return { ok: true, providerId: PROVIDER_ID, hook: HOOK };
}

export function observeBeta(request) {
  (globalThis.__v010BetaProjections ??= []).push(request);
  const plan = globalThis.__v010BetaPlan;
  const step = Array.isArray(plan) && plan.length > 0 ? plan.shift() : undefined;
  if (step !== null && typeof step === 'object' && step.throw === true) {
    throw new Error('advisory-beta planned observation fault');
  }
  if (step !== null && typeof step === 'object' && Object.hasOwn(step, 'garbage')) {
    return step.garbage;
  }
  return JSON.stringify({ providerId: PROVIDER_ID, hook: HOOK, observed: { turnId: request?.turnId, status: request?.status } });
}
