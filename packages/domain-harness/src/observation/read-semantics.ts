import { canonicalJsonStringify } from '../contracts/identity.js';
import type { WorkflowAddress } from '../v2/contracts/workflow.js';
import {
  RuntimeObservationError,
  type RuntimeObservationCursor,
  type RuntimeObservationGap,
  type RuntimeObservationPage,
  type RuntimeObservationReadRequest,
  type RuntimeObservationRecord,
} from './contracts.js';

export const RUNTIME_OBSERVATION_DEFAULT_READ_LIMIT = 100;
export const RUNTIME_OBSERVATION_MAX_READ_LIMIT = 1000;

/** Epoch allocated when a stream binding is first created (contract v1: always this value). */
export const RUNTIME_OBSERVATION_INITIAL_EPOCH_ID = '1';

/**
 * Exact durable key of one observation stream. Includes the immutable
 * content identity (packageId + contentDigest) and the epoch, so two
 * different package identities (or epochs) never share a stream — mutable
 * labels alone can never alias a stream.
 */
export function runtimeObservationStreamKey(stream: {
  readonly target: WorkflowAddress;
  readonly package: { readonly packageId: string; readonly contentDigest: string };
  readonly epochId: string;
}): string {
  return canonicalJsonStringify({
    workflowId: stream.target.workflowId,
    instanceKey: stream.target.instanceKey,
    packageId: stream.package.packageId,
    contentDigest: stream.package.contentDigest,
    epochId: stream.epochId,
  });
}

/** Deterministic observation identity: exact stream key + exact sequence. */
export function runtimeObservationId(streamKey: string, sequence: number): string {
  return `${streamKey}#observation:${sequence}`;
}

interface EncodedCursor {
  readonly v: 1;
  readonly k: string;
  readonly a: number;
}

export function encodeRuntimeObservationCursor(
  streamKey: string,
  afterSequence: number,
): RuntimeObservationCursor {
  const encoded: EncodedCursor = { v: 1, k: streamKey, a: afterSequence };
  return JSON.stringify(encoded);
}

export function decodeRuntimeObservationCursor(
  cursor: RuntimeObservationCursor,
): EncodedCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(cursor);
  } catch {
    throw new RuntimeObservationError('CURSOR_MALFORMED', 'cursor is not a valid observation cursor');
  }
  if (parsed === null || typeof parsed !== 'object') {
    throw new RuntimeObservationError('CURSOR_MALFORMED', 'cursor is not a valid observation cursor');
  }
  const record = parsed as Record<string, unknown>;
  const { v, k, a } = record;
  if (v !== 1 || typeof k !== 'string' || typeof a !== 'number' || !Number.isSafeInteger(a) || a < 0) {
    throw new RuntimeObservationError('CURSOR_MALFORMED', 'cursor is not a valid observation cursor');
  }
  return { v: 1, k, a };
}

export function normalizeRuntimeObservationLimit(limit: number | undefined): number {
  if (limit === undefined) return RUNTIME_OBSERVATION_DEFAULT_READ_LIMIT;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > RUNTIME_OBSERVATION_MAX_READ_LIMIT) {
    throw new RuntimeObservationError(
      'INVALID_READ_LIMIT',
      `limit must be a safe integer in [1, ${RUNTIME_OBSERVATION_MAX_READ_LIMIT}]; got ${String(limit)}`,
    );
  }
  return limit;
}

export interface ObservationReadStreamState {
  /** Highest committed sequence for the exact stream (authoritative, 0 when none). */
  readonly highWatermark: number;
  /** Earliest retained sequence, or null when the full history from 1 is retained. */
  readonly earliestAvailable: number | null;
}

/**
 * Page for a requested stream that has no durable binding at all. Nothing was
 * ever committed under this exact identity — EXCEPT that a presented cursor
 * proves the caller previously read SOME stream, so a foreign cursor is an
 * explicit CURSOR_INVALID and an own-stream cursor (binding lost wholesale to
 * host deletion) is an explicit RETENTION_TRUNCATED. Never a silent empty
 * success when a cursor is involved (review P2 repair).
 */
export function absentRuntimeObservationStreamPage(
  request: RuntimeObservationReadRequest,
): RuntimeObservationPage {
  if (request.afterCursor === undefined) {
    return { records: [], highWatermark: 0 };
  }
  const streamKey = runtimeObservationStreamKey(request.stream);
  const decoded = decodeRuntimeObservationCursor(request.afterCursor);
  if (decoded.k !== streamKey) {
    return {
      records: [],
      highWatermark: 0,
      gap: { kind: 'CURSOR_INVALID', requestedAfter: decoded.a, highWatermark: 0 },
    };
  }
  return {
    records: [],
    highWatermark: 0,
    gap: { kind: 'RETENTION_TRUNCATED', requestedAfter: decoded.a, highWatermark: 0 },
  };
}

export interface ObservationReadRow {
  readonly sequence: number;
  readonly record: RuntimeObservationRecord;
}

/**
 * Shared fail-closed page assembly (single authority for cursor/gap semantics
 * so every adapter behaves identically):
 *
 * - cursor stream mismatch → explicit `CURSOR_INVALID` gap, no records;
 * - request resumes behind the retained window → `RETENTION_TRUNCATED` gap;
 * - a missing sequence inside the retained range → `STORAGE_GAP`;
 * - duplicate or non-monotonic stored sequences → hard error (corruption);
 * - returned records are always contiguous from `after + 1`.
 */
export function assembleRuntimeObservationPage(
  request: RuntimeObservationReadRequest,
  rows: readonly ObservationReadRow[],
  streamState: ObservationReadStreamState,
): RuntimeObservationPage {
  const limit = normalizeRuntimeObservationLimit(request.limit);
  const streamKey = runtimeObservationStreamKey(request.stream);
  const { highWatermark } = streamState;
  const earliest = streamState.earliestAvailable ?? 1;

  let after = 0;
  if (request.afterCursor !== undefined) {
    const decoded = decodeRuntimeObservationCursor(request.afterCursor);
    if (decoded.k !== streamKey) {
      return {
        records: [],
        highWatermark,
        gap: {
          kind: 'CURSOR_INVALID',
          requestedAfter: decoded.a,
          highWatermark,
        },
      };
    }
    after = decoded.a;
  }

  if (after + 1 < earliest) {
    const gap: RuntimeObservationGap = {
      kind: 'RETENTION_TRUNCATED',
      requestedAfter: after,
      ...(streamState.earliestAvailable === null ? {} : { earliestAvailable: streamState.earliestAvailable }),
      highWatermark,
    };
    return { records: [], highWatermark, gap };
  }

  // Rows arrive in storage order; validate strict contiguity from after + 1
  // and take at most `limit` records. A hole is a gap; a repeated or
  // non-increasing sequence is durable corruption and fails closed hard.
  const records: RuntimeObservationRecord[] = [];
  let expected = after + 1;
  for (const row of rows) {
    if (row.sequence === expected - 1) {
      throw new RuntimeObservationError(
        'SEQUENCE_NOT_CONTIGUOUS',
        `duplicate observation sequence ${row.sequence} in stream ${streamKey}`,
      );
    }
    if (row.sequence <= expected - 1) {
      throw new RuntimeObservationError(
        'SEQUENCE_NOT_CONTIGUOUS',
        `non-monotonic observation sequence ${row.sequence} in stream ${streamKey}`,
      );
    }
    if (row.sequence > expected) {
      const gap: RuntimeObservationGap = {
        kind: 'STORAGE_GAP',
        requestedAfter: after,
        highWatermark,
      };
      return { records: [], highWatermark, gap };
    }
    records.push(row.record);
    expected += 1;
    if (records.length === limit) break;
  }

  if (records.length === 0 && highWatermark > after) {
    // Nothing readable from after + 1 although commits exist past the cursor:
    // the window was lost, which is an explicit gap, never silence.
    const gap: RuntimeObservationGap = {
      kind: 'STORAGE_GAP',
      requestedAfter: after,
      highWatermark,
    };
    return { records: [], highWatermark, gap };
  }

  return {
    records,
    ...(records.length === 0
      ? {}
      : { nextCursor: encodeRuntimeObservationCursor(streamKey, records[records.length - 1]!.sequence) }),
    highWatermark,
  };
}
