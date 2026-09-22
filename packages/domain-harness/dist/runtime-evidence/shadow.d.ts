import type { RuntimeEvidenceCapture } from './capture.js';
import { type ShadowEvaluationOutcome, type ShadowEvaluationRequest, type ShadowEvaluatorPort } from './contracts.js';
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
export declare function runShadowEvaluation(request: ShadowEvaluationRequest, ports: ShadowEvaluationPorts): Promise<ShadowEvaluationOutcome>;
//# sourceMappingURL=shadow.d.ts.map