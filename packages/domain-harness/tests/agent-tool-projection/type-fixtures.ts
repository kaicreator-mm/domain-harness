/**
 * T004D compile-time type fixtures (issue #886; authority #589 PACK-C T004D
 * section; readiness #702 WRITE_SET_BOUND / NO_AGENT_AUTHORITY).
 *
 * Proof-only fixtures: typechecked by `tsc -p tsconfig.test.json --noEmit`
 * but never executed. `Expect`/`Equal` force compile failures when the Agent
 * adapter contract regresses, and `@ts-expect-error` blocks prove negative
 * boundaries stay unrepresentable:
 *  - the failure taxonomy is exactly the module-owned adapter categories;
 *  - the query seam is a CLOSED read-only shape: no dispatch authority, no
 *    journal/occurrence/verdict/pin material, no effectful routing option —
 *    mutation is structurally absent from the seam;
 *  - the mutation-intent admission carries proposal material only and returns
 *    the generic T004A admitted request — it never returns a dispatch result,
 *    an outcome, or any effect authority surface;
 *  - the projection binds identity + derived schema metadata only.
 */
import type {
  AgentToolProjectionError,
  AgentToolProjectionErrorCode,
  AgentToolQueryInput,
  AgentToolSurfaceProjection,
  AdmitAgentMutationIntentInput,
  AgentProjectedOperation,
  AgentProjectedTool,
} from '../../src/adapters/agent-tool-projection.js';
import type { AdmittedToolInvocationRequest } from '../../src/contracts/invocation-request.js';
import type { NonEffectfulToolInvocationResult } from '../../src/contracts/non-effectful-invocation.js';
import type { SealedToolImplementationBinding } from '../../src/contracts/tool-implementation-binding.js';
import type { SealedRuntimeAssembly } from '../../src/contracts/runtime-assembly.js';
import type { DefinitionGraphEnvelope } from '../../src/contracts/definition-graph.js';
import type { ComponentId } from '../../src/contracts/component.js';
import type { ContentDigest, Sha256Port } from '../../src/contracts/identity.js';
import type { JsonValue } from '../../src/contracts/json.js';
import type { ResourceProvider } from '../../src/contracts/resource-resolution.js';
import type { NonEffectfulToolDispatchPort } from '../../src/contracts/non-effectful-invocation.js';

type Expect<T extends true> = T;
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// F1: the failure taxonomy is exactly the module-owned T004D adapter
// categories. Owner-seam failures (T004A/T004B/T004C, Central Admission)
// propagate unchanged and are deliberately absent.
export type ErrorCodesExactly = Expect<
  Equal<
    AgentToolProjectionErrorCode,
    | 'INVALID_PROJECTION_INPUT'
    | 'AGENT_OPERATION_NOT_PROJECTED'
    | 'AGENT_MUTATION_REFUSED'
    | 'AGENT_PROJECTION_STALE'
  >
>;
export type ErrorCodeField = Expect<Equal<AgentToolProjectionError['code'], AgentToolProjectionErrorCode>>;

// F2: the query seam input is a closed, read-only shape. Model material enters
// as `proposal` (provenance only); there is NO effectful routing option, no
// dispatch-authority field, no occurrence/journal/verdict/pin material.
type FullQueryShape = {
  readonly agentId: string;
  readonly toolComponentId: ComponentId;
  readonly operationId: string;
  readonly proposal: JsonValue;
  readonly projection: AgentToolSurfaceProjection;
  readonly binding: SealedToolImplementationBinding;
  readonly currentDefinitionGraph: DefinitionGraphEnvelope;
  readonly dispatch: NonEffectfulToolDispatchPort;
  readonly resourceProvider?: ResourceProvider;
  readonly sha256: Sha256Port;
};
export type QueryInputKeys = Expect<Equal<keyof AgentToolQueryInput, keyof FullQueryShape>>;

export function querySeamRejectsSmuggledAuthority(input: AgentToolQueryInput): void {
  // @ts-expect-error no occurrence/verdict/pin/journal/effect-routing field exists on the query seam
  const _withOccurrence: AgentToolQueryInput = { ...input, occurrence: { workflowInstanceId: 'x' } };
  // @ts-expect-error no effect authority verdict is representable
  const _withVerdict: AgentToolQueryInput = { ...input, effectAuthority: 'PRODUCTION' };
  // @ts-expect-error no journal material is representable
  const _withJournal: AgentToolQueryInput = { ...input, effectJournal: {} };
  // @ts-expect-error no admission/occurrence routing option exists
  const _withRoute: AgentToolQueryInput = { ...input, route: 'effectful' };
  // @ts-expect-error model material is proposal only — no authority-typed field
  const _withModelVerdict: AgentToolQueryInput = { ...input, modelOutput: { verdict: 'ADMITTED' } };
  void _withOccurrence;
  void _withVerdict;
  void _withJournal;
  void _withRoute;
  void _withModelVerdict;
}

// F3: the mutation-intent admission input is proposal material + projection
// freshness only. It returns the generic T004A admitted request — the host
// routes it through T004C; the adapter never sees occurrence/journal material.
type FullMutationIntentShape = {
  readonly agentId: string;
  readonly toolComponentId: ComponentId;
  readonly operationId: string;
  readonly proposal: JsonValue;
  readonly projection: AgentToolSurfaceProjection;
  readonly assembly: SealedRuntimeAssembly;
  readonly currentDefinitionGraph: DefinitionGraphEnvelope;
  readonly sha256: Sha256Port;
};
export type MutationIntentKeys = Expect<
  Equal<keyof AdmitAgentMutationIntentInput, keyof FullMutationIntentShape>
>;

export async function mutationIntentReturnsRequestOnly(
  admit: (input: AdmitAgentMutationIntentInput) => Promise<AdmittedToolInvocationRequest>,
  input: AdmitAgentMutationIntentInput,
): Promise<void> {
  const admitted: AdmittedToolInvocationRequest = await admit(input);
  // The return type never carries a dispatch result, an outcome or a journal.
  // @ts-expect-error an admitted request is not an observational result
  const _asResult: NonEffectfulToolInvocationResult = admitted;
  void _asResult;
}

export function mutationIntentRejectsSmuggledMaterial(input: AdmitAgentMutationIntentInput): void {
  // @ts-expect-error no dispatch port on the mutation-intent admission — no Agent mutation shortcut
  const _withDispatch: AdmitAgentMutationIntentInput = { ...input, dispatch: {} };
  // @ts-expect-error no occurrence material is representable
  const _withOccurrence: AdmitAgentMutationIntentInput = { ...input, admissionRequest: {} };
  // @ts-expect-error no admission ports are representable
  const _withPorts: AdmitAgentMutationIntentInput = { ...input, admissionPorts: {} };
  // @ts-expect-error no effect type authority is representable
  const _withEffectType: AdmitAgentMutationIntentInput = { ...input, effectType: 'effect:x' };
  void _withDispatch;
  void _withOccurrence;
  void _withPorts;
  void _withEffectType;
}

// F4: the projection binds identity + derived schema metadata only — no
// handle, no exposure evidence, no admission material.
type FullProjectionShape = {
  readonly status: 'PROJECTED';
  readonly agentId: string;
  readonly graphId: string;
  readonly definitionGraphDigest: ContentDigest;
  readonly tools: readonly AgentProjectedTool[];
};
export type ProjectionKeys = Expect<Equal<keyof AgentToolSurfaceProjection, keyof FullProjectionShape>>;

type FullProjectedToolShape = {
  readonly toolComponentId: ComponentId;
  readonly operations: readonly AgentProjectedOperation[];
};
export type ProjectedToolKeys = Expect<Equal<keyof AgentProjectedTool, keyof FullProjectedToolShape>>;

type FullProjectedOperationShape = {
  readonly operationId: string;
  readonly effect: 'none' | 'idempotent' | 'non-idempotent';
  readonly inputSchema: JsonValue;
  readonly outputSchema: JsonValue;
};
export type ProjectedOperationKeys = Expect<
  Equal<keyof AgentProjectedOperation, keyof FullProjectedOperationShape>
>;

export function projectionCarriesNoAuthority(projection: AgentToolSurfaceProjection): void {
  // @ts-expect-error no exposure evidence is derivable from the projection
  const _exposure = projection.exposure;
  // @ts-expect-error no admission request is derivable from the projection
  const _admitted = projection.admittedRequest;
  // @ts-expect-error no runtime handle is derivable from the projection
  const _handle = projection.implementationHandle;
  void _exposure;
  void _admitted;
  void _handle;
}
