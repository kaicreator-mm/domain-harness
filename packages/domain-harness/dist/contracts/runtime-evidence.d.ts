import type { ContentDigest, ExactContentIdentity } from './identity.js';
import type { JsonValue } from './json.js';
export declare const RUNTIME_EVIDENCE_SOURCE_KINDS: readonly ["decision", "workflow-failure", "fallback", "human-override", "counterexample", "evaluation", "metric"];
export type RuntimeEvidenceSourceKind = (typeof RUNTIME_EVIDENCE_SOURCE_KINDS)[number];
export declare const RUNTIME_EVIDENCE_DURABILITY_CLASSES: readonly ["durable-audit", "derived-ephemeral"];
export type RuntimeEvidenceDurability = (typeof RUNTIME_EVIDENCE_DURABILITY_CLASSES)[number];
/**
 * Evidence-side structural view of the exact Governance Baseline identity.
 * T-005 does not own the Governance Baseline registry/lifecycle (T-003); the
 * canonical T-003 identity is expected to be structurally assignable here.
 */
export interface RuntimeEvidenceGovernanceBaselineRef extends ExactContentIdentity {
    readonly domainId: string;
    readonly governanceId: string;
}
export interface RuntimeEvidenceArtifactRef {
    readonly kind: string;
    readonly artifactId: string;
    readonly contentDigest: ContentDigest;
}
export interface RuntimeEvidenceSourceExecutionRef {
    readonly workflowTarget?: string;
    readonly workflowInstanceId?: string;
    readonly durableControlTurnId?: string;
    readonly decisionTraceRef?: string;
    readonly executionFactRefs?: readonly string[];
}
/**
 * Exact provenance required to make evidence reviewable without turning it
 * into replay truth. References may point at execution facts; they do not
 * replace the journals that own those facts.
 */
export interface RuntimeEvidenceProvenance {
    readonly packageId: string;
    readonly governanceBaseline: RuntimeEvidenceGovernanceBaselineRef;
    readonly sourceExecution?: RuntimeEvidenceSourceExecutionRef;
    readonly producerArtifact?: RuntimeEvidenceArtifactRef;
}
/**
 * Runtime Evidence is output-only execution/evaluation material.
 *
 * `truthClass` and `executionAuthority` deliberately make the negative
 * authority explicit: this record is neither Domain Facts/CDI nor a control
 * snapshot/journal record, and it can never prove committed AI/query/effect
 * work or suppress retry/replay.
 */
export interface RuntimeEvidenceRecord {
    readonly evidenceId: string;
    readonly truthClass: 'runtime-evidence';
    readonly executionAuthority: 'none';
    readonly domainId: string;
    readonly tenantScope?: string;
    readonly sourceKind: RuntimeEvidenceSourceKind;
    readonly durability: RuntimeEvidenceDurability;
    readonly provenance: RuntimeEvidenceProvenance;
    readonly subjectArtifact?: RuntimeEvidenceArtifactRef;
    readonly payload?: JsonValue;
}
/**
 * The runtime-facing v0.3 port is intentionally write-only. Offline analysis,
 * Candidate production/evaluation and operator tooling may read evidence via
 * externally governed storage surfaces, but Runtime Evidence is not a replay
 * lookup source for the running DomainHarness runtime.
 */
export interface RuntimeEvidencePort {
    append(record: RuntimeEvidenceRecord): Promise<void>;
}
export interface RuntimeEvidenceScope {
    readonly domainId: string;
    readonly tenantScope?: string;
}
/**
 * Narrow authorization token supplied by an external privacy/governance
 * authority when evidence must intentionally cross domain/tenant scope.
 * DomainHarness v0.3 does not issue or manage these contracts.
 */
export interface RuntimeEvidenceExternalScopeContract {
    readonly contractId: string;
    readonly source: RuntimeEvidenceScope;
    readonly target: RuntimeEvidenceScope;
}
export interface RuntimeEvidenceUseContext {
    readonly target: RuntimeEvidenceScope;
    readonly governanceCritical?: boolean;
    readonly requireDurableAudit?: boolean;
    readonly expectedPackageId?: string;
    readonly expectedGovernanceBaseline?: RuntimeEvidenceGovernanceBaselineRef;
    readonly expectedSubjectArtifact?: RuntimeEvidenceArtifactRef;
    readonly externalScopeContract?: RuntimeEvidenceExternalScopeContract;
}
export type RuntimeEvidenceContractErrorCode = 'INVALID_RUNTIME_EVIDENCE' | 'RUNTIME_EVIDENCE_NOT_EXECUTION_TRUTH' | 'RUNTIME_EVIDENCE_PROVENANCE_REQUIRED' | 'RUNTIME_EVIDENCE_PROVENANCE_MISMATCH' | 'RUNTIME_EVIDENCE_CROSS_SCOPE_FORBIDDEN' | 'RUNTIME_EVIDENCE_DURABILITY_MISMATCH';
export declare class RuntimeEvidenceContractError extends Error {
    readonly code: RuntimeEvidenceContractErrorCode;
    constructor(code: RuntimeEvidenceContractErrorCode, message: string);
}
/** Deterministic, fail-closed validation of the portable Runtime Evidence record. */
export declare function assertValidRuntimeEvidenceRecord(record: RuntimeEvidenceRecord): void;
/**
 * Validate evidence use against exact authority and privacy expectations.
 * Governance-critical evaluation fails closed unless the caller supplies the
 * exact package and Governance Baseline expected for the evaluation.
 */
export declare function assertRuntimeEvidenceUsable(record: RuntimeEvidenceRecord, context: RuntimeEvidenceUseContext): void;
//# sourceMappingURL=runtime-evidence.d.ts.map