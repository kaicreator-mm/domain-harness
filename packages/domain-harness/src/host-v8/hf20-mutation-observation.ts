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
export const HF20_MUTATION_OBSERVATION_CONTRACT_VERSION = 'hf20-mutation-observation/1' as const;

/**
 * Retained-record tail length of one instance observation window.
 *
 * The window rides the instance document, so it must stay bounded; eviction
 * of the oldest records is the honest explicit `RETENTION_TRUNCATED` gap
 * (with `earliestAvailable` + `highWatermark`), never a silent hole. A
 * reader that needs the evicted range re-syncs from the authoritative
 * snapshot like every other projection consumer.
 */
export const HF20_MUTATION_OBSERVATION_RETENTION_LIMIT = 64;

/** Read-side page limit clamp bounds (clamped, never rejected — #312 rule). */
export const HF20_OBSERVATION_READ_LIMIT_MIN = 1;
export const HF20_OBSERVATION_READ_LIMIT_MAX = 1000;
export const HF20_OBSERVATION_READ_LIMIT_DEFAULT = 100;

/**
 * v0.8 committed-mutation families. `EFFECT_SETTLED` is deliberately absent
 * (same reviewed #312 omission): the Effect Journal is an INDEPENDENT
 * surface and never enters this stream.
 */
export const HF20_MUTATION_OBSERVATION_KINDS = [
  'INSTANCE_OPENED',
  'MUTATION_COMMITTED',
] as const;

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

export type Hf20ObservationErrorCode =
  | 'CURSOR_MALFORMED'
  | 'CURSOR_STREAM_MISMATCH'
  | 'CURSOR_BEYOND_WATERMARK'
  | 'WINDOW_INVALID'
  | 'READ_LIMIT_INVALID';

export class Hf20ObservationError extends Error {
  readonly code: Hf20ObservationErrorCode;

  constructor(code: Hf20ObservationErrorCode, message: string) {
    super(message);
    this.name = 'Hf20ObservationError';
    this.code = code;
  }
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Structural guard of a stored window. Fail-closed: a window whose shape,
 * contract version, sequence math or retained-tail contiguity does not hold
 * is not readable — the reader refuses typed instead of projecting partial
 * truth (`WINDOW_INVALID`).
 */
export function isHf20MutationObservationWindow(value: unknown): value is Hf20MutationObservationWindow {
  if (!isJsonRecord(value)) return false;
  if (value.contractVersion !== HF20_MUTATION_OBSERVATION_CONTRACT_VERSION) return false;
  if (!isSafeNonNegativeInteger(value.mutationSequence)) return false;
  if (!Array.isArray(value.records)) return false;
  // Re-assert the element type after the Array.isArray shape gate (the
  // predicate narrows the indexed array's elements to `any` for type-aware
  // lint); each element is re-validated below regardless.
  const records = value.records as readonly unknown[];
  if (records.length > HF20_MUTATION_OBSERVATION_RETENTION_LIMIT) return false;
  if (records.length > value.mutationSequence) return false;
  const expectedFirst = value.mutationSequence - records.length + 1;
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    // stateRevisionBefore/sourceMessageId are optional extras; the four
    // fixed fields must all be present and well-typed.
    if (!isJsonRecord(record)) return false;
    if (!('sequence' in record) || !('kind' in record) || !('stateRevisionAfter' in record) || !('committedAt' in record)) {
      return false;
    }
    if (!isSafeNonNegativeInteger(record.sequence) || record.sequence !== expectedFirst + index) return false;
    if (typeof record.kind !== 'string' || !(HF20_MUTATION_OBSERVATION_KINDS as readonly string[]).includes(record.kind)) return false;
    if (!isSafeNonNegativeInteger(record.stateRevisionAfter)) return false;
    if (record.stateRevisionBefore !== undefined && !isSafeNonNegativeInteger(record.stateRevisionBefore)) return false;
    if (record.sourceMessageId !== undefined && (typeof record.sourceMessageId !== 'string' || record.sourceMessageId.length === 0)) return false;
    if (typeof record.committedAt !== 'string' || record.committedAt.length === 0) return false;
    if (record.kind === 'INSTANCE_OPENED' && record.stateRevisionAfter !== 0) return false;
    if (record.kind === 'MUTATION_COMMITTED' && record.stateRevisionBefore !== record.stateRevisionAfter - 1) return false;
  }
  return true;
}

/** The empty window a created instance document starts from. */
export function newHf20ObservationWindow(): Hf20MutationObservationWindow {
  return Object.freeze({
    contractVersion: HF20_MUTATION_OBSERVATION_CONTRACT_VERSION,
    mutationSequence: 0,
    records: Object.freeze([]),
  });
}

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
export function appendHf20MutationObservation(
  window: Hf20MutationObservationWindow,
  intent: Hf20MutationCommitIntent,
  committedAt: string,
): { readonly window: Hf20MutationObservationWindow; readonly record: Hf20MutationObservationRecord } {
  if (!isHf20MutationObservationWindow(window)) {
    throw new Hf20ObservationError('WINDOW_INVALID', 'the stored mutation-observation window is structurally invalid; fail closed');
  }
  if (!(HF20_MUTATION_OBSERVATION_KINDS as readonly string[]).includes(intent.kind)) {
    throw new Hf20ObservationError('WINDOW_INVALID', `unknown mutation observation kind ${String(intent.kind)}`);
  }
  if (!isSafeNonNegativeInteger(intent.stateRevisionAfter)) {
    throw new Hf20ObservationError('WINDOW_INVALID', 'stateRevisionAfter must be a safe non-negative integer');
  }
  if (typeof committedAt !== 'string' || committedAt.length === 0) {
    throw new Hf20ObservationError('WINDOW_INVALID', 'committedAt must be a non-empty string');
  }
  const record: Hf20MutationObservationRecord = Object.freeze({
    sequence: window.mutationSequence + 1,
    kind: intent.kind,
    stateRevisionAfter: intent.stateRevisionAfter,
    ...(intent.stateRevisionBefore === undefined ? {} : { stateRevisionBefore: intent.stateRevisionBefore }),
    ...(intent.sourceMessageId === undefined ? {} : { sourceMessageId: intent.sourceMessageId }),
    committedAt,
  });
  if (record.kind === 'INSTANCE_OPENED' && record.stateRevisionAfter !== 0) {
    throw new Hf20ObservationError('WINDOW_INVALID', 'INSTANCE_OPENED must commit at stateRevisionAfter 0');
  }
  if (record.kind === 'MUTATION_COMMITTED' && record.stateRevisionBefore !== record.stateRevisionAfter - 1) {
    throw new Hf20ObservationError('WINDOW_INVALID', 'MUTATION_COMMITTED must advance the document revision by exactly one');
  }
  const retained = [...window.records, record].slice(-HF20_MUTATION_OBSERVATION_RETENTION_LIMIT);
  return {
    window: Object.freeze({
      contractVersion: HF20_MUTATION_OBSERVATION_CONTRACT_VERSION,
      mutationSequence: record.sequence,
      records: Object.freeze(retained),
    }),
    record,
  };
}

interface Hf20CursorPayload {
  readonly v: 1;
  readonly s: string;
  readonly a: number;
}

function base64UrlEncode(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64url');
}

/**
 * Mint the opaque continuation token. Not a MAC: the token carries no
 * authority — every field is re-validated against the CURRENT window at
 * read time, so minting a token locally can only ever produce a request K
 * judges on its own merits (and a substituted stream is refused typed).
 */
export function encodeHf20Cursor(stream: string, after: number): Hf20ObservationCursor {
  if (typeof stream !== 'string' || stream.length === 0) {
    throw new Hf20ObservationError('CURSOR_MALFORMED', 'a cursor requires a non-empty stream identity');
  }
  if (!isSafeNonNegativeInteger(after)) {
    throw new Hf20ObservationError('CURSOR_MALFORMED', 'a cursor requires a safe non-negative exclusive-after sequence');
  }
  return base64UrlEncode(JSON.stringify({ v: 1, s: stream, a: after } satisfies Hf20CursorPayload));
}

/** Decode + structurally validate one cursor token. */
export function decodeHf20Cursor(cursor: Hf20ObservationCursor): { readonly stream: string; readonly after: number } {
  if (typeof cursor !== 'string' || cursor.length === 0) {
    throw new Hf20ObservationError('CURSOR_MALFORMED', 'a cursor token must be a non-empty string');
  }
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new Hf20ObservationError('CURSOR_MALFORMED', 'the cursor token is not decodable base64url JSON');
  }
  if (!isJsonRecord(payload) || payload.v !== 1 || typeof payload.s !== 'string' || payload.s.length === 0
    || !isSafeNonNegativeInteger(payload.a)) {
    throw new Hf20ObservationError('CURSOR_MALFORMED', 'the cursor token does not carry the {v,s,a} contract shape');
  }
  return { stream: payload.s, after: payload.a };
}

function clampReadLimit(limit: number | undefined): number {
  if (limit === undefined) return HF20_OBSERVATION_READ_LIMIT_DEFAULT;
  if (typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit < HF20_OBSERVATION_READ_LIMIT_MIN) {
    throw new Hf20ObservationError('READ_LIMIT_INVALID', `the read limit must be an integer ≥ ${String(HF20_OBSERVATION_READ_LIMIT_MIN)}`);
  }
  return Math.min(limit, HF20_OBSERVATION_READ_LIMIT_MAX);
}

/**
 * The PURE page projection the K read verb (and the H gateway verb behind
 * it) answers with: resolve the exclusive-after sequence, refuse cursors
 * that could not have been minted by THIS stream (malformed / substituted
 * stream / beyond the watermark), project the retained tail in ascending
 * order, and surface retention truncation as an explicit gap — never as a
 * silently shortened history and never as "no activity".
 */
export function projectHf20ObservationPage(
  window: Hf20MutationObservationWindow,
  request: Hf20ObservationReadRequest,
): Hf20ObservationPage {
  if (!isHf20MutationObservationWindow(window)) {
    throw new Hf20ObservationError('WINDOW_INVALID', 'the stored mutation-observation window is structurally invalid; fail closed');
  }
  if (typeof request.stream !== 'string' || request.stream.length === 0) {
    throw new Hf20ObservationError('CURSOR_STREAM_MISMATCH', 'a read requires the exact stream identity being read');
  }
  const limit = clampReadLimit(request.limit);
  let after = 0;
  if (request.afterCursor !== undefined) {
    const decoded = decodeHf20Cursor(request.afterCursor);
    if (decoded.stream !== request.stream) {
      throw new Hf20ObservationError(
        'CURSOR_STREAM_MISMATCH',
        `the cursor was minted for stream ${decoded.stream}, not ${request.stream}; substitution fails closed`,
      );
    }
    if (decoded.after > window.mutationSequence) {
      throw new Hf20ObservationError(
        'CURSOR_BEYOND_WATERMARK',
        `the cursor claims sequence ${String(decoded.after)} but the stream's committed watermark is ${String(window.mutationSequence)}; no such progress was ever committed`,
      );
    }
    after = decoded.after;
  }
  const highWatermark = window.mutationSequence;
  const retained = window.records;
  const earliestAvailable = retained.at(0)?.sequence;
  const truncated = after < highWatermark
    && earliestAvailable !== undefined
    && after < earliestAvailable - 1;
  const eligible = retained.filter((record) => record.sequence > after);
  const records = eligible.slice(0, limit);
  const lastRecord = records.at(-1);
  return Object.freeze({
    records: Object.freeze(records),
    ...(lastRecord !== undefined ? { nextCursor: encodeHf20Cursor(request.stream, lastRecord.sequence) } : {}),
    highWatermark,
    ...(truncated
      ? {
        gap: Object.freeze({
          kind: 'RETENTION_TRUNCATED' as const,
          requestedAfter: after,
          ...(earliestAvailable === undefined ? {} : { earliestAvailable }),
          highWatermark,
        }),
      }
      : {}),
  });
}
