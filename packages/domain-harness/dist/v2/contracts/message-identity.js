import { canonicalJsonStringify } from '../../contracts/identity.js';
/**
 * Thrown when a replayed `target + messageId` carries logical material that is
 * incompatible with the already-accepted durable message. Deliberately
 * distinguishable from a valid duplicate acknowledgement (which is a returned
 * value, not an error) and from unrelated SQLite/storage failures (which surface
 * as their own host/storage errors).
 */
export class AcceptedMessageIdentityCollisionError extends Error {
    code;
    constructor(message) {
        super(message);
        this.name = 'AcceptedMessageIdentityCollisionError';
        this.code = 'MESSAGE_IDENTITY_COLLISION';
    }
}
/** Effective correlation default applied at acceptance, before any comparison. */
export function effectiveMessageCorrelationId(message, instanceCorrelationId) {
    return message.correlationId ?? instanceCorrelationId;
}
/**
 * Normalizes the incoming message material under the addressed instance facts.
 * Omitted `correlationId` converges with an explicit value equal to the
 * instance correlation; omitted causation/contractVersion normalize to `null`.
 */
export function incomingAcceptedMessageIdentity(message, instance) {
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
export function durableAcceptedMessageIdentity(row) {
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
export function findAcceptedMessageIdentityConflict(incoming, durable) {
    if (incoming.targetWorkflowId !== durable.targetWorkflowId)
        return 'target.workflowId';
    if (incoming.targetInstanceKey !== durable.targetInstanceKey)
        return 'target.instanceKey';
    if (incoming.messageId !== durable.messageId)
        return 'messageId';
    if (incoming.type !== durable.type)
        return 'type';
    if (incoming.canonicalPayload !== durable.canonicalPayload)
        return 'payload';
    if (incoming.effectiveCorrelationId !== durable.effectiveCorrelationId)
        return 'correlationId';
    if (incoming.causationId !== durable.causationId)
        return 'causationId';
    if (incoming.contractVersion !== durable.contractVersion)
        return 'contractVersion';
    if (incoming.packageId !== durable.packageId)
        return 'packageId';
    return null;
}
/**
 * The one-call durable duplicate-accept boundary seam shared by every
 * RuntimeStore adapter. Returns silently when the replayed `target + messageId`
 * is identity-compatible with the durable accepted message; throws
 * `AcceptedMessageIdentityCollisionError` — before any new durable write —
 * when it is not.
 */
export function requireAcceptedMessageIdentityCompatible(message, instance, durable) {
    const conflict = findAcceptedMessageIdentityConflict(incomingAcceptedMessageIdentity(message, instance), durableAcceptedMessageIdentity(durable));
    if (conflict !== null) {
        throw new AcceptedMessageIdentityCollisionError(`Accepted-message identity collision for ${durable.workflowId}/${durable.instanceKey} ` +
            `message ${durable.messageId}: replayed material differs in ${conflict}`);
    }
}
//# sourceMappingURL=message-identity.js.map