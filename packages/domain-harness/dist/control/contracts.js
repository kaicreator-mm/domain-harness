/**
 * Issue #313 / #302 (reviewed Product/L2 chain + repair + rereview PASS):
 * generic public Runtime cancel/interrupt control.
 *
 * Authority invariants (mandatory, frozen by the reviewed contract):
 *
 * ```text
 * ControlIntent != RuntimeControlOutcome
 * RuntimeControlOutcome != ExternalEffectOutcome
 * AbortSignal != CommitEvidence
 * CANCEL != Rollback
 * INTERRUPT != DomainPolicyRecoveryDecision
 * SimulatorControlRequest != RuntimeTransitionAuthority
 * ControlRequestAccepted != RuntimeStopped
 * ```
 *
 * External control is opt-in and fail-closed authorization-gated: with no
 * configured `RuntimeControlAuthorizer` the capability is `UNSUPPORTED`
 * (default deny) and a Runtime reference alone is never control authority.
 * Raw XState actor handles and raw AbortControllers stay private; the public
 * truth is the durable control record/outcome only.
 */
/** Exact contract identity of this control surface (capability negotiation). */
export const RUNTIME_CONTROL_CONTRACT_VERSION = 'runtime-control/1';
/** Provenance marker frozen into terminalize/failure evidence by control writes. */
export const RUNTIME_CONTROL_PROVENANCE_KIND = 'runtime-control';
/** True when a terminal/recovery instance's durable failure was written by this exact control. */
export function runtimeControlProvenanceOf(instance) {
    const details = instance.failure?.details;
    if (details !== undefined &&
        details.kind === RUNTIME_CONTROL_PROVENANCE_KIND &&
        typeof details.controlRequestId === 'string' &&
        (details.action === 'CANCEL' || details.action === 'INTERRUPT') &&
        typeof details.authorizationRef === 'string' &&
        typeof details.policyRevision === 'string') {
        return details;
    }
    return null;
}
/** Terminalize reason JSON carrying exact control provenance (stored as failure evidence). */
export function runtimeControlTerminalizeReason(provenance) {
    return {
        code: `runtime_control_${provenance.action.toLowerCase()}`,
        message: `Workflow terminalized by runtime control ${provenance.controlRequestId}`,
        sourceMessageId: null,
        details: provenance,
    };
}
//# sourceMappingURL=contracts.js.map