import type { DomainMessage, MessageAcceptedAck } from '../../v2/contracts/message.js';
import type { PackageRegistry } from '../../v2/contracts/package.js';
import type { RuntimeStore } from '../../v2/contracts/store.js';

export type MessageAcceptanceStore = Pick<
  RuntimeStore,
  'getInstance' | 'acceptMessage' | 'getMessageDisposition'
>;
export type MessageAcceptancePackageRegistry = Pick<PackageRegistry, 'get'>;

export interface MessageAcceptanceDependencies {
  readonly store: MessageAcceptanceStore;
  readonly packages: MessageAcceptancePackageRegistry;
}

export interface DomainMessageAcceptanceBoundary {
  accept(message: DomainMessage): Promise<MessageAcceptedAck>;
}

export type MessageAcceptanceErrorCode =
  | 'invalid_message'
  | 'target_not_found'
  | 'target_not_accepting'
  | 'pinned_package_missing'
  | 'workflow_not_found'
  | 'message_contract_not_found'
  | 'contract_version_mismatch'
  | 'payload_contract_violation'
  | 'invalid_pinned_contract'
  | 'store_invariant_violation';

export class MessageAcceptanceError extends Error {
  readonly code: MessageAcceptanceErrorCode;

  constructor(code: MessageAcceptanceErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'MessageAcceptanceError';
    this.code = code;
  }
}
