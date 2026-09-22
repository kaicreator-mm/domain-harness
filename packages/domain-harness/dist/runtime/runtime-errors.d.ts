/**
 * Stable public Runtime operation error envelope (issue #172).
 *
 * FOREGROUND (public DomainRuntime operations) reject with either:
 * - this envelope, carrying a stable machine-readable `code` — consumers
 *   branch on `error instanceof DomainRuntimeError && error.code`, never on
 *   message text; or
 * - an existing subsystem-specific typed error that is already stable and
 *   intentionally preserved: PackageActivationError (+PackageErrorCode) for
 *   activation/preflight, MessageAcceptanceError for send-time contract and
 *   acceptance failures, ProjectionError for query/projection failures, and
 *   the recovery-v2 error classes (RecoveryStateError, RecoveryTargetNotFoundError,
 *   RecoveryRetryNotAuthorizedError, AmbiguousNonIdempotentResolutionRequiredError,
 *   RecoveryStoreInvariantError) surfacing through recover().
 *
 * BACKGROUND (onBackgroundError) receives the underlying failure as-is:
 * runtime-owned classes where they exist (ProcessingConflict-style drain
 * failures surface as the thrown Error; durable poison-message facts are NOT
 * re-reported because they are already persisted and observable through
 * Query/recovery). The background channel is diagnostic; hosts that need
 * stable codes there should classify by instanceof on the documented classes.
 * Store/host driver errors pass through unchanged and remain host-owned.
 *
 * `cause` is preserved where safe; no code payload embeds host resources,
 * credentials or runtime handles.
 */
export type RuntimeErrorCode = 
/** The Runtime has been disposed; no operation can proceed. */
'runtime_disposed'
/** The addressed Workflow Instance does not exist. */
 | 'instance_not_found'
/** The pinned/selected package does not contain the addressed workflow. */
 | 'workflow_not_in_package'
/** Recovery requires a durable poison-message identity on the instance failure. */
 | 'recovery_identity_missing'
/** Recovery actions require a non-empty domain authorization reason. */
 | 'recovery_reason_required'
/** Ambiguous non-idempotent recovery requires the durable effectId. */
 | 'recovery_effect_identity_missing';
export declare class DomainRuntimeError extends Error {
    readonly code: RuntimeErrorCode;
    constructor(code: RuntimeErrorCode, message: string, options?: {
        cause?: unknown;
    });
}
//# sourceMappingURL=runtime-errors.d.ts.map