/**
 * v0.7 typed Definition relation contract and normalized Definition graph
 * identity (issue #542, fine-grained DAG T001C; repaired by #555).
 *
 * The frozen L2 defines `Domain Definition = Domain Component Graph` with
 * normalized typed relations included exactly once in the graph digest and
 * versioned, domain-separated digest domains. This file owns only that
 * Definition-plane contract identity:
 *
 * - a typed exact relation envelope between bound Domain Components (exact
 *   `ComponentId` endpoints, open exact relation kind);
 * - fail-closed graph-level validation: dangling, duplicate and conflicting
 *   relation rejection; bound components are validated by delegating to the
 *   existing component contract unchanged; authority-bearing floating
 *   selectors are rejected anywhere in relation references;
 * - a normalized (order-insensitive) graph digest in its own versioned
 *   digest domain, composed from exact Component semantic digests and exact
 *   typed relations.
 *
 * Validation consumes the shared descriptor-safe record primitive and
 * unified exact-reference authority of `record-safety.ts` (#557 + #578): the
 * graph envelope and every relation are validated on descriptor-safe
 * snapshots, so accessor-backed `components`/`relations` material is rejected
 * before any authority use, and relation evidence used by later validation
 * phases comes from validated snapshots rather than repeated caller reads.
 */
import { type ComponentEnvelope, type ComponentId } from './component.js';
import { type ContentDigest, type Sha256Port } from './identity.js';
import type { JsonValue } from './json.js';
/**
 * Versioned Definition graph digest domain tag, owned exclusively by this
 * file. Distinct from any per-Component digest domain (T001B) and from the
 * legacy v0.3 domain-data artifact identity material, which carries no
 * domain tag at all — historical identities never change.
 */
export declare const DEFINITION_GRAPH_DIGEST_DOMAIN = "kaicreator.definition-graph.digest.v1";
/** Stable logical identity of one relation within a Definition graph. */
export type RelationId = string;
/**
 * Open, exact, version-free relation-type identity string: any new relation
 * kind is representable, so no closed `depends-on | consumes | ...` union is
 * ever introduced. Floating/range selection semantics stay out of scope.
 */
export type RelationKind = string;
/**
 * Typed exact relation envelope between two bound Domain Components.
 * Endpoints are exact `ComponentId`s of components bound in the same graph
 * envelope — they never embed versions, selectors, implementation/module
 * identity or routing identity.
 */
export interface DefinitionRelation {
    /** Stable logical identity of the relation; unique within the graph. */
    readonly relationId: RelationId;
    /** Open exact relation-type identity; not a floating selector. */
    readonly relationKind: RelationKind;
    /** Exact ComponentId of the source component bound in the same graph. */
    readonly sourceComponentId: ComponentId;
    /** Exact ComponentId of the target component bound in the same graph. */
    readonly targetComponentId: ComponentId;
}
/**
 * Portable Definition graph envelope. `components` are bound Component
 * envelopes validated by the existing component contract (imported, not
 * modified); `relations` are included exactly once — duplicate or conflicting
 * entries invalidate the whole graph, they are never deduplicated.
 * `nonMaterialExtensions` is explicitly non-behavioral material, mirroring
 * the T001A extension boundary, and is excluded from graph identity.
 */
export interface DefinitionGraphEnvelope {
    /** Stable logical Definition graph identity; non-empty; exact. */
    readonly graphId: string;
    /** Bound Component envelopes; each validated by the component contract. */
    readonly components: readonly ComponentEnvelope[];
    /** Typed relations; each included exactly once in the graph identity. */
    readonly relations: readonly DefinitionRelation[];
    /** Explicitly non-behavioral material; excluded from graph identity. */
    readonly nonMaterialExtensions?: JsonValue;
}
export type DefinitionGraphContractErrorCode = 'INVALID_GRAPH_ENVELOPE' | 'INVALID_GRAPH_ID' | 'INVALID_RELATION' | 'INVALID_RELATION_ID' | 'INVALID_RELATION_KIND' | 'DANGLING_COMPONENT_REF' | 'DUPLICATE_RELATION' | 'CONFLICTING_RELATION' | 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN' | 'INVALID_GRAPH_MATERIAL';
export declare class DefinitionGraphContractError extends Error {
    readonly code: DefinitionGraphContractErrorCode;
    constructor(code: DefinitionGraphContractErrorCode, message: string);
}
/**
 * Structural fail-closed validation of a Definition graph envelope. Invalid
 * exact identities are always rejected — never silently normalized to a
 * default/current value. Component-envelope failures propagate the original
 * `ComponentContractError` unwrapped (single source of truth for component
 * codes). Validation runs descriptor-safe on snapshots of the caller graph
 * envelope and each relation (#578): accessor/symbol-keyed/non-enumerable
 * material and exotic prototypes are typed rejections before any authority
 * use, and later validation phases (dangling/duplicate/conflict) read
 * validated snapshot evidence rather than re-reading caller objects. The
 * caller input is never frozen or mutated.
 */
export declare function validateDefinitionGraphEnvelope(envelope: DefinitionGraphEnvelope): void;
/**
 * Normalized (order-insensitive) Definition graph digest through the existing
 * canonical-JSON + Sha256Port seam.
 *
 * Component semantic material is represented exactly once as
 * `{ componentId, componentSemanticDigest }`. The content digest is delegated
 * to T001B's canonical Component digest path, so non-material extensions stay
 * excluded and required semantic/capability reference collections retain the
 * same normalized set semantics at both Component and Definition identity
 * layers. Typed relations are included exactly once at graph level.
 *
 * Torn-snapshot safety (#555 FULL_REVIEW_SUPPLEMENT): `Sha256Port` is async
 * and the caller owns the envelope, so after validation every
 * authority-bearing value that enters graph material is snapshotted
 * synchronously, before the first caller-visible async suspension —
 * `graphId` (an immutable string), each relation copied field-by-field into
 * a fresh record, and each Component's canonical digest material built via
 * the exported pure T001B normalizer. `envelope.graphId`,
 * `envelope.components` and `envelope.relations` are never re-read after
 * that point, so a caller mutating its own graph while a digest promise is
 * pending can never produce a torn hybrid snapshot. Validation additionally
 * guarantees the envelope carries no accessor-backed fields (#578), so the
 * synchronous snapshot cannot observe validation-to-use drift either.
 */
export declare function computeDefinitionGraphDigest(envelope: DefinitionGraphEnvelope, sha256: Sha256Port): Promise<ContentDigest>;
//# sourceMappingURL=definition-graph.d.ts.map