import { deriveDurableControlTurnId, type AdmissionDecisionSchema, type AdmissionTurnSource } from '../admission/index.js';
import type { CompiledArtifactIdentity, BehaviorallyRelevantSemanticDependencies } from '../contracts/domain-data.js';
import type { JsonObject, JsonSchema, JsonValue } from '../contracts/json.js';
import {
  DecisionResolverError,
  type DecisionResolverHarnessConfig,
  type DecisionResolverInvocation,
  type DecisionResolverPorts,
  type DecisionResolverPromotedConfig,
  type ResolvedDecision,
} from '../decision-resolver/contracts.js';
import type { HarnessExecutionJournalStore } from '../harness/execution-journal.js';
import type { BusinessHarnessInput } from '../harness/contract.js';
import type { PromotedChildInvokingContext, PromotedChildSelector } from '../promoted-child/contracts.js';
import type { PromotedChildQueryExecutorPort } from '../promoted-child/runtime.js';
import type {
  SemanticCacheBypassReason,
  SemanticCacheCurrentSchema,
} from '../semantic-cache/exact-semantic-cache.js';
import { DomainHarnessJsonSchemaV1Validator } from '../schema/domainharness-json-schema-v1.js';
import type {
  CompiledSemanticDecisionDescriptor,
  SemanticDecisionCachePolicy,
  SemanticDecisionUnavailableDisposition,
} from '../v2/contracts/semantic-decision.js';
import type { ExpressionExecutorPort } from '../v2/contracts/host.js';
import type { GovernanceExecutionPin } from '../governance/execution-binding.js';
import type { DomainWorkflowDefinition, DomainWorkflowTrigger } from '../workflow/contract.js';
import type { DomainPredicateEvent } from '../workflow/predicate.js';
import type { WorkflowAddress } from '../v2/contracts/workflow.js';
import { DomainRuntimeV3Error } from './runtime-v3-errors.js';

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
 * Deterministic logical slot for promoted child work inside one decision turn
 * (L2 §14.2). Derived from the exact turn identity components — the same
 * components `deriveDurableControlTurnId` consumes — so distinct turns never
 * share a slot and replays of one turn derive the same slot.
 */
function decisionSlot(
  decisionId: string,
  turn: AdmissionTurnSource,
): { readonly parentActorId: string; readonly childActorId: string; readonly invocationOrdinal: number } {
  const parentActorId = `decision:${decisionId}`;
  switch (turn.kind) {
    case 'message':
      return { parentActorId, childActorId: `${parentActorId}:message:${turn.sourceMessageId}`, invocationOrdinal: 1 };
    case 'child-terminal':
      return {
        parentActorId,
        childActorId: `${parentActorId}:child:${turn.childActorId}`,
        invocationOrdinal: turn.invocationOrdinal,
      };
    case 'timer':
      return { parentActorId, childActorId: `${parentActorId}:timer:${turn.timerId}`, invocationOrdinal: turn.fireOrdinal };
    case 'callback':
      return {
        parentActorId,
        childActorId: `${parentActorId}:callback:${turn.externalCorrelationId}`,
        invocationOrdinal: turn.callbackOrdinal,
      };
    case 'recovery':
      return {
        parentActorId,
        childActorId: `${parentActorId}:recovery:${turn.durableRecoveryActionId}`,
        invocationOrdinal: turn.resumeOrdinal,
      };
  }
}

function cachePolicyOf(declaration: CompiledSemanticDecisionDescriptor):
  | { readonly mode: 'eligible' }
  | { readonly mode: 'bypass'; readonly reason: SemanticCacheBypassReason } {
  const policy: SemanticDecisionCachePolicy = declaration.cachePolicy;
  return policy.mode === 'eligible' ? { mode: 'eligible' } : { mode: 'bypass', reason: policy.reason };
}

/**
 * Bind one compiled semantic-decision declaration + exact pinned authority
 * onto the existing resolver invocation. Fails closed — before any resolver
 * or admission work — with the stable T004 runtime error codes when the
 * declaration material cannot be bound exactly.
 */
export async function bindSemanticDecisionTurn<TResult extends JsonValue = JsonValue>(
  request: ResolveAndAdmitTurnRequest<TResult>,
  authority: SemanticDecisionRuntimeAuthority,
): Promise<SemanticDecisionRuntimeBinding<TResult>> {
  const { declaration, governancePin: pin } = authority;

  // Structured result schema authority (§9.3/§18): normalized ONCE through the
  // existing DOMAIN_HARNESS_JSON_SCHEMA_V1 interpreter and shared by the
  // resolver's fresh-result validation and Central Admission's schema gate.
  const schemaValidator = new DomainHarnessJsonSchemaV1Validator();
  let normalizedResultSchema: JsonSchema;
  try {
    normalizedResultSchema = schemaValidator.normalizeSchema(declaration.resultSchema);
  } catch (error) {
    throw new DomainRuntimeV3Error(
      'RUNTIME_V3_DECISION_BINDING_INCOMPATIBLE',
      `semantic decision "${declaration.decisionId}" resultSchema is not a valid DOMAIN_HARNESS_JSON_SCHEMA_V1 schema: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const schemaLabel = `semantic decision "${declaration.decisionId}" result`;
  const decisionSchema: SemanticCacheCurrentSchema<JsonValue> = {
    isValid: (value: JsonValue): value is JsonValue => {
      try {
        schemaValidator.validate(normalizedResultSchema, value, schemaLabel);
        return true;
      } catch {
        return false;
      }
    },
  };

  // Input-selection authority: the declaration's JSONata expression over the
  // invoking workflow context, evaluated through the EXISTING runtime
  // expression port (the same authority compiled workflows use).
  let selectedInput: JsonValue;
  try {
    selectedInput = await authority.expression.evaluate({
      expression: declaration.inputSelection,
      input: request.context,
      logicalTime: request.now,
    });
  } catch (error) {
    throw new DomainRuntimeV3Error(
      'RUNTIME_V3_DECISION_BINDING_INCOMPATIBLE',
      `semantic decision "${declaration.decisionId}" inputSelection ${JSON.stringify(declaration.inputSelection)} failed closed over the invoking context: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Promoted reference: declaration vocabulary is the exact existing
  // PromotedChildSelector vocabulary (version/alias); a declared reference is
  // contract, so a turn without the promoted execution material/ports fails
  // closed instead of silently skipping the declared source.
  let promoted: DecisionResolverPromotedConfig | undefined;
  if (declaration.promotedReference !== undefined) {
    const selector: PromotedChildSelector = declaration.promotedReference;
    if (request.promoted === undefined || request.resolver.promoted === undefined) {
      throw new DomainRuntimeV3Error(
        'RUNTIME_V3_DECISION_BINDING_INCOMPATIBLE',
        `semantic decision "${declaration.decisionId}" declares a promoted reference but the turn supplied no promoted execution material/ports; fail closed`,
      );
    }
    promoted = {
      selector,
      executor: request.promoted.executor,
      journal: request.promoted.journal,
      ...(request.promoted.input === undefined ? {} : { input: request.promoted.input }),
    };
  }

  // Bounded Harness policy + finite outcome/event vocabulary + query-only
  // capability identities. The host model/executors stay host authority; any
  // capability binding outside the declaration's query-only identities fails
  // closed before the resolver can invoke it.
  let harness: DecisionResolverHarnessConfig | undefined;
  if (request.harness !== undefined) {
    const outside = request.harness.input.capabilities.filter(
      (binding) => binding.kind !== 'query' || !declaration.queryCapabilityIds.includes(binding.capabilityId),
    );
    if (outside.length > 0) {
      throw new DomainRuntimeV3Error(
        'RUNTIME_V3_DECISION_BINDING_INCOMPATIBLE',
        `semantic decision "${declaration.decisionId}" cannot bind capability identities [${outside.map((binding) => binding.capabilityId).sort().join(', ')}]; semantic reasoning is bounded to the declaration's query-only capabilities`,
      );
    }
    harness = {
      input: {
        ...request.harness.input,
        allowedDecisionOutcomes: declaration.allowedOutcomes,
        allowedEventTypes: declaration.allowedEventTypes,
        maxSteps: declaration.policy.maxSteps,
      },
      journal: request.harness.journal,
      harnessProducerIdentity: request.harness.harnessProducerIdentity,
      ...(request.harness.capabilitySemanticIdentities === undefined
        ? {}
        : { capabilitySemanticIdentities: request.harness.capabilitySemanticIdentities }),
      ...(request.harness.selectedSemanticDependencies === undefined
        ? {}
        : { selectedSemanticDependencies: request.harness.selectedSemanticDependencies }),
    };
  }

  const slot = decisionSlot(declaration.decisionId, request.turn);
  const invoking: PromotedChildInvokingContext = {
    target: request.target,
    packageId: pin.packageId,
    domainIntelligenceContentDigest: pin.domainIntelligenceContentDigest,
    governanceBaseline: pin.governanceBaseline,
    availableArtifacts: request.invokingArtifacts ?? [],
    applicabilityFacts: request.applicabilityFacts ?? [],
  };

  const invocation: DecisionResolverInvocation<JsonValue> = {
    namespace: authority.namespace,
    domainId: pin.domainId,
    decisionId: declaration.decisionId,
    selectedInput,
    dependencies: request.dependencies ?? {},
    ...(declaration.dependencyMaterial.requiredProjectionIds.length === 0
      ? {}
      : {
          requiredProjections: declaration.dependencyMaterial.requiredProjectionIds.map((projectionId) => ({
            source: 'input' as const,
            projectionId,
          })),
        }),
    ...(declaration.dependencyMaterial.requiredRevisionSourceIds.length === 0
      ? {}
      : { requiredRevisionSourceIds: declaration.dependencyMaterial.requiredRevisionSourceIds }),
    cachePolicy: cachePolicyOf(declaration),
    invoking,
    governancePin: pin,
    slot: { target: request.target, ...slot },
    pinnedAt: request.now,
    // Same deterministic turn identity Central Admission derives for this
    // turn, so journaled resolver work and the admitted plan share identity.
    durableControlTurnId: deriveDurableControlTurnId(request.target, request.turn),
    // Exact declaration content identity (T-016 decision-contract digest).
    semanticContractDigest: declaration.declarationDigest,
    nowEpochMs: Date.parse(request.now),
    currentSchema: decisionSchema,
    ...(promoted === undefined ? {} : { promoted }),
    ...(harness === undefined ? {} : { harness }),
    ...(request.signal === undefined ? {} : { signal: request.signal }),
  };

  return {
    invocation: invocation as DecisionResolverInvocation<TResult>,
    decisionSchema,
  };
}

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
export type DeclaredSemanticUnavailableOutcome<TResult extends JsonValue = JsonValue> =
  | { readonly kind: 'not-applicable' }
  | { readonly kind: 'fail-closed'; readonly reason: string }
  | { readonly kind: 'declared-event'; readonly resolution: ResolvedDecision<TResult> };

export function declaredSemanticUnavailableOutcome<TResult extends JsonValue = JsonValue>(
  declaration: CompiledSemanticDecisionDescriptor,
  error: unknown,
): DeclaredSemanticUnavailableOutcome<TResult> {
  // The ONLY availability signal this disposition may consume is the existing
  // resolver signal for "resolution reached the HarnessMachine fallback with
  // unusable model material". Everything else surfaces raw.
  if (!(error instanceof DecisionResolverError) || error.code !== 'DECISION_RESOLVER_HARNESS_UNCONFIGURED') {
    return { kind: 'not-applicable' };
  }
  const disposition: SemanticDecisionUnavailableDisposition | undefined = declaration.unavailable;
  if (disposition === undefined) {
    // Defensive: the T001 compiled contract always materializes the
    // disposition; absent material means no declared behavior exists, so the
    // raw resolver failure is preserved instead of inventing one.
    return { kind: 'not-applicable' };
  }
  if (disposition.kind === 'fail-closed') {
    return {
      kind: 'fail-closed',
      reason: `semantic decision "${declaration.decisionId}" required fresh semantics (every deterministic source fell through) but model capability is unavailable for this binding and the compiled declaration declares the fail-closed unavailable disposition; no semantic answer is fabricated and no state changes (frozen L2 §7 SEMANTIC_INTELLIGENCE_UNAVAILABLE)`,
    };
  }
  // Defensive fail-closed BEFORE any admission work: the declared event/outcome
  // must be exactly the declaration's own compiled vocabulary. The T001
  // compile/activation authorities already enforce this; a mismatching
  // declaration can only be foreign/tampered material, and the runtime never
  // invents or repairs vocabulary.
  if (
    !declaration.allowedEventTypes.includes(disposition.eventType)
    || !declaration.allowedOutcomes.includes(disposition.outcome)
  ) {
    throw new DomainRuntimeV3Error(
      'RUNTIME_V3_DECISION_BINDING_INCOMPATIBLE',
      `semantic decision "${declaration.decisionId}" declares an unavailable disposition with event "${disposition.eventType}"/outcome "${disposition.outcome}" outside its own compiled allowedEventTypes [${declaration.allowedEventTypes.join(', ')}] / allowedOutcomes [${declaration.allowedOutcomes.join(', ')}]; fail closed before any admission work`,
    );
  }
  return {
    kind: 'declared-event',
    resolution: {
      source: 'declared-unavailable',
      // The declared material carries exactly the declared outcome and event
      // type — nothing else is invented (no data, no payload). The ONE shared
      // declaration result schema re-validates it inside Central Admission.
      structuredDecision: {
        decision: { outcome: disposition.outcome },
        event: { type: disposition.eventType },
      } as unknown as TResult,
      // Nothing produced this material: no producer artifact, no model calls,
      // no journal evidence. The failed attempt's cache telemetry is not
      // imputed; the declared material is not cache-derived.
      provenance: {},
      freshModelCallCount: 0,
      llmAvoided: true,
      cacheDisposition: { read: 'disabled' },
      telemetry: [],
    },
  };
}
