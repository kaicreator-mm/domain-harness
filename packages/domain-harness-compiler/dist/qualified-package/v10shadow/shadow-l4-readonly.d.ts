/**
 * DomainHarness v0.10 T07 (#1174) — Host-owned read-only Shadow L4 runner.
 * =====================================================================
 *
 * The pure Standard candidate feature
 * (`payload/sfeature-candidate-validation-v1.mjs`) validates *reported*
 * counterexamples and deliberately reports `productionWritesVerifiedZero:
 * false`: a selected feature invoked by a business caller can never prove
 * what the Host did or did not write. This module is the Host-owned trusted
 * counterpart that closes that gap for the T07 evidence:
 *
 *   (1) IDENTITY — the candidate is an exact byte-pinned source (the runner
 *       hashes the bytes itself) and the approved fallback is the ACTUAL
 *       selected module of the real built App: its package identity, exact
 *       `moduleSha256`, and the selected subject digest must all match. A
 *       missing, revoked or unpinned identity is a typed refusal, never a
 *       "latest" fallback.
 *   (2) READ-ONLY OBSERVATION — the actual selected K documents are read
 *       through a narrow `get`/`keys` view of the production store under the
 *       EXACT K02 physical prefixes of this activated deployment: the
 *       stable `v10/k/deployment:<deployedAppId>:<tenantId>:<appId>/` outer
 *       namespace plus each selected Business's injective `v010-k02:`
 *       tuple prefix, derived from the facade's private deployment identity. The
 *       BUILD/tenant arguments are only cross-checked against that binding;
 *       they never widen or define the observed prefix set. A nil deployment
 *       binding is a typed refusal, never a fallback to the whole App/Tenant
 *       namespace (two deployments of one BUILD/Tenant must stay disjoint).
 *       The runner never receives `put`, `remove`, `resources`, Memory, cache
 *       or the facade dispatcher. The observations are canonicalized, bounded
 *       and deep-frozen before any evaluator sees them.
 *   (3) ISOLATED EVALUATION — candidate and fallback source bytes are
 *       compiled and executed in a fresh `node:vm` context per evaluator
 *       with no process/network/module access, code generation disabled,
 *       non-determinism (`Math.random`, `Date.now`) refused, and a
 *       synchronous wall-clock budget. The evaluator receives only the
 *       frozen observation snapshot and App identity.
 *   (4) ZERO-WRITE WITNESS — before and after the evaluation the runner
 *       re-reads the selected K snapshot and a Host-supplied physical witness
 *       (for example SQLite file/WAL digests and `total_changes()`), then
 *       reports whether both are unchanged. `productionWritesVerifiedZero` is
 *       true only when the physical witness was captured on both sides and
 *       the snapshots agree.
 *
 * The runner grants no authority: it cannot approve or promote a candidate,
 * cannot activate a new BUILD, cannot mint a K Effect permit, and has no
 * effect/capability port. Candidate disagreement or evaluator failure leaves
 * the exact approved fallback untouched and the production snapshot
 * unchanged; the report is evidence, not an activation request.
 */
import { V10Error } from '../v10build/errors.js';
import { V10AppFacade } from '../v10build/activation.js';
import type { V10AppView } from '../v10build/activation.js';
export declare const SHADOW_L4_ABI = "dh.v10.shadow-l4-readonly/1";
export declare const SHADOW_L4_EVIDENCE_KIND = "shadow-l4-evidence";
/** Physical K docs root; the governed outer namespace is the stable deployment tuple. */
export declare const SHADOW_K_DOCS_PREFIX = "v10/k/";
export type ShadowL4Kind = 'Rule' | 'Skill' | 'DecisionProcedure' | 'Workflow';
export type ShadowL4ApprovalState = 'candidate' | 'approved' | 'revoked';
export declare class ShadowL4Error extends V10Error {
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
