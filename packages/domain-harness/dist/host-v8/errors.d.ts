/**
 * v0.8 trusted Node Host — typed error taxonomy (T-E, #1004).
 * ============================================================
 *
 * The Host boundary fails closed with typed codes only. Codes are part of
 * the tested contract; a refusal never degrades into a best-effort success.
 *
 * Adapted from #994@b9ea4d1 src/host/memory-host.mjs (HostStoreError code
 * shape), hardened by the #1004 L2 contract: unconditional writes do not
 * exist on this store (C01-N10), and every authentication/authorization
 * refusal is explicit (B01-N1..N8).
 */
export declare class HostBoundaryError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
//# sourceMappingURL=errors.d.ts.map