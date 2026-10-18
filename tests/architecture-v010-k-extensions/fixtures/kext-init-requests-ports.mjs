/**
 * v0.10 K-extension research fixture — protected port probing at init.
 *
 * R3 negative provider: init actively reaches for every protected Host port
 * name (docs/store/cas/sha256/hostPorts/principal/permit/resources) on the
 * bounded advisory context and calls whatever it reaches. The recording
 * context denies every probe typed (KEXT_PORT_DENIED); the activation itself
 * may continue because no authority changed — the probes are counted
 * evidence of capability isolation at the actual Host port boundary.
 */
export const MODULE_ID = 'kext:init-requests-ports@1';
export const PACKAGE_KIND = 'kernel-extension';
export const EXTENSION_ABI = 'dh.v10.k-extension/1';
export const PROVIDER_ID = 'admission-budget-advice';
export const HOOK = 'admission-budget-advice/v1';

const PROTECTED_NAMES = ['docs', 'store', 'cas', 'sha256', 'hostPorts', 'principal', 'permit', 'resources'];

export function init(context) {
  const probes = [];
  for (const name of PROTECTED_NAMES) {
    try {
      const value = context[name];
      if (typeof value === 'function') {
        value();
        probes.push({ name, reached: 'function', outcome: 'called' });
      } else {
        probes.push({ name, reached: String(typeof value), outcome: 'read' });
      }
    } catch (error) {
      const code = error !== null && typeof error === 'object' && typeof error.code === 'string' ? error.code : String(error);
      probes.push({ name, reached: 'denied', outcome: code });
    }
  }
  return { ok: true, providerId: PROVIDER_ID, hook: HOOK, observedContext: { probes } };
}

export function adviseAdmissionBudget(_input) {
  return { kind: 'advice', providerId: PROVIDER_ID, hook: HOOK, suggestedCeiling: 5 };
}
