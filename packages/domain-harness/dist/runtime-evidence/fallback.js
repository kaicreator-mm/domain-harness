import { assertExactExperimentalArtifact, RuntimeEvidenceIntegrationError, } from './contracts.js';
/**
 * Rollback of an Experimental artifact is a reference contract only
 * (Amendment A1 §15.2): it validates the exact stable fallback, records the
 * operator action as Runtime Evidence, and returns the exact fallback
 * identity for a future fresh selection/evaluation contract. It never
 * rewrites a running instance's exact package/governance/dynamic-child pins
 * and never undoes committed external business effects; compensation remains
 * an explicit durable business action through the ordinary admission path.
 */
export async function requestExperimentalRollback(request, ports) {
    assertExactExperimentalArtifact(request.experimentalArtifact);
    if (request.reason.trim().length === 0) {
        throw new RuntimeEvidenceIntegrationError('INVALID_RUNTIME_EVIDENCE_INTEGRATION', 'rollback reason must be a non-empty string');
    }
    if (request.operator.kind !== 'human-operator' ||
        request.operator.actorId.trim().length === 0 ||
        request.operator.operatorId.trim().length === 0) {
        throw new RuntimeEvidenceIntegrationError('INVALID_RUNTIME_EVIDENCE_INTEGRATION', 'rollback requires an explicit human-operator identity');
    }
    const evidence = [];
    evidence.push(await ports.capture.captureFallback({
        reason: `experimental rollback: ${request.reason}`,
        ...(request.sourceExecution === undefined
            ? {}
            : { sourceExecution: request.sourceExecution }),
        subjectArtifact: request.experimentalArtifact.subjectArtifact,
        sequence: 0,
    }));
    evidence.push(await ports.capture.captureOperatorOverride({
        actionId: `rollback:${request.experimentalArtifact.subjectArtifact.artifactId}`,
        actor: request.operator,
        detail: {
            kind: 'experimental-rollback',
            reason: request.reason,
            stableFallback: {
                packageId: request.experimentalArtifact.stableFallback.packageId,
                governanceBaselineContentDigest: request.experimentalArtifact.stableFallback.governanceBaselineContentDigest,
                artifact: {
                    kind: request.experimentalArtifact.stableFallback.artifact.kind,
                    artifactId: request.experimentalArtifact.stableFallback.artifact.artifactId,
                    contentDigest: request.experimentalArtifact.stableFallback.artifact.contentDigest,
                },
            },
        },
        ...(request.sourceExecution === undefined
            ? {}
            : { sourceExecution: request.sourceExecution }),
        subjectArtifact: request.experimentalArtifact.subjectArtifact,
        sequence: 1,
    }));
    return {
        evidence,
        stableFallback: request.experimentalArtifact.stableFallback,
    };
}
//# sourceMappingURL=fallback.js.map