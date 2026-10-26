/** v0.10.2 canonical owner of retained v8 structural-snapshot semantics. */
/** Typed error taxonomy for the public v8 qualified-package ABI. */
export declare class QualifiedPackageError extends Error {
    readonly code: string;
    /**
     * #1023 S03: when the package-lifecycle failure path ran a reverse-order
     * cleanup and one or more `dispose(context)` hooks FAILED, the typed
     * primary error carries the per-package failures here — the primary
     * code/message is never erased or replaced by a cleanup failure.
     */
    cleanupFailures?: readonly QualifiedCleanupFailure[];
    constructor(code: string, message: string);
}
/**
 * One package's failed `dispose(context)` during an S03 failure-path
 * cleanup (or a facade `stop()` teardown): the package identity plus the
 * dispose failure message. Reported without erasing the primary failure.
 */
export interface QualifiedCleanupFailure {
    readonly packageId: string;
    readonly message: string;
}
/**
 * Record-safe canonical JSON snapshot (adapted from #956 R3 repaired
 * candidate-validator `data()`): descriptors are inspected BEFORE any value
 * is read, so hostile getters/accessors on an untrusted root are never
 * invoked, own `__proto__`/`constructor`/`prototype` keys are refused, and
 * the result is a plain, prototype-free canonical value.
 */
export declare function canonicalSnapshot(value: unknown, path?: string): unknown;
