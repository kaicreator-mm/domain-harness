import { type AdmissionDecisionSchema, type AdmissionTurnSource } from '../admission/index.js';
import type { CompiledArtifactIdentity, BehaviorallyRelevantSemanticDependencies } from '../contracts/domain-data.js';
import type { JsonObject, JsonValue } from '../contracts/json.js';
import { type DecisionResolverInvocation, type DecisionResolverPorts, type ResolvedDecision } from '../decision-resolver/contracts.js';
import type { HarnessExecutionJournalStore } from '../harness/execution-journal.js';
import type { BusinessHarnessInput } from '../harness/contract.js';
import type { PromotedChildQueryExecutorPort } from '../promoted-child/runtime.js';
import type { CompiledSemanticDecisionDescriptor } from '../v2/contracts/semantic-decision.js';
import type { ExpressionExecutorPort } from '../v2/contracts/host.js';
import type { GovernanceExecutionPin } from '../governance/execution-binding.js';
import type { DomainWorkflowDefinition, DomainWorkflowTrigger } from '../workflow/contract.js';
import type { DomainPredicateEvent } from '../workflow/predicate.js';
import type { WorkflowAddress } from '../v2/contracts/workflow.js';
/**
 * v0.6 T004 (issue #523, frozen L2 C2): the bounded runtime binding from a
 * compiled T001 semantic-decision declaration onto the EXISTING
 * `DecisionResolverInvocation` / `resolveDecision()` path.
 *
 * This module is an adapter, not an authority: it owns no resolution order,
 * no schema vocabulary, no registry and no mutation path. Every bound field
 * is consumed from the compiled declaration through existing repository
 * authorities —
 *
 *   decisionId                → declaration.decisionId (stable identity)
 *   inputSelection            → existing runtime ExpressionExecutorPort
 *   structured result schema  → existing DOMAIN_HARNESS_JSON_SCHEMA_V1
 *                               validator; ONE predicate shared by resolver
 *                               validation and admission schema validation
 *   outcome/event vocabulary  → declaration.allowedOutcomes/allowedEventTypes
 *                               (bound onto the Harness input)
 *   query-only capabilities   → declaration.queryCapabilityIds (fail closed
 *                               on any other/mutating capability binding)
 *   dependency/currentness    → declaration.dependencyMaterial through the
 *                               existing semantic-cache required-projection /
 *                               revision-source seams
 *   cache policy              → declaration.cachePolicy (frozen vocabulary)
 *   promoted reference        → existing PromotedChildSelector vocabulary
 *   bounded Harness policy    → declaration.policy.maxSteps
 *   semanticContractDigest    → declaration.declarationDigest (exact
 *                               declaration content identity)
 *
 * The resolver stays the proposal authority only: this adapter returns the
 * invocation (plus the shared schema predicate) as data. Publication,
 * admission, and effects stay with the existing Runtime / Central Admission /
 * Effect Tool authorities.
 */
/** Existing resolver ports handed through per turn; the runtime never constructs a second resolver. */
export type RuntimeDecisionResolverPorts<TResult extends JsonValue = JsonValue> = DecisionResolverPorts<TResult>;
/**
 * Host-owned Harness execution material for one decision turn. The
 * declaration-derived vocabulary (`allowedDecisionOutcomes`,
 * `allowedEventTypes`, `maxSteps`) is deliberately absent: the runtime binds
 * it from the compiled declaration and the host cannot override it. The model
 * port stays AI Runtime / host authority; this adapter never routes providers
 * or models.
 */
export interface RuntimeHarnessDecisionTurnMaterial {
    readonly input: Omit<BusinessHarnessInput, 'allowedDecisionOutcomes' | 'allowedEventTypes' | 'maxSteps'>;
    readonly journal: HarnessExecutionJournalStore;
    /** Exact harness-config producer identity (T-016 producer rule). */
    readonly harnessProducerIdentity: CompiledArtifactIdentity;
    readonly capabilitySemanticIdentities?: Readonly<Record<string, CompiledArtifactIdentity>>;
    readonly selectedSemanticDependencies?: BehaviorallyRelevantSemanticDependencies;
}
/** Host-owned promoted-child execution material for one decision turn. */
export interface RuntimePromotedDecisionTurnMaterial {
    readonly executor: PromotedChildQueryExecutorPort;
    readonly journal: HarnessExecutionJournalStore;
    /** Child input; defaults to the invocation selectedInput (existing resolver behavior). */
    readonly input?: JsonValue;
}
/**
 * One semantic-decision turn presented to the v3 runtime. Everything except
 * the decision binding is exactly the existing `CentralAdmissionRequest`
 * material; `resolved` and `decisionSchema` are deliberately absent because
 * both are produced inside the runtime: `resolved` by the existing resolver,
 * `decisionSchema` from the declaration's compiled result schema.
 */
export interface ResolveAndAdmitTurnRequest<TResult extends JsonValue = JsonValue> {
    /** Stable decision identity of a compiled declaration in the pinned package. */
    readonly decisionId: string;
    readonly target: WorkflowAddress;
    readonly turn: AdmissionTurnSource;
    /** Engine-neutral trigger the host turn loop matched for this turn. */
    readonly trigger: DomainWorkflowTrigger;
    /** T-014 durable GovernanceExecutionPin lookup key for this instance. */
    readonly workflowInstanceId: string;
    readonly definition: DomainWorkflowDefinition;
    readonly currentStateKey: string;
    readonly context: JsonObject;
    readonly event: DomainPredicateEvent;
    readonly now: string;
    /** Existing resolver ports (rule / exact cache / promoted / HarnessMachine). */
    readonly resolver: RuntimeDecisionResolverPorts<TResult>;
    /**
     * Pre-read behaviorally relevant dependency material (existing T-002
     * vocabulary; host-observed projections/revisions/producer artifacts).
     * Declared required revision sources without a pre-read revision keep the
     * existing deterministic cache-bypass currentness semantics.
     */
    readonly dependencies?: BehaviorallyRelevantSemanticDependencies;
    /** Required when the declaration declares a promoted reference. */
    readonly promoted?: RuntimePromotedDecisionTurnMaterial;
    /** Required to reach the HarnessMachine fallback stage. */
    readonly harness?: RuntimeHarnessDecisionTurnMaterial;
    /** Invoking-context artifact material for promoted compatibility (existing promoted-child vocabulary). */
    readonly invokingArtifacts?: readonly CompiledArtifactIdentity[];
    /** Applicability facts for the promoted stage (existing promoted-child vocabulary). */
    readonly applicabilityFacts?: readonly CompiledArtifactIdentity[];
    readonly signal?: AbortSignal;
}
export interface SemanticDecisionRuntimeAuthority {
    /** The compiled declaration resolved by stable identity from the admission-validated pinned package. */
    readonly declaration: CompiledSemanticDecisionDescriptor;
    /** Exact durable pin of the invoking instance (T-014). */
    readonly governancePin: GovernanceExecutionPin;
    /** Exact semantic-cache namespace (tenant scope when supplied, else the pinned domainId). */
    readonly namespace: string;
    /** The ONE existing runtime expression authority (host-injected port). */
    readonly expression: ExpressionExecutorPort;
}
export interface SemanticDecisionRuntimeBinding<TResult extends JsonValue = JsonValue> {
    readonly invocation: DecisionResolverInvocation<TResult>;
    /**
     * The ONE schema authority built from the declaration's compiled
     * resultSchema. The exact same predicate validates fresh resolver results
     * (`currentSchema`) and admitted decisions (`decisionSchema`), so no second
     * schema authority can diverge between resolver and admission.
     */
    readonly decisionSchema: AdmissionDecisionSchema;
}
/**
 * Bind one compiled semantic-decision declaration + exact pinned authority
 * onto the existing resolver invocation. Fails closed — before any resolver
 * or admission work — with the stable T004 runtime error codes when the
 * declaration material cannot be bound exactly.
 */
export declare function bindSemanticDecisionTurn<TResult extends JsonValue = JsonValue>(request: ResolveAndAdmitTurnRequest<TResult>, authority: SemanticDecisionRuntimeAuthority): Promise<SemanticDecisionRuntimeBinding<TResult>>;
/**
 * v0.6 T005 (issue #540, frozen L2 C3): the declared semantic-unavailable
 * disposition applied at the T004 seam.
 *
 * When the existing resolver exhausted every deterministic source and reached
 * the HarnessMachine stage with unusable model material — exactly its existing
 * `DECISION_RESOLVER_HARNESS_UNCONFIGURED` availability signal — the compiled
 * declaration's `unavailable` disposition decides what happens. The
 * disposition is read ONLY from the compiled declaration; a host cannot
 * inject or override it. No provider health check, retry, routing or
 * undeclared fallback exists.
 *
 *   fail-closed    → `{ kind: 'fail-closed' }`: the caller raises the typed
 *                    `RUNTIME_V3_SEMANTIC_INTELLIGENCE_UNAVAILABLE` terminal
 *                    (L2 §7 SEMANTIC_INTELLIGENCE_UNAVAILABLE meaning: no
 *                    fabricated answer, no mutation).
 *   declared-event → `{ kind: 'declared-event', resolution }`: the declared
 *                    outcome/eventType materialized as resolver-shaped DATA
 *                    (source `declared-unavailable`, zero model calls) for the
 *                    SAME Central Admission path — guards, hard invariants and
 *                    the shared schema gate still apply, and an admission
 *                    denial of it is final.
 *
 * Any other error (and, defensively, a declaration with no disposition
 * material) is `not-applicable`: the original failure surfaces exactly as
 * T004 left it.
 */
export type DeclaredSemanticUnavailableOutcome<TResult extends JsonValue = JsonValue> = {
    readonly kind: 'not-applicable';
} | {
    readonly kind: 'fail-closed';
    readonly reason: string;
} | {
    readonly kind: 'declared-event';
    readonly resolution: ResolvedDecision<TResult>;
};
export declare function declaredSemanticUnavailableOutcome<TResult extends JsonValue = JsonValue>(declaration: CompiledSemanticDecisionDescriptor, error: unknown): DeclaredSemanticUnavailableOutcome<TResult>;
//# sourceMappingURL=decision-resolver-binding.d.ts.map