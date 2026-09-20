/**
 * Stable public Runtime operation error envelope (seed of issue #172).
 *
 * Foreground Runtime operations reject with either this envelope (carrying a
 * stable machine-readable `code`) or an existing subsystem-specific typed
 * error (PackageActivationError, ProjectionError, MessageAcceptanceError,
 * recovery-v2 errors), which remain stable and are preserved intentionally.
 * Consumers must never need to parse message text.
 */
export type RuntimeErrorCode =
  /** The Runtime has been disposed; no operation can proceed. */
  | 'runtime_disposed'
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

export class DomainRuntimeError extends Error {
  public constructor(
    public readonly code: RuntimeErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'DomainRuntimeError';
  }
}
