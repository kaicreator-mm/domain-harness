import { isContentDigest } from './identity.js';
export const RUNTIME_EVIDENCE_SOURCE_KINDS = [
    'decision',
    'workflow-failure',
    'fallback',
    'human-override',
    'counterexample',
    'evaluation',
    'metric',
];
export const RUNTIME_EVIDENCE_DURABILITY_CLASSES = [
    'durable-audit',
    'derived-ephemeral',
];
export class RuntimeEvidenceContractError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'RuntimeEvidenceContractError';
        this.code = code;
    }
}
function fail(code, message) {
    throw new RuntimeEvidenceContractError(code, message);
}
function isNonEmptyString(value) {
    return typeof value === 'string' && value.length > 0;
}
function assertNonEmptyString(value, field) {
    if (!isNonEmptyString(value)) {
        fail('INVALID_RUNTIME_EVIDENCE', `${field} must be a non-empty string`);
    }
}
function assertOptionalNonEmptyString(value, field) {
    if (value !== undefined)
        assertNonEmptyString(value, field);
}
function assertScope(scope, field) {
    assertNonEmptyString(scope.domainId, `${field}.domainId`);
    assertOptionalNonEmptyString(scope.tenantScope, `${field}.tenantScope`);
}
function assertGovernanceBaselineRef(value, field) {
    assertNonEmptyString(value.domainId, `${field}.domainId`);
    assertNonEmptyString(value.governanceId, `${field}.governanceId`);
    assertNonEmptyString(value.schemaVersion, `${field}.schemaVersion`);
    if (!isContentDigest(value.contentDigest)) {
        fail('INVALID_RUNTIME_EVIDENCE', `${field}.contentDigest must be a non-empty digest`);
    }
}
function assertArtifactRef(value, field) {
    assertNonEmptyString(value.kind, `${field}.kind`);
    assertNonEmptyString(value.artifactId, `${field}.artifactId`);
    if (!isContentDigest(value.contentDigest)) {
        fail('INVALID_RUNTIME_EVIDENCE', `${field}.contentDigest must be a non-empty digest`);
    }
}
function assertSourceExecutionRef(value) {
    assertOptionalNonEmptyString(value.workflowTarget, 'provenance.sourceExecution.workflowTarget');
    assertOptionalNonEmptyString(value.workflowInstanceId, 'provenance.sourceExecution.workflowInstanceId');
    assertOptionalNonEmptyString(value.durableControlTurnId, 'provenance.sourceExecution.durableControlTurnId');
    assertOptionalNonEmptyString(value.decisionTraceRef, 'provenance.sourceExecution.decisionTraceRef');
    if (value.executionFactRefs !== undefined) {
        for (const [index, ref] of value.executionFactRefs.entries()) {
            assertNonEmptyString(ref, `provenance.sourceExecution.executionFactRefs[${index}]`);
        }
    }
}
function sameScope(left, right) {
    return left.domainId === right.domainId && left.tenantScope === right.tenantScope;
}
function sameGovernanceBaseline(left, right) {
    return (left.domainId === right.domainId &&
        left.governanceId === right.governanceId &&
        left.schemaVersion === right.schemaVersion &&
        left.contentDigest === right.contentDigest);
}
function sameArtifact(left, right) {
    return (left.kind === right.kind &&
        left.artifactId === right.artifactId &&
        left.contentDigest === right.contentDigest);
}
/** Deterministic, fail-closed validation of the portable Runtime Evidence record. */
export function assertValidRuntimeEvidenceRecord(record) {
    assertNonEmptyString(record.evidenceId, 'evidenceId');
    assertNonEmptyString(record.domainId, 'domainId');
    assertOptionalNonEmptyString(record.tenantScope, 'tenantScope');
    if (record.truthClass !== 'runtime-evidence') {
        fail('RUNTIME_EVIDENCE_NOT_EXECUTION_TRUTH', 'Runtime Evidence must retain truthClass=runtime-evidence');
    }
    if (record.executionAuthority !== 'none') {
        fail('RUNTIME_EVIDENCE_NOT_EXECUTION_TRUTH', 'Runtime Evidence cannot claim replay or committed-work authority');
    }
    if (!RUNTIME_EVIDENCE_SOURCE_KINDS.includes(record.sourceKind)) {
        fail('INVALID_RUNTIME_EVIDENCE', `unsupported sourceKind: ${String(record.sourceKind)}`);
    }
    if (!RUNTIME_EVIDENCE_DURABILITY_CLASSES.includes(record.durability)) {
        fail('INVALID_RUNTIME_EVIDENCE', `unsupported durability: ${String(record.durability)}`);
    }
    assertNonEmptyString(record.provenance.packageId, 'provenance.packageId');
    assertGovernanceBaselineRef(record.provenance.governanceBaseline, 'provenance.governanceBaseline');
    if (record.provenance.governanceBaseline.domainId !== record.domainId) {
        fail('RUNTIME_EVIDENCE_PROVENANCE_MISMATCH', 'provenance Governance Baseline domain must match the evidence domain');
    }
    if (record.provenance.sourceExecution !== undefined) {
        assertSourceExecutionRef(record.provenance.sourceExecution);
    }
    if (record.provenance.producerArtifact !== undefined) {
        assertArtifactRef(record.provenance.producerArtifact, 'provenance.producerArtifact');
    }
    if (record.subjectArtifact !== undefined) {
        assertArtifactRef(record.subjectArtifact, 'subjectArtifact');
    }
}
function assertExternalScopeContract(recordScope, targetScope, contract) {
    if (contract === undefined) {
        fail('RUNTIME_EVIDENCE_CROSS_SCOPE_FORBIDDEN', 'cross-domain/tenant Runtime Evidence use requires an explicit external privacy/governance contract');
    }
    assertNonEmptyString(contract.contractId, 'externalScopeContract.contractId');
    assertScope(contract.source, 'externalScopeContract.source');
    assertScope(contract.target, 'externalScopeContract.target');
    if (!sameScope(contract.source, recordScope) || !sameScope(contract.target, targetScope)) {
        fail('RUNTIME_EVIDENCE_CROSS_SCOPE_FORBIDDEN', 'external privacy/governance contract does not bind the exact source and target scopes');
    }
}
/**
 * Validate evidence use against exact authority and privacy expectations.
 * Governance-critical evaluation fails closed unless the caller supplies the
 * exact package and Governance Baseline expected for the evaluation.
 */
export function assertRuntimeEvidenceUsable(record, context) {
    assertValidRuntimeEvidenceRecord(record);
    assertScope(context.target, 'target');
    const recordScope = {
        domainId: record.domainId,
        ...(record.tenantScope === undefined ? {} : { tenantScope: record.tenantScope }),
    };
    if (!sameScope(recordScope, context.target)) {
        assertExternalScopeContract(recordScope, context.target, context.externalScopeContract);
    }
    if (context.governanceCritical === true) {
        if (context.expectedPackageId === undefined ||
            context.expectedGovernanceBaseline === undefined) {
            fail('RUNTIME_EVIDENCE_PROVENANCE_REQUIRED', 'governance-critical evidence use requires exact expected package and Governance Baseline identities');
        }
    }
    if (context.expectedPackageId !== undefined &&
        record.provenance.packageId !== context.expectedPackageId) {
        fail('RUNTIME_EVIDENCE_PROVENANCE_MISMATCH', 'evidence package provenance does not match the expected exact package');
    }
    if (context.expectedGovernanceBaseline !== undefined &&
        !sameGovernanceBaseline(record.provenance.governanceBaseline, context.expectedGovernanceBaseline)) {
        fail('RUNTIME_EVIDENCE_PROVENANCE_MISMATCH', 'evidence Governance Baseline provenance does not match the expected exact baseline');
    }
    if (context.expectedSubjectArtifact !== undefined &&
        (record.subjectArtifact === undefined ||
            !sameArtifact(record.subjectArtifact, context.expectedSubjectArtifact))) {
        fail('RUNTIME_EVIDENCE_PROVENANCE_MISMATCH', 'evidence subject artifact does not match the expected exact artifact');
    }
    if (context.requireDurableAudit === true && record.durability !== 'durable-audit') {
        fail('RUNTIME_EVIDENCE_DURABILITY_MISMATCH', 'governed use requires durable-audit evidence');
    }
}
//# sourceMappingURL=runtime-evidence.js.map