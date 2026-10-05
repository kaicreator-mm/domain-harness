import type { JsonSchema } from '../../contracts/json.js';
import type { CapabilityId } from './capability.js';
/**
 * v0.6 T001 (issue #497; frozen L2 A2/A7): the compiled first-class Semantic
 * Decision Declaration/Binding.
 *
 * This is an authoring/compiled CONTRACT, not a new execution engine or
 * planner abstraction. It is exactly sufficient to construct the existing
 * `DecisionResolverInvocation` (rule → exact cache → promoted subworkflow →
 * HarnessMachine) and route a validated structured result through the
 * existing Central Admission authority (A2). The invocation/resolve→admit
 * bridge itself is later Runtime integration (T004) and stays outside this
 * contract.
 *
 * Authority boundaries baked into the closed field set (A2 "MUST NOT" list):
 * the declaration can never carry model/provider names or routing policy,
 * engine/XState state ids selected by a model, mutation capabilities,
 * unconstrained Runtime capability lists, goal/obligation/JIT graph
 * definitions, or generic agent memory/planner state. Unknown keys fail
 * closed at compile/load/activation time.
 */
/**
 * Capability id required by every compiled package that carries semantic
 * decision declarations. Added to `manifest.requiredCapabilities` by the
 * compiler, so a target profile or host that does not support compiled
 * semantic decisions fails closed through the existing capability machinery
 * (A7 rule 4) instead of silently ignoring the declaration.
 */
export declare const SEMANTIC_DECISION_CAPABILITY: CapabilityId;
/**
 * Exact declaration contract version recorded next to the compiled
 * descriptors. A manifest whose descriptors were produced under a different
 * declaration contract fails closed rather than being interpreted as
 * "latest" (A7 rule 5). Widen this union only with a reviewed successor
 * version and explicit compatibility handling.
 */
export declare const SEMANTIC_DECISION_CONTRACT_VERSION_V1 = "semantic-declaration.v1";
export type SemanticDecisionContractVersion = typeof SEMANTIC_DECISION_CONTRACT_VERSION_V1;
/**
 * Frozen cache bypass vocabulary, mirroring the resolver-side
 * `SemanticCacheBypassReason` union (frozen A1 source-order authority). The
 * declaration may pin a bypass reason; it cannot invent a new one.
 */
export type SemanticDecisionCacheBypassReason = 'non-cacheable' | 'time-sensitive' | 'live-dependency-without-semantic-revision' | 'dynamic-dependency-not-prebound' | 'explicit-domain-policy';
/**
 * Exact-reuse/cache policy. Optional in the authoring form; always
 * materialized in the compiled form (absent authoring policy compiles to
 * `{ mode: 'eligible' }`, the existing resolver default).
 */
export type SemanticDecisionCachePolicy = {
    readonly mode: 'eligible';
} | {
    readonly mode: 'bypass';
    readonly reason: SemanticDecisionCacheBypassReason;
};
/**
 * Promoted-known-process reference/selector. Resolved exclusively through
 * the existing promotion/revocation authority (`PromotedChildSelector`
 * vocabulary); the declaration never routes or selects at runtime.
 */
export type SemanticDecisionPromotedReference = {
    readonly kind: 'version';
    readonly artifactId: string;
    readonly version: string;
} | {
    readonly kind: 'alias';
    readonly artifactId: string;
    readonly alias: string;
};
/**
 * Explicit semantic-unavailable disposition (frozen L2 A3): what happens when
 * fresh semantics are required but model capability is unavailable. The
 * Runtime (T005) applies this declared disposition; it must never fabricate a
 * semantic answer or choose an undeclared fallback. `declared-event` is valid
 * only when the event type is in `allowedEventTypes` and the outcome is in
 * `allowedOutcomes` of the same declaration.
 */
export type SemanticDecisionUnavailableDisposition = {
    readonly kind: 'fail-closed';
} | {
    readonly kind: 'declared-event';
    readonly eventType: string;
    readonly outcome: string;
};
/**
 * Declared behaviorally relevant semantic dependency/currentness material,
 * expressed only with existing resolver/cache vocabulary (T-002/T-013):
 * required semantic-context projections and live revision sources. This is
 * decision-scoped material only — it does not introduce a generic
 * work/obligation model (deferred per A5).
 */
export interface CompiledSemanticDecisionDependencyMaterial {
    /** Projection ids that must be prebound for exact reuse/currentness. */
    readonly requiredProjectionIds: readonly string[];
    /** Live revision source ids whose currentness participates in the decision. */
    readonly requiredRevisionSourceIds: readonly string[];
}
/** Bounded Harness policy (frozen L2 A2): bounded reasoning/tool step budget. */
export interface CompiledSemanticDecisionHarnessPolicy {
    readonly maxSteps: number;
}
/**
 * The compiled Semantic Decision Declaration descriptor. Closed, portable,
 * canonical (arrays sorted/deduplicated, keys fixed). `declarationDigest` is
 * the content identity over the canonical descriptor body (every field except
 * the digest itself), suitable as decision-contract identity material for the
 * existing resolver/cache/promotion machinery.
 */
export interface CompiledSemanticDecisionDescriptor {
    /** Stable decision identity; unique within the package (domain scope = `manifest.domainId`). */
    readonly decisionId: string;
    /**
     * Input-selection authority: a portable JSONata expression over the
     * invoking workflow context producing `selectedInput` for the resolver.
     */
    readonly inputSelection: string;
    /**
     * Structured result schema authority under the DOMAIN_HARNESS_JSON_SCHEMA_V1
     * schema contract. A resolver result is only a structured decision when it
     * validates against this schema — never an opaque free-form result.
     */
    readonly resultSchema: JsonSchema;
    /** Finite allowed decision outcomes (sorted, unique, non-empty). */
    readonly allowedOutcomes: readonly string[];
    /** Finite allowed Domain Event types (sorted, unique, non-empty). */
    readonly allowedEventTypes: readonly string[];
    /**
     * Allowed query/read-only capability identities (sorted, unique). Every
     * entry must reference a compiled Tool whose effect semantics are pure
     * read (`effect: 'none'`); mutation/effect tools are rejected at compile
     * and activation time.
     */
    readonly queryCapabilityIds: readonly string[];
    /** Behaviorally relevant semantic dependency/currentness material. */
    readonly dependencyMaterial: CompiledSemanticDecisionDependencyMaterial;
    /** Exact-reuse/cache policy, always materialized in compiled form. */
    readonly cachePolicy: SemanticDecisionCachePolicy;
    /** Optional promoted-known-process reference through existing promotion authority. */
    readonly promotedReference?: SemanticDecisionPromotedReference;
    /** Bounded Harness policy. */
    readonly policy: CompiledSemanticDecisionHarnessPolicy;
    /** Explicit semantic-unavailable disposition (A3). */
    readonly unavailable: SemanticDecisionUnavailableDisposition;
    /** Content digest over the canonical descriptor body excluding this field (lowercase sha256 hex). */
    readonly declarationDigest: string;
}
export type SemanticDecisionManifestIssues = readonly string[];
/**
 * Structural validation of the `manifest.semanticDecisions` material.
 * Compiler-independent: used by the compiler's manifest assertion, by
 * manifest-shape activation validation, and by tests, so a hand-built or
 * tampered artifact can never carry a malformed declaration. Package-level
 * reference closure (projections/business sources/tools) requires the whole
 * manifest and is validated by the successor activation validator.
 */
export declare function semanticDecisionManifestIssues(value: unknown): string[];
//# sourceMappingURL=semantic-decision.d.ts.map