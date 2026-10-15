/**
 * #1063 HF20 — ordered durable mutation observation contract (seam B prep).
 * ===========================================================================
 *
 * MINIMAL K/H contract module for the v0.8 T-G corrective HF20 row: a
 * durably ordered, restart-resumable observation stream over COMMITTED
 * Kernel mutations, with an opaque K-validated cursor.
 *
 * WHAT THIS IS (and is not):
 *   - It IS the shared contract surface (record/window/cursor/page shapes,
 *     the pure append reducer and the pure page projection) that the small
 *     Kernel hook and the protected Host read verb will adopt after the
 *     seam-A K owner (#1062) merges — the Kernel payload module is
 *     self-contained sealed bytes and will carry the same semantics
 *     internally, exactly like every other port it consumes.
 *   - It is NOT a runtime rewrite of the historical observation stack: the
 *     reviewed #312 contract (`src/observation/contracts.ts`, byte-pinned in
 *     the retained 44-row source map) is the SEMANTIC reference — sequence
 *     is the only ordering authority, cursors are stream-bound, retention
 *     truncation is an explicit typed gap, replays commit no new record,
 *     and the Effect Journal stays a distinct surface.
 *   - It is NOT HF17: `observeLatest` stays a NON-durable Query-latest →
 *     new-subscription session; nothing here reinterprets it.
 *   - It is NOT NF06: decision receipts stay OBSERVATIONAL_OPTIONAL
 *     best-effort appends AFTER the business commit; nothing here changes
 *     their policy semantics.
 *
 * ATOMICITY CARRIER (the decision this module freezes, see
 * `docs/validation/v0.8/hf20-adoption-decision.md`): the observation window
 * lives INSIDE the same mutation-committed instance document — the ONE
 * single-key CAS write `WorkflowInstanceEngine.commitAcceptedTransitionInLane`
 * already performs (`kernel-mechanism-v1.mjs`, the authoritative state
 * commit). Physically that is ONE SqliteCasStore row write inside ONE
 * IMMEDIATE transaction, so the observation records CANNOT exist without
 * their committed stateRevision and vice versa — a genuine same-envelope
 * atomicity, not a best-effort second-document append and not a
 * recoverable-protocol claim. A separate post-commit append (the NF06
 * shape) is explicitly NOT sufficient for HF20 mutation consistency.
 */
/** Exact contract identity of this HF20 surface (capability negotiation). */
export declare const HF20_MUTATION_OBSERVATION_CONTRACT_VERSION: "hf20-mutation-observation/1";
/**
 * Retained-record tail length of one instance observation window.
 *
 * The window rides the instance document, so it must stay bounded; eviction
 * of the oldest records is the honest explicit `RETENTION_TRUNCATED` gap
 * (with `earliestAvailable` + `highWatermark`), never a silent hole. A
 * reader that needs the evicted range re-syncs from the authoritative
 * snapshot like every other projection consumer.
 */
export declare const HF20_MUTATION_OBSERVATION_RETENTION_LIMIT = 64;
/** Read-side page limit clamp bounds (clamped, never rejected — #312 rule). */
export declare const HF20_OBSERVATION_READ_LIMIT_MIN = 1;
export declare const HF20_OBSERVATION_READ_LIMIT_MAX = 1000;
export declare const HF20_OBSERVATION_READ_LIMIT_DEFAULT = 100;
/**
 * v0.8 committed-mutation families. `EFFECT_SETTLED` is deliberately absent
 * (same reviewed #312 omission): the Effect Journal is an INDEPENDENT
 * surface and never enters this stream.
 */
export declare const HF20_MUTATION_OBSERVATION_KINDS: readonly ["INSTANCE_OPENED", "MUTATION_COMMITTED"];
export type Hf20MutationObservationKind = (typeof HF20_MUTATION_OBSERVATION_KINDS)[number];
/**
 * ONE durable committed-mutation fact. Envelope discipline follows #312:
 * identities, revisions and refs only — never raw message/state payload
 * bytes; `committedAt` is informational, ordering authority is `sequence`
 * alone.
 */
export interface Hf20MutationObservationRecord {
    /** Positive safe integer; contiguous per instance stream: seq(n+1) = seq(n) + 1. */
    readonly sequence: number;
    readonly kind: Hf20MutationObservationKind;
    /** Revision of the instance document this record was committed with. */
    readonly stateRevisionAfter: number;
    /** `MUTATION_COMMITTED` only: the CAS revision this turn replaced. */
    readonly stateRevisionBefore?: number;
    /** `MUTATION_COMMITTED` only: the durable turn's message identity. */
    readonly sourceMessageId?: string;
    /** Informational timestamp of the commit; never an ordering authority. */
    readonly committedAt: string;
}
/**
 * The ordered observation window stored INSIDE the mutation-committed
 * instance document (the same-envelope carrier). `mutationSequence` is the
 * total count of committed mutation records ever appended — it NEVER
 * decreases and stays the read-side high-watermark even when old records
 * were evicted from the retained tail.
 */
export interface Hf20MutationObservationWindow {
    readonly contractVersion: typeof HF20_MUTATION_OBSERVATION_CONTRACT_VERSION;
    readonly mutationSequence: number;
    /** Retained tail, ascending by `sequence`, length ≤ RETENTION_LIMIT. */
    readonly records: readonly Hf20MutationObservationRecord[];
}
/** One committed turn as the Kernel commit path hands it to the reducer. */
export interface Hf20MutationCommitIntent {
    readonly kind: Hf20MutationObservationKind;
    readonly stateRevisionAfter: number;
    readonly stateRevisionBefore?: number;
    readonly sourceMessageId?: string;
}
/**
 * Opaque continuation token: binds the exact instance stream (the
 * tenant/app-qualified physical address) and an exclusive-after sequence.
 * A cursor from one stream never reads another — substitution fails closed
 * typed. Opaque by encoding, not by secrecy: K validates every field
 * against the CURRENT authoritative window, so a forged, stale or
 * cross-stream cursor cannot fabricate progress.
 */
export type Hf20ObservationCursor = string;
export type Hf20ObservationGapKind = 'RETENTION_TRUNCATED' | 'CURSOR_INVALID';
/**
 * Explicit structured gap. When present, the reader MUST NOT claim an exact
 * continuous trace across it; absence of records never means "no activity".
 * (`STORAGE_GAP` from #312 has no v0.8 carrier analogue: the window is one
 * physical row, so a storage-level partial window cannot occur — a failed
 * write leaves the whole previous document.)
 */
export interface Hf20ObservationGap {
    readonly kind: Hf20ObservationGapKind;
    readonly requestedAfter: number;
    /** Earliest retained sequence when known. */
    readonly earliestAvailable?: number;
    readonly highWatermark: number;
}
export interface Hf20ObservationReadRequest {
    /** The exact stream being read (K derives it from the scoped instance). */
    readonly stream: string;
    readonly afterCursor?: Hf20ObservationCursor;
    /** Clamped to [1, 1000]; default 100. */
    readonly limit?: number;
}
export interface Hf20ObservationPage {
    /** Deterministic ascending sequence, exclusive-after the cursor. */
    readonly records: readonly Hf20MutationObservationRecord[];
    /** Present iff at least one record was returned; resume exactly-after it. */
    readonly nextCursor?: Hf20ObservationCursor;
    /** Highest committed sequence for the exact stream (0 when nothing committed). */
    readonly highWatermark: number;
    readonly gap?: Hf20ObservationGap;
}
export type Hf20ObservationErrorCode = 'CURSOR_MALFORMED' | 'CURSOR_STREAM_MISMATCH' | 'CURSOR_BEYOND_WATERMARK' | 'WINDOW_INVALID' | 'READ_LIMIT_INVALID';
export declare class Hf20ObservationError extends Error {
    readonly code: Hf20ObservationErrorCode;
    constructor(code: Hf20ObservationErrorCode, message: string);
}
/**
 * Structural guard of a stored window. Fail-closed: a window whose shape,
 * contract version, sequence math or retained-tail contiguity does not hold
 * is not readable — the reader refuses typed instead of projecting partial
 * truth (`WINDOW_INVALID`).
 */
export declare function isHf20MutationObservationWindow(value: unknown): value is Hf20MutationObservationWindow;
/** The empty window a created instance document starts from. */
export declare function newHf20ObservationWindow(): Hf20MutationObservationWindow;
/**
 * The PURE append reducer the Kernel commit path calls INSIDE the same
 * single-key CAS write that commits the turn (same-envelope atomicity):
 * `commitAcceptedTransitionInLane` computes the next document value through
 * this reducer, so the record and the new stateRevision become durable as
 * ONE physical row write. There is deliberately NO separate append entry
 * point — an observation record that did not ride the authoritative commit
 * would be exactly the best-effort second-document shape HF20 forbids.
 *
 * Idempotence is the caller's committed-turn discipline: the reducer runs
 * exactly once per CAS-WINNING turn; a lost CAS throws before any durable
 * effect and appends nothing.
 */
export declare function appendHf20MutationObservation(window: Hf20MutationObservationWindow, intent: Hf20MutationCommitIntent, committedAt: string): {
    readonly window: Hf20MutationObservationWindow;
    readonly record: Hf20MutationObservationRecord;
};
/**
 * Mint the opaque continuation token. Not a MAC: the token carries no
 * authority — every field is re-validated against the CURRENT window at
 * read time, so minting a token locally can only ever produce a request K
 * judges on its own merits (and a substituted stream is refused typed).
 */
export declare function encodeHf20Cursor(stream: string, after: number): Hf20ObservationCursor;
/** Decode + structurally validate one cursor token. */
export declare function decodeHf20Cursor(cursor: Hf20ObservationCursor): {
    readonly stream: string;
    readonly after: number;
};
/**
 * The PURE page projection the K read verb (and the H gateway verb behind
 * it) answers with: resolve the exclusive-after sequence, refuse cursors
 * that could not have been minted by THIS stream (malformed / substituted
 * stream / beyond the watermark), project the retained tail in ascending
 * order, and surface retention truncation as an explicit gap — never as a
 * silently shortened history and never as "no activity".
 */
export declare function projectHf20ObservationPage(window: Hf20MutationObservationWindow, request: Hf20ObservationReadRequest): Hf20ObservationPage;
//# sourceMappingURL=hf20-mutation-observation.d.ts.map