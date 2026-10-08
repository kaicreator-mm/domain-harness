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
/**
 * Deterministic, fail-closed compatibility failure codes. Deliberately named
 * distinctly from T001D's envelope-seam codes (`UNKNOWN_KIND`/
 * `KIND_VERSION_MISMATCH`) so a failure site identifies which seam failed.
 */
export type KindCompatibilityErrorCode = 'KIND_NOT_SUPPORTED' | 'KIND_VERSION_NOT_SUPPORTED' | 'INCOMPATIBLE_KIND_REF' | 'INVALID_COMPATIBILITY_INPUT';
/** The failure taxonomy discriminator: each failure code maps to exactly one class. */
export type KindCompatibilityFailureClass = 'KIND' | 'INPUT';
/**
 * Typed compatibility failure mirroring the `ComponentContractError` pattern
 * of `src/contracts/component.ts`: a dedicated error class carrying a `code`
 * plus exactly one failure-class discriminator.
 */
export declare class KindCompatibilityError extends Error {
    readonly code: KindCompatibilityErrorCode;
    readonly failureClass: KindCompatibilityFailureClass;
    constructor(code: KindCompatibilityErrorCode, message: string);
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
export declare function decideKindCompatibility(requiredKind: KindRef, supportedKinds: SupportedKindSet): KindCompatibilityResult;
//# sourceMappingURL=kind-compatibility.d.ts.map