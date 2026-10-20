/**
 * T00 fixture — a Standard feature module whose installed NATIVE add-on
 * import is DECLARED in the sealed externalImports allowance and REALLY
 * evaluated at activation: `better-sqlite3` ships a real `.node` binary in
 * this workspace, resolved through the deployment-anchored resolve seam at
 * activation time (review 6254726674, P1-1). The import-time :memory:
 * roundtrip below records the physical evidence the activation tests assert
 * on (never evaluated at BUILD — BUILD is purely static).
 */
import Database from 'better-sqlite3';

export const MODULE_ID = 'sfeature-native-declared@v010.1.0.0';
export const PACKAGE_KIND = 'standard-feature';
export const FEATURE_ABI = 'dh.v10.standard-feature/1';
export const FEATURE_KEY = 'standard:native-declared/1';

const probe = new Database(':memory:');
try {
  probe.exec('CREATE TABLE t00_probe (value INTEGER NOT NULL)');
  probe.prepare('INSERT INTO t00_probe (value) VALUES (?)').run(42);
  const row = probe.prepare('SELECT value FROM t00_probe').get();
  if (row?.value !== 42) {
    throw new Error('the declared native import evaluated but its sqlite roundtrip mismatched');
  }
} finally {
  probe.close();
}
globalThis.__v010DeclaredImportEvidence = [...(globalThis.__v010DeclaredImportEvidence ?? []), `${MODULE_ID}:sqlite-roundtrip-ok`];

export function init() {
  return { ok: true, featureKey: FEATURE_KEY };
}

export function memoryValue(input) {
  const db = new Database(':memory:');
  try {
    db.exec('CREATE TABLE t00_probe (value INTEGER NOT NULL)');
    db.prepare('INSERT INTO t00_probe (value) VALUES (?)').run(input);
    return db.prepare('SELECT value FROM t00_probe').get().value;
  } finally {
    db.close();
  }
}
