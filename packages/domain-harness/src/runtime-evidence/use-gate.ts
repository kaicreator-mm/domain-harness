import {
  assertRuntimeEvidenceUsable,
  type RuntimeEvidenceRecord,
} from '../contracts/runtime-evidence.js';
import type { GovernedEvaluationUse, ObservationUse } from './contracts.js';

/**
 * Governance-critical evaluation gate (Amendment A1 §13.4/§16, V9): exact
 * expected package + Governance Baseline provenance and durable-audit class
 * are mandatory; cross-scope use requires an exact external privacy /
 * governance contract. Every mismatch fails closed.
 */
export function assertEvidenceUsableForGovernedEvaluation(
  record: RuntimeEvidenceRecord,
  use: GovernedEvaluationUse,
): void {
  assertRuntimeEvidenceUsable(record, {
    target: use.target,
    governanceCritical: true,
    requireDurableAudit: true,
    expectedPackageId: use.expectedPackageId,
    expectedGovernanceBaseline: use.expectedGovernanceBaseline,
    ...(use.expectedSubjectArtifact === undefined
      ? {}
      : { expectedSubjectArtifact: use.expectedSubjectArtifact }),
    ...(use.externalScopeContract === undefined
      ? {}
      : { externalScopeContract: use.externalScopeContract }),
  });
}

/**
 * Non-governance-critical observation gate: record validity and the tenant /
 * domain privacy boundary are still enforced exactly; provenance pins are not
 * required at this level.
 */
export function assertEvidenceUsableForObservation(
  record: RuntimeEvidenceRecord,
  use: ObservationUse,
): void {
  assertRuntimeEvidenceUsable(record, {
    target: use.target,
    ...(use.externalScopeContract === undefined
      ? {}
      : { externalScopeContract: use.externalScopeContract }),
  });
}
