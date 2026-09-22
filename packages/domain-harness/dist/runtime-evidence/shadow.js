import { assertExactExperimentalArtifact, RuntimeEvidenceIntegrationError, } from './contracts.js';
/**
 * Shadow-only L4 reference path (Amendment A1 §15.1): non-mutating, no
 * authoritative Workflow transition, no durable business Effect. The only
 * output channel is Runtime Evidence appended through the capture seam. A
 * shadow result can become an authoritative DomainEvent only by being
 * separately admitted through the ordinary validated/activated runtime path.
 */
export async function runShadowEvaluation(request, ports) {
    assertExactExperimentalArtifact(request.experimentalArtifact);
    if (request.shadowId.trim().length === 0) {
        throw new RuntimeEvidenceIntegrationError('INVALID_RUNTIME_EVIDENCE_INTEGRATION', 'shadowId must be a non-empty string');
    }
    try {
        const result = await ports.evaluator.evaluate(request.input);
        const evidence = [];
        evidence.push(await ports.capture.captureEvaluation({
            shadowId: request.shadowId,
            verdict: result.verdict,
            experimentalArtifact: request.experimentalArtifact,
            ...(request.sourceExecution === undefined
                ? {}
                : { sourceExecution: request.sourceExecution }),
            sequence: 0,
        }));
        for (const [index, counterexample] of (result.counterexamples ?? []).entries()) {
            evidence.push(await ports.capture.captureCounterexample({
                shadowId: request.shadowId,
                counterexample,
                experimentalArtifact: request.experimentalArtifact,
                ...(request.sourceExecution === undefined
                    ? {}
                    : { sourceExecution: request.sourceExecution }),
                sequence: index + 1,
            }));
        }
        for (const [index, [name, value]] of Object.entries(result.metrics ?? {}).entries()) {
            evidence.push(await ports.capture.captureMetric({
                name: `shadow:${request.shadowId}:${name}`,
                value,
                ...(request.sourceExecution === undefined
                    ? {}
                    : { sourceExecution: request.sourceExecution }),
                sequence: index + 1,
            }));
        }
        return { evidence };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // Failure evidence is audit material: its append must never mask the
        // shadow failure itself, so a store conflict cannot rewrite the surfaced
        // error code. The discriminator keeps distinct shadow failures distinct.
        try {
            await ports.capture.captureFailure({
                code: 'RUNTIME_EVIDENCE_SHADOW_FAILED',
                message,
                discriminator: `shadow:${request.shadowId}`,
                ...(request.sourceExecution === undefined
                    ? {}
                    : { sourceExecution: request.sourceExecution }),
            });
        }
        catch {
            // evidence append failure is secondary to the shadow failure
        }
        throw new RuntimeEvidenceIntegrationError('RUNTIME_EVIDENCE_SHADOW_FAILED', `shadow evaluation failed closed: ${message}`);
    }
}
//# sourceMappingURL=shadow.js.map