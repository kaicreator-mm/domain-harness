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
import { type CapabilityContractRef, type ComponentEnvelope, type ComponentFamily, type KindRef, type SemanticContractRef } from './component.js';
import { type ContentDigest, type Sha256Port } from './identity.js';
import type { JsonValue } from './json.js';
/**
 * Versioned domain tag of the v0.7 Component semantic digest. Frozen: never
 * re-tagged in place. Any future change to the material shape is a NEW domain
 * tag (e.g. a `v0.8` tag); historical digests never change retroactively.
 * Successor convention: T001C must introduce its own sibling tag constant in
 * its own file — it never borrows this one.
 */
export declare const COMPONENT_SEMANTIC_DIGEST_DOMAIN_V0_7: "domain-harness.v0.7.component-semantic";
export type ComponentDigestErrorCode = 'INVALID_ENVELOPE_INPUT' | 'INVALID_DIGEST_MATERIAL' | 'UNNORMALIZABLE_REQUIRED_REFS' | 'NON_CANONICAL_JSON';
export declare class ComponentDigestError extends Error {
    readonly code: ComponentDigestErrorCode;
    constructor(code: ComponentDigestErrorCode, message: string);
}
/**
 * Canonical, behaviorally material digest input of one Component. `digestDomain`
 * is the first field and pins the digest to the frozen v0.7 Component domain.
 * `semanticBody` is embedded canonicalized (object key order normalized
 * recursively, array order preserved — array order is behaviorally material
 * JSON semantics). Required-ref collections are unordered sets in digest
 * material and appear code-unit-sorted.
 */
export interface ComponentSemanticDigestMaterial {
    readonly digestDomain: typeof COMPONENT_SEMANTIC_DIGEST_DOMAIN_V0_7;
    readonly family: ComponentFamily;
    readonly kind: KindRef;
    readonly requiredSemanticContracts: readonly SemanticContractRef[];
    readonly requiredCapabilities: readonly CapabilityContractRef[];
    readonly semanticBody: JsonValue;
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
export declare function componentSemanticDigestMaterial(envelope: ComponentEnvelope): ComponentSemanticDigestMaterial;
/**
 * Validated gate: digest one Component envelope into the v0.7 Component
 * semantic digest. `validateComponentEnvelope` runs first and every
 * `ComponentContractError` (including `FLOATING_AUTHORITY_REFERENCE_FORBIDDEN`)
 * propagates unchanged — floating selectors and implementation identity are
 * impossible in digest input by construction. A Sha256Port failure surfaces as
 * `IdentityContractError('INVALID_CONTENT_DIGEST')`, unchanged. The input
 * envelope is never mutated.
 */
export declare function computeComponentSemanticDigest(envelope: ComponentEnvelope, sha256: Sha256Port): Promise<ContentDigest>;
//# sourceMappingURL=component-digest.d.ts.map