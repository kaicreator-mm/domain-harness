import { V10AppFacade } from '../v10build/activation.js';
import type { V10AppView } from '../v10build/activation.js';
export declare const SHADOW_L4_ABI = "dh.v10.shadow-l4-readonly/1";
export declare const SHADOW_L4_EVIDENCE_KIND = "shadow-l4-evidence";
/** The exact facade-owned K namespace: `<prefix><subjectDigest>/<tenantId>/`. */
export declare const SHADOW_K_DOCS_PREFIX = "v10/k/";
export type ShadowL4Kind = 'Rule' | 'Skill' | 'DecisionProcedure' | 'Workflow';
export type ShadowL4ApprovalState = 'candidate' | 'approved' | 'revoked';
export declare class ShadowL4Error extends Error {
    readonly code: string;
    constructor(code: string, message: string, options?: {
        cause?: unknown;
    });
}
/** Exact identity of one pinned version (digest/revision/provenance included). */
export interface ShadowL4VersionPin {
    readonly kind: ShadowL4Kind;
    readonly id: string;
    readonly revision: string;
    readonly sha256: string;
    readonly provenance: string;
    readonly approvalState: ShadowL4ApprovalState;
}
/** One actual selected K document observed by the shadow runner. */
export interface ShadowKObservation {
    readonly key: string;
    readonly revision: number;
    readonly value: unknown;
    readonly valueSha256: string;
}
/**
 * The ONLY store surface the shadow runner receives. A `V10DocStore` is
 * structurally assignable, but the runner never names or calls any mutation
 * member; the production write path remains outside this module.
 */
export interface ShadowKReadStore {
    get(key: string): Promise<{
        value: unknown;
        revision: number;
    } | null>;
    keys(): readonly string[] | Promise<readonly string[]>;
}
export interface ShadowL4CaseEvidence {
    readonly caseId: string;
    readonly key: string;
    readonly revision: number;
    readonly valueSha256: string;
    readonly candidateOutputSha256: string;
    readonly baselineOutputSha256: string;
    readonly same: boolean;
}
export interface ShadowL4Failure {
    readonly code: string;
    readonly caseId: string | null;
    readonly message: string;
}
export interface ShadowL4Report {
    readonly kind: typeof SHADOW_L4_EVIDENCE_KIND;
    readonly shadowAbi: typeof SHADOW_L4_ABI;
    readonly appSubjectDigest: string;
    /** The exact activated deployment instance whose K rows were observed. */
    readonly deployedAppId: string;
    readonly tenantId: string;
    readonly candidate: ShadowL4VersionPin;
    readonly candidateApproval: {
        readonly state: ShadowL4ApprovalState;
        readonly authority: 'host-admission' | 'explicit-candidate';
    };
    readonly approvedFallback: ShadowL4VersionPin & {
        readonly selectedPackageId: string;
    };
    readonly budget: {
        readonly maxCases: number;
        readonly maxComparisons: number;
    };
    readonly observations: {
        /** The App/Tenant K namespace; selection is narrowed to `documentPrefixes`. */
        readonly prefix: string;
        /** The exact deployment/B K02 prefixes the snapshot was selected from. */
        readonly documentPrefixes: readonly string[];
        readonly total: number;
        readonly considered: number;
        readonly truncated: boolean;
        readonly snapshotSha256: string;
        readonly keys: readonly string[];
    };
    readonly comparisons: number;
    readonly matchingCaseIds: readonly string[];
    readonly differingCaseIds: readonly string[];
    readonly cases: readonly ShadowL4CaseEvidence[];
    readonly differencePreview: string | null;
    readonly status: 'match' | 'difference' | 'shadow-failed';
    readonly failure: ShadowL4Failure | null;
    readonly production: {
        readonly beforeSnapshotSha256: string;
        readonly afterSnapshotSha256: string | null;
        readonly snapshotUnchanged: boolean;
        readonly physicalWitnessBeforeSha256: string;
        readonly physicalWitnessAfterSha256: string | null;
        readonly physicalWitnessUnchanged: boolean;
        readonly storeReads: number;
        readonly storeMutationMethodsUsed: 0;
        readonly externalEffectCalls: 0;
        readonly memoryWrites: 0;
        readonly cacheWrites: 0;
        readonly productionWritesVerifiedZero: boolean;
    };
    readonly evidenceAuthority: 'host-owned-readonly-shadow';
    readonly canSelfApprove: false;
    readonly canPromote: false;
    readonly kernelEffectPermit: false;
    readonly replayDigest: string;
}
export interface ShadowL4RunnerOptions {
    /** The REAL activated App facade (lookalikes are refused). */
    readonly facade: V10AppFacade;
    /** The BUILD view of that same App (selected module bytes/digests). */
    readonly app: V10AppView;
    /** Narrow read-only K view of the production store. */
    readonly store: ShadowKReadStore;
    readonly tenantId: string;
    readonly candidate: {
        readonly pin: ShadowL4VersionPin;
        /** Exact controlled candidate bytes; `sha256(source)` must equal the pin. */
        readonly source: string;
        readonly exportName?: string;
    };
    readonly approvedFallback: {
        readonly pin: ShadowL4VersionPin;
        /** The actual selected module this exact fallback pins. */
        readonly selectedPackageId: string;
        readonly exportName?: string;
    };
    readonly budget: {
        readonly maxCases: number;
        readonly maxComparisons: number;
    };
    /**
     * Host-owned trusted approval record. Required when the candidate pin
     * claims `approved`; a pin's own claim is never trusted by itself.
     */
    readonly trustedCandidateApproval?: {
        readonly id: string;
        readonly revision: string;
        readonly sha256: string;
        readonly state: 'approved';
    };
    /**
     * Mandatory physical zero-write witness. Captured before and after the
     * shadow run; canonical equality is the physical zero-write proof (for
     * example: SQLite DB/WAL digests plus a read-only `total_changes()`).
     */
    readonly physicalWitness: () => unknown;
    /** Per-evaluator synchronous wall-clock bound. */
    readonly evaluationTimeoutMs?: number;
}
/** The exact provenance the Host pins for an actually selected fallback module. */
export declare function selectedFallbackProvenance(app: V10AppView, selectedPackageId: string): string;
/**
 * Host admission helper: derive the exact approved fallback pin from the
 * actually selected module bytes. The Host supplies the logical candidate
 * identity (kind/id); every byte/revision/provenance field is derived here,
 * not taken from candidate or business data.
 */
export declare function selectedFallbackPin(app: V10AppView, options: {
    readonly selectedPackageId: string;
    readonly kind: ShadowL4Kind;
    readonly id: string;
}): ShadowL4VersionPin;
/** Pin exact candidate source bytes under a Host-supplied logical identity. */
export declare function pinCandidateSource(identity: Omit<ShadowL4VersionPin, 'sha256'>, source: string): ShadowL4VersionPin;
/**
 * Run one bounded read-only Shadow L4 comparison against real selected K
 * documents. Typed identity/budget refusals throw before any evaluator runs;
 * evaluation and physical-witness failures are returned as an honest
 * `shadow-failed` report so zero-write evidence is never lost.
 */
export declare function runShadowL4(options: ShadowL4RunnerOptions): Promise<ShadowL4Report>;
