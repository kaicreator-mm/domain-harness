/**
 * T00 fixture — K advisory extension #1 (physically distinct module).
 * [v0.10 #1264] Provides the Kernel's CLOSED `admission-budget-advice/v1`
 * hook: a pure, bounded PRE-ADMISSION budget advice. The Kernel Primary
 * invokes it with a frozen redacted proposal (intentType, workflowId and the
 * Kernel's own effective hard limits — never an instanceKey, input payload
 * or caller data) and revalidates the returned ceiling itself; the advice
 * can only tighten the Kernel's limits and is otherwise ignored for
 * authority. This fixture records every proposal it receives for witness
 * assertions and, absent a test plan, always advises `{ maxSteps: 2 }` — a
 * real deterministic tightening. No authority, no ports, no writes.
 *
 * Test plan channel (the established fixture-sentinel pattern of this
 * suite): `globalThis.__v010AlphaAdvicePlan` — an ordered array of
 * `{ advice }` / `{ throw: true }` steps consumed one per consultation.
 */
export const MODULE_ID = 'kext-advisory-alpha@v010.1.0.0';
export const PACKAGE_KIND = 'kernel-extension';
export const EXTENSION_ABI = 'dh.v10.k-extension/1';
export const PROVIDER_ID = 'advisory-alpha';
export const HOOK = 'admission-budget-advice/v1';

export function init(context) {
  return {
    ok: true,
    providerId: PROVIDER_ID,
    hook: HOOK,
    observedContext: { appId: context.appId, hardBudget: context.hardBudget },
  };
}

export function observeAlpha(proposal) {
  (globalThis.__v010AlphaProposals ??= []).push(proposal);
  const plan = globalThis.__v010AlphaAdvicePlan;
  const step = Array.isArray(plan) && plan.length > 0 ? plan.shift() : undefined;
  if (step !== null && typeof step === 'object' && step.throw === true) {
    throw new Error('advisory-alpha planned budget-advice fault');
  }
  if (step !== null && typeof step === 'object' && Object.hasOwn(step, 'advice')) {
    return step.advice;
  }
  return { maxSteps: 2 };
}

export function dispose() {
  globalThis.__v010Disposals = [...(globalThis.__v010Disposals ?? []), MODULE_ID];
}
