/**
 * DomainHarness v0.10 T09 (#1178, R1 repair) — recurring proposal-only Meta
 * Feedback Workflow.
 * ====================================================================
 *
 * This Host-owned runner composes ONLY already-selected v0.10 surfaces:
 *
 *   (1) durable Decision Evidence / Candidate / Shadow records are read from
 *       the production document store through `get` only, bounded before any
 *       evaluator sees them, and ONLY from the exact deployment/tenant/App/
 *       Business evidence namespace derived from the trusted activation
 *       binding (never a public caller claim);
 *   (2) a selected Standard feature (`standard:meta-feedback/1`) turns those
 *       bounded observations into at most four PROPOSAL records;
 *   (3) exactly ONE ordinary selected Business workflow turn records that
 *       proposal. The selected Business policy declares a recurring
 *       self-transition whose guard accepts only `disposition:
 *       'proposal-only'` and `effectCount: 0`, and it declares no effect
 *       intent/binding at all;
 *   (4) a durable create-only RESERVATION is written BEFORE any business turn
 *       can be admitted, and a create-only ledger is written after the turn.
 *       Two simultaneous fresh writers of one round therefore cannot both
 *       reach `facade.send`: the one reservation CAS winner owns the send and
 *       every other fresh writer refuses typed. A later call that observes an
 *       existing reservation (a crashed or still-running earlier attempt)
 *       recovers by re-sending the SAME stable message identity with the
 *       reservation's own recorded input — the selected Kernel's durable
 *       message dedup replays the original receipt with zero new
 *       State/Journal/Effect activity — and then finalizes the terminal
 *       ledger. A pending reservation is never reported as success.
 *       Recurrence is explicit Host rounds (1..32), never an autonomous timer
 *       or a new Agent/Kernel runtime.
 *
 * The runner cannot approve, publish, promote a BUILD, activate a deployment
 * or dispatch an external Effect: it exposes no such operation and every
 * authority-shaped record is refused typed BEFORE any business turn or
 * reservation/ledger write. K State/Journal/Effect, the K02 fence and the
 * immutable original receipt remain exclusively the selected Kernel's.
 */
import { V10Error } from '@kaicreator/domain-harness-contracts';
import type { V10DocStore } from '@kaicreator/domain-harness-contracts';
import type { V10AppFacade } from '@kaicreator/domain-harness-microkernel/host-seam';
export declare const META_FEEDBACK_ABI = "dh.v10.meta-feedback-workflow/2";
export declare const META_FEEDBACK_LEDGER_KIND = "v10/meta-feedback-round";
export declare const META_FEEDBACK_CLAIM_KIND = "v10/meta-feedback-round-claim";
export declare const META_FEEDBACK_CLAIM_STATE = "reserved";
export declare const META_FEEDBACK_LEDGER_STATE = "committed";
export declare const META_FEEDBACK_EVIDENCE_KEY_PREFIX = "v10/t09/";
export declare const META_FEEDBACK_LEDGER_PREFIX = "v10-meta-feedback:";
export declare const META_FEEDBACK_CLAIM_PREFIX = "v10-meta-feedback-claim:";
export declare const MAX_META_ROUNDS = 32;
export declare const MAX_META_EVIDENCE_KEYS = 8;
export declare const MAX_META_RECORD_CHARS = 32768;
export declare class MetaFeedbackError extends V10Error {
    readonly detail: Readonly<Record<string, unknown>> | undefined;
    constructor(code: string, message: string, detail?: Record<string, unknown>);
}
/**
 * The exact selected deployment/Business identity that scopes BOTH the
 * read-only evidence namespace and the create-only round records. It is
 * derived from the trusted activation binding, never from public input.
 */
export interface MetaFeedbackScope {
    readonly deployedAppId: string;
    readonly tenantId: string;
    readonly appId: string;
    readonly businessPackageId: string;
}
/**
 * The read-only evidence namespace of ONE deployment/tenant/App/Business
 * tuple. Every component is injectively encoded, so Tenant A can never point
 * Tenant B's runner at its records through an ambiguous key.
 */
export declare function metaFeedbackEvidencePrefix(scope: MetaFeedbackScope): string;
/** The terminal create-only ledger key of one exact round. */
export declare function metaFeedbackLedgerKey(scope: MetaFeedbackScope, instanceKey: string, scheduleKey: string, round: number): string;
/** The create-only pre-admission reservation key of one exact round. */
export declare function metaFeedbackClaimKey(scope: MetaFeedbackScope, instanceKey: string, scheduleKey: string, round: number): string;
export interface MetaFeedbackSources {
    /** Durable DecisionTrace/Candidate/Shadow record keys (bounded, deduplicated). */
    readonly evidenceKeys: readonly string[];
    readonly candidateKey?: string;
    readonly shadowKey?: string;
}
export interface MetaFeedbackWorkflowAddress {
    readonly intentType: string;
    readonly instanceKey: string;
    readonly scheduleKey: string;
    /** Explicit Host round; the same round is idempotent, not a timer. */
    readonly round: number;
}
export interface RunMetaFeedbackWorkflowOptions {
    /** The REAL activated selected App facade; a lookalike is refused. */
    readonly facade: V10AppFacade;
    /** Durable production document store (read evidence, create-only round records). */
    readonly store: V10DocStore;
    readonly workflow: MetaFeedbackWorkflowAddress;
    readonly sources: MetaFeedbackSources;
    readonly maxProposals?: number;
    readonly now?: () => number;
}
export interface MetaFeedbackAuthorityFlags {
    readonly proposalOnly: true;
    readonly canApprove: false;
    readonly canPromote: false;
    readonly canActivate: false;
    readonly canPublish: false;
    readonly kernelEffectPermit: false;
}
export interface MetaFeedbackResult {
    readonly status: 'proposed' | 'no-observation';
    readonly replayed: boolean;
    /**
     * True when this call consumed a pre-existing durable reservation left by
     * an earlier (crashed or still-running) attempt and finalized it. A fresh
     * reservation winner reports false.
     */
    readonly recovered: boolean;
    readonly proposals: readonly Readonly<Record<string, unknown>>[];
    readonly proposalDigest: string | null;
    readonly inputDigest: string;
    readonly round: number;
    readonly ledgerKey: string | null;
    /** The pre-admission reservation key of this round, when one was addressed. */
    readonly claimKey: string | null;
    readonly receipt: Readonly<Record<string, unknown>> | null;
    readonly receiptDigest: string | null;
    readonly counters: Readonly<{
        evidenceRecords: number;
        missingEvidence: number;
        candidateRecords: number;
        shadowRecords: number;
        proposals: number;
    }>;
    readonly authority: MetaFeedbackAuthorityFlags;
}
/**
 * Run exactly one explicit Host round of the recurring proposal-only meta
 * feedback workflow. The same `(scope, instance, schedule, round)` is
 * idempotent; the next round is a distinct bounded business turn. At most one
 * fresh writer can reserve a round, and only a reservation owner (or a later
 * recovery caller that observes the existing reservation) may send. No
 * approval/promotion/activation/publication/Effect operation exists on this
 * surface.
 */
export declare function runMetaFeedbackWorkflow(options: RunMetaFeedbackWorkflowOptions): Promise<MetaFeedbackResult>;
