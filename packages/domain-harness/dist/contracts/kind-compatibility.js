import { carriesEmbeddedSelector, carriesFloatingOrRangeSemantics, carriesXRangeVersionSemantics, describeRecordSafetyIssue, isNonEmptyIdentityString, safeArraySnapshot, safeRecordSnapshot, } from './record-safety.js';
const FAILURE_CLASS_BY_CODE = {
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
    code;
    failureClass;
    constructor(code, message) {
        super(message);
        this.name = 'KindCompatibilityError';
        this.code = code;
        this.failureClass = FAILURE_CLASS_BY_CODE[code];
    }
}
function fail(code, message) {
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
function requireStructurallyExactKindRef(value, description) {
    const result = safeRecordSnapshot(value, description);
    if (!result.ok) {
        fail('INVALID_COMPATIBILITY_INPUT', `${description} must be an exact KindRef object`);
    }
    const candidate = result.snapshot;
    const keys = Object.keys(candidate).sort();
    if (keys.length !== 2 || !keys.includes('kindId') || !keys.includes('version')) {
        fail('INVALID_COMPATIBILITY_INPUT', `${description} must contain exactly {kindId, version} (implementation/module identity is not part of a Kind reference)`);
    }
    const kindId = candidate.kindId;
    const version = candidate.version;
    if (typeof kindId !== 'string' ||
        !isNonEmptyIdentityString(kindId) ||
        carriesEmbeddedSelector(kindId)) {
        fail('INVALID_COMPATIBILITY_INPUT', `${description}.kindId must be a non-empty exact identity without an embedded \`id@version\` selector`);
    }
    if (typeof version !== 'string' ||
        !isNonEmptyIdentityString(version) ||
        carriesEmbeddedSelector(version)) {
        fail('INVALID_COMPATIBILITY_INPUT', `${description}.version must be a non-empty exact identity without an embedded \`id@version\` selector`);
    }
    return candidate;
}
/**
 * Stage 2 (required-ref exactness): a well-formed required ref that encodes
 * floating/range/x-range selection semantics is a typed
 * `INCOMPATIBLE_KIND_REF` — rejected unconditionally, never resolved.
 */
function requireExactRequiredKindRef(candidate) {
    const kindId = candidate.kindId;
    const version = candidate.version;
    if (carriesFloatingOrRangeSemantics(kindId)) {
        fail('INCOMPATIBLE_KIND_REF', `required kindId "${kindId}" encodes floating/range selection semantics (latest/current/active/default/*/x/range); only exact kindIds are decidable`);
    }
    if (carriesFloatingOrRangeSemantics(version) || carriesXRangeVersionSemantics(version)) {
        fail('INCOMPATIBLE_KIND_REF', `required version "${version}" encodes floating/range/x-range selection semantics (latest/current/active/default/*/x/range, 1.x, 1.); only exact versions are decidable`);
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
function validateAndIndexSupportedSet(supportedKinds) {
    const setResult = safeArraySnapshot(supportedKinds, 'supported Kind set');
    if (!setResult.ok) {
        fail('INVALID_COMPATIBILITY_INPUT', setResult.issue.violation === 'NOT_AN_ARRAY'
            ? 'supported Kind set must be an array of exact KindRefs'
            : `supported Kind set ${describeRecordSafetyIssue(setResult.issue)}`);
    }
    const index = new Map();
    for (const [entryIndex, entry] of setResult.snapshot.entries()) {
        const at = `supported Kind set entry [${entryIndex}]`;
        const candidate = requireStructurallyExactKindRef(entry, at);
        const kindId = candidate.kindId;
        const version = candidate.version;
        if (carriesFloatingOrRangeSemantics(kindId)) {
            fail('INVALID_COMPATIBILITY_INPUT', `${at}.kindId must be an exact kindId, not a floating/range selector (latest/current/active/default/*/x/range)`);
        }
        if (carriesFloatingOrRangeSemantics(version) || carriesXRangeVersionSemantics(version)) {
            fail('INVALID_COMPATIBILITY_INPUT', `${at}.version must be an exact version, not a floating/range/x-range selector (latest/current/active/default/*/x/range, 1.x, 1.)`);
        }
        const key = `${kindId}@${version}`;
        if (index.has(key)) {
            fail('INVALID_COMPATIBILITY_INPUT', `${at} declares exact Kind "${key}" more than once (each exact KindRef appears at most once)`);
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
export function decideKindCompatibility(requiredKind, supportedKinds) {
    const required = requireStructurallyExactKindRef(requiredKind, 'required Kind');
    requireExactRequiredKindRef(required);
    const supported = validateAndIndexSupportedSet(supportedKinds);
    const key = `${required.kindId}@${required.version}`;
    const matched = supported.get(key);
    if (matched === undefined) {
        const kindIdKnown = [...supported.values()].some((ref) => ref.kindId === required.kindId);
        fail(kindIdKnown ? 'KIND_VERSION_NOT_SUPPORTED' : 'KIND_NOT_SUPPORTED', kindIdKnown
            ? `exact Kind "${key}" is not in the supported Kind set, which supports other exact versions of kindId "${required.kindId}"; compatibility never falls back to another version`
            : `kindId "${required.kindId}" is not supported by the supported Kind set`);
    }
    const supportedKind = Object.freeze({
        kindId: matched.kindId,
        version: matched.version,
    });
    return Object.freeze({
        status: 'SUPPORTED',
        supportedKind,
    });
}
//# sourceMappingURL=kind-compatibility.js.map