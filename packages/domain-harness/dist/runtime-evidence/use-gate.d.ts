import { type RuntimeEvidenceRecord } from '../contracts/runtime-evidence.js';
import type { GovernedEvaluationUse, ObservationUse } from './contracts.js';
/**
 * Governance-critical evaluation gate (Amendment A1 §13.4/§16, V9): exact
 * expected package + Governance Baseline provenance and durable-audit class
 * are mandatory; cross-scope use requires an exact external privacy /
 * governance contract. Every mismatch fails closed.
 */
export declare function assertEvidenceUsableForGovernedEvaluation(record: RuntimeEvidenceRecord, use: GovernedEvaluationUse): void;
/**
 * Non-governance-critical observation gate: record validity and the tenant /
 * domain privacy boundary are still enforced exactly; provenance pins are not
 * required at this level.
 */
export declare function assertEvidenceUsableForObservation(record: RuntimeEvidenceRecord, use: ObservationUse): void;
//# sourceMappingURL=use-gate.d.ts.map