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
 * TYPE from `src/contracts/component.ts` and nothing else from the package's
 * admission or legacy seams. It does not import, call, or modify
 * `src/contracts/component-admission.ts` and is not coupled to the v0.3
 * governance admission (`src/admission/`) or legacy
 * `COMPILED_ARTIFACT_KINDS`. Exactness validation and descriptor-safe input
 * handling are delegated to the shared low-level primitive
 * `record-safety.ts` (#557 + #578), the same internal seam consumed by the
 * other v0.7 contract modules — one accepted/rejected matrix, not a third
 * local helper family.
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
import {
  carriesEmbeddedSelector,
  carriesFloatingOrRangeSemantics,
  carriesXRangeVersionSemantics,
  describeRecordSafetyIssue,
  isNonEmptyIdentityString,
  safeArraySnapshot,
  safeRecordSnapshot,
} from './record-safety.js';

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

function fail(code: KindCompatibilityErrorCode, message: string): never {
  throw new KindCompatibilityError(code, message);
}

/**
 * Stage 1 (structural input): the ref must be a descriptor-safe record
 * carrying exactly the own enumerable data keys `{kindId, version}`, both
 * non-empty strings without an embedded `id@version` form. Structurally
 * unusable input is a typed `INVALID_COMPATIBILITY_INPUT`, never a
 * TypeError, and no hidden getter executes during validation or diagnostics.
 * Returns the validated snapshot for later stages.
 */
function requireStructurallyExactKindRef(
  value: unknown,
  description: string,
): Record<string, unknown> {
  const result = safeRecordSnapshot(value, description);
  if (!result.ok) {
    fail('INVALID_COMPATIBILITY_INPUT', `${description} must be an exact KindRef object`);
  }
  const candidate = result.snapshot;
  const keys = Object.keys(candidate).sort();
  if (keys.length !== 2 || !keys.includes('kindId') || !keys.includes('version')) {
    fail(
      'INVALID_COMPATIBILITY_INPUT',
      `${description} must contain exactly {kindId, version} (implementation/module identity is not part of a Kind reference)`,
    );
  }
  const kindId = candidate.kindId;
  const version = candidate.version;
  if (
    typeof kindId !== 'string' ||
    !isNonEmptyIdentityString(kindId) ||
    carriesEmbeddedSelector(kindId)
  ) {
    fail(
      'INVALID_COMPATIBILITY_INPUT',
      `${description}.kindId must be a non-empty exact identity without an embedded \`id@version\` selector`,
    );
  }
  if (
    typeof version !== 'string' ||
    !isNonEmptyIdentityString(version) ||
    carriesEmbeddedSelector(version)
  ) {
    fail(
      'INVALID_COMPATIBILITY_INPUT',
      `${description}.version must be a non-empty exact identity without an embedded \`id@version\` selector`,
    );
  }
  return candidate;
}

/**
 * Stage 2 (required-ref exactness): a well-formed required ref that encodes
 * floating/range/x-range selection semantics is a typed
 * `INCOMPATIBLE_KIND_REF` — rejected unconditionally, never resolved.
 */
function requireExactRequiredKindRef(candidate: Record<string, unknown>): void {
  const kindId = candidate.kindId as string;
  const version = candidate.version as string;
  if (carriesFloatingOrRangeSemantics(kindId)) {
    fail(
      'INCOMPATIBLE_KIND_REF',
      `required kindId "${kindId}" encodes floating/range selection semantics (latest/current/active/default/*/x/range); only exact kindIds are decidable`,
    );
  }
  if (carriesFloatingOrRangeSemantics(version) || carriesXRangeVersionSemantics(version)) {
    fail(
      'INCOMPATIBLE_KIND_REF',
      `required version "${version}" encodes floating/range/x-range selection semantics (latest/current/active/default/*/x/range, 1.x, 1.); only exact versions are decidable`,
    );
  }
}

/**
 * Stages 3 (supported-set exactness/duplicates): full fail-closed validation
 * of the caller-supplied supported set. Floating/range entries and duplicate
 * exact KindRef entries are input failures before any lookup. Returns an
 * index keyed by the unambiguous `kindId@version` composite (`@` never occurs
 * inside exact identity strings); each indexed value is a fresh,
 * non-aliased KindRef snapshot, so later caller mutation cannot perturb the
 * decision.
 */
function validateAndIndexSupportedSet(supportedKinds: SupportedKindSet): Map<string, KindRef> {
  const setResult = safeArraySnapshot(supportedKinds, 'supported Kind set');
  if (!setResult.ok) {
    fail(
      'INVALID_COMPATIBILITY_INPUT',
      setResult.issue.violation === 'NOT_AN_ARRAY'
        ? 'supported Kind set must be an array of exact KindRefs'
        : `supported Kind set ${describeRecordSafetyIssue(setResult.issue)}`,
    );
  }
  const index = new Map<string, KindRef>();
  for (const [entryIndex, entry] of setResult.snapshot.entries()) {
    const at = `supported Kind set entry [${entryIndex}]`;
    const candidate = requireStructurallyExactKindRef(entry, at);
    const kindId = candidate.kindId as string;
    const version = candidate.version as string;
    if (carriesFloatingOrRangeSemantics(kindId)) {
      fail(
        'INVALID_COMPATIBILITY_INPUT',
        `${at}.kindId must be an exact kindId, not a floating/range selector (latest/current/active/default/*/x/range)`,
      );
    }
    if (carriesFloatingOrRangeSemantics(version) || carriesXRangeVersionSemantics(version)) {
      fail(
        'INVALID_COMPATIBILITY_INPUT',
        `${at}.version must be an exact version, not a floating/range/x-range selector (latest/current/active/default/*/x/range, 1.x, 1.)`,
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
 * deterministic even when multiple defects coexist. All validation runs on
 * descriptor-safe snapshots (#578), so accessor-backed inputs cannot drift
 * between validation and the exact lookup. Matching is exact on both
 * kindId and version: no fallback to another version of a known kindId, no
 * `latest`/`current`/`default`/ordering/nearest-version/lexical-selection
 * semantics of any kind, and no compatibility ranges (out of scope by the
 * frozen L2; only a future bounded L2 repair may introduce them).
 */
export function decideKindCompatibility(
  requiredKind: KindRef,
  supportedKinds: SupportedKindSet,
): KindCompatibilityResult {
  const required = requireStructurallyExactKindRef(requiredKind, 'required Kind');
  requireExactRequiredKindRef(required);
  const supported = validateAndIndexSupportedSet(supportedKinds);

  const key = `${required.kindId as string}@${required.version as string}`;
  const matched = supported.get(key);
  if (matched === undefined) {
    const kindIdKnown = [...supported.values()].some(
      (ref) => ref.kindId === (required.kindId as string),
    );
    fail(
      kindIdKnown ? 'KIND_VERSION_NOT_SUPPORTED' : 'KIND_NOT_SUPPORTED',
      kindIdKnown
        ? `exact Kind "${key}" is not in the supported Kind set, which supports other exact versions of kindId "${required.kindId as string}"; compatibility never falls back to another version`
        : `kindId "${required.kindId as string}" is not supported by the supported Kind set`,
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
