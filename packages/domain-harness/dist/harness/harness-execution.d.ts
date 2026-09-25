import type { BehaviorallyRelevantSemanticDependencies, CompiledArtifactIdentity } from '../contracts/domain-data.js';
import { type ObservedDependencySet as SemanticObservedDependencySet, type SemanticCacheWriteIneligibleReason } from '../semantic-cache/exact-semantic-cache.js';
import type { BusinessHarnessInput, BusinessHarnessResult, ObservedDependencySet as HarnessProvenanceDependencySet } from './contract.js';
import { type HarnessExecutionIdentityContext, type HarnessExecutionJournalStore, type HarnessJournalFailureCode, type HarnessOperationEvidence } from './execution-journal.js';
export type HarnessExecutionIntegrationErrorCode = 'INVALID_CAPABILITY_SEMANTIC_IDENTITY' | 'INVALID_HARNESS_PRODUCER_IDENTITY' | 'INVALID_SELECTED_DEPENDENCY_PROVENANCE';
export declare class HarnessExecutionIntegrationError extends Error {
    readonly code: HarnessExecutionIntegrationErrorCode;
    constructor(code: HarnessExecutionIntegrationErrorCode, message: string);
}
export interface HarnessJournalIntegrationContext extends HarnessExecutionIdentityContext {
    readonly journal: HarnessExecutionJournalStore;
}
export interface HarnessExecutionIntegrationOptions {
    readonly input: BusinessHarnessInput;
    readonly execution: HarnessJournalIntegrationContext;
    /** Exact producer identity required by the T-013 Harness cache-write contract. */
    readonly harnessProducerIdentity: CompiledArtifactIdentity;
    /** Selected Fact/CDI semantic identities actually supplied to this Harness invocation. */
    readonly selectedSemanticDependencies?: BehaviorallyRelevantSemanticDependencies;
    /** T-013 pre-read semantic material. It is eligibility input only, never observed provenance. */
    readonly cachePreReadDependencies?: BehaviorallyRelevantSemanticDependencies;
    /** Exact semantic identity for a model-visible query/tool capability, keyed by capabilityId. */
    readonly capabilitySemanticIdentities?: Readonly<Record<string, CompiledArtifactIdentity>>;
}
export type HarnessObservedCacheWriteEligibility = {
    readonly eligible: true;
} | {
    readonly eligible: false;
    readonly reason: SemanticCacheWriteIneligibleReason | 'harness-not-successful';
    readonly identity?: string;
};
export interface HarnessIntegratedObservedDependencySet {
    /** T-007 Fact/CDI/query provenance. Query entries come only from executed or journal-replayed queries. */
    readonly provenance: HarnessProvenanceDependencySet;
    /** Exact T-002/T-013 semantic dependency vocabulary for cache-write handoff. */
    readonly semantic: SemanticObservedDependencySet;
    /** Convenience exact subset of actually used model-visible tool/capability artifacts. */
    readonly toolArtifacts: readonly CompiledArtifactIdentity[];
}
export interface HarnessSemanticCacheWriteHandoff {
    /** Exact `harness-config` producer; T-013 still performs final producer/pre-read checks. */
    readonly producerIdentity: CompiledArtifactIdentity;
    readonly observedDependencies: SemanticObservedDependencySet;
    readonly dependencyEligibility: HarnessObservedCacheWriteEligibility;
}
export interface HarnessJournalFailureEvidence {
    readonly code: HarnessJournalFailureCode;
    readonly message: string;
    readonly operationKind: 'ai' | 'query';
    readonly operationOrdinal: number;
}
export interface JournaledHarnessExecutionResult {
    readonly harnessResult: BusinessHarnessResult;
    readonly observedDependencies: HarnessIntegratedObservedDependencySet;
    /** Dependency-only T-013 handoff. T-013 producer checks still run before any actual cache write. */
    readonly cacheWriteEligibility: HarnessObservedCacheWriteEligibility;
    /** Exact producer + observed dependency material for T-013 final cache-write preparation. */
    readonly cacheWriteHandoff: HarnessSemanticCacheWriteHandoff;
    readonly journalEvidence: readonly HarnessOperationEvidence[];
    readonly journalFailure?: HarnessJournalFailureEvidence;
}
export interface JournaledHarnessExecutionIntegration {
    /** Pass this exact input to the existing bounded HarnessMachine child. */
    readonly input: BusinessHarnessInput;
    /** Call exactly once after HarnessMachine reaches a terminal output. */
    complete(result: BusinessHarnessResult): JournaledHarnessExecutionResult;
}
/**
 * Integrate durable AI/query execution facts around one existing HarnessMachine
 * invocation without creating a second workflow/runtime authority.
 */
export declare function createJournaledHarnessExecutionIntegration(options: HarnessExecutionIntegrationOptions): JournaledHarnessExecutionIntegration;
//# sourceMappingURL=harness-execution.d.ts.map