import type { DomainMessage } from '../../v2/contracts/message.js';
import type { RuntimeStore } from '../../v2/contracts/store.js';
import type { WorkflowInstanceSnapshot } from '../../v2/contracts/workflow.js';
import {
  MessageAcceptanceError,
  type DomainMessageAcceptanceBoundary,
} from '../contracts/message-acceptance.js';
import type {
  WorkflowSendAcceptanceBoundary,
  WorkflowSendAcceptanceResult,
  WorkflowSendPermanentRejectionCode,
} from '../contracts/workflow-send-acceptance.js';

export type WorkflowSendTargetReader = Pick<RuntimeStore, 'getInstance'>;

export interface WorkflowSendAcceptanceDependencies {
  readonly acceptance: DomainMessageAcceptanceBoundary;
  readonly store: WorkflowSendTargetReader;
}

const PERMANENT_REJECTION_CODES = new Set<WorkflowSendPermanentRejectionCode>([
  'workflow_not_found',
  'message_contract_not_found',
  'contract_version_mismatch',
  'payload_contract_violation',
]);

/**
 * Successor I-MSG-REJECT adapter over the retained acceptance authority.
 *
 * The retained boundary is always consulted first, preserving its durable
 * duplicate-first semantics. This adapter only classifies a closed subset of
 * already-produced acceptance failures; it never reimplements validation or
 * mutates target state.
 */
export class WorkflowSendAcceptance implements WorkflowSendAcceptanceBoundary {
  readonly #acceptance: DomainMessageAcceptanceBoundary;
  readonly #store: WorkflowSendTargetReader;

  constructor(dependencies: WorkflowSendAcceptanceDependencies) {
    this.#acceptance = dependencies.acceptance;
    this.#store = dependencies.store;
  }

  async accept(message: DomainMessage): Promise<WorkflowSendAcceptanceResult> {
    try {
      return {
        status: 'accepted',
        ack: await this.#acceptance.accept(message),
      };
    } catch (error) {
      if (!(error instanceof MessageAcceptanceError)) throw error;

      if (PERMANENT_REJECTION_CODES.has(error.code as WorkflowSendPermanentRejectionCode)) {
        return {
          status: 'rejected',
          rejection: {
            code: error.code as WorkflowSendPermanentRejectionCode,
            message: error.message,
          },
        };
      }

      if (error.code === 'target_not_found') {
        return {
          status: 'transient_unavailable',
          condition: {
            code: 'target_not_found',
            message: error.message,
          },
        };
      }

      if (error.code !== 'target_not_accepting') throw error;

      return this.#classifyNonAcceptingTarget(message, error);
    }
  }

  async #classifyNonAcceptingTarget(
    message: DomainMessage,
    original: MessageAcceptanceError,
  ): Promise<WorkflowSendAcceptanceResult> {
    const current = await this.#store.getInstance(message.target);
    if (current === null) {
      return {
        status: 'transient_unavailable',
        condition: {
          code: 'target_not_found',
          message: `Workflow target ${message.target.workflowId}/${message.target.instanceKey} disappeared while classifying acceptance`,
        },
      };
    }

    if (!sameAddress(current, message)) {
      throw new MessageAcceptanceError(
        'store_invariant_violation',
        `RuntimeStore returned a different WorkflowAddress while classifying ${message.target.workflowId}/${message.target.instanceKey}`,
      );
    }

    if (current.lifecycle === 'recovery_required') {
      return {
        status: 'transient_unavailable',
        condition: {
          code: 'target_recovery_required',
          message: original.message,
        },
      };
    }

    if (isTerminal(current.lifecycle)) {
      return {
        status: 'rejected',
        rejection: {
          code: 'target_terminal',
          message: original.message,
          targetLifecycle: current.lifecycle,
        },
      };
    }

    // The target became accepting between the retained boundary's lookup and
    // this classification read. That race is not a stable semantic rejection;
    // preserve the original technical failure so a caller cannot durably route
    // a stale classification.
    throw original;
  }
}

function sameAddress(instance: WorkflowInstanceSnapshot, message: DomainMessage): boolean {
  return (
    instance.address.workflowId === message.target.workflowId &&
    instance.address.instanceKey === message.target.instanceKey
  );
}

function isTerminal(
  lifecycle: WorkflowInstanceSnapshot['lifecycle'],
): lifecycle is 'completed' | 'failed' | 'cancelled' | 'terminated' {
  return (
    lifecycle === 'completed' ||
    lifecycle === 'failed' ||
    lifecycle === 'cancelled' ||
    lifecycle === 'terminated'
  );
}
