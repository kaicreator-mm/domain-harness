/**
 * v0.8 trusted Node Host — physical compare-and-swap document store (T-E, #1004).
 * ================================================================================
 *
 * The Host supplies ONLY a generic durable document store with true revision
 * compare-and-swap semantics. It contains NO workflow/admission/journal/effect
 * knowledge and NO business policy (L2 boundary; adapted from #994@b9ea4d1
 * src/host/memory-host.mjs `MemoryDocStore` + `resources` port surface).
 *
 * THE central C01 repair over the #994 hosts: a write WITHOUT a physical
 * revision expectation does not exist. `put(key, value)` — or
 * `put(key, value, { mustMatchRevision: undefined })` where a lost `get()`
 * revision silently degraded into an unconditional overwrite in the #994
 * hosts — is a typed refusal here (`HOST_PUT_CONDITION_REQUIRED`), never an
 * unconditional write (L2 C01-N10). Every write is either:
 *   - create-if-absent  (`mustBeAbsent: true`  → revision 0), or
 *   - revision CAS      (`mustMatchRevision: <safe integer>` → revision + 1).
 *
 * `get` returns `{value, revision}` (C01 contract) or `null` for absent keys;
 * values are deep-cloned JSON on every crossing so a returned snapshot can
 * never alias the authoritative bytes (B01-N7).
 */
/** Result of a successful `get`: the deep-cloned value and its physical revision. */
export interface CasGetResult {
    readonly value: unknown;
    readonly revision: number;
}
/**
 * The write condition. Exactly one of `mustBeAbsent` / `mustMatchRevision`
 * must be provided; the absence of both is a typed refusal, never an
 * unconditional write (C01-N10).
 */
export interface CasPutConditions {
    readonly mustBeAbsent?: true;
    readonly mustMatchRevision?: number;
}
/** The generic physical document port every trusted Host storage implements. */
export interface CasDocumentStore {
    get(key: string): Promise<CasGetResult | null>;
    put(key: string, value: unknown, conditions: CasPutConditions): Promise<{
        revision: number;
    }>;
    remove(key: string, conditions: CasPutConditions): Promise<void>;
    list(prefix: string): Promise<readonly string[]>;
    close(): Promise<void>;
}
export type ValidatedWriteCondition = {
    readonly kind: 'create';
} | {
    readonly kind: 'cas';
    readonly revision: number;
};
/**
 * Shared condition gate for every physical store: validates the exactly-one
 * rule and returns the physical write plan. Exported for the bootstrap-time
 * storage probe so both the SQLite and in-memory stores cannot drift.
 */
export declare function validateWriteCondition(key: string, conditions: CasPutConditions): ValidatedWriteCondition;
/**
 * In-memory reference implementation of the physical CAS contract. Same
 * condition gate as the SQLite store; for non-durable fixtures only (the
 * durable physical store is the SQLite store — L2 file+SQLite decision).
 */
export declare class InMemoryCasStore implements CasDocumentStore {
    #private;
    /** Physical fault injection (KPK-06 vector port): typed Host-side I/O failure. */
    failNextPutMatching(keySubstring: string, { skip }?: {
        skip?: number | undefined;
    }): void;
    /**
     * Physical READ fault injection (#1055 R1 P1-02 vector): the next matching
     * `get` fails typed, so a read-side Host failure (connection closed, I/O
     * error) is provable on the physical path — symmetric with the write fault.
     */
    failNextGetMatching(keySubstring: string, { skip }?: {
        skip?: number | undefined;
    }): void;
    get(key: string): Promise<CasGetResult | null>;
    put(key: string, value: unknown, conditions: CasPutConditions): Promise<{
        revision: number;
    }>;
    remove(key: string, conditions: CasPutConditions): Promise<void>;
    list(prefix: string): Promise<readonly string[]>;
    close(): Promise<void>;
}
/**
 * Bootstrap-time physical CAS probe (C01-N7 enforcement): a store handed to
 * the trusted Host bootstrap must PROVE true revision CAS behavior before it
 * is accepted, by exercising an actual conflict. A store that cannot run the
 * probe sequence, accepts a stale-revision write, or accepts an unconditional
 * write is refused typed — "typed unsupported" instead of silent degradation.
 */
export declare function probeTrueCasStore(store: CasDocumentStore): Promise<void>;
//# sourceMappingURL=cas.d.ts.map