import type { JsonValue } from '../contracts/json.js';
import type { ResolvedDecision } from '../decision-resolver/contracts.js';
import type { WorkflowAddress } from '../v2/contracts/workflow.js';
import { type AdmissionResolverEvidence, type AdmissionTurnSource, type CentralAdmissionOutcome, type CentralAdmissionPorts, type CentralAdmissionRequest } from './contracts.js';
/**
 * Deterministic Durable Control Turn identity (frozen L2 §13.2). Replaying the
 * same source derives the same id; distinct sources never collide. Synchronous
 * engine microsteps settle inside the containing turn — every effect/query/AI
 * operation identity derives from this id plus a stable operation ordinal.
 */
export declare function deriveDurableControlTurnId(target: WorkflowAddress, source: AdmissionTurnSource): string;
/** §21 handoff: resolver telemetry/LLM-avoidance evidence for the turn receipt. */
export declare function admissionResolverEvidence(resolved: ResolvedDecision<JsonValue>): AdmissionResolverEvidence;
/**
 * The single central authoritative admission path (frozen L2 §15, Amendment
 * A1 §8.1): structured result → current schema → pinned Governance Baseline
 * Hard Invariants → current guard → transition → durable effect intent.
 *
 * Every resolver source (rule / exact cache / promoted subworkflow / Business
 * Harness) passes the same gates, so no source can bypass admission. The
 * admitted output is a plan for the parent Durable Control Turn publication;
 * admission itself never mutates workflow state, message dispositions or
 * control snapshots, and holds no resolver/evidence handle — guard rejection
 * is final, with no hidden resolver retry (S7).
 */
export declare function admitCentralDecision(request: CentralAdmissionRequest, ports: CentralAdmissionPorts): Promise<CentralAdmissionOutcome>;
//# sourceMappingURL=admission.d.ts.map