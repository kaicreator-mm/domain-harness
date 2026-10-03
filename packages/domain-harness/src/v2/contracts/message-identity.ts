import { canonicalJsonStringify } from '../../contracts/identity.js';
import type { DomainMessage } from './message.js';

/**
 * A8 — Durable accepted-message identity and duplicate compatibility
 * (L2 completeness addendum `DomainHarness_v0.6_L2_ARCHITECTURE_EVIDENCE_COMPLETENESS_ADDENDUM.md`).
 *
 * A durable duplicate acknowledgement is valid only when the incoming message
 * is logically identity-compatible with the already-accepted durable message
 * under the same target and `messageId`:
 *
 * ```text
 * AcceptedMessageIdentity =
 *   target WorkflowAddress
 *   + messageId
 *   + type
 *   + canonical payload
 *   + effective correlationId
 *   + normalized causationId
 *   + normalized contractVersion
 *   + target package binding
 * ```
 *
 * The portable Runtime contract owns these identity semantics. Node and Expo
 * RuntimeStore adapters call `requireAcceptedMessageIdentityCompatible()` at
 * the durable duplicate-accept boundary, before any new write, so both hosts
 * enforce exactly one shared rule and cannot drift. This is defensive
 * durable-boundary validation, not a second message-routing or business
 * authority.
 *
 * `targetSequence` and `acceptedAt` are durable facts assigned on first
 * acceptance; they are not incoming identity and are returned unchanged on a
 * valid duplicate.
 */

/** Stable, deterministic collision category at the contract/host error boundary. */
export type AcceptedMessageIdentityErrorCode = 'MESSAGE_IDENTITY_COLLISION';

/**
 * Thrown when a replayed `target + messageId` carries logical material that is
 * incompatible with the already-accepted durable message. Deliberately
 * distinguishable from a valid duplicate acknowledgement (which is a returned
 * value, not an error) and from unrelated SQLite/storage failures (which surface
 * as their own host/storage errors).
 */
export class AcceptedMessageIdentityCollisionError extends Error {
  readonly code: AcceptedMessageIdentityErrorCode;

  constructor(message: string) {
    super(message);
    this.name = 'AcceptedMessageIdentityCollisionError';
    this.code = 'MESSAGE_IDENTITY_COLLISION';
  }
}

/**
 * The durable instance facts that complete the incoming identity: the exact
 * addressed WorkflowAddress plus the correlation default and package binding in
 * force for the target instance.
 */
export interface AcceptedMessageIdentityInstanceFacts {
  readonly workflowId: string;
  readonly instanceKey: string;
  readonly correlationId: string;
  readonly packageId: string;
}

/**
 * The durable accepted-message row material a host store compares against.
 * `causationId`/`contractVersion` use storage `null` for absence; absence
 * normalization maps it onto the same bucket as an omitted incoming field.
 */
export interface AcceptedMessageIdentityDurableRow {
  readonly workflowId: string;
  readonly instanceKey: string;
  readonly messageId: string;
  readonly type: string;
  readonly payloadJson: string;
  readonly correlationId: string;
  readonly causationId: string | null;
  readonly contractVersion: string | null;
  readonly packageId: string;
}

/**
 * The normalized A8 identity tuple. Both sides of the comparison are reduced to
 * this exact shape before comparison so no per-host normalization can drift.
 */
export interface AcceptedMessageIdentity {
  readonly targetWorkflowId: string;
  readonly targetInstanceKey: string;
  readonly messageId: string;
  readonly type: string;
  /** Canonical JSON text: recursive key order removed, array order preserved. */
  readonly canonicalPayload: string;
  readonly effectiveCorrelationId: string;
  /** `null` is the normalized absence for both omitted and storage-null values. */
  readonly causationId: string | null;
  /** `null` is the normalized absence for both omitted and storage-null values. */
  readonly contractVersion: string | null;
  readonly packageId: string;
}

/** Effective correlation default applied at acceptance, before any comparison. */
export function effectiveMessageCorrelationId(
  message: Pick<DomainMessage, 'correlationId'>,
  instanceCorrelationId: string,
): string {
  return message.correlationId ?? instanceCorrelationId;
}

/**
 * Normalizes the incoming message material under the addressed instance facts.
 * Omitted `correlationId` converges with an explicit value equal to the
 * instance correlation; omitted causation/contractVersion normalize to `null`.
 */
export function incomingAcceptedMessageIdentity(
  message: DomainMessage,
  instance: AcceptedMessageIdentityInstanceFacts,
): AcceptedMessageIdentity {
  return {
    targetWorkflowId: instance.workflowId,
    targetInstanceKey: instance.instanceKey,
    messageId: message.messageId,
    type: message.type,
    canonicalPayload: canonicalJsonStringify(message.payload),
    effectiveCorrelationId: effectiveMessageCorrelationId(message, instance.correlationId),
    causationId: message.causationId ?? null,
    contractVersion: message.contractVersion ?? null,
    packageId: instance.packageId,
  };
}

/**
 * Normalizes the durable accepted-message row material. The stored payload JSON
 * text is re-canonicalized so object key serialization order cannot create a
 * collision; corrupt stored JSON is a storage failure and surfaces as such
 * (never as an identity collision).
 */
export function durableAcceptedMessageIdentity(
  row: AcceptedMessageIdentityDurableRow,
): AcceptedMessageIdentity {
  return {
    targetWorkflowId: row.workflowId,
    targetInstanceKey: row.instanceKey,
    messageId: row.messageId,
    type: row.type,
    canonicalPayload: canonicalJsonStringify(JSON.parse(row.payloadJson)),
    effectiveCorrelationId: row.correlationId,
    causationId: row.causationId ?? null,
    contractVersion: row.contractVersion ?? null,
    packageId: row.packageId,
  };
}

/**
 * Returns the first frozen-tuple component on which the two identities differ,
 * in deterministic A8 field order, or `null` when they are compatible.
 */
export function findAcceptedMessageIdentityConflict(
  incoming: AcceptedMessageIdentity,
  durable: AcceptedMessageIdentity,
): string | null {
  if (incoming.targetWorkflowId !== durable.targetWorkflowId) return 'target.workflowId';
  if (incoming.targetInstanceKey !== durable.targetInstanceKey) return 'target.instanceKey';
  if (incoming.messageId !== durable.messageId) return 'messageId';
  if (incoming.type !== durable.type) return 'type';
  if (incoming.canonicalPayload !== durable.canonicalPayload) return 'payload';
  if (incoming.effectiveCorrelationId !== durable.effectiveCorrelationId) return 'correlationId';
  if (incoming.causationId !== durable.causationId) return 'causationId';
  if (incoming.contractVersion !== durable.contractVersion) return 'contractVersion';
  if (incoming.packageId !== durable.packageId) return 'packageId';
  return null;
}

/**
 * The one-call durable duplicate-accept boundary seam shared by every
 * RuntimeStore adapter. Returns silently when the replayed `target + messageId`
 * is identity-compatible with the durable accepted message; throws
 * `AcceptedMessageIdentityCollisionError` — before any new durable write —
 * when it is not.
 */
export function requireAcceptedMessageIdentityCompatible(
  message: DomainMessage,
  instance: AcceptedMessageIdentityInstanceFacts,
  durable: AcceptedMessageIdentityDurableRow,
): void {
  const conflict = findAcceptedMessageIdentityConflict(
    incomingAcceptedMessageIdentity(message, instance),
    durableAcceptedMessageIdentity(durable),
  );
  if (conflict !== null) {
    throw new AcceptedMessageIdentityCollisionError(
      `Accepted-message identity collision for ${durable.workflowId}/${durable.instanceKey} ` +
        `message ${durable.messageId}: replayed material differs in ${conflict}`,
    );
  }
}
