/**
 * DomainHarness v0.9 N06 (#1032) — protected H typed error taxonomy.
 * ==================================================================
 *
 * Two strict layers, per frozen L2 §11 D04:
 *
 *  - PUBLIC path (`load`): every caller-visible failure for an
 *    invalid/unknown/foreign/revoked/forged reference or stale approval
 *    collapses into the ONE public `PACKAGE_NOT_AUTHORIZED` family (plus the
 *    separate stable ABI/lifecycle families) — no reference-existence or
 *    revoked-issuer oracle on the public path. The thrown public error is a
 *    `V09PublicRefusalError`: its only own enumerable fields are `name` and
 *    the family `code`, its message is the family's CONSTANT string (the
 *    #1035-reviewed public D04 constant-message contract), and it carries no
 *    `diagnosticCode`, no `cause` and no other extra enumerable detail — so
 *    every refusal cause inside one family is byte-identical to the untrusted
 *    caller, `JSON.stringify` included.
 *
 *  - PROTECTED/GOVERNANCE paths (`install`/`activate`/`revoke`): the typed
 *    `V09HostError` carries the code and the typed diagnostic subcode for
 *    trusted Host-side consumers; governance entries stay addressed to the
 *    trusted operator with the typed code as both public and diagnostic code.
 *
 * Protected diagnostics observed while producing a public refusal are NOT
 * attached to the public error: they are recorded on the H-private trusted
 * `V09ProtectedDiagnosticChannel` (in-Host telemetry/log, drained only by
 * governance-side trusted consumers). Durable telemetry export is #1036/#1037
 * integration surface; this channel is the trusted in-H handoff point.
 *
 * `UNSUPPORTED_RUNTIME_ABI` / `UNSUPPORTED_HOST_ABI` keep their own public
 * families (D04 additional stable families) and `LIFECYCLE_FAILED` covers
 * post-gate activation evaluation failure.
 */
export declare const V09_PUBLIC_FAMILY_NOT_AUTHORIZED = "PACKAGE_NOT_AUTHORIZED";
export declare const V09_PUBLIC_FAMILY_RUNTIME_ABI = "UNSUPPORTED_RUNTIME_ABI";
export declare const V09_PUBLIC_FAMILY_HOST_ABI = "UNSUPPORTED_HOST_ABI";
export declare const V09_PUBLIC_FAMILY_LIFECYCLE = "LIFECYCLE_FAILED";
export type V09PublicFamily = typeof V09_PUBLIC_FAMILY_NOT_AUTHORIZED | typeof V09_PUBLIC_FAMILY_RUNTIME_ABI | typeof V09_PUBLIC_FAMILY_HOST_ABI | typeof V09_PUBLIC_FAMILY_LIFECYCLE;
export declare class V09HostError extends Error {
    /** Caller-visible code: the public family on the public path, the typed code on governance paths. */
    readonly code: string;
    /** Protected typed diagnostic subcode (trusted paths only — never on public-thrown errors). */
    readonly diagnosticCode: string;
    constructor(code: string, diagnosticCode: string, message: string);
}
/**
 * The PUBLIC-path refusal error for untrusted callers: the ONLY error shape
 * the public `load` forward ever throws. Own enumerable fields are exactly
 * `name` and the family `code`; the message is the family's constant string.
 * No protected subcode, no `cause`, no other enumerable detail — every cause
 * inside one family serializes byte-identically (D04).
 */
export declare class V09PublicRefusalError extends Error {
    /** The ONE caller-visible public family code. */
    readonly code: V09PublicFamily;
    constructor(code: V09PublicFamily, message: string);
}
/** One protected diagnostic event observed on the H-private trusted channel. */
export interface V09ProtectedDiagnostic {
    /** Trusted Host wall-clock record time (internal diagnostic metadata). */
    readonly at: string;
    /** Which trusted H surface produced the diagnostic. */
    readonly channel: 'public-load-refusal';
    /** The public family the caller actually saw. */
    readonly family: V09PublicFamily;
    /** The protected typed subcode withheld from the public error. */
    readonly diagnosticCode: string;
}
/**
 * H-private trusted diagnostics channel: protected typed subcodes triggered
 * by public refusals live ONLY here (bounded FIFO inside H), never on the
 * public error object. `drain()` is the governance/trusted-telemetry handoff
 * point (durable export is #1036/#1037 integration surface).
 */
export declare class V09ProtectedDiagnosticChannel {
    #private;
    static readonly CAPACITY = 256;
    /** Record one protected diagnostic; the oldest entry is dropped when bounded. */
    record(entry: V09ProtectedDiagnostic): void;
    /** Trusted-consumer handoff: returns the buffered diagnostics in order and clears the channel. */
    drain(): readonly V09ProtectedDiagnostic[];
    /** Count of diagnostics that overflowed the bounded buffer (oldest dropped first). */
    get droppedCount(): number;
}
/** Governance-side typed refusal: the trusted operator sees the exact code. */
export declare function governanceRefusal(code: string, message: string): V09HostError;
/**
 * Public-path refusal: one visible family with its CONSTANT message. The
 * `diagnosticCode` argument preserves the historical call shape but is
 * deliberately NOT attached to the returned public error — callers must route
 * it into the H-private `V09ProtectedDiagnosticChannel` instead (D04).
 */
export declare function publicRefusal(family: V09PublicFamily, diagnosticCode: string): V09PublicRefusalError;
//# sourceMappingURL=errors.d.ts.map