/**
 * DomainHarness v0.11.0 T01 (#1575) — L201 machine contracts (L2 §2.2/§2.3).
 *
 * One unified Element root schema (PRD AR-01): no closed Element class
 * hierarchy; `roles` are descriptive multi-labels that never grant
 * authority, choose execution engines or change Function ABI (AR-01/E01).
 * `functions` may be empty — a zero-Function knowledge Element is a
 * first-class positive form (PRD AR-02/AC01), not a degenerate one.
 *
 * FunctionContract deliberately carries NO implementation reference:
 * implementations are selected per Function at BUILD (PRD E05/P05), so a
 * provider clone cannot fork the semantic identity. Unknown required
 * content kinds fail BUILD; unknown optional content is explicitly
 * excluded and recorded in the Lock (PRD E10).
 */
import type { ContentDigest, JsonValue, SemVer } from './base.js';
import type { DH_DOMAIN_SCHEMA_VERSION, DH_ELEMENT_SCHEMA_VERSION } from './schema-versions.js';
export declare const CORE_CONTENT_KINDS: readonly ["semantic-model", "knowledge", "rule", "constraint", "workflow-definition", "state-model", "structured-data", "interaction", "document", "validation"];
export type CoreContentKind = (typeof CORE_CONTENT_KINDS)[number];
/**
 * Extension kinds must carry a namespace prefix `dh-ext.<scope>.<kind>`.
 *
 * Frozen unknown predicate (L2 §2.2): a kind is unknown when it is neither
 * a core kind nor `dh-ext.`-prefixed. Responsibility boundary —
 * `DH_BUILD_SCHEMA_UNKNOWN_REQUIRED` answers ONLY "is this kind
 * recognized?"; schema resolution/validation failures for a KNOWN kind
 * (core or dh-ext) belong to `DH_BUILD_SCHEMA_INVALID` (T02 BUILD).
 */
export type ContentKind = CoreContentKind | `dh-ext.${string}`;
export declare function isUnknownContentKind(kind: string): boolean;
export interface SchemaResourceRef {
    readonly packageId: string;
    /** Package-root relative POSIX path; absolute paths and `..` segments are refused. */
    readonly path: string;
    readonly digest: ContentDigest;
}
/**
 * Inline JSON Schema object (draft 2020-12 subset) versus package-internal
 * schema resource reference; BUILD normalizes both to equivalent semantics
 * (PRD E08).
 */
export type SchemaRef = {
    readonly inline: JsonValue;
} | SchemaResourceRef;
export interface ResourceRef {
    readonly packageId: string;
    /** Package-root relative POSIX path; absolute paths and `..` segments are refused. */
    readonly path: string;
    readonly digest: ContentDigest;
}
export interface ApplicabilityRule {
    /** Minimal shape frozen by T01 fixtures; semantics = when this applies (PRD E05). */
    readonly targets?: readonly string[];
    readonly when?: JsonValue;
}
export interface ProvenanceRef {
    readonly source?: string;
    readonly refs?: readonly ResourceRef[];
}
export interface ContentBlock {
    /** Unique within its Element (PRD E03; R4 review omission repaired by L2 §13.2-1). */
    readonly id: string;
    readonly contentKind: ContentKind;
    readonly schemaRef: SchemaRef;
    /**
     * Disposition of an unknown contentKind: required + unknown is a BUILD
     * refusal; optional + unknown is explicitly excluded and recorded in the
     * Lock's `excludedUnknownContent[]` (PRD E10).
     */
    readonly required: boolean;
    /** value and ref must be exactly-one (XOR); BUILD validates. */
    readonly value?: JsonValue;
    readonly ref?: ResourceRef;
    readonly applicability?: ApplicabilityRule;
    readonly provenance?: ProvenanceRef;
}
export type FunctionOutcomeKind = 'SUCCEEDED' | 'UNKNOWN' | 'FAILED';
/**
 * Only 'none' can be selected for implementation in 0.11.0 (PRD A06/AR-10);
 * the remaining values exist in the type space so BUILD can explicitly
 * refuse them (`DH_BUILD_EFFECT_PROFILE_UNSUPPORTED`).
 */
export type EffectIntent = 'none' | 'external' | 'state';
export interface FunctionContract {
    /** Unique within its Element. */
    readonly id: string;
    /** Author-owned version string, e.g. '1'. */
    readonly contractVersion: string;
    readonly description?: string;
    readonly inputSchemaRef: SchemaRef;
    readonly outputSchemaRef: SchemaRef;
    /** Must contain 'SUCCEEDED'; unknown outcome literals are refused. */
    readonly outcomes: readonly FunctionOutcomeKind[];
    readonly effects: EffectIntent;
    readonly applicability?: ApplicabilityRule;
}
export interface ElementDependency {
    /** Full id of the depended-on Element (domain-prefixed). */
    readonly element: string;
    /** Authoring-time semver range allowed; BUILD resolves to exact versions. */
    readonly version: string;
    /** Optional: precise public Function ids (PRD E07). */
    readonly functions?: readonly string[];
}
export interface ElementDefinition {
    readonly kind: 'Element';
    readonly schemaVersion: typeof DH_ELEMENT_SCHEMA_VERSION;
    /** e.g. 'orders.eligibility'; unique across the Domain. */
    readonly id: string;
    readonly version: SemVer;
    readonly description: string;
    /** Descriptive labels only; never authority, engine selection, or ABI change (PRD E01/AR-01). */
    readonly roles?: readonly string[];
    readonly content: readonly ContentBlock[];
    readonly functions: readonly FunctionContract[];
    /** Build-time dependency DAG; cycles are refused by BUILD. */
    readonly dependencies?: readonly ElementDependency[];
    /** Positive/negative case resources (PRD E09). */
    readonly validation?: {
        readonly ref: ResourceRef;
    };
}
export interface SemanticEdge {
    readonly relation: string;
    readonly from: string;
    readonly to: string;
    readonly version?: string;
}
/**
 * Semantic relations are Domain-level (PRD §2 model table: semantic
 * relations, constraints and collaboration semantics belong to the Domain
 * Definition). They may legitimately cycle and never grant executable
 * access; Elements keep only build-time `dependencies` (L2 §13.2-3).
 */
export interface DomainDefinition {
    readonly kind: 'Domain';
    readonly schemaVersion: typeof DH_DOMAIN_SCHEMA_VERSION;
    /** Domain namespace, e.g. 'orders'. */
    readonly id: string;
    readonly version: SemVer;
    readonly description?: string;
    readonly elements: readonly ElementDefinition[];
    readonly semanticRelations?: readonly SemanticEdge[];
    readonly constraints?: readonly JsonValue[];
}
