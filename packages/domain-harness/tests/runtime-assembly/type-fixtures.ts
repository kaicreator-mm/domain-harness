/**
 * T002B compile-time type fixtures (issues #587, #601).
 *
 * Proof-only fixtures: typechecked by `tsc -p tsconfig.test.json --noEmit`
 * but never executed. `Expect`/`Equal` force compile failures when the
 * sealed Runtime Assembly contract regresses (taxonomy drift, mutable
 * authority surfaces, smuggled runtime-handle material), and
 * `@ts-expect-error` blocks prove negative boundaries stay unrepresentable:
 * validator functions, secrets and live handles are never part of the
 * serializable record; callers cannot mint a SealedRuntimeAssembly or an
 * AssemblyBoundComponentAdmission by hand.
 */
import type {
  AssemblyBoundComponentAdmission,
  AssemblyImplementationBindingEvidence,
  AssemblyResourceRequirement,
  KindImplementationBindingInput,
  KindImplementationPin,
  RuntimeAssemblyError,
  RuntimeAssemblyErrorCode,
  RuntimeAssemblyRecord,
  SealRuntimeAssemblyInput,
  SealedKindImplementationBinding,
  SealedRuntimeAssembly,
  sealRuntimeAssembly,
  admitComponentWithAssembly,
} from '../../src/contracts/runtime-assembly.js';
import type {
  ComponentEnvelope,
  KindRef,
} from '../../src/contracts/component.js';
import type { Sha256Port } from '../../src/contracts/identity.js';
import type { ToolResourceRequirementsDeclaration } from '../../src/contracts/resource-requirements.js';

type Expect<T extends true> = T;
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// F1: the failure taxonomy is exactly the ten #587 categories.
export type ErrorCodesExactly = Expect<
  Equal<
    RuntimeAssemblyErrorCode,
    | 'INVALID_ASSEMBLY_INPUT'
    | 'DEFINITION_CURRENTNESS_MISMATCH'
    | 'MISSING_KIND_IMPLEMENTATION'
    | 'AMBIGUOUS_KIND_IMPLEMENTATION'
    | 'INCOMPATIBLE_KIND_IMPLEMENTATION'
    | 'INVALID_IMPLEMENTATION_PIN'
    | 'INVALID_RESOURCE_REQUIREMENT_IDENTITY'
    | 'DUPLICATE_BINDING_EVIDENCE'
    | 'ASSEMBLY_ADMISSION_KIND_NOT_BOUND'
    | 'ASSEMBLY_ADMISSION_CURRENTNESS_MISMATCH'
  >
>;
export type ErrorCodeField = Expect<Equal<RuntimeAssemblyError['code'], RuntimeAssemblyErrorCode>>;

// F2: the exact KindImplementation pin is kind + exact opaque implementation
// identity (id/version/digest) — never ranges, selectors or source identity.
export type PinShape = Expect<
  Equal<
    KindImplementationPin,
    {
      readonly kind: KindRef;
      readonly implementation: {
        readonly implementationId: string;
        readonly implementationVersion: string;
        readonly implementationDigest: string;
      };
    }
  >
>;

// F3: the runtime validator handle lives only on the binding INPUT and the
// sealed (non-serializable) binding — never on the serializable record.
export type BindingInputCarriesValidator = Expect<
  Equal<KindImplementationBindingInput['validateComponent'], (envelope: ComponentEnvelope) => void>
>;
export type SealedBindingCarriesValidator = Expect<
  Equal<SealedKindImplementationBinding['validateComponent'], (envelope: ComponentEnvelope) => void>
>;
export type RecordHasNoValidator = Expect<
  Equal<Exclude<keyof RuntimeAssemblyRecord, 'digestDomain' | 'definitionGraphDigest' | 'kindImplementations' | 'resourceRequirements' | 'implementationBindingEvidence'>, never>
>;

// F4: the resource requirement canonical material is exactly the five #568
// fields — no secret, endpoint, handle or provider identity is representable.
export type ResourceMaterialShape = Expect<
  Equal<
    AssemblyResourceRequirement,
    {
      readonly resourceKey: string;
      readonly contract?: { readonly contractId: string; readonly version: string };
      readonly operationId?: string;
      readonly required: boolean;
    }
  >
>;
export const secretSmuggling: AssemblyResourceRequirement = {
  resourceKey: 'resource.alpha',
  required: true,
  // @ts-expect-error secret values are structurally unrepresentable (#568 closure)
  secret: 'hunter2',
};
export const handleSmuggling: AssemblyResourceRequirement = {
  resourceKey: 'resource.alpha',
  required: true,
  // @ts-expect-error live handles are structurally unrepresentable (#568 closure)
  connection: { host: 'localhost', port: 5432 },
};

// F5: the §G evidence slot is subject identity + content digest only.
export type EvidenceSlotShape = Expect<
  Equal<AssemblyImplementationBindingEvidence, { readonly subject: string; readonly bindingDigest: string }>
>;
export const providerSmuggling: AssemblyImplementationBindingEvidence = {
  subject: 'tool.alpha',
  bindingDigest: 'sha256:evidence',
  // @ts-expect-error Tool provider selection semantics are T003C-owned; the
  // generic slot carries no provider field
  provider: 'acme',
};

// F6: a public caller cannot hand-mint a SealedRuntimeAssembly (brand is
// module-private) nor an AssemblyBoundComponentAdmission.
declare const wouldBeForgery: {
  readonly record: RuntimeAssemblyRecord;
  readonly assemblyDigest: string;
  readonly bindings: readonly SealedKindImplementationBinding[];
};
// @ts-expect-error the sealed-Assembly brand is not implementable outside the
// sealing module — a caller-constructed object is not a SealedRuntimeAssembly
export const forgedAssembly: SealedRuntimeAssembly = wouldBeForgery;

export const forgedAdmission: AssemblyBoundComponentAdmission = {
  status: 'ADMITTED',
  componentId: 'component.a',
  definitionGraphDigest: 'sha256:graph',
  assemblyDigest: 'sha256:assembly',
  admittedKind: { kindId: 'example.kind', version: '1.0.0' },
  admittedKindImplementation: {
    kind: { kindId: 'example.kind', version: '1.0.0' },
    implementation: {
      implementationId: 'impl',
      implementationVersion: '1.0.0',
      implementationDigest: 'sha256:impl',
    },
  },
  admittedSemanticContracts: [],
  admittedCapabilities: [],
  // @ts-expect-error admission evidence is minted only by the Assembly-bound
  // path; a caller cannot attach an arbitrary validator as authority (#575)
  validateComponent: () => {},
};

// F7: the seal seam is (input, Sha256Port) -> Promise<SealedRuntimeAssembly>;
// the admission seam consumes a sealed Assembly plus the current graph.
export type SealIsTwoArgSeam = Expect<
  Equal<typeof sealRuntimeAssembly, (input: SealRuntimeAssemblyInput, sha256: Sha256Port) => Promise<SealedRuntimeAssembly>>
>;
export type AdmissionSeamShape = Expect<
  Equal<
    typeof admitComponentWithAssembly,
    (
      envelope: ComponentEnvelope,
      assembly: SealedRuntimeAssembly,
      options: { readonly currentDefinitionGraph: import('../../src/contracts/definition-graph.js').DefinitionGraphEnvelope; readonly sha256: Sha256Port },
    ) => Promise<AssemblyBoundComponentAdmission>
  >
>;

// F8: the seal input dimensions are exactly the #587 concerns — definition
// graph, exact pins with trusted handles, T005A declarations, §G evidence,
// optional currentness claim.
export const sealInputFixture: SealRuntimeAssemblyInput = {
  definitionGraph: {} as import('../../src/contracts/definition-graph.js').DefinitionGraphEnvelope,
  kindImplementations: [] as readonly KindImplementationBindingInput[],
  resourceRequirements: [] as readonly { owner: ComponentEnvelope; declaration: ToolResourceRequirementsDeclaration }[],
  implementationBindingEvidence: [] as readonly AssemblyImplementationBindingEvidence[],
};
