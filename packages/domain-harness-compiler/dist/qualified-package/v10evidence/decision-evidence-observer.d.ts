import { V10AppFacade } from '../v10build/activation.js';
import type { V10PublicIntent } from '../v10build/activation.js';
export declare const OBSERVER_ABI = "dh.v10.decision-evidence-observer/1";
/** Kernel outcomes a real receipt can honestly yield. */
export type HostKernelOutcome = 'admitted' | 'denied' | 'terminated' | 'unknown';
export declare class DecisionEvidenceObserverError extends Error {
    readonly code: string;
    constructor(code: string, message: string, options?: {
        cause?: unknown;
    });
}
/** The T02 host-selected semantic boundary this bridge is allowed to pin. */
export interface ObserverSemanticBoundary {
    readonly procedures?: ReadonlyMap<unknown, unknown>;
    readonly model?: (payload: unknown) => unknown;
    readonly tool?: (payload: unknown) => unknown;
    readonly now?: () => number;
    readonly createTimeoutSignal?: () => unknown;
}
export interface CreateDecisionEvidenceObserverDeps {
    /** The real activated App facade (deployment-owned; a lookalike is refused). */
    readonly facade: V10AppFacade;
    /** Feature key of the selected decision-evidence feature (e.g. `standard:decision-evidence/1`). */
    readonly evidenceFeatureKey: string;
    /** Feature key of the selected T02 semantic-decision feature. */
    readonly semanticFeatureKey: string;
    /**
     * Host-pinned model/tool/procedure boundary for the semantic resolution.
     * Closure-private once the observer is created: a public caller can never
     * reach or replace these endpoints through any later request.
     */
    readonly semanticDeps?: ObserverSemanticBoundary;
    /**
     * Optional Host-approved observation sink handed to the evidence feature.
     * Its failure (or timeout) surfaces in `observationStore` only — the
     * already-issued immutable K receipt and the observed trace are unaffected.
     */
    readonly persistObservation?: (trace: unknown) => void | Promise<void>;
    readonly observationTimeoutMs?: number;
}
export interface ObserveDecisionEvidenceRequest {
    /** The public intent whose real Kernel receipt is observed. */
    readonly intent: V10PublicIntent;
    /** Evidence identity carried into the base trace authored by the feature. */
    readonly evidence: {
        readonly observationId: string;
        readonly schema: {
            readonly id: string;
            readonly revision: string;
            readonly provenanceKey: string;
        };
        readonly observedDependencies?: readonly unknown[];
    };
    /** The request passed verbatim to the selected T02 semantic-decision feature. */
    readonly semanticRequest: Record<string, unknown>;
}
export interface DecisionEvidenceObservation {
    /** Frozen snapshot of the actual K original receipt the outcome was read from. */
    readonly kernelReceipt: Record<string, unknown>;
    /** The host-annotated immutable DecisionTrace (base authored by the feature). */
    readonly decisionTrace: Record<string, unknown>;
    /** Honest sink outcome from the evidence feature (`not-selected` when no sink). */
    readonly observationStore: string;
    readonly observerAbi: string;
}
export declare function createDecisionEvidenceObserver(deps: CreateDecisionEvidenceObserverDeps): {
    readonly observerAbi: string;
    observeAndRecord(request: ObserveDecisionEvidenceRequest): Promise<DecisionEvidenceObservation>;
};
