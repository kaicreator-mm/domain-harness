import { DynamicChildExecutionError, } from './contracts.js';
import { assertSlot, computeRetentionReferenceId, createRetentionReference, dynamicChildSlotKey, } from './selection.js';
function clone(value) {
    return JSON.parse(JSON.stringify(value));
}
function sameArtifact(left, right) {
    return left.kind === right.kind
        && left.artifactId === right.artifactId
        && left.contentDigest === right.contentDigest;
}
function sameAuthority(left, right) {
    return left.domainId === right.domainId
        && left.packageId === right.packageId
        && left.domainIntelligenceContentDigest === right.domainIntelligenceContentDigest
        && left.governanceBaseline.domainId === right.governanceBaseline.domainId
        && left.governanceBaseline.governanceId === right.governanceBaseline.governanceId
        && left.governanceBaseline.schemaVersion === right.governanceBaseline.schemaVersion
        && left.governanceBaseline.contentDigest === right.governanceBaseline.contentDigest;
}
function samePin(left, right) {
    return left.slot.target.workflowId === right.slot.target.workflowId
        && left.slot.target.instanceKey === right.slot.target.instanceKey
        && left.slot.parentActorId === right.slot.parentActorId
        && left.slot.childActorId === right.slot.childActorId
        && left.slot.invocationOrdinal === right.slot.invocationOrdinal
        && left.invokingPackageId === right.invokingPackageId
        && sameAuthority(left.invokingAuthority, right.invokingAuthority)
        && sameArtifact(left.artifact, right.artifact)
        && left.pinnedAt === right.pinnedAt;
}
export class MemoryDynamicChildPinStore {
    pins = new Map();
    async get(slotKey) {
        const pin = this.pins.get(slotKey);
        return pin === undefined ? undefined : clone(pin);
    }
    async insertOnce(slotKey, pin) {
        const existing = this.pins.get(slotKey);
        if (existing !== undefined) {
            return samePin(existing, pin) ? 'existing' : 'conflict';
        }
        this.pins.set(slotKey, clone(pin));
        return 'inserted';
    }
}
/** Validate the invoking pinned context against the instance's durable GovernanceExecutionPin. */
export function assertInvokingContextMatchesGovernancePin(invoking, pin) {
    if (pin.packageId !== invoking.packageId) {
        throw new DynamicChildExecutionError('DYNAMIC_CHILD_PACKAGE_MISMATCH', 'invoking packageId does not match the durable GovernanceExecutionPin package');
    }
    if (pin.domainIntelligenceContentDigest !== invoking.domainIntelligenceContentDigest) {
        throw new DynamicChildExecutionError('DYNAMIC_CHILD_PACKAGE_MISMATCH', 'invoking CDI digest does not match the durable GovernanceExecutionPin CDI digest');
    }
    const pinned = pin.governanceBaseline;
    const current = invoking.governanceBaseline;
    if (pinned.domainId !== current.domainId
        || pinned.governanceId !== current.governanceId
        || pinned.schemaVersion !== current.schemaVersion
        || pinned.contentDigest !== current.contentDigest) {
        throw new DynamicChildExecutionError('DYNAMIC_CHILD_GOVERNANCE_MISMATCH', 'invoking Governance Baseline does not match the durable GovernanceExecutionPin baseline');
    }
}
/**
 * Pin-before-work authority. A dynamically selected promoted child MUST NOT
 * perform journaled work or emit a terminal result before its exact
 * DynamicChildExecutionPin is durably committed (frozen L2 §14.1/§14.2).
 */
export class DynamicChildPinCoordinator {
    store;
    artifactPort;
    sha256;
    constructor(store, artifactPort, sha256) {
        this.store = store;
        this.artifactPort = artifactPort;
        this.sha256 = sha256;
    }
    async commitPin(input) {
        assertSlot(input.slot);
        if (typeof input.pinnedAt !== 'string' || input.pinnedAt.length === 0) {
            throw new DynamicChildExecutionError('DYNAMIC_CHILD_SELECTION_INVALID', 'pinnedAt must be non-empty');
        }
        if (input.governancePin !== undefined) {
            assertInvokingContextMatchesGovernancePin(input.invoking, input.governancePin);
        }
        const invokingAuthority = {
            domainId: input.invoking.governanceBaseline.domainId,
            packageId: input.invoking.packageId,
            domainIntelligenceContentDigest: input.invoking.domainIntelligenceContentDigest,
            governanceBaseline: input.invoking.governanceBaseline,
        };
        const pin = {
            slot: clone(input.slot),
            invokingPackageId: input.invoking.packageId,
            invokingAuthority: clone(invokingAuthority),
            artifact: clone(input.resolved.body.identity),
            pinnedAt: input.pinnedAt,
        };
        const slotKey = dynamicChildSlotKey(input.slot);
        const inserted = await this.store.insertOnce(slotKey, pin);
        if (inserted === 'conflict') {
            throw new DynamicChildExecutionError('DYNAMIC_CHILD_DEFINITION_CONFLICT', 'a different exact child definition was already pinned for this logical invocation slot; the pin is insert-once and is never overwritten');
        }
        const referenceId = await computeRetentionReferenceId(input.slot, input.invoking.packageId, pin.artifact, this.sha256);
        const retention = createRetentionReference(referenceId, pin.artifact, input.resolved.promotion.authorityBinding);
        try {
            await this.artifactPort.putRetention(retention);
        }
        catch (error) {
            throw new DynamicChildExecutionError('DYNAMIC_CHILD_RETENTION_FAILED', 'dynamic child pin is committed but registry retention failed; the exact artifact body must remain resolvable while the pin is recoverable', error);
        }
        return pin;
    }
    async requirePin(slot) {
        const slotKey = dynamicChildSlotKey(slot);
        const pin = await this.store.get(slotKey);
        if (pin === undefined) {
            throw new DynamicChildExecutionError('DYNAMIC_CHILD_PIN_MISSING', 'required DynamicChildExecutionPin is missing; child journaled work must not start and recovery fails closed');
        }
        return pin;
    }
    async releaseRetention(slot) {
        const pin = await this.requirePin(slot);
        const referenceId = await computeRetentionReferenceId(slot, pin.invokingPackageId, pin.artifact, this.sha256);
        const retention = createRetentionReference(referenceId, pin.artifact, {
            domainId: pin.invokingAuthority.domainId,
            packageId: pin.invokingAuthority.packageId,
            domainIntelligenceContentDigest: pin.invokingAuthority.domainIntelligenceContentDigest,
            governanceBaseline: pin.invokingAuthority.governanceBaseline,
        });
        await this.artifactPort.releaseRetention(retention);
    }
}
//# sourceMappingURL=pin.js.map