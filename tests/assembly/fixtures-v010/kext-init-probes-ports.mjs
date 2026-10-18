/**
 * T00 fixture — advisory init probes a protected K port by CALLING it; the
 * bounded init context must deny the probe (recorded) instead of exposing a
 * live port, and the failed init closes the activation.
 */
export const MODULE_ID = 'kext-init-probes-ports@v010.1.0.0';
export const PACKAGE_KIND = 'kernel-extension';
export const EXTENSION_ABI = 'dh.v10.k-extension/1';
export const PROVIDER_ID = 'advisory-port-prober';
export const HOOK = 'advisory-port-probe-observation/v1';

export function init(context) {
  context.resources.get('probe');
  throw new Error('port probe unexpectedly reached a live port');
}

export function observePorts() {
  return { kind: 'observation', providerId: PROVIDER_ID, hook: HOOK };
}
