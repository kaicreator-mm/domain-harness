import type { JsonValue } from './json.js';
import { type ContentDigest, type Sha256Port } from './identity.js';
export declare const COMPILED_ARTIFACT_KINDS: readonly ["rule", "knowledge", "skill", "tool", "output-schema", "workflow", "promoted-subworkflow", "harness-config"];
export type CompiledArtifactKind = (typeof COMPILED_ARTIFACT_KINDS)[number];
export interface CompiledArtifactIdentity {
    readonly kind: CompiledArtifactKind;
    readonly artifactId: string;
    readonly version?: string;
    readonly contentDigest: ContentDigest;
}
export interface CompiledArtifactDescriptor {
    readonly kind: CompiledArtifactKind;
    readonly artifactId: string;
    readonly version?: string;
    /** Behaviorally relevant semantic material only; audit/provenance stays outside this body. */
    readonly semanticMaterial: JsonValue;
}
export type SemanticContextSource = 'input' | 'domain-facts' | 'workflow-context';
export type SemanticPathSegment = string | number;
export interface SemanticContextSelector {
    readonly path: readonly SemanticPathSegment[];
}
export interface SemanticContextProjectionDefinition {
    readonly projectionId: string;
    readonly source: SemanticContextSource;
    readonly selectors: readonly SemanticContextSelector[];
}
export interface SemanticContextProjectionDescriptor extends SemanticContextProjectionDefinition {
    readonly descriptorDigest: ContentDigest;
}
export interface ResolvedSemanticContextProjection {
    readonly projectionId: string;
    readonly source: SemanticContextSource;
    readonly descriptorDigest: ContentDigest;
    readonly valueDigest: ContentDigest;
}
export interface DomainIntelligencePackageDescriptor {
    readonly domainId: string;
    /** Operator/human lifecycle label; not semantic identity. */
    readonly version: string;
    /** Exact target-compiled package execution pin; kept separate from semantic equivalence. */
    readonly packageId: string;
    readonly formatVersion: string;
    readonly runtimeContractMajor: number;
    readonly executionEngineMajor: number;
    readonly requiredCapabilities: readonly string[];
    readonly artifacts: readonly CompiledArtifactIdentity[];
    readonly semanticContextProjections: readonly SemanticContextProjectionDescriptor[];
}
export interface DomainIntelligencePackageIdentity {
    readonly domainId: string;
    readonly version: string;
    readonly packageId: string;
    readonly contentDigest: ContentDigest;
    readonly formatVersion: string;
    readonly runtimeContractMajor: number;
    readonly executionEngineMajor: number;
    readonly requiredCapabilities: readonly string[];
}
export interface SemanticRevisionRequest {
    /** Stable logical identity for the live/read-only semantic source. */
    readonly sourceId: string;
    /** Optional deterministic scope used only to ask for the revision token. */
    readonly scope?: JsonValue;
}
export interface SemanticRevisionIdentity {
    readonly sourceId: string;
    /** Version/freshness token only; never the business observation itself. */
    readonly revision: string;
}
export interface SemanticRevisionPort {
    resolveRevision(request: SemanticRevisionRequest): Promise<SemanticRevisionIdentity | undefined>;
}
export interface BehaviorallyRelevantSemanticDependencies {
    readonly artifacts?: readonly CompiledArtifactIdentity[];
    readonly projections?: readonly ResolvedSemanticContextProjection[];
    readonly revisions?: readonly SemanticRevisionIdentity[];
}
export type DomainDataContractErrorCode = 'INVALID_DOMAIN_DATA_IDENTITY' | 'INVALID_SEMANTIC_PROJECTION' | 'MISSING_SEMANTIC_INPUT' | 'INVALID_SEMANTIC_REVISION' | 'MISSING_SEMANTIC_REVISION';
export declare class DomainDataContractError extends Error {
    readonly code: DomainDataContractErrorCode;
    constructor(code: DomainDataContractErrorCode, message: string);
}
export declare function compileCompiledArtifactIdentity(descriptor: CompiledArtifactDescriptor, sha256: Sha256Port): Promise<CompiledArtifactIdentity>;
export declare function compileSemanticContextProjectionDescriptor(definition: SemanticContextProjectionDefinition, sha256: Sha256Port): Promise<SemanticContextProjectionDescriptor>;
export declare function resolveSemanticContextProjection(descriptor: SemanticContextProjectionDescriptor, sourceValue: unknown, sha256: Sha256Port): Promise<ResolvedSemanticContextProjection>;
export declare function compileDomainIntelligencePackageIdentity(descriptor: DomainIntelligencePackageDescriptor, sha256: Sha256Port): Promise<DomainIntelligencePackageIdentity>;
export declare function requireSemanticRevision(request: SemanticRevisionRequest, port: SemanticRevisionPort): Promise<SemanticRevisionIdentity>;
export declare function computeBehaviorallyRelevantDependencyDigest(dependencies: BehaviorallyRelevantSemanticDependencies, sha256: Sha256Port): Promise<ContentDigest>;
//# sourceMappingURL=domain-data.d.ts.map