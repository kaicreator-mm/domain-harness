/**
 * DomainHarness v0.10 T06 (#1173) — Host-origin read-only DecisionEvidence
 * observation bridge.
 * ====================================================================
 *
 * The selected Standard `decision-evidence` feature is deliberately a pure
 * normalizer: a public caller invoking it through
 * `facade.invokeSelectedStandardFeature(..., trustedDeps)` can never turn its
 * own claims into a Kernel admission observation — the trace stays
 * `kernelOutcome: 'unobserved'` on that path, and no caller callback is ever
 * treated as a trusted Host receipt.
 *
 * This module is the deployment-owned trusted counterpart. It closes the loop
 * over REAL selected surfaces only:
 *
 *   (1) the Kernel outcome is read from the actual `facade.send(intent)`
 *       return — the immutable K original receipt of the real selected
 *       kernel-primary (admission, denial or honest UNKNOWN pass through
 *       unchanged; a Kernel refusal is surfaced typed, never invented as an
 *       observation);
 *   (2) the decision result is produced by an actual invocation of the
 *       selected T02 semantic-decision feature whose model/tool boundary the
 *       deployment pinned HERE (closure-private), so the resolver outcome and
 *       its reported counters are the selected module's own output, not a
 *       caller's retelling;
 *   (3) the Host wraps the model/tool endpoints with a transparent counter,
 *       so the trace records Host-measured call counts next to the resolver's
 *       self-reported ones and marks agreement or mismatch honestly;
 *   (4) the evidence feature itself is still invoked through the real facade
 *       (with NO persistence side effect) and stays the author of the base
 *       trace; this bridge annotates the outcome/provenance facts it observed
 *       itself, freezes the result, and only THEN hands the final attested
 *       trace to the optional Host-owned sink under a bounded timeout — the
 *       sink stores the real evidence, and its failure or timeout cannot veto
 *       or rewrite the already-issued immutable K receipt.
 *
 * The bridge grants no authority: no K State/Journal/Fence/Effect/Permit is
 * read or written beyond the public send receipt, the optional observation
 * sink failure cannot veto or alter the already-issued K receipt, and every
 * object handed back is a frozen snapshot (the receipt digest allows the
 * caller to re-verify the exact receipt bytes the outcome was read from).
 */
import { V10Error } from '@kaicreator/domain-harness-contracts';
import type { V10PublicIntent } from '@kaicreator/domain-harness-contracts';
import type { V10AppFacade } from '@kaicreator/domain-harness-microkernel/host-seam';
export declare const OBSERVER_ABI = "dh.v10.decision-evidence-observer/1";
/** Kernel outcomes a real receipt can honestly yield. */
export type HostKernelOutcome = 'admitted' | 'denied' | 'terminated' | 'unknown';
export declare class DecisionEvidenceObserverError extends V10Error {
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
