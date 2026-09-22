import type { CandidateEnvelope, CandidateExactReference } from '../candidate/contracts.js';
import type { CompiledArtifactIdentity } from '../contracts/domain-data.js';
import type { ContentDigest } from '../contracts/identity.js';
import type { JsonValue } from '../contracts/json.js';
import type { GovernanceBaselineIdentity } from '../governance/contracts.js';
import type { PromotedArtifactBody, PromotedArtifactIdentity, PromotedArtifactPromotionRecord, PromotedArtifactRetentionReference, PromotedArtifactSelection, SelectedPromotedArtifact } from '../promoted-artifact/contracts.js';
import type { WorkflowAddress } from '../v2/contracts/workflow.js';
import type { DomainWorkflowDefinition } from '../workflow/contract.js';
export declare const PROMOTED_CHILD_BODY_SCHEMA_VERSION: "promoted-child-workflow/v1";
/** Governance lifecycle `version` stays metadata; the semantic baseline digest is exact authority. */
export type PromotedChildGovernanceIdentity = Omit<GovernanceBaselineIdentity, 'version'>;
/**
 * Invoking workflow instance's pinned runtime context. Compatibility/applicability
 * is evaluated against THIS pinned context, never the globally active package.
 */
export interface PromotedChildInvokingContext {
    readonly target: WorkflowAddress;
    readonly packageId: string;
    readonly domainIntelligenceContentDigest: ContentDigest;
    readonly governanceBaseline: PromotedChildGovernanceIdentity;
    /** Exact artifact identities available from the invoking pinned package. */
    readonly availableArtifacts: readonly CompiledArtifactIdentity[];
    /** Exact applicability facts declared for the current decision invocation. */
    readonly applicabilityFacts: readonly CompiledArtifactIdentity[];
}
/** Resolve-once selector. The runtime never resolves a selector a second time. */
export type PromotedChildSelector = {
    readonly kind: 'exact-digest';
    readonly artifact: PromotedArtifactIdentity;
} | {
    readonly kind: 'version';
    readonly artifactId: string;
    readonly version: string;
} | {
    readonly kind: 'alias';
    readonly artifactId: string;
    readonly alias: string;
    readonly expectedRevision?: number;
};
/** The single resolution object reused by identity/compatibility/pin/compile/telemetry. */
export interface ResolvedPromotedChild {
    readonly selection: PromotedArtifactSelection;
    readonly body: PromotedArtifactBody;
    readonly promotion: PromotedArtifactPromotionRecord;
}
/**
 * Narrow T-012 seam consumed by T-017. T-012 remains the sole owner of registry
 * storage/lifecycle; fresh selection is revocation-blocked while exact recovery
 * stays resolvable per frozen L2 §14.4.
 */
export interface PromotedChildArtifactPort {
    resolveExact(artifact: PromotedArtifactIdentity, expectedAuthority: PromotedChildExpectedAuthority): Promise<SelectedPromotedArtifact>;
    selectVersion(artifactId: string, version: string, expectedAuthority: PromotedChildExpectedAuthority): Promise<SelectedPromotedArtifact>;
    selectAlias(artifactId: string, alias: string, expectedRevision: number | undefined, expectedAuthority: PromotedChildExpectedAuthority): Promise<SelectedPromotedArtifact>;
    /** Exact-pinned recovery load. Revoked artifacts remain resolvable here only. */
    recoverExact(artifact: PromotedArtifactIdentity, expectedAuthority: PromotedChildExpectedAuthority): Promise<SelectedPromotedArtifact>;
    putRetention(reference: PromotedArtifactRetentionReference): Promise<void>;
    /** Exact-reference release. Idempotent for an already-absent reference; stale mismatches fail closed. */
    releaseRetention(expected: PromotedArtifactRetentionReference): Promise<void>;
}
export interface PromotedChildExpectedAuthority {
    readonly domainId: string;
    readonly packageId: string;
    readonly domainIntelligenceContentDigest: ContentDigest;
    readonly governanceBaseline: PromotedChildGovernanceIdentity;
}
/** Logical invocation slot. Insert-once; never reallocated silently. */
export interface DynamicChildInvocationSlot {
    readonly target: WorkflowAddress;
    readonly parentActorId: string;
    readonly childActorId: string;
    readonly invocationOrdinal: number;
}
/**
 * Durable execution-definition pin (frozen L2 §14.2). The durable home is the
 * per-instance DurableExecutionStore durability domain; the pin is first-class,
 * not metadata hidden inside a snapshot blob.
 */
export interface DynamicChildExecutionPin {
    readonly slot: DynamicChildInvocationSlot;
    readonly invokingPackageId: string;
    /** Invoking instance's pinned package/CDI/Governance context, preserved exactly. */
    readonly invokingAuthority: PromotedChildExpectedAuthority;
    readonly artifact: PromotedArtifactIdentity;
    readonly pinnedAt: string;
}
export type InsertDynamicChildPinResult = 'inserted' | 'existing' | 'conflict';
export interface DynamicChildPinStore {
    get(slotKey: string): Promise<DynamicChildExecutionPin | undefined>;
    /** Atomic insert-once. Identical replay is idempotent; conflict never overwrites. */
    insertOnce(slotKey: string, pin: DynamicChildExecutionPin): Promise<InsertDynamicChildPinResult>;
}
/** Declarative value binding. No arbitrary code, no callbacks, no eval. */
export type PromotedChildValueSource = {
    readonly kind: 'literal';
    readonly value: JsonValue;
} | {
    readonly kind: 'input';
    readonly path: string;
} | {
    readonly kind: 'step-output';
    readonly node: string;
    readonly path: string;
};
export interface PromotedChildQueryStep {
    readonly kind: 'query';
    /** Must be an exact allowlisted `tools` entry of the Candidate envelope. */
    readonly tool: CandidateExactReference;
    readonly input: PromotedChildValueSource;
}
export interface PromotedChildEmitEventStep {
    readonly kind: 'emit-event';
    /** Must be declared in the Candidate envelope `events` allowlist. */
    readonly eventType: string;
    readonly payload?: PromotedChildValueSource;
}
export interface PromotedChildEffectIntentStep {
    readonly kind: 'effect-intent';
    /** Must be declared in the envelope `mutation.effects` allowlist. */
    readonly effect: CandidateExactReference;
    readonly input: PromotedChildValueSource;
    readonly idempotencyKey?: string;
}
export interface PromotedChildTerminalStep {
    readonly kind: 'terminal-output';
    readonly output: PromotedChildValueSource;
}
/** Frozen L2 §11.6: reasoned steps MAY exist later; v0.3 T-017 fails them closed. */
export interface PromotedChildReasonedStep {
    readonly kind: 'reasoned';
    readonly harnessConfig: CandidateExactReference;
}
export type PromotedChildStep = PromotedChildQueryStep | PromotedChildEmitEventStep | PromotedChildEffectIntentStep | PromotedChildTerminalStep | PromotedChildReasonedStep;
export interface PromotedChildNode {
    readonly node: string;
    readonly step: PromotedChildStep;
}
export interface PromotedChildWorkflowBody {
    readonly schemaVersion: typeof PROMOTED_CHILD_BODY_SCHEMA_VERSION;
    readonly nodes: readonly PromotedChildNode[];
}
export interface CompiledPromotedChildStep {
    readonly node: string;
    readonly step: PromotedChildStep;
    readonly operationOrdinal: number;
}
export interface CompiledPromotedChild {
    readonly artifact: PromotedArtifactIdentity;
    /** Public engine-neutral control-flow contract; runs under the selected engine. */
    readonly definition: DomainWorkflowDefinition;
    /** Deterministic topological step plan; journaled-operation binding order. */
    readonly steps: readonly CompiledPromotedChildStep[];
    readonly maxSteps: number;
    readonly declaredEvents: readonly string[];
    readonly envelope: CandidateEnvelope;
}
export interface PromotedChildEffectIntentData {
    readonly effect: CandidateExactReference;
    readonly input: JsonValue;
    readonly idempotencyKey?: string;
}
export interface PromotedChildEmittedEvent {
    readonly eventType: string;
    readonly payload?: JsonValue;
}
export interface PromotedChildTerminalResult {
    readonly artifact: PromotedArtifactIdentity;
    readonly pin: DynamicChildExecutionPin;
    readonly output: JsonValue;
    readonly emittedEvents: readonly PromotedChildEmittedEvent[];
    /** Data only. Mutation admission/execution remains the parent durable effect authority. */
    readonly effectIntents: readonly PromotedChildEffectIntentData[];
}
export type DynamicChildExecutionErrorCode = 'DYNAMIC_CHILD_SELECTION_INVALID' | 'DYNAMIC_CHILD_INCOMPATIBLE' | 'DYNAMIC_CHILD_NOT_APPLICABLE' | 'DYNAMIC_CHILD_PACKAGE_MISMATCH' | 'DYNAMIC_CHILD_GOVERNANCE_MISMATCH' | 'DYNAMIC_CHILD_PIN_MISSING' | 'DYNAMIC_CHILD_DEFINITION_CONFLICT' | 'DYNAMIC_CHILD_BODY_MISSING' | 'DYNAMIC_CHILD_DIGEST_MISMATCH' | 'DYNAMIC_CHILD_BODY_INVALID' | 'DYNAMIC_CHILD_COMPILE_INVALID' | 'DYNAMIC_CHILD_CYCLE_FORBIDDEN' | 'DYNAMIC_CHILD_BOUND_EXCEEDED' | 'DYNAMIC_CHILD_REASONED_STEP_UNSUPPORTED' | 'DYNAMIC_CHILD_MUTATION_BINDING_FORBIDDEN' | 'DYNAMIC_CHILD_EVENT_NOT_ALLOWED' | 'DYNAMIC_CHILD_EFFECT_NOT_ALLOWED' | 'DYNAMIC_CHILD_WORK_BEFORE_PIN' | 'DYNAMIC_CHILD_RETENTION_FAILED' | 'DYNAMIC_CHILD_VALUE_RESOLUTION_FAILED' | 'DYNAMIC_CHILD_JOURNAL_FAILURE';
export declare class DynamicChildExecutionError extends Error {
    readonly code: DynamicChildExecutionErrorCode;
    readonly cause?: unknown;
    constructor(code: DynamicChildExecutionErrorCode, message: string, cause?: unknown);
}
/** Fallthrough-eligible fresh-selection outcomes per frozen policy (T-018 consumes). */
export declare const FALLTHROUGH_ELIGIBLE_CODES: readonly DynamicChildExecutionErrorCode[];
//# sourceMappingURL=contracts.d.ts.map