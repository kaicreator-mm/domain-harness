import type { RuntimeStore, WorkflowAddress, WorkflowInstanceSnapshot } from '../../src/v2/index.js';

export interface RuntimeStoreConformanceAdapter {
  createStore(): Promise<RuntimeStore>;
  disposeStore(store: RuntimeStore): Promise<void>;
}

export function makeConformanceAddress(suffix: string): WorkflowAddress {
  return { workflowId: 'conformance', instanceKey: suffix };
}

export function makeConformanceInstance(
  suffix: string,
  now = '2026-09-18T00:00:00.000Z',
): WorkflowInstanceSnapshot {
  return {
    address: makeConformanceAddress(suffix),
    correlationId: `corr-${suffix}`,
    packageId: 'pkg-conformance',
    lifecycle: 'active',
    stateRevision: 0,
    state: { ready: true },
    createdAt: now,
    updatedAt: now,
  };
}
