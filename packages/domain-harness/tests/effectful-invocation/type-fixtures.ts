/**
 * T004C compile-time type fixtures (issue #874; authority #589 PACK-C T004C
 * section + #672 readiness posture).
 *
 * Proof-only fixtures: typechecked by `tsc -p tsconfig.test.json --noEmit`
 * but never executed. `Expect`/`Equal` force compile failures when the
 * effectful invocation contract regresses (taxonomy drift, mutable authority
 * surfaces, smuggled journal/occurrence/verdict material), and
 * `@ts-expect-error` blocks prove negative boundaries stay unrepresentable:
 * callers cannot mint a `SealedToolImplementationBinding` by hand, no
 * caller-supplied occurrence/effect-authority verdict field exists on the
 * closed input, and the result never carries a live handle, secret or a
 * second effect-authority surface.
 */
import type {
  EffectfulInvocationError,
  EffectfulInvocationErrorCode,
  EffectfulToolDispatchPort,
  EffectfulToolDispatchQuery,
  EffectfulToolInvocationResult,
  InvokeEffectfulToolInput,
} from '../../src/contracts/effectful-invocation.js';
import type { AdmittedToolInvocationRequest } from '../../src/contracts/invocation-request.js';
import type {
  SealedToolImplementationBinding,
  ToolImplementationIdentity,
} from '../../src/contracts/tool-implementation-binding.js';
import type { DefinitionGraphEnvelope } from '../../src/contracts/definition-graph.js';
import type { ContentDigest, Sha256Port } from '../../src/contracts/identity.js';
import type { JsonValue } from '../../src/contracts/json.js';
import type { ComponentId } from '../../src/contracts/component.js';
import type { ResourceProvider } from '../../src/contracts/resource-resolution.js';
import type { AssemblyExecutionActivator } from '../../src/governance/assembly-activation.js';
import type { RuntimeAuthorityClass } from '../../src/governance/execution-binding.js';
import type { GovernanceExecutionCoordinator } from '../../src/governance/execution-binding.js';
import type { GovernanceBaselineStore } from '../../src/governance/contracts.js';
import type {
  AdmissionDurableEffectJournal,
  AdmissionTurnSource,
  CentralAdmissionOutcome,
} from '../../src/admission/contracts.js';
import type { ToolEffectSemantics } from '../../src/v2/contracts/package.js';
import type { WorkflowAddress } from '../../src/v2/contracts/workflow.js';
import type { DomainWorkflowDefinition } from '../../src/workflow/index.js';

type Expect<T extends true> = T;
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// F1: the failure taxonomy is exactly the module-owned T004C categories. Every
// owner-seam failure (T004A/T003C/T005B/occurrence gates/Central Admission)
// propagates UNCHANGED and is deliberately absent from this taxonomy.
export type ErrorCodesExactly = Expect<
  Equal<
    EffectfulInvocationErrorCode,
    | 'INVALID_INVOCATION_INPUT'
    | 'INVALID_TOOL_DISPATCH_PORT'
    | 'INVALID_BINDING_EVIDENCE'
    | 'ASSEMBLY_PROVENANCE_UNVERIFIED'
    | 'EFFECTLESS_OPERATION_REJECTED'
    | 'OCCURRENCE_ASSEMBLY_MISMATCH'
    | 'MISSING_RESOURCE_PROVIDER'
    | 'EFFECT_INTENT_MISMATCH'
  >
>;
export type ErrorCodeField = Expect<Equal<EffectfulInvocationError['code'], EffectfulInvocationErrorCode>>;

// F2: the input is the closed T004C composition set. The occurrence identity
// is carried by the admission turn material (never a separate mintable
// field), the effect tools port is NOT caller-expressible (the module
// installs the only verified-binding adapter), and no journal, occurrence
// verdict, effect-authority token or caller-minted pin is representable.
export type AdmissionPortsInput = Expect<
  Equal<
    InvokeEffectfulToolInput['admissionPorts'],
    {
      readonly governance: GovernanceExecutionCoordinator;
      readonly baselines: GovernanceBaselineStore;
      readonly effectJournal: AdmissionDurableEffectJournal;
    }
  >
>;
type FullInputShape = {
  readonly request: AdmittedToolInvocationRequest;
  readonly binding: SealedToolImplementationBinding;
  readonly currentDefinitionGraph: DefinitionGraphEnvelope;
  readonly activator: AssemblyExecutionActivator;
  readonly admissionRequest: {
    readonly target: WorkflowAddress;
    readonly turn: AdmissionTurnSource;
    readonly trigger: unknown;
    readonly workflowInstanceId: string;
    readonly definition: DomainWorkflowDefinition;
    readonly currentStateKey: string;
    readonly context: unknown;
    readonly event: unknown;
    readonly resolved: unknown;
    readonly decisionSchema: { readonly isValid: (value: JsonValue) => boolean };
    readonly now: string;
  };
  readonly admissionPorts: {
    readonly governance: GovernanceExecutionCoordinator;
    readonly baselines: GovernanceBaselineStore;
    readonly effectJournal: AdmissionDurableEffectJournal;
  };
  readonly effectType: string;
  readonly dispatch: EffectfulToolDispatchPort;
  readonly resourceProvider?: ResourceProvider;
  readonly sha256: Sha256Port;
};
export type InputFieldKeys = Expect<
  Equal<keyof InvokeEffectfulToolInput, keyof FullInputShape>
>;

// F3: the dispatch port query carries the opaque verified handle, the exact
// operation/input/resources and the durable effect identity context — never
// caller authority material and never a binding/selection object.
export type DispatchQueryShape = Expect<
  Equal<
    EffectfulToolDispatchQuery,
    {
      readonly handle: unknown;
      readonly operationId: string;
      readonly input: JsonValue;
      readonly resources: ReadonlyMap<string, import('../../src/contracts/resource-resolution.js').ResolvedResourceEntry>;
      readonly effectId: string;
      readonly durableControlTurnId: string;
      readonly operationOrdinal: number;
      readonly effectType: string;
      readonly idempotencyKey?: string;
      readonly logicalTime: string;
    }
  >
>;
export type DispatchPortShape = Expect<
  Equal<ReturnType<EffectfulToolDispatchPort['dispatch']>, Promise<unknown>>
>;

// F4: the result binds the existing Central Admission outcome plus exact
// identity material only — the proven PRODUCTION occurrence pin identity, the
// exact verified implementation pin and digests. No handle, no secret, no
// journal record surface, no mintable authority.
export type ResultShape = Expect<
  Equal<
    EffectfulToolInvocationResult,
    {
      readonly outcome: CentralAdmissionOutcome;
      readonly occurrence: {
        readonly workflowTarget: string;
        readonly workflowInstanceId: string;
        readonly authorityClass: RuntimeAuthorityClass;
        readonly pinBindingDigest: string;
        readonly assemblyDigest: ContentDigest;
      };
      readonly invocation: {
        readonly toolComponentId: ComponentId;
        readonly operationId: string;
        readonly effectType: string;
        readonly effectSemantics: ToolEffectSemantics;
        readonly implementation: ToolImplementationIdentity;
        readonly bindingDigest: ContentDigest;
        readonly definitionGraphDigest: ContentDigest;
      };
    }
  >
>;

// F5: negative boundaries — the T003C sealing brand is module-private, so no
// caller can construct a sealed binding by hand, and neither the input nor the
// result can be widened into a second effect authority.
declare const wouldBeBindingForgery: {
  readonly evidence: unknown;
  readonly successorAssembly: unknown;
  readonly implementationHandle: unknown;
};
// @ts-expect-error the sealed-binding brand is not implementable outside the
// minting module — a caller-constructed object is not SealedToolImplementationBinding
export const forgedBinding: SealedToolImplementationBinding = wouldBeBindingForgery;

declare const genuineInput: InvokeEffectfulToolInput;
// @ts-expect-error no caller-supplied effect-authority verdict field exists.
export const noVerdictField: unknown = (genuineInput as { effectAuthority: unknown }).effectAuthority;
// @ts-expect-error no caller-minted occurrence/pin field exists.
export const noCallerPinField: unknown = (genuineInput as { occurrencePin: unknown }).occurrencePin;
// @ts-expect-error the caller cannot express an effectTools port — the module
// installs the only verified-binding adapter (no independent implementation selection).
export const noEffectToolsField: unknown = (genuineInput as { effectTools: unknown }).effectTools;
// @ts-expect-error the caller cannot inject a second journal port.
export const noJournalField: unknown = (genuineInput as { journal: unknown }).journal;

declare const genuineResult: EffectfulToolInvocationResult;
// Positive assertion: the occurrence authority class is exactly the
// RuntimeAuthorityClass (assignability itself is the compile-time proof).
export const authorityClassExact: RuntimeAuthorityClass = genuineResult.occurrence.authorityClass;
// @ts-expect-error no live handle or secret field exists on the result.
export const noHandleField: unknown = (genuineResult as { handle: unknown }).handle;

// F6: the activator is consumed, never re-owned — the occurrence pin gates
// are the accepted T002C/T002D/T005C seam (compile-time proof of the exact
// single-string occurrence key the module gates on).
declare const activator: AssemblyExecutionActivator;
export type ActivatorGates = Expect<
  Equal<
    Parameters<AssemblyExecutionActivator['requireProductionEffectAuthority']>[0],
    string
  >
>;
export const activatorIsConsumed: AssemblyExecutionActivator = activator;

// F7: the Central Admission ports shape remains the existing owner contract —
// the module adds no port kind and no parallel journal type.
export type PortsShape = Expect<
  Equal<
    keyof import('../../src/admission/contracts.js').CentralAdmissionPorts,
    'governance' | 'baselines' | 'sha256' | 'effectJournal' | 'effectTools'
  >
>;
