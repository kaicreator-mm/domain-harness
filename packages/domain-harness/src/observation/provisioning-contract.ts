import type {
  EnsureProvisionedWorkflowInstanceOpenResult,
  ProvisionAndOpenWorkflowInstanceRequest,
  RuntimeInstanceProvisioningStore,
} from '../runtime/durable-control-contracts.js';
import type {
  RuntimeObservationIntent,
  RuntimeObservationRecord,
  RuntimeObservationStore,
} from './contracts.js';

/**
 * Observation-capable form of the I-OPEN atomic provisioning store extension.
 *
 * When Runtime Observation is enabled, instance materialization is a covered
 * `INSTANCE_OPENED` mutation. The provisioning-key bind, instance create-or-
 * return and any newly emitted observation record therefore live in ONE host
 * transaction. Exact idempotent replay of an existing instance emits no second
 * `INSTANCE_OPENED` record.
 */
export interface RuntimeObservationInstanceProvisioningStore
  extends RuntimeObservationStore,
    RuntimeInstanceProvisioningStore {
  ensureProvisionedWorkflowInstanceOpenWithObservation(
    request: ProvisionAndOpenWorkflowInstanceRequest,
    intent: RuntimeObservationIntent | undefined,
  ): Promise<{
    readonly result: EnsureProvisionedWorkflowInstanceOpenResult;
    readonly records: readonly RuntimeObservationRecord[];
  }>;
}

export function isRuntimeObservationInstanceProvisioningStore(
  store: unknown,
): store is RuntimeObservationInstanceProvisioningStore {
  return (
    store !== null &&
    typeof store === 'object' &&
    typeof (store as { ensureProvisionedWorkflowInstanceOpen?: unknown })
      .ensureProvisionedWorkflowInstanceOpen === 'function' &&
    typeof (store as { ensureProvisionedWorkflowInstanceOpenWithObservation?: unknown })
      .ensureProvisionedWorkflowInstanceOpenWithObservation === 'function'
  );
}
