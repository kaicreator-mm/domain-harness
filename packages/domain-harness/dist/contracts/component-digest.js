/**
 * v0.7 Component semantic digest (issue #541, fine-grained DAG T001B).
 *
 * One versioned/domain-separated digest domain over the exact T001A
 * `ComponentEnvelope` types: a canonical, behaviorally material digest input
 * built from ComponentFamily, the exact KindRef/version, the required
 * semantic contracts, the required capabilities and the semantic body.
 *
 * Excluded by construction:
 * - `componentId` — stable logical identity, not behavior content (T001C
 *   pairs the id with this digest);
 * - `nonMaterialExtensions` — explicitly non-behavioral; promotion into the
 *   digest is an authoring act (moving content into `semanticBody` or a
 *   required ref), never automatic;
 * - anything else — unknown envelope fields are unrepresentable on the
 *   validated envelope (`component.ts`).
 *
 * Frozen L2: "v0.7 Component content digest includes ComponentFamily, exact
 * KindRef/version, required semantic contracts, required capabilities and
 * semantic body"; "v0.7 Component/Definition digest domains are versioned/
 * domain-separated from legacy artifact identity hashing".
 *
 * Boundaries owned by sibling/successor tasks — intentionally absent here:
 * - Definition relation/graph digest (T001C owns its own sibling domain tag);
 * - must-understand admission (T001D) — no admission conclusion is drawn from
 *   empty required collections;
 * - Tool operation contracts (T003A);
 * - public barrel exposure and legacy isolation (T001E);
 * - Runtime Assembly / implementation pins (T002+).
 */
import { validateComponentEnvelope, } from './component.js';
import { canonicalizeJson, computeCanonicalJsonDigest, } from './identity.js';
/**
 * Versioned domain tag of the v0.7 Component semantic digest. Frozen: never
 * re-tagged in place. Any future change to the material shape is a NEW domain
 * tag (e.g. a `v0.8` tag); historical digests never change retroactively.
 * Successor convention: T001C must introduce its own sibling tag constant in
 * its own file — it never borrows this one.
 */
export const COMPONENT_SEMANTIC_DIGEST_DOMAIN_V0_7 = 'domain-harness.v0.7.component-semantic';
export class ComponentDigestError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'ComponentDigestError';
        this.code = code;
    }
}
function failDigest(code, message) {
    throw new ComponentDigestError(code, message);
}
function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/** Code-unit comparison only; `localeCompare` is forbidden in this module. */
function lexicalCompare(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}
function requireNonEmptyIdentityString(value, path) {
    if (typeof value !== 'string' || value.length === 0) {
        failDigest('INVALID_DIGEST_MATERIAL', `${path} must be a non-empty exact identity string`);
    }
    return value;
}
function requireNoSymbolKeys(value, path) {
    if (Object.getOwnPropertySymbols(value).length > 0) {
        failDigest('NON_CANONICAL_JSON', `${path} carries symbol-keyed properties, which are not canonical JSON`);
    }
}
/**
 * Structural shape of one exact reference (two own enumerable string keys).
 * Mirrors the structural-only checking of `component.ts` — no prototype
 * check here, so a ref accepted by the envelope validator despite an exotic
 * prototype still normalizes; the returned fresh two-key record keeps any
 * prototype exotica out of digest material.
 */
function requireMaterialRef(value, path, idField) {
    if (!isPlainObject(value)) {
        failDigest('UNNORMALIZABLE_REQUIRED_REFS', `${path} must be an exact reference object`);
    }
    requireNoSymbolKeys(value, path);
    const keys = Object.keys(value).sort();
    if (keys.length !== 2 || !keys.includes(idField) || !keys.includes('version')) {
        failDigest('UNNORMALIZABLE_REQUIRED_REFS', `${path} must carry exactly {${idField}, version}`);
    }
    return {
        id: requireNonEmptyIdentityString(value[idField], `${path}.${idField}`),
        version: requireNonEmptyIdentityString(value.version, `${path}.version`),
    };
}
/**
 * `\u0000`-separated sort key over the exact reference identity — the existing
 * sort-key convention of `src/contracts/domain-data.ts`.
 */
function requiredRefSortKey(ref) {
    return `${ref.id}\u0000${ref.version}`;
}
/**
 * Normalize one required-ref collection: exact two-key refs only, duplicate
 * ids fail (never silently deduplicated, mirroring `component.ts`
 * `requireExactRefCollection`), order normalized to code-unit comparison.
 * The digest layer draws no admission conclusion from an empty collection.
 */
function normalizeRequiredRefCollection(values, path, idField) {
    if (!Array.isArray(values)) {
        failDigest('UNNORMALIZABLE_REQUIRED_REFS', `${path} must be an array of exact references`);
    }
    const refs = values.map((value, index) => requireMaterialRef(value, `${path}[${index}]`, idField));
    const seen = new Set();
    for (const ref of refs) {
        if (seen.has(ref.id)) {
            failDigest('UNNORMALIZABLE_REQUIRED_REFS', `${path} declares ${ref.id} more than once (exact refs only; duplicates are never deduplicated)`);
        }
        seen.add(ref.id);
    }
    return refs.sort((left, right) => lexicalCompare(requiredRefSortKey(left), requiredRefSortKey(right)));
}
function normalizeSemanticContractRefs(values, path) {
    return normalizeRequiredRefCollection(values, path, 'contractId').map((ref) => ({
        contractId: ref.id,
        version: ref.version,
    }));
}
function normalizeCapabilityRefs(values, path) {
    return normalizeRequiredRefCollection(values, path, 'capabilityId').map((ref) => ({
        capabilityId: ref.id,
        version: ref.version,
    }));
}
function normalizeFamily(value, path) {
    if (typeof value !== 'string' || (value !== 'semantic' && value !== 'tool')) {
        failDigest('INVALID_DIGEST_MATERIAL', `${path} must be one of semantic | tool`);
    }
    return value;
}
function normalizeKind(value, path) {
    if (!isPlainObject(value)) {
        failDigest('INVALID_DIGEST_MATERIAL', `${path} must be an exact kind reference object`);
    }
    requireNoSymbolKeys(value, path);
    const keys = Object.keys(value).sort();
    if (keys.length !== 2 || !keys.includes('kindId') || !keys.includes('version')) {
        failDigest('INVALID_DIGEST_MATERIAL', `${path} must carry exactly {kindId, version}`);
    }
    return {
        kindId: requireNonEmptyIdentityString(value.kindId, `${path}.kindId`),
        version: requireNonEmptyIdentityString(value.version, `${path}.version`),
    };
}
/**
 * Pure normalizer from a Component envelope to the canonical v0.7 Component
 * semantic digest material. Exported for T001C/T002B composition.
 *
 * This function deliberately does NOT run full envelope validation —
 * `computeComponentSemanticDigest` is the single validated gate and lets
 * `ComponentContractError` propagate unchanged. Every digest-relevant field
 * still fails closed here: a field violating the material shape throws the
 * typed `ComponentDigestError` deterministically. The normalizer is pure and
 * never mutates its input.
 */
export function componentSemanticDigestMaterial(envelope) {
    if (!isPlainObject(envelope)) {
        failDigest('INVALID_ENVELOPE_INPUT', 'component semantic digest material input must be a plain ComponentEnvelope object');
    }
    const view = envelope;
    const family = normalizeFamily(view.family, 'component envelope.family');
    const kind = normalizeKind(view.kind, 'component envelope.kind');
    const requiredSemanticContracts = normalizeSemanticContractRefs(view.requiredSemanticContracts, 'component envelope.requiredSemanticContracts');
    const requiredCapabilities = normalizeCapabilityRefs(view.requiredCapabilities, 'component envelope.requiredCapabilities');
    let semanticBody;
    try {
        semanticBody = canonicalizeJson(view.semanticBody);
    }
    catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        failDigest('NON_CANONICAL_JSON', `component envelope.semanticBody cannot be canonicalized: ${reason}`);
    }
    return {
        digestDomain: COMPONENT_SEMANTIC_DIGEST_DOMAIN_V0_7,
        family,
        kind,
        requiredSemanticContracts,
        requiredCapabilities,
        semanticBody,
    };
}
/**
 * Validated gate: digest one Component envelope into the v0.7 Component
 * semantic digest. `validateComponentEnvelope` runs first and every
 * `ComponentContractError` (including `FLOATING_AUTHORITY_REFERENCE_FORBIDDEN`)
 * propagates unchanged — floating selectors and implementation identity are
 * impossible in digest input by construction. A Sha256Port failure surfaces as
 * `IdentityContractError('INVALID_CONTENT_DIGEST')`, unchanged. The input
 * envelope is never mutated.
 */
export async function computeComponentSemanticDigest(envelope, sha256) {
    if (!isPlainObject(envelope)) {
        failDigest('INVALID_ENVELOPE_INPUT', 'component semantic digest input must be a plain ComponentEnvelope object');
    }
    validateComponentEnvelope(envelope);
    const material = componentSemanticDigestMaterial(envelope);
    return computeCanonicalJsonDigest(material, sha256);
}
//# sourceMappingURL=component-digest.js.map