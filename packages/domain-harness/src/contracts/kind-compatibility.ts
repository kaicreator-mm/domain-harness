/**
 * v0.7 deterministic Kind compatibility decision contract (issue #552,
 * fine-grained DAG T002A).
 *
 * A pure, deterministic, fail-closed decision function deciding whether one
 * required exact `KindRef` (kindId + exact version, the same type owned by
 * `src/contracts/component.ts`) is supported by a caller-supplied supported
 * set of exact KindRefs, with an explicit, typed mismatch taxonomy when it
 * is not. The frozen L2 (v0.7 freeze + R2) sanctions exact/versioned Kind
 * identity only: "Must-understand validation occurs at Definition admission
 * for the exact KindRef/version". There is deliberately no bounded
 * compatibility-range concept here — no range parsing, no semver evaluation;
 * range/floating-carrying references are rejected with typed failures, never
 * resolved.
 *
 * Exact-match rule (normative): the decision is exact equality on both
 * kindId and version. No fallback to another version of a known kindId and
 * no `latest`/`current`/`default`/ordering/nearest-version/lexical-selection
 * semantics of any kind. kindId known + version absent is always
 * `KIND_VERSION_NOT_SUPPORTED`, never a selection.
 *
 * Seam independence rule (normative): this module imports only the `KindRef`
 * type from `src/contracts/component.ts` and nothing else from the package.
 * It does not import, call, or modify `src/contracts/component-admission.ts`
 * and defines its own local exactness validation (mirroring the established
 * floating-selector/x-range discipline of `component.ts` and
 * `component-admission.ts`). It is not coupled to the v0.3 governance
 * admission (`src/admission/`) or legacy `COMPILED_ARTIFACT_KINDS`.
 *
 * No-registry / no-implementation-identity rule (normative): neither input
 * nor output carries implementation, module, provider, package-path,
 * endpoint, secret, assembly-digest, or activation identity. This module
 * holds no Kind catalog, no implementation registry, no resolver, and no
 * dispatch adapter.
 *
 * Deliberately absent here (successor tasks): Runtime Assembly records/
 * digests and implementation pins (T002B), activation integration (T002C),
 * PRODUCTION/SIMULATION authority class (T002D), Kind implementation
 * registries/catalogs/provider selection (T003B/T007A), public barrel
 * exposure (T001E).
 */
import type { KindRef } from './component.js';

/**
 * Deterministic, fail-closed compatibility failure codes. Deliberately named
 * distinctly from T001D's envelope-seam codes (`UNKNOWN_KIND`/
 * `KIND_VERSION_MISMATCH`) so a failure site identifies which seam failed.
 */
export type KindCompatibilityErrorCode =
  | 'KIND_NOT_SUPPORTED'
  | 'KIND_VERSION_NOT_SUPPORTED'
  | 'INCOMPATIBLE_KIND_REF'
  | 'INVALID_COMPATIBILITY_INPUT';

/** The failure taxonomy discriminator: each failure code maps to exactly one class. */
export type KindCompatibilityFailureClass = 'KIND' | 'INPUT';

const FAILURE_CLASS_BY_CODE: Record<KindCompatibilityErrorCode, KindCompatibilityFailureClass> = {
  KIND_NOT_SUPPORTED: 'KIND',
  KIND_VERSION_NOT_SUPPORTED: 'KIND',
  INCOMPATIBLE_KIND_REF: 'KIND',
  INVALID_COMPATIBILITY_INPUT: 'INPUT',
};

/**
 * Typed compatibility failure mirroring the `ComponentContractError` pattern
 * of `src/contracts/component.ts`: a dedicated error class carrying a `code`
 * plus exactly one failure-class discriminator.
 */
export class KindCompatibilityError extends Error {
  readonly code: KindCompatibilityErrorCode;
  readonly failureClass: KindCompatibilityFailureClass;

  constructor(code: KindCompatibilityErrorCode, message: string) {
    super(message);
    this.name = 'KindCompatibilityError';
    this.code = code;
    this.failureClass = FAILURE_CLASS_BY_CODE[code];
  }
}

/**
 * The deterministic SUPPORTED decision: the exact matched KindRef as fresh,
 * runtime-immutable evidence. Nothing implementation-identity-shaped is
 * representable here.
 */
export interface KindCompatibilityResult {
  readonly status: 'SUPPORTED';
  /** The exact matched KindRef as a fresh, non-aliased `{kindId, version}` object. */
  readonly supportedKind: KindRef;
}

/**
 * The caller-supplied supported set of exact KindRefs. No Kind catalog and no
 * Kind implementation registry exist in this module — the caller supplies the
 * complete supported set on every decision. Each exact KindRef
 * (kindId+version) appears at most once; multiple exact versions of one
 * kindId MAY coexist (each exact; no ordering, range, or preference meaning).
 * Floating/range entries and duplicates are input failures. An empty set is
 * structurally valid and supports nothing.
 */
export type SupportedKindSet = readonly KindRef[];

/** Floating selection tokens never occur in an exact identity string. */
const FLOATING_SELECTOR_TOKENS = new Set(['latest', 'current', 'active', 'default', '*', 'x']);
/** Range/wildcard operators never occur in an exact identity string. */
const FLOATING_SELECTOR_PATTERN = /[\^~<>|*]/;

function fail(code: KindCompatibilityErrorCode, message: string): never {
  throw new KindCompatibilityError(code, message);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ownKeys(value: Record<string, unknown>): string[] {
  return Object.keys(value).filter((key) =>
    Object.prototype.propertyIsEnumerable.call(value, key),
  );
}

/** Exact identity string: non-empty, not an embedded `id@selector` form. */
function isExactIdentityString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && !value.includes('@');
}

/** Mutable selection tokens; never normalized to a default. */
function carriesFloatingOrRangeSemantics(value: string): boolean {
  return (
    FLOATING_SELECTOR_TOKENS.has(value.trim().toLowerCase()) || FLOATING_SELECTOR_PATTERN.test(value)
  );
}

/** Semver x-range/partial version parts (`1.x`, `1.`, `x`) are never exact. */
function carriesXRangeSemantics(version: string): boolean {
  return version
    .trim()
    .split('.')
    .some((part) => part.length === 0 || part.toLowerCase() === 'x');
}

/**
 * Stage 1 (structural input): the ref must be a plain object carrying
 * exactly the own enumerable keys `{kindId, version}`, both non-empty strings
 * without an embedded `id@version` form. Structurally unusable input is a
 * typed `INVALID_COMPATIBILITY_INPUT`, never a TypeError.
 */
function requireStructurallyExactKindRef(value: unknown, description: string): void {
  if (!isPlainObject(value)) {
    fail('INVALID_COMPATIBILITY_INPUT', `${description} must be an exact KindRef object`);
  }
  const keys = ownKeys(value).sort();
  if (keys.length !== 2 || !keys.includes('kindId') || !keys.includes('version')) {
    fail(
      'INVALID_COMPATIBILITY_INPUT',
      `${description} must contain exactly {kindId, version} (implementation/module identity is not part of a Kind reference)`,
    );
  }
  if (!isExactIdentityString(value.kindId)) {
    fail(
      'INVALID_COMPATIBILITY_INPUT',
      `${description}.kindId must be a non-empty exact identity without an embedded \`id@version\` selector`,
    );
  }
  if (!isExactIdentityString(value.version)) {
    fail(
      'INVALID_COMPATIBILITY_INPUT',
      `${description}.version must be a non-empty exact identity without an embedded \`id@version\` selector`,
    );
  }
}

/**
 * Stage 2 (required-ref exactness): a well-formed required ref that encodes
 * floating/range/x-range selection semantics is a typed
 * `INCOMPATIBLE_KIND_REF` — rejected unconditionally, never resolved.
 */
function requireExactRequiredKindRef(ref: KindRef): void {
  if (carriesFloatingOrRangeSemantics(ref.kindId)) {
    fail(
      'INCOMPATIBLE_KIND_REF',
      `required kindId "${ref.kindId}" encodes floating/range selection semantics (latest/current/active/default/*/range); only exact kindIds are decidable`,
    );
  }
  if (carriesFloatingOrRangeSemantics(ref.version) || carriesXRangeSemantics(ref.version)) {
    fail(
      'INCOMPATIBLE_KIND_REF',
      `required version "${ref.version}" encodes floating/range/x-range selection semantics (latest/current/active/default/*/range, 1.x, 1.); only exact versions are decidable`,
    );
  }
}

/**
 * Stages 3 (supported-set exactness/duplicates): full fail-closed validation
 * of the caller-supplied supported set. Floating/range entries and duplicate
 * exact KindRef entries are input failures before any lookup. Returns an
 * index keyed by the unambiguous `kindId@version` composite (`@` never occurs
 * inside exact identity strings); each indexed value is a fresh,
 * non-aliased KindRef.
 */
function validateAndIndexSupportedSet(supportedKinds: SupportedKindSet): Map<string, KindRef> {
  if (!Array.isArray(supportedKinds)) {
    fail('INVALID_COMPATIBILITY_INPUT', 'supported Kind set must be an array of exact KindRefs');
  }
  const index = new Map<string, KindRef>();
  for (const [entryIndex, entry] of supportedKinds.entries()) {
    const at = `supported Kind set entry [${entryIndex}]`;
    requireStructurallyExactKindRef(entry, at);
    const kindId = (entry as KindRef).kindId;
    const version = (entry as KindRef).version;
    if (carriesFloatingOrRangeSemantics(kindId)) {
      fail(
        'INVALID_COMPATIBILITY_INPUT',
        `${at}.kindId must be an exact kindId, not a floating/range selector (latest/current/active/default/*/range)`,
      );
    }
    if (carriesFloatingOrRangeSemantics(version) || carriesXRangeSemantics(version)) {
      fail(
        'INVALID_COMPATIBILITY_INPUT',
        `${at}.version must be an exact version, not a floating/range/x-range selector (latest/current/active/default/*/range, 1.x, 1.)`,
      );
    }
    const key = `${kindId}@${version}`;
    if (index.has(key)) {
      fail(
        'INVALID_COMPATIBILITY_INPUT',
        `${at} declares exact Kind "${key}" more than once (each exact KindRef appears at most once)`,
      );
    }
    index.set(key, { kindId, version });
  }
  return index;
}

/**
 * Pure, deterministic, fail-closed Kind compatibility decision: does the
 * required exact KindRef appear in the caller-supplied supported set? Throws
 * `KindCompatibilityError` on failure; never mutates its inputs.
 *
 * Fixed validation order — structural input, required-ref exactness,
 * supported-set exactness/duplicates, exact lookup — makes the failure code
 * deterministic even when multiple defects coexist. Matching is exact on both
 * kindId and version: no fallback to another version of a known kindId, no
 * `latest`/`current`/`default`/ordering/nearest-version/lexical-selection
 * semantics of any kind, and no compatibility ranges (out of scope by the
 * frozen L2; only a future bounded L2 repair may introduce them).
 */
export function decideKindCompatibility(
  requiredKind: KindRef,
  supportedKinds: SupportedKindSet,
): KindCompatibilityResult {
  requireStructurallyExactKindRef(requiredKind, 'required Kind');
  requireExactRequiredKindRef(requiredKind);
  const supported = validateAndIndexSupportedSet(supportedKinds);

  const key = `${requiredKind.kindId}@${requiredKind.version}`;
  const matched = supported.get(key);
  if (matched === undefined) {
    const kindIdKnown = [...supported.values()].some((ref) => ref.kindId === requiredKind.kindId);
    fail(
      kindIdKnown ? 'KIND_VERSION_NOT_SUPPORTED' : 'KIND_NOT_SUPPORTED',
      kindIdKnown
        ? `exact Kind "${key}" is not in the supported Kind set, which supports other exact versions of kindId "${requiredKind.kindId}"; compatibility never falls back to another version`
        : `kindId "${requiredKind.kindId}" is not supported by the supported Kind set`,
    );
  }

  const supportedKind = Object.freeze({
    kindId: matched.kindId,
    version: matched.version,
  });
  return Object.freeze({
    status: 'SUPPORTED' as const,
    supportedKind,
  });
}
