import type { ContentDigest } from '../contracts/identity.js';
import type { JsonValue } from '../contracts/json.js';
import type { RuntimeEvidenceArtifactRef, RuntimeEvidenceExternalScopeContract, RuntimeEvidenceGovernanceBaselineRef, RuntimeEvidenceRecord, RuntimeEvidenceScope, RuntimeEvidenceSourceExecutionRef } from '../contracts/runtime-evidence.js';
import type { HumanOperatorActorIdentity } from '../promotion-activation/contracts.js';
export type RuntimeEvidenceIntegrationErrorCode = 'INVALID_RUNTIME_EVIDENCE_INTEGRATION' | 'RUNTIME_EVIDENCE_FLOATING_FALLBACK' | 'RUNTIME_EVIDENCE_SHADOW_FAILED' | 'RUNTIME_EVIDENCE_APPEND_CONFLICT';
export declare class RuntimeEvidenceIntegrationError extends Error {
    readonly code: RuntimeEvidenceIntegrationErrorCode;
    constructor(code: RuntimeEvidenceIntegrationErrorCode, message: string);
}
/**
 * Exact stable fallback reference every represented Experimental artifact
 * must carry (Amendment A1 §15.2). The triple is content-exact: package id,
 * Governance Baseline content digest and artifact content identity.
 */
export interface StableFallbackIdentity {
    readonly packageId: string;
    readonly governanceBaselineContentDigest: ContentDigest;
    readonly artifact: RuntimeEvidenceArtifactRef;
}
/** An Experimental artifact is represented only together with its exact stable fallback. */
export interface ExperimentalArtifactReference {
    readonly subjectArtifact: RuntimeEvidenceArtifactRef;
    readonly stableFallback: StableFallbackIdentity;
}
/**
 * Fail-closed validation of the exact stable fallback identity. Any floating
 * alias in any identity slot rejects the representation before it can be used.
 */
export declare function assertExactStableFallbackIdentity(fallback: StableFallbackIdentity): void;
/** Fail-closed validation of a represented Experimental artifact. */
export declare function assertExactExperimentalArtifact(reference: ExperimentalArtifactReference): void;
/**
 * Capture-time binding of the exact authority context every record inherits.
 * This is pinned-package/Governance provenance, not fallback authority:
 * Amendment A1 §15.2 floating-alias rejection applies to the Experimental
 * artifact slots (assertExactExperimentalArtifact), which is the only place
 * the Amendment forbids floating fallback authority.
 */
export interface RuntimeEvidenceCaptureContext {
    readonly domainId: string;
    readonly tenantScope?: string;
    readonly packageId: string;
    readonly governanceBaseline: RuntimeEvidenceGovernanceBaselineRef;
}
/** Shadow-only L4 evaluation request (A1 §15.1). */
export interface ShadowEvaluationRequest {
    readonly shadowId: string;
    readonly experimentalArtifact: ExperimentalArtifactReference;
    readonly input: JsonValue;
    readonly sourceExecution?: RuntimeEvidenceSourceExecutionRef;
}
export interface ShadowEvaluationResult {
    readonly verdict: JsonValue;
    readonly counterexamples?: readonly JsonValue[];
    readonly metrics?: Readonly<Record<string, JsonValue>>;
}
/**
 * Host-supplied pure shadow evaluator. The seam injects no admission port,
 * effect journal, tool port, baseline store, durable store or activation
 * authority, so a shadow run has no mutation channel by construction.
 */
export interface ShadowEvaluatorPort {
    evaluate(input: JsonValue): Promise<ShadowEvaluationResult>;
}
/** The shadow path's only output channel: Runtime Evidence records. */
export interface ShadowEvaluationOutcome {
    readonly evidence: readonly RuntimeEvidenceRecord[];
}
/** Operator rollback request against an Experimental artifact (A1 §15.2). */
export interface ExperimentalRollbackRequest {
    readonly experimentalArtifact: ExperimentalArtifactReference;
    readonly operator: HumanOperatorActorIdentity;
    readonly reason: string;
    readonly sourceExecution?: RuntimeEvidenceSourceExecutionRef;
}
/**
 * Rollback output is evidence plus the exact fallback identity for a future
 * fresh selection/evaluation contract. It carries no pin/registry/journal
 * handle: running instances keep their exact pins and committed external
 * effects are never undone here.
 */
export interface ExperimentalRollbackOutcome {
    readonly evidence: readonly RuntimeEvidenceRecord[];
    readonly stableFallback: StableFallbackIdentity;
}
/** Use gate input for governance-critical evaluation (V9, A1 §13.4/§16). */
export interface GovernedEvaluationUse {
    readonly target: RuntimeEvidenceScope;
    readonly expectedPackageId: string;
    readonly expectedGovernanceBaseline: RuntimeEvidenceGovernanceBaselineRef;
    readonly expectedSubjectArtifact?: RuntimeEvidenceArtifactRef;
    readonly externalScopeContract?: RuntimeEvidenceExternalScopeContract;
}
/** Use gate input for non-governance-critical observation. */
export interface ObservationUse {
    readonly target: RuntimeEvidenceScope;
    readonly externalScopeContract?: RuntimeEvidenceExternalScopeContract;
}
//# sourceMappingURL=contracts.d.ts.map