/**
 * T05 fixture — a selected READ-ONLY C Tool capability for the Agent
 * workflow slice (#1172).
 * ====================================================================
 *
 * The Agent's context is assembled from two actual read channels: scoped
 * Memory (`memory.search`) and this Tool lookup. This capability is
 * deliberately read-only — it has no mutation operation, no storage, no
 * document store and no Kernel authority whatsoever. Each lookup returns a
 * deterministic, bounded observation with its own source/revision
 * provenance; the per-process call counter is exposed ONLY for the physical
 * test's "zero unnecessary Tool dispatch" assertions (a fixture seam, not a
 * product surface).
 *
 * The capability is invoked by the Business package's effect handler through
 * the sealed Kernel effect dispatch, never directly by an S feature.
 */

export const MODULE_ID = 'capability-agent-tool-read@v010.1.0.0';
export const PACKAGE_KIND = 'capability';
export const ABI_VERSION = 'v08-capability-abi/1';
export const ENDPOINTS = [
  { endpointId: 'capability:agent-tool-read', kind: 'capability-endpoint' },
];

export const OPERATIONS = [
  { operationId: 'tool.lookup', effectClass: 'none' },
];

const AUTHORIZED_SCOPES = Object.freeze([
  Object.freeze({
    tenantId: 'tenant:v010-t05-rich',
    businessPackageId: 'business-agent-workflow@v010.1.0.0',
  }),
]);

function counter() {
  if (typeof globalThis.__v010T05ToolCalls !== 'number') globalThis.__v010T05ToolCalls = 0;
  return globalThis.__v010T05ToolCalls;
}

export async function toolLookup(payload) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('tool.lookup refused: TOOL_INPUT_INVALID: one plain-data payload is required');
  }
  const scope = payload.scope;
  const allowed = scope !== null && typeof scope === 'object' && !Array.isArray(scope)
    && AUTHORIZED_SCOPES.some((entry) =>
      entry.tenantId === scope.tenantId && entry.businessPackageId === scope.businessPackageId);
  if (!allowed) {
    throw new Error('tool.lookup refused: TOOL_SCOPE_DENIED: caller scope is not selected for this App');
  }
  globalThis.__v010T05ToolCalls = counter() + 1;
  return {
    ok: true,
    operation: 'tool.lookup',
    items: [
      {
        id: 'tool:policy-catalog',
        text: 'Tool catalog: respond with one bounded answer; no external mutation is exposed.',
        provenance: { source: 'tool:policy-catalog', revision: 'r1' },
      },
    ],
  };
}
