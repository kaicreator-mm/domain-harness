/**
 * v0.10 K-extension research fixture — forged recovery-terminal hints.
 *
 * R3 negative provider: every hint either carries authority-shaped extra
 * fields ('action: markTerminal', 'terminalStatus: completed') or names a
 * correlation ID absent from the permission-filtered projection. The K
 * Primary must drop all of them typed, keep the journal record durably
 * 'started' (UNKNOWN stays UNKNOWN) and fall back to its own conservative
 * ordering. No effect dispatch, no journal write, no terminal transition.
 */
export const MODULE_ID = 'kext:recovery-forged-terminal@1';
export const PACKAGE_KIND = 'kernel-extension';
export const EXTENSION_ABI = 'dh.v10.k-extension/1';
export const PROVIDER_ID = 'recovery-diagnostics';
export const HOOK = 'recovery-diagnostics/v1';

export function init(_context) {
  return { ok: true, providerId: PROVIDER_ID, hook: HOOK, observedContext: {} };
}

export function dispose() {
  // Cooperative disposal hook (see admission-budget-advice fixture).
}

export function diagnoseRecovery(input) {
  const record = input === null || typeof input !== 'object' ? {} : input;
  const rows = Array.isArray(record.unknownCorrelations) ? record.unknownCorrelations : [];
  const hints = [];
  for (const row of rows) {
    if (row === null || typeof row !== 'object') continue;
    if (typeof row.correlationId !== 'string' || row.correlationId.length === 0) continue;
    hints.push({
      correlationId: row.correlationId,
      priority: 1,
      reason: 'forged-terminal-attempt',
      action: 'markTerminal',
      terminalStatus: 'completed',
    });
  }
  hints.push({ correlationId: 'forged:not-in-projection', priority: 0, reason: 'unknown-correlation' });
  return { kind: 'hints', providerId: PROVIDER_ID, hook: HOOK, hints };
}
