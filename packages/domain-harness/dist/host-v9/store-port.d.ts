/**
 * DomainHarness v0.9 N06 (#1032) — typed physical storage PORT of the
 * protected H registry (logical layer only; no physical store lives here).
 * ===========================================================================
 *
 * The physical Node24/SQLite true-CAS store is owned by #1028. This module
 * declares ONLY the v0.9 port the protected H registry consumes, injected at
 * host bootstrap. Exact method contract (documented for the #1028 JIT
 * integration; every physical store must implement precisely this face):
 *
 *   get(key: string)
 *     → Promise<{ value: unknown; revision: number } | null>
 *       The document and its current physical revision, or null when the key
 *       is absent. Returned values must be JSON-representable snapshots that
 *       never alias the authoritative bytes.
 *
 *   put(key: string, value: unknown, condition: V09StorePutCondition)
 *     → Promise<{ revision: number }>            — the NEW revision after an
 *       accepted write, where
 *       condition = { kind: 'create' }                     (write only if the key is absent; an accepted create yields revision 0)
 *                  | { kind: 'cas'; revision: number }     (write only if the current revision equals `revision`; an accepted CAS yields revision + 1)
 *     and refuses with a typed V09HostStoreError instead:
 *       V09_STORE_CONFLICT — the condition did not hold (key existed / revision moved). A lost read must NEVER degrade into an unconditional overwrite.
 *       V09_STORE_BUSY     — transient physical contention; the caller may retry.
 *       V09_STORE_DISK     — durable-write failure; the write must be treated as not committed.
 *       V09_STORE_UNKNOWN  — any other physical failure; fail closed.
 *       V09_STORE_MISUSE   — malformed key or an absent/ambiguous condition; unconditional writes do not exist on this port.
 *
 *   close(): Promise<void> — release all physical resources; no further ops.
 *
 * Structural compatibility with the v0.8 `CasDocumentStore` face
 * (`get → {value, revision} | null`, true revision CAS, deep-cloned values)
 * is intentional; the v0.9 condition shape is the discriminated
 * `{kind:'create'} | {kind:'cas',revision}` union above.
 *
 * `probeV09Store` runs at host bootstrap and REFUSES any store that cannot
 * prove true create-if-absent + revision-CAS behavior (fail closed, same
 * discipline as the v0.8 `probeTrueCasStore` bootstrap probe).
 */
import { V09HostError } from './errors.js';
export interface V09StoreDocument {
    readonly value: unknown;
    readonly revision: number;
}
export type V09StorePutCondition = {
    readonly kind: 'create';
} | {
    readonly kind: 'cas';
    readonly revision: number;
};
export type V09StoreErrorCode = 'V09_STORE_CONFLICT' | 'V09_STORE_BUSY' | 'V09_STORE_DISK' | 'V09_STORE_UNKNOWN' | 'V09_STORE_MISUSE';
export declare class V09HostStoreError extends Error {
    readonly code: V09StoreErrorCode;
    constructor(code: V09StoreErrorCode, message: string);
}
/** The physical document port every v0.9 protected-H store implements. */
export interface V09HostDocumentStore {
    get(key: string): Promise<V09StoreDocument | null>;
    put(key: string, value: unknown, condition: V09StorePutCondition): Promise<{
        readonly revision: number;
    }>;
    close(): Promise<void>;
}
export declare function validateV09StoreCondition(key: string, condition: V09StorePutCondition): void;
/**
 * Map a physical store failure onto the protected-H fail-closed refusal.
 * BUSY/DISK/UNKNOWN all refuse as `APPROVAL_STORE_UNAVAILABLE` (D04) — the
 * registry never degrades or silently skips a currentness/artifact step when
 * the store is unreachable.
 */
export declare function storeFailureToHostError(error: unknown, operation: string): V09HostError;
/**
 * Bootstrap-time physical CAS probe: the presented store must PROVE true
 * create-if-absent + revision-CAS behavior by exercising an actual conflict
 * before the host accepts it. A store that accepts a stale-revision write,
 * accepts an unconditional write, or cannot run the sequence is refused
 * typed — never degraded. The probe key is CAS-overwritten to a tombstone
 * marker at the end (this port intentionally has no unconditional remove).
 */
export declare function probeV09Store(store: V09HostDocumentStore): Promise<void>;
//# sourceMappingURL=store-port.d.ts.map