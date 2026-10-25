/**
 * DomainHarness v0.10.1 — T05 CT-02 read-only Agent Improvement Feature caller.
 * Host-owned since v0.10.2 T03b (#1325): moved byte-faithfully in behavior from
 * `extensions/agent-improvement/host/ct02-data-only-invoker.mjs` (deleted by
 * the same move; both of its importers were re-pointed in the same task).
 *
 * A narrowly scoped, HOST-OWNED data boundary for four new Standard Feature
 * keys. This is NOT the global v10 selected facade, a Node/JS sandbox or a
 * Kernel Admission grant. T02 legitimately accepts callable dependencies via
 * its existing Host path; do not route T02 through this wrapper.
 *
 * Caller trust contract: the Host projects untrusted bytes to a validated
 * plain-data object before this API. JavaScript Proxy traps can execute during
 * introspection; no arbitrary hostile Proxy object can be safely introspected
 * with a universal "zero code execution" guarantee.
 */
/** The minimal trusted facade surface this invoker depends on. */
export interface Ct02FeatureFacade {
    invokeSelectedStandardFeature(featureKey: string, request: unknown, trustedDependencies: unknown): Promise<unknown>;
}
export declare class FeatureInputNotPlainDataError extends Error {
    /** Own enumerable fields, exactly as the moved v0.10.1 source shaped them. */
    readonly code: string;
    readonly reason: string;
    constructor(reason: string);
}
/**
 * Validate/copy BOTH data channels before invoking a selected feature.
 * The facade itself is an existing trusted Host object, never accepted from
 * arbitrary serialized request data and never serialized through snapshot().
 */
export declare function invokeAgentImprovementFeature(facade: Ct02FeatureFacade | null | undefined, featureKey: string, request: unknown, trustedDependencies?: unknown): Promise<unknown>;
