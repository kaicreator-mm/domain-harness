import { canonicalJsonStringify } from '../contracts/identity.js';
import { RuntimeObservationError, } from './contracts.js';
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
export function runtimeObservationStreamKey(stream) {
    return canonicalJsonStringify({
        workflowId: stream.target.workflowId,
        instanceKey: stream.target.instanceKey,
        packageId: stream.package.packageId,
        contentDigest: stream.package.contentDigest,
        epochId: stream.epochId,
    });
}
/** Deterministic observation identity: exact stream key + exact sequence. */
export function runtimeObservationId(streamKey, sequence) {
    return `${streamKey}#observation:${sequence}`;
}
export function encodeRuntimeObservationCursor(streamKey, afterSequence) {
    const encoded = { v: 1, k: streamKey, a: afterSequence };
    return JSON.stringify(encoded);
}
export function decodeRuntimeObservationCursor(cursor) {
    let parsed;
    try {
        parsed = JSON.parse(cursor);
    }
    catch {
        throw new RuntimeObservationError('CURSOR_MALFORMED', 'cursor is not a valid observation cursor');
    }
    if (parsed === null || typeof parsed !== 'object') {
        throw new RuntimeObservationError('CURSOR_MALFORMED', 'cursor is not a valid observation cursor');
    }
    const record = parsed;
    const { v, k, a } = record;
    if (v !== 1 || typeof k !== 'string' || typeof a !== 'number' || !Number.isSafeInteger(a) || a < 0) {
        throw new RuntimeObservationError('CURSOR_MALFORMED', 'cursor is not a valid observation cursor');
    }
    return { v: 1, k, a };
}
export function normalizeRuntimeObservationLimit(limit) {
    if (limit === undefined)
        return RUNTIME_OBSERVATION_DEFAULT_READ_LIMIT;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > RUNTIME_OBSERVATION_MAX_READ_LIMIT) {
        throw new RuntimeObservationError('INVALID_READ_LIMIT', `limit must be a safe integer in [1, ${RUNTIME_OBSERVATION_MAX_READ_LIMIT}]; got ${String(limit)}`);
    }
    return limit;
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
export function assembleRuntimeObservationPage(request, rows, streamState) {
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
        const gap = {
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
    const records = [];
    let expected = after + 1;
    for (const row of rows) {
        if (row.sequence === expected - 1) {
            throw new RuntimeObservationError('SEQUENCE_NOT_CONTIGUOUS', `duplicate observation sequence ${row.sequence} in stream ${streamKey}`);
        }
        if (row.sequence <= expected - 1) {
            throw new RuntimeObservationError('SEQUENCE_NOT_CONTIGUOUS', `non-monotonic observation sequence ${row.sequence} in stream ${streamKey}`);
        }
        if (row.sequence > expected) {
            const gap = {
                kind: 'STORAGE_GAP',
                requestedAfter: after,
                highWatermark,
            };
            return { records: [], highWatermark, gap };
        }
        records.push(row.record);
        expected += 1;
        if (records.length === limit)
            break;
    }
    if (records.length === 0 && highWatermark > after) {
        // Nothing readable from after + 1 although commits exist past the cursor:
        // the window was lost, which is an explicit gap, never silence.
        const gap = {
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
            : { nextCursor: encodeRuntimeObservationCursor(streamKey, records[records.length - 1].sequence) }),
        highWatermark,
    };
}
//# sourceMappingURL=read-semantics.js.map