import type { RuntimeEvidenceRecord } from '../contracts/runtime-evidence.js';
import type { RuntimeEvidenceCapture } from './capture.js';
import {
  assertExactExperimentalArtifact,
  RuntimeEvidenceIntegrationError,
  type ShadowEvaluationOutcome,
  type ShadowEvaluationRequest,
  type ShadowEvaluatorPort,
} from './contracts.js';

export interface ShadowEvaluationPorts {
  readonly capture: RuntimeEvidenceCapture;
  readonly evaluator: ShadowEvaluatorPort;
}

/**
 * Shadow-only L4 reference path (Amendment A1 §15.1): non-mutating, no
 * authoritative Workflow transition, no durable business Effect. The only
 * output channel is Runtime Evidence appended through the capture seam. A
 * shadow result can become an authoritative DomainEvent only by being
 * separately admitted through the ordinary validated/activated runtime path.
 */
export async function runShadowEvaluation(
  request: ShadowEvaluationRequest,
  ports: ShadowEvaluationPorts,
): Promise<ShadowEvaluationOutcome> {
  assertExactExperimentalArtifact(request.experimentalArtifact);
  if (request.shadowId.trim().length === 0) {
    throw new RuntimeEvidenceIntegrationError(
      'INVALID_RUNTIME_EVIDENCE_INTEGRATION',
      'shadowId must be a non-empty string',
    );
  }

  try {
    const result = await ports.evaluator.evaluate(request.input);
    const evidence: RuntimeEvidenceRecord[] = [];
    evidence.push(
      await ports.capture.captureEvaluation({
        shadowId: request.shadowId,
        verdict: result.verdict,
        experimentalArtifact: request.experimentalArtifact,
        ...(request.sourceExecution === undefined
          ? {}
          : { sourceExecution: request.sourceExecution }),
        sequence: 0,
      }),
    );
    for (const [index, counterexample] of (result.counterexamples ?? []).entries()) {
      evidence.push(
        await ports.capture.captureCounterexample({
          shadowId: request.shadowId,
          counterexample,
          experimentalArtifact: request.experimentalArtifact,
          ...(request.sourceExecution === undefined
            ? {}
            : { sourceExecution: request.sourceExecution }),
          sequence: index + 1,
        }),
      );
    }
    for (const [index, [name, value]] of Object.entries(result.metrics ?? {}).entries()) {
      evidence.push(
        await ports.capture.captureMetric({
          name: `shadow:${request.shadowId}:${name}`,
          value,
          ...(request.sourceExecution === undefined
            ? {}
            : { sourceExecution: request.sourceExecution }),
          sequence: index + 1,
        }),
      );
    }
    return { evidence };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await ports.capture.captureFailure({
      code: 'RUNTIME_EVIDENCE_SHADOW_FAILED',
      message,
      ...(request.sourceExecution === undefined
        ? {}
        : { sourceExecution: request.sourceExecution }),
    });
    throw new RuntimeEvidenceIntegrationError(
      'RUNTIME_EVIDENCE_SHADOW_FAILED',
      `shadow evaluation failed closed: ${message}`,
    );
  }
}
