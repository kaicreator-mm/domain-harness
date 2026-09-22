import type { JsonValue } from '../contracts/json.js';
import { type RuntimeEvidenceArtifactRef, type RuntimeEvidencePort, type RuntimeEvidenceRecord, type RuntimeEvidenceSourceExecutionRef } from '../contracts/runtime-evidence.js';
import type { CentralAdmissionOutcome } from '../admission/contracts.js';
import type { PromotionActivationAuditRecord } from '../promotion-activation/contracts.js';
import type { HumanOperatorActorIdentity } from '../promotion-activation/contracts.js';
import type { ExperimentalArtifactReference, RuntimeEvidenceCaptureContext } from './contracts.js';
export interface CaptureDecisionInput {
    readonly outcome: CentralAdmissionOutcome;
    readonly sourceExecution: RuntimeEvidenceSourceExecutionRef;
    readonly producerArtifact?: RuntimeEvidenceArtifactRef;
    readonly sequence?: number;
}
export interface CaptureFailureInput {
    readonly code: string;
    readonly message: string;
    readonly sourceExecution?: RuntimeEvidenceSourceExecutionRef;
    /**
     * Optional evidence-id discriminator override. Integration points that can
     * fail repeatedly under the same code/turn (e.g. shadow evaluation) supply
     * their own discriminator so distinct failures stay distinct records.
     */
    readonly discriminator?: string;
    readonly sequence?: number;
}
export interface CaptureFallbackInput {
    readonly reason: string;
    readonly sourceExecution?: RuntimeEvidenceSourceExecutionRef;
    readonly subjectArtifact?: RuntimeEvidenceArtifactRef;
    readonly sequence?: number;
}
export interface CaptureHumanOverrideInput {
    readonly audit: PromotionActivationAuditRecord;
    readonly sequence?: number;
}
/** General operator-override integration point (rollback, manual intervention, …). */
export interface CaptureOperatorOverrideInput {
    readonly actionId: string;
    readonly actor: HumanOperatorActorIdentity;
    readonly detail: JsonValue;
    readonly sourceExecution?: RuntimeEvidenceSourceExecutionRef;
    readonly subjectArtifact?: RuntimeEvidenceArtifactRef;
    readonly sequence?: number;
}
export interface CaptureEvaluationInput {
    readonly shadowId: string;
    readonly verdict: JsonValue;
    readonly experimentalArtifact: ExperimentalArtifactReference;
    readonly sourceExecution?: RuntimeEvidenceSourceExecutionRef;
    readonly sequence?: number;
}
export interface CaptureCounterexampleInput {
    readonly shadowId: string;
    readonly counterexample: JsonValue;
    readonly experimentalArtifact: ExperimentalArtifactReference;
    readonly sourceExecution?: RuntimeEvidenceSourceExecutionRef;
    readonly sequence?: number;
}
export interface CaptureMetricInput {
    readonly name: string;
    readonly value: JsonValue;
    readonly sourceExecution?: RuntimeEvidenceSourceExecutionRef;
    readonly sequence?: number;
}
/**
 * Integration-point capture for Runtime Evidence (T-020). One method per
 * integration point; each builds the record, validates it fail-closed with
 * the T-005 contract, then appends through the write-only port. The capture
 * path never reads evidence back, so evidence can never gate execution here.
 */
export declare class RuntimeEvidenceCapture {
    #private;
    constructor(context: RuntimeEvidenceCaptureContext, port: RuntimeEvidencePort);
    get context(): RuntimeEvidenceCaptureContext;
    captureDecision(input: CaptureDecisionInput): Promise<RuntimeEvidenceRecord>;
    captureFailure(input: CaptureFailureInput): Promise<RuntimeEvidenceRecord>;
    captureFallback(input: CaptureFallbackInput): Promise<RuntimeEvidenceRecord>;
    captureHumanOverride(input: CaptureHumanOverrideInput): Promise<RuntimeEvidenceRecord>;
    captureOperatorOverride(input: CaptureOperatorOverrideInput): Promise<RuntimeEvidenceRecord>;
    captureEvaluation(input: CaptureEvaluationInput): Promise<RuntimeEvidenceRecord>;
    captureCounterexample(input: CaptureCounterexampleInput): Promise<RuntimeEvidenceRecord>;
    captureMetric(input: CaptureMetricInput): Promise<RuntimeEvidenceRecord>;
}
//# sourceMappingURL=capture.d.ts.map