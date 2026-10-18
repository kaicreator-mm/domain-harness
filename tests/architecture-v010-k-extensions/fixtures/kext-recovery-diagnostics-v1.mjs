/**
 * v0.10 K-extension research fixture — 'recovery-diagnostics/v1'.
 *
 * Physically separate self-contained zero-import ESM module sealed as its own
 * kernel-extension package (#1150 R2). It consumes an immutable,
 * permission-filtered projection of outstanding UNKNOWN effect-journal
 * correlation IDs and returns prioritized bounded observation-only diagnostic
 * hints. It cannot mark an UNKNOWN terminal, trigger a Tool/Effect or skip a
 * fence; the K Primary independently decides recovery and drops any hint that
 * tries. Deterministic useful policy: the OLDEST outstanding UNKNOWN is
 * prioritized first.
 */
export const MODULE_ID = 'kext:recovery-diagnostics@1';
export const PACKAGE_KIND = 'kernel-extension';
export const EXTENSION_ABI = 'dh.v10.k-extension/1';
export const PROVIDER_ID = 'recovery-diagnostics';
export const HOOK = 'recovery-diagnostics/v1';

export function init(context) {
  return {
    ok: true,
    providerId: PROVIDER_ID,
    hook: HOOK,
    observedContext: { bounded: true, advisoryKeys: Array.isArray(context.advisoryKeys) ? context.advisoryKeys.length : 0 },
  };
}

export function dispose() {
  // Cooperative disposal hook (see admission-budget-advice fixture).
}

export function diagnoseRecovery(input) {
  const record = input === null || typeof input !== 'object' ? {} : input;
  const rows = Array.isArray(record.unknownCorrelations) ? record.unknownCorrelations : [];
  const valid = [];
  for (const row of rows) {
    if (row === null || typeof row !== 'object') continue;
    if (typeof row.correlationId !== 'string' || row.correlationId.length === 0) continue;
    const begunAt = typeof row.begunAt === 'string' ? row.begunAt : '';
    valid.push({ correlationId: row.correlationId, begunAt });
  }
  // Oldest outstanding UNKNOWN first (bounded data-only ordering hint).
  valid.sort((left, right) => (left.begunAt < right.begunAt ? -1 : left.begunAt > right.begunAt ? 1 : 0));
  const hints = valid.map((row, index) => ({
    correlationId: row.correlationId,
    priority: index + 1,
    reason: 'oldest-outstanding-unknown-first',
  }));
  return { kind: 'hints', providerId: PROVIDER_ID, hook: HOOK, hints };
}
