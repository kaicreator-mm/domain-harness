/**
 * T00 fixture — selected S feature #3: physically separate Standard
 * feature module that REALLY imports an ordinary Node builtin (node:crypto)
 * through the ordinary module system inside the composed activation. The
 * import is sealed in the BUILD composition's externalImports allowance.
 */
import { createHash } from 'node:crypto';

export const MODULE_ID = 'sfeature-formatting@v010.1.0.0';
export const PACKAGE_KIND = 'standard-feature';
export const FEATURE_ABI = 'dh.v10.standard-feature/1';
export const FEATURE_KEY = 'standard:formatting/1';

export function init(context) {
  return { ok: true, featureKey: FEATURE_KEY, observedContext: { appId: context.appId } };
}

export function canonicalDigest(value) {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

export function dispose() {
  globalThis.__v010Disposals = [...(globalThis.__v010Disposals ?? []), MODULE_ID];
}
