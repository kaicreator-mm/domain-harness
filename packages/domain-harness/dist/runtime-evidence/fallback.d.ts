import type { RuntimeEvidenceCapture } from './capture.js';
import { type ExperimentalRollbackOutcome, type ExperimentalRollbackRequest } from './contracts.js';
export interface ExperimentalRollbackPorts {
    readonly capture: RuntimeEvidenceCapture;
}
/**
 * Rollback of an Experimental artifact is a reference contract only
 * (Amendment A1 §15.2): it validates the exact stable fallback, records the
 * operator action as Runtime Evidence, and returns the exact fallback
 * identity for a future fresh selection/evaluation contract. It never
 * rewrites a running instance's exact package/governance/dynamic-child pins
 * and never undoes committed external business effects; compensation remains
 * an explicit durable business action through the ordinary admission path.
 */
export declare function requestExperimentalRollback(request: ExperimentalRollbackRequest, ports: ExperimentalRollbackPorts): Promise<ExperimentalRollbackOutcome>;
//# sourceMappingURL=fallback.d.ts.map