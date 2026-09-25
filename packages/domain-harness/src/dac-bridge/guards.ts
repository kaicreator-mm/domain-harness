// Issue #308 / A2 I-005: role guards for the DAC UX<->Runtime correlation
// bridge. Mirrors the I-002 adapter's enforcement style: guards authenticate
// against the private minting registry, so only references actually produced
// by this bridge's constructors/adapters pass — and one role never passes
// another role's guard. No conversion function exists between roles: intent
// != command != outcome, and view/snapshot/watch stay distinct identities.
// The I-002 lifecycle reference registry stays separate on purpose — a
// lifecycle ref (e.g. RuntimeActivationRef) is never a bridge ref and vice
// versa (distinct DAC authority categories).
import {
  DAC_BRIDGE_ADAPTER_VERSION,
  DAC_BRIDGE_BASELINE,
  DAC_BRIDGE_ROLES,
  DacBridgeError,
} from './contracts.js';
import type {
  CommandRef,
  DacBridgeRole,
  DomainCommandCorrelation,
  DomainIntentRef,
  DomainOutcomeCorrelation,
  OutcomeRef,
  SemanticTargetRef,
  SnapshotRef,
  ViewRef,
  WatchRef,
} from './contracts.js';
import {
  isMintedCorrelation,
  isMintedReference,
} from './registry.js';

type AnyBridgeReference = { role: unknown } & Record<string, unknown>;

function structurallyMintedReference(value: unknown): value is AnyBridgeReference {
  if (!isMintedReference(value)) return false;
  const candidate = value as Partial<AnyBridgeReference>;
  return (
    candidate.adapter === DAC_BRIDGE_ADAPTER_VERSION &&
    typeof candidate.role === 'string' &&
    (DAC_BRIDGE_ROLES as readonly string[]).includes(candidate.role) &&
    candidate.baseline === DAC_BRIDGE_BASELINE
  );
}

/** Structural guard for any bridge-minted reference (unknown-safe). */
export function isDacBridgeReference(value: unknown): value is AnyBridgeReference {
  return structurallyMintedReference(value);
}

/** Exact role of a bridge-minted reference; `undefined` for non-references. */
export function getDacBridgeRole(value: unknown): DacBridgeRole | undefined {
  return structurallyMintedReference(value)
    ? ((value as { role: DacBridgeRole }).role)
    : undefined;
}

function roleGuard(role: DacBridgeRole, value: unknown): boolean {
  return structurallyMintedReference(value) && value.role === role;
}

function expectRole(role: DacBridgeRole, value: unknown, description: string): void {
  if (!roleGuard(role, value)) {
    const actual = structurallyMintedReference(value)
      ? `"${String(value.role)}"`
      : 'not a bridge-minted DAC reference';
    throw new DacBridgeError(
      'ROLE_MISMATCH',
      `expected a ${description} reference, but received ${actual}; DAC UX<->Runtime roles are never interchangeable`,
    );
  }
}

export function isDomainIntentRef(v: unknown): v is DomainIntentRef {
  return roleGuard('domain-intent', v);
}
export function isSemanticTargetRef(v: unknown): v is SemanticTargetRef {
  return roleGuard('semantic-target', v);
}
export function isCommandRef(v: unknown): v is CommandRef {
  return roleGuard('command', v);
}
export function isOutcomeRef(v: unknown): v is OutcomeRef {
  return roleGuard('outcome', v);
}
export function isViewRef(v: unknown): v is ViewRef {
  return roleGuard('view', v);
}
export function isSnapshotRef(v: unknown): v is SnapshotRef {
  return roleGuard('snapshot', v);
}
export function isWatchRef(v: unknown): v is WatchRef {
  return roleGuard('watch', v);
}

export function expectDomainIntentRef(v: unknown): asserts v is DomainIntentRef {
  expectRole('domain-intent', v, 'domain-intent');
}
export function expectSemanticTargetRef(v: unknown): asserts v is SemanticTargetRef {
  expectRole('semantic-target', v, 'semantic-target');
}
export function expectCommandRef(v: unknown): asserts v is CommandRef {
  expectRole('command', v, 'command');
}
export function expectOutcomeRef(v: unknown): asserts v is OutcomeRef {
  expectRole('outcome', v, 'outcome');
}
export function expectViewRef(v: unknown): asserts v is ViewRef {
  expectRole('view', v, 'view');
}
export function expectSnapshotRef(v: unknown): asserts v is SnapshotRef {
  expectRole('snapshot', v, 'snapshot');
}
export function expectWatchRef(v: unknown): asserts v is WatchRef {
  expectRole('watch', v, 'watch');
}

/** Structural guard for a bridge-minted command correlation envelope. */
export function isDomainCommandCorrelation(
  value: unknown,
): value is DomainCommandCorrelation {
  if (!isMintedCorrelation(value)) return false;
  const candidate = value as Partial<DomainCommandCorrelation>;
  return isCommandRef(candidate.command);
}

/** Structural guard for a bridge-minted outcome correlation envelope. */
export function isDomainOutcomeCorrelation(
  value: unknown,
): value is DomainOutcomeCorrelation {
  if (!isMintedCorrelation(value)) return false;
  const candidate = value as Partial<DomainOutcomeCorrelation>;
  return isOutcomeRef(candidate.outcome);
}
