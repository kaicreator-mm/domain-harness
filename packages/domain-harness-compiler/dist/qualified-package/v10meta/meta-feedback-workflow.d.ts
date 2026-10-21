import { V10AppFacade } from '../v10build/activation.js';
import type { V10DocStore } from '../v10build/activation.js';
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
export declare class MetaFeedbackError extends Error {
    readonly code: string;
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
