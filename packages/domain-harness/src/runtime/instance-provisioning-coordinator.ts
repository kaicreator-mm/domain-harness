import { canonicalJsonStringify } from '../contracts/identity.js';
import type {
  EnsureProvisionedWorkflowInstanceOpenResult,
  ProvisionAndOpenWorkflowInstanceRequest,
  RuntimeInstanceProvisioningStore,
} from './durable-control-contracts.js';
import {
  initialProvisioningInstanceMatchesRequest,
  provisioningInstanceIdentityMatchesRequest,
  provisioningRecordMatchesRequest,
} from './durable-control-contracts.js';
import { DurableControlError } from './durable-control-coordinator.js';

function requireNonEmpty(value: string, name: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new DurableControlError('INVALID_ARGUMENT', `${name} must be a non-empty string`);
  }
}

function requireTimestamp(value: string, name: string): void {
  requireNonEmpty(value, name);
  if (!Number.isFinite(Date.parse(value))) {
    throw new DurableControlError('INVALID_ARGUMENT', `${name} must be a valid timestamp`);
  }
}

function requireKnownDisposition(
  value: unknown,
  name: 'provisioningDisposition' | 'instanceDisposition',
): asserts value is 'created' | 'existing' {
  if (value !== 'created' && value !== 'existing') {
    throw new DurableControlError(
      'STORE_CONTRACT_VIOLATION',
      `provisioning store returned unknown ${name}`,
    );
  }
}

/**
 * Portable I-OPEN coordinator.
 *
 * Runtime owns package/workflow resolution and construction of the exact
 * revision-0 initial snapshot. This coordinator owns fail-closed validation of
 * the successor provisioning contract around the host transaction; adapters
 * own only the atomic durable write itself.
 */
export class RuntimeInstanceProvisioningCoordinator {
  constructor(private readonly store: RuntimeInstanceProvisioningStore) {}

  async ensureProvisionedWorkflowInstanceOpen(
    request: ProvisionAndOpenWorkflowInstanceRequest,
  ): Promise<EnsureProvisionedWorkflowInstanceOpenResult> {
    requireNonEmpty(request.provisioningKey, 'provisioningKey');
    requireNonEmpty(request.target.workflowId, 'target.workflowId');
    requireNonEmpty(request.target.instanceKey, 'target.instanceKey');
    requireNonEmpty(request.correlationId, 'correlationId');
    requireNonEmpty(request.packageId, 'packageId');
    requireTimestamp(request.requestedAt, 'requestedAt');
    canonicalJsonStringify(request.input);

    if (!initialProvisioningInstanceMatchesRequest(request.initialInstance, request)) {
      throw new DurableControlError(
        'INVALID_ARGUMENT',
        'initialInstance must be the exact revision-0 Runtime snapshot for this provisioning request',
      );
    }

    const result = await this.store.ensureProvisionedWorkflowInstanceOpen(request);
    requireKnownDisposition(result.provisioningDisposition, 'provisioningDisposition');
    requireKnownDisposition(result.instanceDisposition, 'instanceDisposition');

    if (!provisioningRecordMatchesRequest(result.record, request)) {
      throw new DurableControlError(
        'PROVISIONING_IDENTITY_CONFLICT',
        `provisioning key ${request.provisioningKey} is already bound to different logical material`,
      );
    }

    if (!provisioningInstanceIdentityMatchesRequest(result.instance, request)) {
      throw new DurableControlError(
        'PROVISIONING_IDENTITY_CONFLICT',
        `workflow ${request.target.workflowId}/${request.target.instanceKey} is already bound to incompatible durable identity`,
      );
    }

    if (
      result.provisioningDisposition === 'created' &&
      result.record.createdAt !== request.requestedAt
    ) {
      throw new DurableControlError(
        'STORE_CONTRACT_VIOLATION',
        'new provisioning record must preserve requestedAt as createdAt',
      );
    }

    if (
      result.instanceDisposition === 'created' &&
      !initialProvisioningInstanceMatchesRequest(result.instance, request)
    ) {
      throw new DurableControlError(
        'STORE_CONTRACT_VIOLATION',
        'new Runtime instance does not match the exact initial snapshot supplied by Runtime',
      );
    }

    return result;
  }
}
