/**
 * Issue #312 / #301 (reviewed Product/L2 chain): durable ordered public
 * Runtime Observation Stream.
 *
 * Authority invariants (mandatory, frozen by the reviewed contract):
 *
 * ```text
 * RuntimeObservationRecord != DomainTruth
 * RuntimeObservationRecord != HarnessExecutionJournalRecord
 * RuntimeObservationRecord != RuntimeEvidenceRecord
 * RuntimeObservationStream != Runtime transition authority
 * Observer notification != durable observation record
 * Timestamp != ordering authority
 * ```
 *
 * The stream is read-only evidence for external consumers. It confers no
 * transition, promotion, selection, binding or activation authority, and it
 * never exposes private engine state or microsteps.
 */
/** Exact contract identity of this observation surface (capability negotiation). */
export const RUNTIME_OBSERVATION_CONTRACT_VERSION = 'runtime-observation/1';
/**
 * Public semantic Runtime commit families observed by this contract.
 *
 * `EFFECT_SETTLED` is deliberately NOT part of contract v1: the reviewed
 * rereview (P2) allows omitting it when narrow atomic source-effect
 * association cannot be proven without widening the concern. The
 * `effectRef` envelope field is reserved for a future family and is never
 * populated by contract v1 emitters.
 */
export const RUNTIME_OBSERVATION_EVENT_FAMILIES = [
    'INSTANCE_OPENED',
    'MESSAGE_ACCEPTED',
    'TURN_COMMITTED',
    'TURN_RECOVERY_REQUIRED',
    'RECOVERY_COMMITTED',
    'INSTANCE_TERMINALIZED',
];
export class RuntimeObservationError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'RuntimeObservationError';
        this.code = code;
    }
}
/** Structural capability check: does this store implement the observation seam? */
export function isRuntimeObservationStore(store) {
    if (store === null || typeof store !== 'object')
        return false;
    const candidate = store;
    return (typeof candidate.createInstanceWithObservation === 'function' &&
        typeof candidate.acceptMessageWithObservation === 'function' &&
        typeof candidate.commitProcessedMessageWithObservation === 'function' &&
        typeof candidate.failMessageProcessingWithObservation === 'function' &&
        typeof candidate.resetRecoveryWithObservation === 'function' &&
        typeof candidate.terminalizeInstanceWithObservation === 'function' &&
        typeof candidate.readObservations === 'function');
}
/**
 * Default exact package identity for a runtime-compiled package, using the
 * `DomainIntelligencePackageIdentity` shape required by the reviewed
 * contract.
 *
 * `contentDigest` maps to the compiled `packageId`: in this runtime the
 * packageId IS the content-derived digest of the canonical compiled manifest
 * (activation re-verifies it and fails closed on `PACKAGE_ID_MISMATCH`),
 * and registry pins are exact — so the pair (packageId, contentDigest) is
 * the immutable content identity the Runtime itself pins instances to.
 * Hosts that own a richer identity (e.g. a DAC-promoted CDI package digest)
 * can override this mapping when enabling the capability.
 */
export function runtimePackageIdentityFromManifest(manifest) {
    return {
        domainId: manifest.domainId,
        version: manifest.domainVersion,
        packageId: manifest.packageId,
        contentDigest: manifest.packageId,
        formatVersion: manifest.formatVersion,
        runtimeContractMajor: manifest.runtimeContractMajor,
        executionEngineMajor: manifest.executionEngineMajor,
        requiredCapabilities: [...manifest.requiredCapabilities],
    };
}
//# sourceMappingURL=contracts.js.map