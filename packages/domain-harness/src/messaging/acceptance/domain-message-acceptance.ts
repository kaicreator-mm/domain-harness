import type { ErrorObject, ValidateFunction } from 'ajv';
import { Ajv2020 } from 'ajv/dist/2020.js';

import type { JsonSchema, JsonValue } from '../../contracts/json.js';
import type { DomainMessage, MessageAcceptedAck } from '../../v2/contracts/message.js';
import type {
  CompiledMessageContract,
  TargetCompiledDomainPackage,
} from '../../v2/contracts/package.js';
import type { WorkflowAddress, WorkflowInstanceSnapshot } from '../../v2/contracts/workflow.js';
import {
  MessageAcceptanceError,
  type DomainMessageAcceptanceBoundary,
  type MessageAcceptanceDependencies,
} from '../contracts/message-acceptance.js';

export class DomainMessageAcceptance implements DomainMessageAcceptanceBoundary {
  private readonly store: MessageAcceptanceDependencies['store'];
  private readonly packages: MessageAcceptanceDependencies['packages'];
  private readonly payloadValidator = new MessagePayloadValidator();

  constructor(dependencies: MessageAcceptanceDependencies) {
    this.store = dependencies.store;
    this.packages = dependencies.packages;
  }

  async accept(message: DomainMessage): Promise<MessageAcceptedAck> {
    validateEnvelope(message);

    const target = await this.store.getInstance(message.target);
    if (!target) {
      throw new MessageAcceptanceError(
        'target_not_found',
        `Workflow target ${formatAddress(message.target)} does not exist`,
      );
    }

    assertTargetSnapshot(target, message.target);
    assertTargetAccepting(target);

    const pinnedPackage = this.packages.get(target.packageId);
    if (!pinnedPackage) {
      throw new MessageAcceptanceError(
        'pinned_package_missing',
        `Pinned package ${target.packageId} for ${formatAddress(message.target)} is unavailable`,
      );
    }

    const contract = resolvePinnedMessageContract(pinnedPackage, message);
    assertContractVersion(contract, message);
    this.payloadValidator.validate(contract.payloadSchema, message.payload, message.type);

    const correlationId = message.correlationId ?? target.correlationId;
    if (!isNonEmptyString(correlationId)) {
      throw new MessageAcceptanceError(
        'store_invariant_violation',
        `Workflow target ${formatAddress(message.target)} has no usable correlation identity`,
      );
    }

    const persistedMessage: DomainMessage = {
      ...message,
      correlationId,
    };

    // RuntimeStore.acceptMessage is the frozen atomic boundary that re-checks target lifecycle,
    // deduplicates, durably persists and allocates the per-target sequence before it resolves.
    const ack = await this.store.acceptMessage(persistedMessage);
    assertAcceptedAck(ack, persistedMessage, target.packageId);
    return ack;
  }
}

class MessagePayloadValidator {
  private readonly ajv = new Ajv2020({ strict: true, allErrors: true });
  private readonly cache = new WeakMap<object, ValidateFunction>();

  validate(schema: JsonSchema, payload: JsonValue, messageType: string): void {
    if (!isPortableJson(payload)) {
      throw new MessageAcceptanceError(
        'payload_contract_violation',
        `Message ${messageType} payload is not a portable JSON value`,
      );
    }

    let validate = this.cache.get(schema);
    if (!validate) {
      try {
        validate = this.ajv.compile(schema);
      } catch (error) {
        throw new MessageAcceptanceError(
          'invalid_pinned_contract',
          `Pinned message contract ${messageType} contains an invalid JSON Schema`,
          { cause: error },
        );
      }
      this.cache.set(schema, validate);
    }

    if (!validate(payload)) {
      throw new MessageAcceptanceError(
        'payload_contract_violation',
        `Message ${messageType} payload does not satisfy the pinned contract: ${formatAjvErrors(validate.errors)}`,
      );
    }
  }
}

function validateEnvelope(message: DomainMessage): void {
  if (!isNonEmptyString(message.messageId)) {
    throw new MessageAcceptanceError('invalid_message', 'messageId must be a non-empty string');
  }
  if (!message.target || typeof message.target !== 'object') {
    throw new MessageAcceptanceError('invalid_message', 'target must be a WorkflowAddress');
  }
  if (!isNonEmptyString(message.target.workflowId) || !isNonEmptyString(message.target.instanceKey)) {
    throw new MessageAcceptanceError(
      'invalid_message',
      'target.workflowId and target.instanceKey must be non-empty strings',
    );
  }
  if (!isNonEmptyString(message.type)) {
    throw new MessageAcceptanceError('invalid_message', 'type must be a non-empty string');
  }
  if (message.correlationId !== undefined && !isNonEmptyString(message.correlationId)) {
    throw new MessageAcceptanceError('invalid_message', 'correlationId must be a non-empty string when provided');
  }
  if (message.causationId !== undefined && !isNonEmptyString(message.causationId)) {
    throw new MessageAcceptanceError('invalid_message', 'causationId must be a non-empty string when provided');
  }
  if (message.contractVersion !== undefined && !isNonEmptyString(message.contractVersion)) {
    throw new MessageAcceptanceError(
      'invalid_message',
      'contractVersion must be a non-empty string when provided',
    );
  }
}

function assertTargetSnapshot(target: WorkflowInstanceSnapshot, requested: WorkflowAddress): void {
  if (!sameAddress(target.address, requested)) {
    throw new MessageAcceptanceError(
      'store_invariant_violation',
      `RuntimeStore returned ${formatAddress(target.address)} for requested target ${formatAddress(requested)}`,
    );
  }
  if (!isNonEmptyString(target.packageId)) {
    throw new MessageAcceptanceError(
      'store_invariant_violation',
      `Workflow target ${formatAddress(requested)} has no pinned package identity`,
    );
  }
}

function assertTargetAccepting(target: WorkflowInstanceSnapshot): void {
  if (target.lifecycle === 'active' || target.lifecycle === 'waiting') return;
  throw new MessageAcceptanceError(
    'target_not_accepting',
    `Workflow target ${formatAddress(target.address)} cannot accept state-changing messages while ${target.lifecycle}`,
  );
}

function resolvePinnedMessageContract(
  pinnedPackage: TargetCompiledDomainPackage,
  message: DomainMessage,
): CompiledMessageContract {
  const workflow = pinnedPackage.manifest.workflows[message.target.workflowId];
  if (!workflow) {
    throw new MessageAcceptanceError(
      'workflow_not_found',
      `Pinned package ${pinnedPackage.manifest.packageId} has no workflow ${message.target.workflowId}`,
    );
  }

  const matches = Object.values(workflow.messageContracts).filter(
    (contract) => contract.type === message.type,
  );
  if (matches.length === 0) {
    throw new MessageAcceptanceError(
      'message_contract_not_found',
      `Workflow ${message.target.workflowId} in pinned package ${pinnedPackage.manifest.packageId} does not accept message type ${message.type}`,
    );
  }
  if (matches.length > 1) {
    throw new MessageAcceptanceError(
      'invalid_pinned_contract',
      `Workflow ${message.target.workflowId} contains multiple contracts for message type ${message.type}`,
    );
  }
  return matches[0]!;
}

function assertContractVersion(contract: CompiledMessageContract, message: DomainMessage): void {
  if (contract.version === message.contractVersion) return;
  throw new MessageAcceptanceError(
    'contract_version_mismatch',
    `Message ${message.type} contract version ${message.contractVersion ?? '<unversioned>'} is incompatible with pinned version ${contract.version ?? '<unversioned>'}`,
  );
}

function assertAcceptedAck(
  ack: MessageAcceptedAck,
  message: DomainMessage,
  expectedPackageId: string,
): void {
  const validStatus = ack.status === 'accepted' || ack.status === 'duplicate';
  const validSequence = Number.isSafeInteger(ack.targetSequence) && ack.targetSequence >= 0;
  if (
    !validStatus ||
    ack.messageId !== message.messageId ||
    !sameAddress(ack.target, message.target) ||
    ack.packageId !== expectedPackageId ||
    !validSequence ||
    !isNonEmptyString(ack.acceptedAt)
  ) {
    throw new MessageAcceptanceError(
      'store_invariant_violation',
      `RuntimeStore returned an invalid acceptance ACK for message ${message.messageId}`,
    );
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function sameAddress(left: WorkflowAddress, right: WorkflowAddress): boolean {
  return left.workflowId === right.workflowId && left.instanceKey === right.instanceKey;
}

function formatAddress(address: WorkflowAddress): string {
  return `${address.workflowId}/${address.instanceKey}`;
}

function isPortableJson(value: unknown): value is JsonValue {
  if (value === null) return true;
  if (typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isPortableJson);
  if (typeof value !== 'object') return false;

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Object.values(value as Record<string, unknown>).every(isPortableJson);
}

function formatAjvErrors(errors: ErrorObject[] | null | undefined): string {
  if (!errors?.length) return 'validation failed';
  return errors
    .map((error) => `${error.instancePath || '/'} ${error.message ?? error.keyword}`)
    .join('; ');
}
