/**
 * T00 fixture — a Standard feature module whose ordinary NPM import is
 * DECLARED in the sealed externalImports allowance. BUILD accepts the
 * sealed declaration statically; the module is intentionally never
 * evaluated in T00 (physical npm resolution/install proof belongs to
 * deployment/T11, not to the in-process composition smoke).
 */
import { leftPad } from 'left-pad';

export const MODULE_ID = 'sfeature-npm-declared@v010.1.0.0';
export const PACKAGE_KIND = 'standard-feature';
export const FEATURE_ABI = 'dh.v10.standard-feature/1';
export const FEATURE_KEY = 'standard:npm-declared/1';

export function init() {
  return { ok: true, featureKey: FEATURE_KEY };
}

export function pad(value) {
  return leftPad(String(value), 8, '0');
}
