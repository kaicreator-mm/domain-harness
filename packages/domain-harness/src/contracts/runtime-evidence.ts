import type { ContentDigest, ExactContentIdentity } from './identity.js';
import { isContentDigest } from './identity.js';
import type { JsonValue } from './json.js';

export const RUNTIME_EVIDENCE_SOURCE_KINDS = [
  'decision',
  'workflow-failure',
  'fallback',
  'human-override',
  'counterexample',
  'evaluation',
  'metric',
] as const;

export type RuntimeEvidenceSourceKind = (typeof RUNTIME_EVIDENCE_SOURCE_KINDS)[number];

export const RUNTIME_EVIDENCE_DURABILITY_CLASSES = [
  'durable-audit',
  'derived-ephemeral',
] as const;

export type RuntimeEvidenceDurability =
  (typeof RUNTIME_EVIDENCE_DURABILITY_CLASSES)[number];

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

export type RuntimeEvidenceContractErrorCode =
  | 'INVALID_RUNTIME_EVIDENCE'
  | 'RUNTIME_EVIDENCE_NOT_EXECUTION_TRUTH'
  | 'RUNTIME_EVIDENCE_PROVENANCE_REQUIRED'
  | 'RUNTIME_EVIDENCE_PROVENANCE_MISMATCH'
  | 'RUNTIME_EVIDENCE_CROSS_SCOPE_FORBIDDEN'
  | 'RUNTIME_EVIDENCE_DURABILITY_MISMATCH';

export class RuntimeEvidenceContractError extends Error {
  readonly code: RuntimeEvidenceContractErrorCode;

  constructor(code: RuntimeEvidenceContractErrorCode, message: string) {
    super(message);
    this.name = 'RuntimeEvidenceContractError';
    this.code = code;
  }
}

function fail(code: RuntimeEvidenceContractErrorCode, message: string): never {
  throw new RuntimeEvidenceContractError(code, message);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function assertNonEmptyString(value: unknown, field: string): asserts value is string {
  if (!isNonEmptyString(value)) {
    fail('INVALID_RUNTIME_EVIDENCE', `${field} must be a non-empty string`);
  }
}

function assertOptionalNonEmptyString(value: unknown, field: string): void {
  if (value !== undefined) assertNonEmptyString(value, field);
}

function assertScope(scope: RuntimeEvidenceScope, field: string): void {
  assertNonEmptyString(scope.domainId, `${field}.domainId`);
  assertOptionalNonEmptyString(scope.tenantScope, `${field}.tenantScope`);
}

function assertGovernanceBaselineRef(
  value: RuntimeEvidenceGovernanceBaselineRef,
  field: string,
): void {
  assertNonEmptyString(value.domainId, `${field}.domainId`);
  assertNonEmptyString(value.governanceId, `${field}.governanceId`);
  assertNonEmptyString(value.schemaVersion, `${field}.schemaVersion`);
  if (!isContentDigest(value.contentDigest)) {
    fail('INVALID_RUNTIME_EVIDENCE', `${field}.contentDigest must be a non-empty digest`);
  }
}

function assertArtifactRef(value: RuntimeEvidenceArtifactRef, field: string): void {
  assertNonEmptyString(value.kind, `${field}.kind`);
  assertNonEmptyString(value.artifactId, `${field}.artifactId`);
  if (!isContentDigest(value.contentDigest)) {
    fail('INVALID_RUNTIME_EVIDENCE', `${field}.contentDigest must be a non-empty digest`);
  }
}

function assertSourceExecutionRef(value: RuntimeEvidenceSourceExecutionRef): void {
  assertOptionalNonEmptyString(value.workflowTarget, 'provenance.sourceExecution.workflowTarget');
  assertOptionalNonEmptyString(
    value.workflowInstanceId,
    'provenance.sourceExecution.workflowInstanceId',
  );
  assertOptionalNonEmptyString(
    value.durableControlTurnId,
    'provenance.sourceExecution.durableControlTurnId',
  );
  assertOptionalNonEmptyString(
    value.decisionTraceRef,
    'provenance.sourceExecution.decisionTraceRef',
  );

  if (value.executionFactRefs !== undefined) {
    for (const [index, ref] of value.executionFactRefs.entries()) {
      assertNonEmptyString(ref, `provenance.sourceExecution.executionFactRefs[${index}]`);
    }
  }
}

function sameScope(left: RuntimeEvidenceScope, right: RuntimeEvidenceScope): boolean {
  return left.domainId === right.domainId && left.tenantScope === right.tenantScope;
}

function sameGovernanceBaseline(
  left: RuntimeEvidenceGovernanceBaselineRef,
  right: RuntimeEvidenceGovernanceBaselineRef,
): boolean {
  return (
    left.domainId === right.domainId &&
    left.governanceId === right.governanceId &&
    left.schemaVersion === right.schemaVersion &&
    left.contentDigest === right.contentDigest
  );
}

function sameArtifact(left: RuntimeEvidenceArtifactRef, right: RuntimeEvidenceArtifactRef): boolean {
  return (
    left.kind === right.kind &&
    left.artifactId === right.artifactId &&
    left.contentDigest === right.contentDigest
  );
}

/** Deterministic, fail-closed validation of the portable Runtime Evidence record. */
export function assertValidRuntimeEvidenceRecord(record: RuntimeEvidenceRecord): void {
  assertNonEmptyString(record.evidenceId, 'evidenceId');
  assertNonEmptyString(record.domainId, 'domainId');
  assertOptionalNonEmptyString(record.tenantScope, 'tenantScope');

  if (record.truthClass !== 'runtime-evidence') {
    fail(
      'RUNTIME_EVIDENCE_NOT_EXECUTION_TRUTH',
      'Runtime Evidence must retain truthClass=runtime-evidence',
    );
  }

  if (record.executionAuthority !== 'none') {
    fail(
      'RUNTIME_EVIDENCE_NOT_EXECUTION_TRUTH',
      'Runtime Evidence cannot claim replay or committed-work authority',
    );
  }

  if (!(RUNTIME_EVIDENCE_SOURCE_KINDS as readonly string[]).includes(record.sourceKind)) {
    fail('INVALID_RUNTIME_EVIDENCE', `unsupported sourceKind: ${String(record.sourceKind)}`);
  }

  if (!(RUNTIME_EVIDENCE_DURABILITY_CLASSES as readonly string[]).includes(record.durability)) {
    fail('INVALID_RUNTIME_EVIDENCE', `unsupported durability: ${String(record.durability)}`);
  }

  assertNonEmptyString(record.provenance.packageId, 'provenance.packageId');
  assertGovernanceBaselineRef(record.provenance.governanceBaseline, 'provenance.governanceBaseline');

  if (record.provenance.governanceBaseline.domainId !== record.domainId) {
    fail(
      'RUNTIME_EVIDENCE_PROVENANCE_MISMATCH',
      'provenance Governance Baseline domain must match the evidence domain',
    );
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

function assertExternalScopeContract(
  recordScope: RuntimeEvidenceScope,
  targetScope: RuntimeEvidenceScope,
  contract: RuntimeEvidenceExternalScopeContract | undefined,
): void {
  if (contract === undefined) {
    fail(
      'RUNTIME_EVIDENCE_CROSS_SCOPE_FORBIDDEN',
      'cross-domain/tenant Runtime Evidence use requires an explicit external privacy/governance contract',
    );
  }

  assertNonEmptyString(contract.contractId, 'externalScopeContract.contractId');
  assertScope(contract.source, 'externalScopeContract.source');
  assertScope(contract.target, 'externalScopeContract.target');

  if (!sameScope(contract.source, recordScope) || !sameScope(contract.target, targetScope)) {
    fail(
      'RUNTIME_EVIDENCE_CROSS_SCOPE_FORBIDDEN',
      'external privacy/governance contract does not bind the exact source and target scopes',
    );
  }
}

/**
 * Validate evidence use against exact authority and privacy expectations.
 * Governance-critical evaluation fails closed unless the caller supplies the
 * exact package and Governance Baseline expected for the evaluation.
 */
export function assertRuntimeEvidenceUsable(
  record: RuntimeEvidenceRecord,
  context: RuntimeEvidenceUseContext,
): void {
  assertValidRuntimeEvidenceRecord(record);
  assertScope(context.target, 'target');

  const recordScope: RuntimeEvidenceScope = {
    domainId: record.domainId,
    ...(record.tenantScope === undefined ? {} : { tenantScope: record.tenantScope }),
  };

  if (!sameScope(recordScope, context.target)) {
    assertExternalScopeContract(recordScope, context.target, context.externalScopeContract);
  }

  if (context.governanceCritical === true) {
    if (
      context.expectedPackageId === undefined ||
      context.expectedGovernanceBaseline === undefined
    ) {
      fail(
        'RUNTIME_EVIDENCE_PROVENANCE_REQUIRED',
        'governance-critical evidence use requires exact expected package and Governance Baseline identities',
      );
    }
  }

  if (
    context.expectedPackageId !== undefined &&
    record.provenance.packageId !== context.expectedPackageId
  ) {
    fail(
      'RUNTIME_EVIDENCE_PROVENANCE_MISMATCH',
      'evidence package provenance does not match the expected exact package',
    );
  }

  if (
    context.expectedGovernanceBaseline !== undefined &&
    !sameGovernanceBaseline(
      record.provenance.governanceBaseline,
      context.expectedGovernanceBaseline,
    )
  ) {
    fail(
      'RUNTIME_EVIDENCE_PROVENANCE_MISMATCH',
      'evidence Governance Baseline provenance does not match the expected exact baseline',
    );
  }

  if (
    context.expectedSubjectArtifact !== undefined &&
    (record.subjectArtifact === undefined ||
      !sameArtifact(record.subjectArtifact, context.expectedSubjectArtifact))
  ) {
    fail(
      'RUNTIME_EVIDENCE_PROVENANCE_MISMATCH',
      'evidence subject artifact does not match the expected exact artifact',
    );
  }

  if (context.requireDurableAudit === true && record.durability !== 'durable-audit') {
    fail(
      'RUNTIME_EVIDENCE_DURABILITY_MISMATCH',
      'governed use requires durable-audit evidence',
    );
  }
}
