/**
 * DomainHarness v0.9 N06 (#1032) — BUILD-side typed errors.
 */
export declare class V09BuildError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
