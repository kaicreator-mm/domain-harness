import type { WorkflowAddress } from '../v2/contracts/workflow.js';

function formatTarget(target: WorkflowAddress): string {
  return `${target.workflowId}/${target.instanceKey}`;
}

export class RecoveryTargetNotFoundError extends Error {
  constructor(readonly target: WorkflowAddress) {
    super(`Workflow target ${formatTarget(target)} does not exist`);
    this.name = 'RecoveryTargetNotFoundError';
  }
}

export class RecoveryMessageNotFoundError extends Error {
  constructor(
    readonly target: WorkflowAddress,
    readonly messageId: string,
  ) {
    super(`Message ${messageId} is not durable for ${formatTarget(target)}`);
    this.name = 'RecoveryMessageNotFoundError';
  }
}

export class RecoveryStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecoveryStateError';
  }
}

export class RecoveryRetryNotAuthorizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecoveryRetryNotAuthorizedError';
  }
}

export class AmbiguousNonIdempotentResolutionRequiredError extends Error {
  constructor(readonly effectId: string) {
    super(
      `Ambiguous non-idempotent effect ${effectId} requires an explicit matching ambiguity-resolution authorization before retry`,
    );
    this.name = 'AmbiguousNonIdempotentResolutionRequiredError';
  }
}

export class RecoveryStoreInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecoveryStoreInvariantError';
  }
}
