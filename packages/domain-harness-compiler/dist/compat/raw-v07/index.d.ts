/**
 * T008A — Raw authoring -> Component Graph strangler adapter (PACK-A #589,
 * thin issue #619).
 *
 * `COMPATIBILITY` boundary module (R2 MICROKERNEL_BOUNDARY): Raw authoring
 * material is evidence-input consumed from the existing compiler Raw modules;
 * it is NOT a v0.7 ontology root and never becomes runtime truth. Accepted Raw
 * is mapped deterministically onto the frozen v0.7 Definition contracts:
 *
 * - every Raw Tool becomes one `tool`-family Component whose body is exactly
 *   one `ToolOperationsDeclaration` (single `execute` operation — Raw Tools
 *   have no finer operation granularity, and none is invented);
 * - every Raw Workflow / Skill / Projection becomes one `semantic`-family
 *   Component carrying its behaviorally material Raw body as canonical JSON;
 * - tool/skill invokes become exact `invokes` relations (one per
 *   (workflow, target, kind) triple — repeated invokes never duplicate);
 * - `LogicalToolBindingConfig.resourceKey` becomes a T005A-shape logical
 *   resource requirement declaration (logical key only; endpoints,
 *   credentials and handles stay structurally unrepresentable);
 * - exact historical logical identity/provenance (ids, executionKind,
 *   bindingCapability, closed config, sourcePath, schemaVersion) is recorded
 *   verbatim in the mapping provenance and in non-material graph extensions —
 *   historical identity is never rewritten (strangler, not rewrite).
 *
 * Mapping guarantees (PACK-A):
 * - same Raw + same rules => same graph semantic digest (canonical copy sorts
 *   object keys recursively and preserves Raw array order; the produced graph
 *   is validated by the standard `validateDefinitionGraphEnvelope` gate);
 * - ambiguous or unrepresentable semantics fail typed with
 *   `NOT_TRANSLATABLE` — never a closest-match guess, never silent dropping;
 * - the produced graph is fully caller-isolated (deep canonical copies; no
 *   caller alias survives mapping), so post-mapping caller mutation cannot
 *   perturb the product;
 * - the product carries no reverse Raw authority: it is consumable only
 *   through the standard v0.7 Component/Definition contracts (envelope
 *   validation, must-understand admission, graph digest).
 *
 * Intentionally excluded (PACK-A boundaries): public compatibility promises
 * (T008C), harness-config/promoted-subworkflow special mapping (T008D), final
 * v0.6 delta (T008E). This module is internal to the compiler package: it is
 * not re-exported through any barrel.
 */
import { type ComponentId, type DefinitionGraphEnvelope, type KindRef } from '@kaicreator/domain-harness/v7';
import type { JsonObject, LoadedRawDomainPackage, RawProjectionDefinition, RawToolDefinition } from '../../raw/types.js';
/** The only Raw authoring schema form the adapter accepts. */
export declare const RAW_V07_SUPPORTED_SCHEMA_VERSION: "0.1";
/** Exact versioned KindRef the adapter binds Raw Tools to (open Kind contract). */
export declare const RAW_V07_TOOL_KIND: KindRef;
/** Exact versioned KindRef the adapter binds Raw Workflows to. */
export declare const RAW_V07_WORKFLOW_KIND: KindRef;
/** Exact versioned KindRef the adapter binds Raw Skills to. */
export declare const RAW_V07_SKILL_KIND: KindRef;
/** Exact versioned KindRef the adapter binds Raw Projections to. */
export declare const RAW_V07_PROJECTION_KIND: KindRef;
/** Open exact relation kind used for tool/skill invokes from a workflow. */
export declare const RAW_V07_INVOKES_RELATION_KIND: "invokes";
/**
 * Raw Tools declare exactly one execution surface, so the mapped operation
 * identity is this fixed exact identity — never derived from target material.
 */
export declare const RAW_V07_EXECUTE_OPERATION_ID: "execute";
/** Marker recorded in graph `nonMaterialExtensions` (excluded from identity). */
export declare const RAW_V07_ADAPTER_PROVENANCE_MARKER: "domain-harness.raw-v07-adapter";
export type RawV07AdapterErrorCode = 'UNSUPPORTED_RAW_SCHEMA_VERSION' | 'NOT_TRANSLATABLE' | 'INVALID_RAW_AUTHORING' | 'MAPPING_CONTRACT_VIOLATION';
/**
 * Typed fail-closed error for the Raw->Component Graph mapping. `path`
 * identifies the caller Raw location; no message ever normalizes or rewrites
 * the offending identity.
 */
export declare class RawV07AdapterError extends Error {
    readonly code: RawV07AdapterErrorCode;
    readonly path: string;
    constructor(code: RawV07AdapterErrorCode, path: string, reason: string, options?: {
        cause?: unknown;
    });
}
/** Accepted adapter input: authoring evidence only — no target/binding plane. */
export interface RawV07AuthoringInput {
    readonly raw: LoadedRawDomainPackage;
    readonly tools?: readonly RawToolDefinition[];
    readonly projections?: readonly RawProjectionDefinition[];
}
/** Provenance record of one mapped Component's exact historical identity. */
export interface RawV07ComponentProvenance {
    /** Component identity in the mapped graph (never rewritten). */
    readonly componentId: ComponentId;
    /** Which Raw family the Component was mapped from. */
    readonly sourceKind: 'workflow' | 'skill' | 'tool' | 'projection';
    /** Exact historical Raw identity material, deep-copied (never aliased). */
    readonly historicalIdentity: JsonObject;
}
/** Exact historical identity of the whole mapped Raw Domain Package. */
export interface RawV07MappingProvenance {
    readonly schemaVersion: '0.1';
    readonly domainId: string;
    readonly sourceRoot: string;
    readonly components: readonly RawV07ComponentProvenance[];
}
/** T005A-shape logical resource requirement (closed field set). */
export interface RawV07ResourceRequirement {
    readonly resourceKey: string;
    readonly required: boolean;
}
/**
 * T005A-shape logical resource requirement declaration keyed to exactly one
 * Tool Component. Structurally identical to the core
 * `ToolResourceRequirementsDeclaration`; consumers validate it through the
 * core contract.
 */
export interface RawV07ToolResourceDeclaration {
    readonly componentId: ComponentId;
    readonly requirements: readonly RawV07ResourceRequirement[];
}
/** Adapter output: an admitted-shape Component Graph plus mapping evidence. */
export interface RawV07GraphMappingResult {
    /** Bound Component Graph; passes `validateDefinitionGraphEnvelope`. */
    readonly graph: DefinitionGraphEnvelope;
    /** T005A-shape logical resource declarations for tools declaring resourceKey. */
    readonly resourceDeclarations: readonly RawV07ToolResourceDeclaration[];
    /** Exact historical identity/provenance evidence (mapping record). */
    readonly provenance: RawV07MappingProvenance;
}
/**
 * Deterministically map accepted Raw authoring material to a v0.7 Component
 * Graph plus T005A-shape logical resource declarations and exact historical
 * provenance. Pure and synchronous: no I/O, no environment access, no
 * mutation of the caller input, no aliasing of caller-owned material.
 *
 * The produced graph is validated through the standard
 * `validateDefinitionGraphEnvelope` gate before returning; a violation there
 * is an adapter defect (`MAPPING_CONTRACT_VIOLATION`), never tolerated.
 */
export declare function mapRawV07AuthoringToComponentGraph(input: RawV07AuthoringInput): RawV07GraphMappingResult;
