import type { JsonObject, JsonSchema, JsonValue } from '../contracts/json.js';

/**
 * Fail-closed reasons emitted by one bounded Business Harness invocation.
 * These are invocation results only; they do not mutate Workflow or business state.
 */
export type BusinessHarnessFailureCode =
  | 'CANCELLED'
  | 'INVALID_CONFIGURATION'
  | 'INVALID_MODEL_RESPONSE'
  | 'INVALID_STRUCTURED_RESULT'
  | 'MAX_STEPS_EXHAUSTED'
  | 'MODEL_ERROR'
  | 'MUTATION_CAPABILITY_FORBIDDEN'
  | 'QUERY_OUTPUT_INVALID'
  | 'UNKNOWN_CAPABILITY';

/** Structured domain decision proposed by Business Harness reasoning. */
export interface DomainDecision {
  readonly outcome: string;
  readonly data: JsonValue;
}

/**
 * Structured Domain Event proposal. This is data for the parent Domain Workflow;
 * it is not an instruction to transition to an engine-specific state id.
 */
export interface DomainEventProposal {
  readonly type: string;
  readonly payload: JsonValue;
}

/** The only authoritative final payload a model may propose from HarnessMachine. */
export interface BusinessHarnessStructuredResult {
  readonly decision: DomainDecision;
  readonly event: DomainEventProposal;
}

/**
 * Behaviorally relevant dependency observed/consumed by this invocation.
 * T-016 owns durable journal integration; this contract is invocation-local only.
 */
export interface ObservedDependency {
  readonly kind: 'domain-fact' | 'compiled-intelligence' | 'query';
  readonly identity: string;
  readonly revision?: string;
}

export interface ObservedDependencySet {
  readonly items: readonly ObservedDependency[];
}

export type DecisionTraceEntryType =
  | 'prepare'
  | 'model.request'
  | 'model.response'
  | 'query.call'
  | 'query.observation'
  | 'final.accepted'
  | 'failed'
  | 'cancelled';

/**
 * Externally checkable structured execution fact. `detail` intentionally contains
 * only contract-level facts; private/free-form chain-of-thought is not represented.
 */
export interface DecisionTraceEntry {
  readonly seq: number;
  readonly type: DecisionTraceEntryType;
  readonly detail?: JsonObject;
}

export interface DecisionTrace {
  readonly entries: readonly DecisionTraceEntry[];
}

/** Schema advertised to the model for one read/query capability. */
export interface HarnessQuerySchema {
  readonly capabilityId: string;
  readonly description: string;
  readonly inputSchema?: JsonSchema;
}

export interface HarnessQueryCall {
  readonly capabilityId: string;
  readonly input: JsonValue;
}

export interface HarnessQueryObservation {
  readonly capabilityId: string;
  readonly ok: boolean;
  readonly value?: JsonValue;
  readonly error?: string;
}

/** Canonical successful result expected from a host query binding. */
export interface HarnessQueryExecutionResult {
  readonly value: JsonValue;
  readonly dependency?: ObservedDependency;
}

/**
 * Capability bindings are supplied by the host. Mutation bindings may exist in
 * the registry so the runtime can reject a model request explicitly, but they are
 * never advertised to the model and are never executed by HarnessMachine.
 */
export interface HarnessCapabilityBinding {
  readonly capabilityId: string;
  readonly description: string;
  readonly kind: 'query' | 'mutation';
  readonly inputSchema?: JsonSchema;
  execute(input: JsonValue, signal: AbortSignal): Promise<unknown>;
}

/** Provider-neutral request surface. Provider/model selection is deliberately absent. */
export interface BusinessHarnessModelRequest {
  readonly domainFacts: JsonObject;
  readonly compiledIntelligence: JsonObject;
  readonly workflowContext: JsonObject;
  readonly queries: readonly HarnessQuerySchema[];
  readonly observations: readonly HarnessQueryObservation[];
  readonly step: number;
}

export type BusinessHarnessModelResponse =
  | { readonly kind: 'query'; readonly call: unknown }
  | { readonly kind: 'final'; readonly result: unknown };

/** Provider-neutral model execution seam. AI Runtime owns routing/retry/fallback. */
export interface ModelPort {
  generate(
    request: BusinessHarnessModelRequest,
    signal: AbortSignal,
  ): Promise<BusinessHarnessModelResponse>;
}

/**
 * Input for exactly one bounded unresolved-semantics invocation.
 * `selectedDependencies` identifies selected Facts/CDI already supplied to the
 * model request. Query dependencies are appended only after successful reads.
 */
export interface BusinessHarnessInput {
  readonly domainFacts: JsonObject;
  readonly compiledIntelligence: JsonObject;
  readonly workflowContext: JsonObject;
  readonly selectedDependencies?: readonly ObservedDependency[];
  readonly allowedDecisionOutcomes: readonly string[];
  readonly allowedEventTypes: readonly string[];
  readonly capabilities: readonly HarnessCapabilityBinding[];
  readonly model: ModelPort;
  readonly maxSteps: number;
}

export interface BusinessHarnessSuccess {
  readonly status: 'ok';
  readonly decision: DomainDecision;
  readonly event: DomainEventProposal;
  readonly trace: DecisionTrace;
  readonly observedDependencies: ObservedDependencySet;
}

export interface BusinessHarnessFailure {
  readonly status: 'error';
  readonly code: BusinessHarnessFailureCode;
  readonly message: string;
  readonly trace: DecisionTrace;
  readonly observedDependencies: ObservedDependencySet;
}

export type BusinessHarnessResult = BusinessHarnessSuccess | BusinessHarnessFailure;

/** Explicit cooperative cancellation while the child invocation is active. */
export type BusinessHarnessEvent = { readonly type: 'CANCEL' };
