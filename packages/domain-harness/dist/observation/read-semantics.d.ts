import type { WorkflowAddress } from '../v2/contracts/workflow.js';
import { type RuntimeObservationCursor, type RuntimeObservationPage, type RuntimeObservationReadRequest, type RuntimeObservationRecord } from './contracts.js';
export declare const RUNTIME_OBSERVATION_DEFAULT_READ_LIMIT = 100;
export declare const RUNTIME_OBSERVATION_MAX_READ_LIMIT = 1000;
/** Epoch allocated when a stream binding is first created (contract v1: always this value). */
export declare const RUNTIME_OBSERVATION_INITIAL_EPOCH_ID = "1";
/**
 * Exact durable key of one observation stream. Includes the immutable
 * content identity (packageId + contentDigest) and the epoch, so two
 * different package identities (or epochs) never share a stream — mutable
 * labels alone can never alias a stream.
 */
export declare function runtimeObservationStreamKey(stream: {
    readonly target: WorkflowAddress;
    readonly package: {
        readonly packageId: string;
        readonly contentDigest: string;
    };
    readonly epochId: string;
}): string;
/** Deterministic observation identity: exact stream key + exact sequence. */
export declare function runtimeObservationId(streamKey: string, sequence: number): string;
interface EncodedCursor {
    readonly v: 1;
    readonly k: string;
    readonly a: number;
}
export declare function encodeRuntimeObservationCursor(streamKey: string, afterSequence: number): RuntimeObservationCursor;
export declare function decodeRuntimeObservationCursor(cursor: RuntimeObservationCursor): EncodedCursor;
export declare function normalizeRuntimeObservationLimit(limit: number | undefined): number;
export interface ObservationReadStreamState {
    /** Highest committed sequence for the exact stream (authoritative, 0 when none). */
    readonly highWatermark: number;
    /** Earliest retained sequence, or null when the full history from 1 is retained. */
    readonly earliestAvailable: number | null;
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
export declare function assembleRuntimeObservationPage(request: RuntimeObservationReadRequest, rows: readonly ObservationReadRow[], streamState: ObservationReadStreamState): RuntimeObservationPage;
export {};
//# sourceMappingURL=read-semantics.d.ts.map