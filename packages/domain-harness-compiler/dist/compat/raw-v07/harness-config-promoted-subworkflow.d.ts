/**
 * T008D — historical harness-config / promoted-subworkflow compatibility
 * mapping (PACK-B #589, thin issue #790).
 *
 * `COMPATIBILITY` boundary module (sibling of the T008A Raw adapter): the
 * historical `harness-config` and `promoted-subworkflow` compiled-artifact
 * material is evidence-input consumed from the legacy artifact model — it is
 * NOT a v0.7 ontology root and never becomes runtime truth:
 *
 * - every historical `promoted-subworkflow` artifact maps to exactly one
 *   ordinary `semantic`-family Workflow Component on the exact compat Kind
 *   `domain-harness.compat.promoted-subworkflow@1.0.0`, whose semanticBody is
 *   the exact historical candidate-envelope material (canonical copy: array
 *   order preserved, object keys sorted) — no privileged runtime magic, and
 *   no behaviorally material historical semantics are dropped or rewritten;
 * - every historical `harness-config` artifact maps to exactly one ordinary
 *   `semantic`-family Component on `domain-harness.compat.harness-config@1.0.0`
 *   carrying its exact historical material;
 * - intra-concern composition becomes exact typed `references` relations: one
 *   relation per (source, target) pair, emitted only when the referenced
 *   compat artifact is bound in the same mapping input (a dangling relation is
 *   never emitted, a stale revision never silently accepted). Historical
 *   references outside the compat concern (tools/rules/knowledge/...) stay
 *   exact historical envelope material — preserved verbatim, never relations,
 *   never dropped;
 * - DecisionResolver source authority is preserved: the frozen ADR-03 source
 *   order (`rule -> exact-cache -> promoted-subworkflow -> harness-machine`)
 *   is the module-owned canonical composition order. Historical decision
 *   declarations map to canonical evidence sorted by that frozen order — the
 *   declaration shape is closed (no priority/order/weight field exists), the
 *   source union is closed (unknown/inferred names fail), and input config
 *   order can never alter the recorded authority. The binding rule is
 *   deterministic and required: `promoted-subworkflow` binds exactly one
 *   exact `promoted-subworkflow` artifact identity, `harness-machine` binds
 *   exactly one exact `harness-config` artifact identity, `rule` /
 *   `exact-cache` bind none — resolution requires full exact identity
 *   equality with the bound artifact (kind + artifactId + optional version +
 *   contentDigest): a missing required binding fails typed, a bound-kind or
 *   version mismatch fails closed exactly like digest drift, and nothing is
 *   ever inferred, normalized, defaulted or chosen by order;
 * - exact historical identity/currentness (kind, artifactId, version,
 *   contentDigest) is preserved verbatim as mapping provenance — historical
 *   identity is never rewritten (strangler, not rewrite).
 *
 * Mapping guarantees (PACK-B):
 * - same input => same graph, same provenance, same standard normalized graph
 *   digest; unordered input permutation (component lists, declarations) is
 *   invariant; explicitly ordered historical sequences (control edges, body
 *   nodes) are preserved exactly;
 * - ambiguous or unrepresentable historical semantics fail typed — duplicate,
 *   conflicting, missing and stale material each get their own closed error
 *   code; there is no closest-match guess and no latest/default/first/
 *   registry-order inference anywhere;
 * - the product is fully caller-isolated (deep canonical copies) and carries
 *   no reverse authority: it is consumable only through the standard v0.7
 *   Component/Definition contracts. The module imports no runtime, executes
 *   no DecisionResolver/XState/Harness path, and accepts no ports.
 *
 * Intentionally excluded (PACK-B boundaries): legacy identity correspondence
 * evidence (T008B), public compatibility (T008C), final v0.6 delta (T008E),
 * and every edit to the runtime `decision-resolver` / promoted-child /
 * workflow-runtime-bridge sources. This module is internal to the compiler
 * package: it is not re-exported through any barrel.
 */
import { type ComponentId, type DefinitionGraphEnvelope, type KindRef } from '@kaicreator/domain-harness/v7';
import type { JsonObject, JsonValue } from '../../raw/types.js';
/** Marker recorded in graph `nonMaterialExtensions` (excluded from identity). */
export declare const COMPAT_ADAPTER_PROVENANCE_MARKER: "domain-harness.compat.harness-config-promoted-subworkflow";
/** Exact historical promoted candidate envelope schema form the mapper accepts. */
export declare const COMPAT_PROMOTED_ENVELOPE_SCHEMA_VERSION: "candidate-envelope-v1";
/** Exact historical promoted child body schema form (relation-derivation surface). */
export declare const COMPAT_PROMOTED_CHILD_BODY_SCHEMA_VERSION: "promoted-child-workflow/v1";
/** Exact versioned KindRef historical promoted subworkflows map to. */
export declare const COMPAT_PROMOTED_SUBWORKFLOW_KIND: KindRef;
/** Exact versioned KindRef historical harness configs map to. */
export declare const COMPAT_HARNESS_CONFIG_KIND: KindRef;
/** Open exact relation kind for intra-concern historical composition. */
export declare const COMPAT_REFERENCES_RELATION_KIND: "references";
/**
 * The frozen historical DecisionResolver source order (ADR-03): rule → exact
 * cache → promoted subworkflow → HarnessMachine. Compatibility mirror only —
 * the authoritative order stays owned by the runtime resolver, which this
 * module never imports or executes. Config material cannot reorder it: mapped
 * decision-source evidence is canonicalized by this exact order.
 */
export declare const COMPAT_DECISION_RESOLVER_SOURCE_ORDER: readonly ["rule", "exact-cache", "promoted-subworkflow", "harness-machine"];
export type CompatDecisionResolverSource = (typeof COMPAT_DECISION_RESOLVER_SOURCE_ORDER)[number];
export type CompatMappingErrorCode = 'INVALID_COMPAT_INPUT' | 'NOT_TRANSLATABLE' | 'DUPLICATE_COMPAT_IDENTITY' | 'CONFLICTING_COMPAT_IDENTITY' | 'MISSING_REFERENCED_COMPAT_ARTIFACT' | 'STALE_COMPAT_IDENTITY' | 'MAPPING_CONTRACT_VIOLATION';
/**
 * Typed fail-closed error for the historical compat mapping. `path` identifies
 * the caller input location; no message ever normalizes or rewrites the
 * offending historical identity.
 */
export declare class CompatHarnessConfigMappingError extends Error {
    readonly code: CompatMappingErrorCode;
    readonly path: string;
    constructor(code: CompatMappingErrorCode, path: string, reason: string, options?: {
        cause?: unknown;
    });
}
/** Exact historical artifact identity (legacy CompiledArtifactIdentity shape). */
export interface CompatHistoricalArtifactIdentity {
    readonly kind: 'promoted-subworkflow' | 'harness-config';
    readonly artifactId: string;
    /** Operator/human lifecycle label; historical material is preserved verbatim. */
    readonly version?: string;
    readonly contentDigest: string;
}
/** One historical promoted-subworkflow artifact: exact identity + envelope material. */
export interface CompatHistoricalPromotedSubworkflow {
    /** Exact historical identity; `kind` must be exactly 'promoted-subworkflow'. */
    readonly identity: CompatHistoricalArtifactIdentity;
    /** Exact historical candidate-envelope material (canonical-copied, never rewritten). */
    readonly envelope: JsonValue;
}
/** One historical harness-config artifact: exact identity + closed material. */
export interface CompatHistoricalHarnessConfig {
    /** Exact historical identity; `kind` must be exactly 'harness-config'. */
    readonly identity: CompatHistoricalArtifactIdentity;
    /** Exact historical harness-config material (canonical-copied, never rewritten). */
    readonly material: JsonValue;
}
/**
 * One historical decision-source declaration: which frozen authoritative
 * DecisionResolver source resolves a decision. Configuration may reference and
 * compose accepted decisions, but the recorded authority is the frozen source
 * identity — never a list position, never an inferred default.
 */
export interface CompatDecisionSourceDeclaration {
    readonly decisionId: string;
    readonly source: CompatDecisionResolverSource;
    /**
     * Exact bound compat artifact (closed identity) — required exactly for the
     * artifact-bearing sources: `promoted-subworkflow` binds exactly one
     * `promoted-subworkflow` identity, `harness-machine` binds exactly one
     * `harness-config` identity; `rule` / `exact-cache` bind none. The declared
     * identity must equal the full exact bound identity (kind + artifactId +
     * optional version + contentDigest): a missing required binding fails
     * typed, a bound-kind or version mismatch fails closed exactly like digest
     * drift — never inferred, normalized, defaulted or chosen by config order.
     */
    readonly artifact?: CompatHistoricalArtifactIdentity;
}
/** Adapter input: historical compat material plus the explicit graph identity. */
export interface CompatMappingInput {
    /** Explicit graph identity — never silently defaulted. */
    readonly graphId: string;
    readonly promotedSubworkflows?: readonly CompatHistoricalPromotedSubworkflow[];
    readonly harnessConfigs?: readonly CompatHistoricalHarnessConfig[];
    readonly decisionSources?: readonly CompatDecisionSourceDeclaration[];
}
/** Canonical decision-source evidence (frozen source order, then decisionId). */
export interface CompatMappedDecisionSource {
    readonly decisionId: string;
    readonly source: CompatDecisionResolverSource;
    /** Exact bound compat artifact; present exactly for the artifact-bearing sources. */
    readonly artifact?: CompatHistoricalArtifactIdentity;
}
/** Provenance record of one mapped Component's exact historical identity. */
export interface CompatComponentProvenance {
    /** Component identity in the mapped graph (the historical artifactId, never rewritten). */
    readonly componentId: ComponentId;
    /** Which historical artifact family the Component was mapped from. */
    readonly historicalKind: 'promoted-subworkflow' | 'harness-config';
    /** Exact historical identity material, deep-copied (never aliased). */
    readonly historicalIdentity: JsonObject;
}
/** Exact historical identity of the whole compat mapping. */
export interface CompatMappingProvenance {
    readonly graphId: string;
    readonly envelopeSchemaVersion: typeof COMPAT_PROMOTED_ENVELOPE_SCHEMA_VERSION;
    readonly components: readonly CompatComponentProvenance[];
    /** Canonical decision-source evidence in frozen resolver source order. */
    readonly decisionSources: readonly CompatMappedDecisionSource[];
}
/** Adapter output: an admitted-shape Component Graph plus mapping evidence. */
export interface CompatMappingResult {
    /** Bound Component Graph; passes `validateDefinitionGraphEnvelope`. */
    readonly graph: DefinitionGraphEnvelope;
    /** Exact historical identity/currentness/decision-source evidence. */
    readonly provenance: CompatMappingProvenance;
}
/**
 * Deterministically map accepted historical harness-config /
 * promoted-subworkflow material to an ordinary v0.7 Component Graph plus
 * exact historical identity/currentness and canonical decision-source
 * evidence. Pure and synchronous: no I/O, no environment access, no ports,
 * no mutation of the caller input, no aliasing of caller-owned material, no
 * runtime/DecisionResolver/XState execution path.
 *
 * The produced graph is validated through the standard
 * `validateDefinitionGraphEnvelope` gate before returning; a violation there
 * is an adapter defect (`MAPPING_CONTRACT_VIOLATION`), never tolerated.
 */
export declare function mapHarnessConfigPromotedSubworkflowToComponentGraph(input: CompatMappingInput): CompatMappingResult;
