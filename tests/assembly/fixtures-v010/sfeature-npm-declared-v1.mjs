/**
 * T00 fixture — a Standard feature module whose ordinary NPM import is
 * DECLARED in the sealed externalImports allowance and REALLY evaluated at
 * activation: `yaml` is an actually installed dependency of this workspace,
 * resolved through the deployment-anchored resolve seam at activation time
 * (review 6254726674, P1-1). The import-time roundtrip below records the
 * physical evidence the activation tests assert on (never evaluated at
 * BUILD — BUILD is purely static).
 */
import { parse } from 'yaml';

export const MODULE_ID = 'sfeature-npm-declared@v010.1.0.0';
export const PACKAGE_KIND = 'standard-feature';
export const FEATURE_ABI = 'dh.v10.standard-feature/1';
export const FEATURE_KEY = 'standard:npm-declared/1';

const manifest = parse('kind: domain-harness\nmajor: 10');
if (manifest.kind !== 'domain-harness' || manifest.major !== 10) {
  throw new Error('the declared npm import evaluated but its yaml roundtrip mismatched');
}
globalThis.__v010DeclaredImportEvidence = [...(globalThis.__v010DeclaredImportEvidence ?? []), `${MODULE_ID}:yaml-roundtrip-ok`];

export function init() {
  return { ok: true, featureKey: FEATURE_KEY };
}

export function parseDocument(text) {
  return parse(text);
}
