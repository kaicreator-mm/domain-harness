import type { DacObservedBasis, DomainCommandCorrelation } from './contracts.js';
import type { ProjectionSnapshot } from '../v2/contracts/projection.js';
import type { WorkflowInstanceSnapshot } from '../v2/contracts/workflow.js';
/** The current authoritative observation a basis is classified against. */
export type AuthoritativeObservation = {
    readonly kind: 'workflow-instance';
    readonly snapshot: WorkflowInstanceSnapshot;
} | {
    readonly kind: 'projection';
    readonly snapshot: ProjectionSnapshot;
} | {
    readonly kind: 'revision';
    readonly sourceKind: string;
    readonly targetKey?: string;
    readonly revision: string;
};
export type ObservedBasisClassification = {
    readonly status: 'CURRENT';
} | {
    readonly status: 'STALE';
    readonly observedSourceKind: string;
    readonly observedRevision: string;
    readonly authoritativeRevision: string;
    readonly requiredHandling: 'REJECT_OR_EXPLICIT_REBASE_REVIEW';
} | {
    readonly status: 'NOT_OBSERVED';
};
/** Canonical target identity of a workflow instance observation. */
export declare function workflowInstanceTargetKey(address: {
    readonly workflowId: string;
    readonly instanceKey: string;
}): string;
/** Canonical target identity of a projection observation. */
export declare function projectionTargetKey(projectionId: string, key: string): string;
/**
 * The observed basis a command correlation carries: the direct correlation
 * basis when supplied, otherwise the intent's basis. Presence in either slot
 * satisfies correlatability (DAC section 9).
 */
export declare function resolvedObservedBasis(correlation: Pick<DomainCommandCorrelation, 'intent' | 'observedBasis'> | undefined): DacObservedBasis | undefined;
/**
 * Classify an observed basis against the current authoritative observation.
 *
 * - `requireBasis: true` and no basis anywhere → `BASIS_REQUIRED` (fail
 *   closed for that operation; never "assume current").
 * - A basis for a different source kind or a different target than the
 *   authoritative observation → `TARGET_MISMATCH` (fail closed; a reference
 *   is never silently reinterpreted to another target — DAC section 11).
 * - Exact revision equality → `CURRENT`; otherwise → `STALE` with the
 *   required `REJECT_OR_EXPLICIT_REBASE_REVIEW` handling hint.
 */
export declare function classifyObservedBasis(correlation: Pick<DomainCommandCorrelation, 'intent' | 'observedBasis'> | undefined, authoritative: AuthoritativeObservation, options: {
    readonly requireBasis: boolean;
}): ObservedBasisClassification;
//# sourceMappingURL=stale-basis.d.ts.map