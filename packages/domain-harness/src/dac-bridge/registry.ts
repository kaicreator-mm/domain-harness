// Issue #308 / A2 I-005: internal minting registry for the DAC UX<->Runtime
// correlation bridge. Only objects actually minted by this module's
// constructors/adapters pass the guards in guards.ts — a structurally
// identical forged object fails closed, so a role or correlation claim can
// never be guessed into existence by a foreign carrier.
import { DAC_REFERENCE_BASELINE } from '../dac/contracts.js';
import { DacBridgeError } from './contracts.js';
import type { DacBridgeBaselineInput } from './contracts.js';

/**
 * Mutable alias tokens that can never stand in for an exact observed
 * revision basis (DAC section 1/3.11; same token set as the I-002 reference
 * adapter's selected-revision guard, duplicated here so this leaf module
 * never edits the reviewed I-002 surface). Matched on the trimmed,
 * lower-cased whole token only.
 */
const MUTABLE_ALIAS_TOKENS = new Set([
  'latest',
  'current',
  'head',
  'main',
  'master',
  'default',
  'stable',
  'tip',
]);

export function isMutableAliasToken(value: string): boolean {
  return MUTABLE_ALIAS_TOKENS.has(value.trim().toLowerCase());
}

export function requireNonEmptyString(value: unknown, field: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new DacBridgeError(
      'INVALID_REFERENCE',
      `${field} must be a non-empty string`,
    );
  }
}

export function requireExactBaseline(input: DacBridgeBaselineInput): void {
  if (
    input === null ||
    typeof input !== 'object' ||
    input.contract !== DAC_REFERENCE_BASELINE.contract ||
    input.version !== DAC_REFERENCE_BASELINE.version ||
    input.baselineCommit !== DAC_REFERENCE_BASELINE.baselineCommit
  ) {
    throw new DacBridgeError(
      'UNSUPPORTED_DAC_BASELINE',
      `reference baseline must be exactly ${DAC_REFERENCE_BASELINE.contract}@${DAC_REFERENCE_BASELINE.version} commit ${DAC_REFERENCE_BASELINE.baselineCommit}`,
    );
  }
}

export function freezeOpaque(
  opaque: Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, unknown>> {
  return Object.freeze({ ...(opaque ?? {}) });
}

const MINTED_REFERENCES = new WeakSet<object>();
const MINTED_CORRELATIONS = new WeakSet<object>();

/** Freeze, register and return a minted bridge reference. */
export function mintReference<T extends object>(value: T): T {
  Object.freeze(value);
  MINTED_REFERENCES.add(value);
  return value;
}

/** Freeze, register and return a minted correlation envelope. */
export function mintCorrelation<T extends object>(value: T): T {
  Object.freeze(value);
  MINTED_CORRELATIONS.add(value);
  return value;
}

/** True iff the value was minted by this bridge's constructors. */
export function isMintedReference(value: unknown): value is object {
  return (
    value !== null && typeof value === 'object' && MINTED_REFERENCES.has(value)
  );
}

/** True iff the value was minted as a correlation envelope by this bridge. */
export function isMintedCorrelation(value: unknown): value is object {
  return (
    value !== null && typeof value === 'object' && MINTED_CORRELATIONS.has(value)
  );
}
