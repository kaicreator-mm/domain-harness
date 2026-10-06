/**
 * T004B compile-time type fixtures (issue #632, fine-grained DAG #534 T004B;
 * authority #589 PACK-C T004B section; #691 post-merge bounded repair).
 *
 * Proof-only fixtures: typechecked by `tsc -p tsconfig.test.json --noEmit`
 * but never executed. `Expect`/`Equal` force compile failures when the
 * non-effectful invocation contract regresses (taxonomy drift, mutable
 * authority surfaces, smuggled occurrence/journal/provenance-decision
 * material), and `@ts-expect-error` blocks prove negative boundaries stay
 * unrepresentable: callers cannot mint a `SealedToolImplementationBinding` by
 * hand (the sealing brand is module-private to T003C), no injected
 * provenance-decision field exists on the dispatch input (assembly provenance
 * is the directly consumed T002B mint verifier, #691), and the invocation
 * result never carries transition, occurrence or journal authority.
 */
import type {
  InvokeNonEffectfulToolInput,
  NonEffectfulInvocationError,
  NonEffectfulInvocationErrorCode,
  NonEffectfulToolDispatchPort,
  NonEffectfulToolDispatchQuery,
  NonEffectfulToolInvocationResult,
} from '../../src/contracts/non-effectful-invocation.js';
import type { AdmittedToolInvocationRequest } from '../../src/contracts/invocation-request.js';
import type { SealedToolImplementationBinding } from '../../src/contracts/tool-implementation-binding.js';
import type { DefinitionGraphEnvelope } from '../../src/contracts/definition-graph.js';
import type { ContentDigest, Sha256Port } from '../../src/contracts/identity.js';
import type { JsonValue } from '../../src/contracts/json.js';
import type { ComponentId } from '../../src/contracts/component.js';
import type { ToolImplementationIdentity } from '../../src/contracts/tool-implementation-binding.js';

type Expect<T extends true> = T;
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// F1: the failure taxonomy is exactly the seven T004B categories.
// ASSEMBLY_PROVENANCE_UNVERIFIED survives the #691 repair with a new, genuine
// authority: it is now decided by the directly consumed T002B mint verifier
// over the exact final Assembly, never by a caller/host-supplied decision.
export type ErrorCodesExactly = Expect<
  Equal<
    NonEffectfulInvocationErrorCode,
    | 'INVALID_INVOCATION_INPUT'
    | 'INVALID_BINDING_EVIDENCE'
    | 'ASSEMBLY_PROVENANCE_UNVERIFIED'
    | 'MISSING_RESOURCE_PROVIDER'
    | 'INVALID_TOOL_DISPATCH_PORT'
    | 'EFFECTFUL_OPERATION_REJECTED'
    | 'INVALID_TOOL_OUTPUT'
  >
>;
export type ErrorCodeField = Expect<Equal<NonEffectfulInvocationError['code'], NonEffectfulInvocationErrorCode>>;

// F2: the dispatch input is the closed PACK-C field set — no occurrence,
// activation, journal, transition or injected provenance-decision material is
// representable (#691: the `assemblyProvenance` field was removed as
// authority together with its guard port).
export type InputShape = Expect<
  Equal<
    InvokeNonEffectfulToolInput,
    {
      readonly request: AdmittedToolInvocationRequest;
      readonly binding: SealedToolImplementationBinding;
      readonly currentDefinitionGraph: DefinitionGraphEnvelope;
      readonly dispatch: NonEffectfulToolDispatchPort;
      readonly resourceProvider?: import('../../src/contracts/resource-resolution.js').ResourceProvider;
      readonly sha256: Sha256Port;
    }
  >
>;

// F3 (removed with the #691 repair): the injected provenance-guard port
// fixtures are gone — the guard type no longer exists on the module, and F2's
// exact-shape equality proves no injected provenance field can reappear.

// F4: the dispatch port query carries the opaque paired handle plus
// operation/input/resource snapshots — no caller context, no authority
// material, no occurrence anchor.
export type DispatchQueryShape = Expect<
  Equal<
    NonEffectfulToolDispatchQuery,
    {
      readonly handle: unknown;
      readonly operationId: string;
      readonly input: JsonValue;
      readonly resources: ReadonlyMap<string, import('../../src/contracts/resource-resolution.js').ResolvedResourceEntry>;
    }
  >
>;
export type DispatchPortShape = Expect<
  Equal<
    ReturnType<NonEffectfulToolDispatchPort['dispatch']>,
    Promise<unknown>
  >
>;

// F5: the result is observational identity + portable output only — the
// exact implementation pin dispatched is bound in for audit, and no
// transition/occurrence/journal field exists anywhere in the type.
export type ResultShape = Expect<
  Equal<
    NonEffectfulToolInvocationResult,
    {
      readonly status: 'OBSERVED';
      readonly toolComponentId: ComponentId;
      readonly operationId: string;
      readonly output: JsonValue;
      readonly implementation: ToolImplementationIdentity;
      readonly bindingDigest: ContentDigest;
      readonly definitionGraphDigest: ContentDigest;
      readonly assemblyDigest: ContentDigest;
    }
  >
>;

// F6: negative boundaries — the T003C sealing brand is module-private, so no
// caller can construct a sealed binding by hand, and neither the result nor
// the input can be widened into effect authority.
declare const wouldBeBindingForgery: {
  readonly evidence: unknown;
  readonly successorAssembly: unknown;
  readonly implementationHandle: unknown;
};
// @ts-expect-error the sealed-binding brand is not implementable outside the
// minting module — a caller-constructed object is not SealedToolImplementationBinding
export const forgedBinding: SealedToolImplementationBinding = wouldBeBindingForgery;

declare const genuineResult: NonEffectfulToolInvocationResult;
export const resultHasNoOccurrence: 'OBSERVED' = genuineResult.status;
// @ts-expect-error no occurrence field exists on the observational result.
export const noOccurrence: string = (genuineResult as { occurrenceId: string }).occurrenceId;

declare const genuineInput: InvokeNonEffectfulToolInput;
// @ts-expect-error no journal/transition/occurrence option exists on the dispatch input.
export const noJournalOption: unknown = (genuineInput as { journal: unknown }).journal;
