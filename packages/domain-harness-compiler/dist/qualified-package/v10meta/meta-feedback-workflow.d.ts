/**
 * DomainHarness v0.10 T09 (#1178) — recurring proposal-only Meta Feedback
 * Workflow.
 * ====================================================================
 *
 * This Host-owned runner composes ONLY already-selected v0.10 surfaces:
 *
 *   (1) durable Decision Evidence / Candidate / Shadow records are read from
 *       the production document store through `get` only, bounded before any
 *       evaluator sees them;
 *   (2) a selected Standard feature (`standard:meta-feedback/1`) turns those
 *       bounded observations into at most four PROPOSAL records;
 *   (3) exactly ONE ordinary selected Business workflow turn records that
 *       proposal. The selected Business policy declares a recurring
 *       self-transition whose guard accepts only `disposition:
 *       'proposal-only'` and `effectCount: 0`, and it declares no effect
 *       intent/binding at all;
 *   (4) a durable per-`(scheduleKey, round)` ledger makes a repeated round
 *       idempotent across process/SQLite restarts and refuses a conflicting
 *       reuse. Recurrence is explicit Host rounds (1..32), never an
 *       autonomous timer or a new Agent/Kernel runtime.
 *
 * The runner cannot approve, publish, promote a BUILD, activate a deployment
 * or dispatch an external Effect: it exposes no such operation and every
 * authority-shaped record is refused typed BEFORE any business turn or
 * ledger write. K State/Journal/Effect, the K02 fence and the immutable
 * original receipt remain exclusively the selected Kernel's.
 */
import { V10AppFacade } from '../v10build/activation.js';
import type { V10DocStore } from '../v10build/activation.js';
export declare const META_FEEDBACK_ABI = "dh.v10.meta-feedback-workflow/1";
export declare const META_FEEDBACK_LEDGER_KIND = "v10/meta-feedback-round";
export declare const META_FEEDBACK_EVIDENCE_KEY_PREFIX = "v10/t09/";
export declare const META_FEEDBACK_LEDGER_PREFIX = "v10-meta-feedback:";
export declare const MAX_META_ROUNDS = 32;
export declare const MAX_META_EVIDENCE_KEYS = 8;
export declare const MAX_META_RECORD_CHARS = 65536;
export declare class MetaFeedbackError extends Error {
    readonly code: string;
    readonly detail: Readonly<Record<string, unknown>> | undefined;
    constructor(code: string, message: string, detail?: Record<string, unknown>);
}
/** The explicit Host-driven recurrence address and its durable ledger key. */
export declare function metaFeedbackLedgerKey(scheduleKey: string, round: number): string;
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
    /** Durable production document store (read evidence, create-only ledger). */
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
    readonly proposals: readonly Readonly<Record<string, unknown>>[];
    readonly proposalDigest: string | null;
    readonly inputDigest: string;
    readonly round: number;
    readonly ledgerKey: string | null;
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
 * feedback workflow. The same `(scheduleKey, round)` is idempotent; the next
 * round is a distinct bounded business turn. No approval/promotion/
 * activation/publication/Effect operation exists on this surface.
 */
export declare function runMetaFeedbackWorkflow(options: RunMetaFeedbackWorkflowOptions): Promise<MetaFeedbackResult>;
