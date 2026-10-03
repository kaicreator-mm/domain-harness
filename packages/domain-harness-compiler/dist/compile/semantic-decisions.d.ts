import type { CompiledSemanticDecisionDescriptor } from '@kaicreator/domain-harness/v2';
import type { LoadedRawDomainPackage, RawProjectionDefinition, RawToolDefinition } from '../raw/types.js';
import type { BusinessSourceCompileEntry } from '../package/business-sources.js';
export declare class SemanticDecisionCompileError extends Error {
    readonly issues: readonly string[];
    constructor(issues: readonly string[]);
}
/**
 * v0.6 T001 (issue #497, frozen L2 A2/A7): compile authoring-form Semantic
 * Decision Declarations into the portable first-class compiled descriptors.
 *
 * All external references resolve exclusively through existing authority:
 * - `queryCapabilities` must be compiled Tools with pure read semantics
 *   (`effect: 'none'`); mutation/effect exposure to semantic reasoning is a
 *   compile failure, never a downgrade;
 * - `requiredProjections` / `requiredRevisionSources` must reference the
 *   package's declared projections / Business Sources (existing resolver
 *   currentness vocabulary);
 * - the structured result schema is normalized under the existing
 *   DOMAIN_HARNESS_JSON_SCHEMA_V1 schema contract machinery.
 *
 * The compiled descriptor is canonical: arrays sorted and deduplicated,
 * cache policy always materialized, and `declarationDigest` carried as
 * content identity for the existing resolver/cache/promotion machinery.
 */
export declare function compileSemanticDecisions(input: {
    raw: LoadedRawDomainPackage;
    tools: readonly RawToolDefinition[];
    projections: readonly RawProjectionDefinition[];
    businessSources: readonly BusinessSourceCompileEntry[];
}): CompiledSemanticDecisionDescriptor[];
