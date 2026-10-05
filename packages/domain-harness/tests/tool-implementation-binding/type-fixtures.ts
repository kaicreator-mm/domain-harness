/**
 * T003C compile-time type fixtures (issue #607; authority #589 PACK-A).
 *
 * Proof-only fixtures: typechecked by `tsc -p tsconfig.test.json --noEmit`
 * but never executed. `Expect`/`Equal` force compile failures when the Tool
 * implementation binding contract regresses (taxonomy drift, mutable
 * authority surfaces, smuggled runtime-handle material), and
 * `@ts-expect-error` blocks prove negative boundaries stay unrepresentable:
 * module paths / provider objects / invoke functions are never part of the
 * exact pin or the serializable evidence; callers cannot mint a
 * SealedToolImplementationBinding by hand.
 */
import type { CapabilityContractRef, ComponentId } from '../../src/contracts/component.js';
import type { DefinitionGraphEnvelope } from '../../src/contracts/definition-graph.js';
import type { ContentDigest, Sha256Port } from '../../src/contracts/identity.js';
import type { CurrentCapabilityProviderSelection } from '../../src/contracts/capability-provision.js';
import type { SealedRuntimeAssembly } from '../../src/contracts/runtime-assembly.js';
import {
  bindToolImplementation,
  type BindToolImplementationInput,
  type SealedToolImplementationBinding,
  type ToolImplementationBindingError,
  type ToolImplementationBindingErrorCode,
  type ToolImplementationBindingEvidence,
  type ToolImplementationCandidate,
} from '../../src/contracts/tool-implementation-binding.js';

type Expect<T extends true> = T;
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// F1: the failure taxonomy is exactly the six T003C categories.
export type ErrorCodesExactly = Expect<
  Equal<
    ToolImplementationBindingErrorCode,
    | 'INVALID_BINDING_INPUT'
    | 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN'
    | 'MISSING_TOOL_IMPLEMENTATION'
    | 'AMBIGUOUS_TOOL_IMPLEMENTATION'
    | 'INCOMPATIBLE_TOOL_IMPLEMENTATION'
    | 'DEFINITION_GRAPH_DIGEST_MISMATCH'
  >
>;
export type ErrorCodeField = Expect<
  Equal<ToolImplementationBindingError['code'], ToolImplementationBindingErrorCode>
>;

// F2: the exact pin is exactly id/version/content-digest — never module
// paths, provider objects, function identity or registry order.
export type ImplementationIdentityShape = Expect<
  Equal<
    ToolImplementationCandidate['implementation'],
    {
      readonly implementationId: string;
      readonly implementationVersion: string;
      readonly implementationDigest: ContentDigest;
    }
  >
>;
export const modulePathSmuggling: ToolImplementationCandidate = {
  implementation: {
    implementationId: 'impl.alpha',
    implementationVersion: '1.0.0',
    implementationDigest: 'sha256:alpha',
  },
  supportedOperations: ['op.a'],
  // @ts-expect-error module paths are never identity (PACK-A T003C)
  modulePath: './node_modules/acme',
};
export const providerObjectSmuggling: ToolImplementationCandidate = {
  implementation: {
    implementationId: 'impl.alpha',
    implementationVersion: '1.0.0',
    implementationDigest: 'sha256:alpha',
  },
  supportedOperations: ['op.a'],
  // @ts-expect-error mutable provider objects are never identity
  provider: { getImplementation: () => {} },
};
export const invokeSmuggling: ToolImplementationCandidate = {
  implementation: {
    implementationId: 'impl.alpha',
    implementationVersion: '1.0.0',
    implementationDigest: 'sha256:alpha',
  },
  supportedOperations: ['op.a'],
  // @ts-expect-error invocation semantics are a T004 concern; the candidate
  // envelope carries no invoke function
  invoke: () => {},
};

// F3: the serializable binding evidence carries identity material only — no
// runtime handle, secret, endpoint, provider object or invoke function.
export type EvidenceShape = Expect<
  Equal<
    ToolImplementationBindingEvidence,
    {
      readonly status: 'BOUND';
      readonly definitionGraphDigest: ContentDigest;
      readonly assemblyDigest: ContentDigest;
      readonly toolComponentId: ComponentId;
      readonly providesCapability: CapabilityContractRef;
      readonly implementation: {
        readonly implementationId: string;
        readonly implementationVersion: string;
        readonly implementationDigest: ContentDigest;
      };
      readonly supportedOperations: readonly string[];
      readonly bindingDigest: ContentDigest;
    }
  >
>;
export const evidenceHandleSmuggling: ToolImplementationBindingEvidence = {
  status: 'BOUND',
  definitionGraphDigest: 'sha256:graph',
  assemblyDigest: 'sha256:assembly',
  toolComponentId: 'tool.alpha',
  providesCapability: { capabilityId: 'cap.a', version: '1.0.0' },
  implementation: {
    implementationId: 'impl.alpha',
    implementationVersion: '1.0.0',
    implementationDigest: 'sha256:alpha',
  },
  supportedOperations: ['op.a'],
  bindingDigest: 'sha256:evidence',
  // @ts-expect-error runtime handles are paired with the pin OUTSIDE digest
  // material; they are structurally unrepresentable on the evidence
  implementationHandle: { connection: 'live' },
};

// F4: a public caller cannot hand-mint a SealedToolImplementationBinding
// (brand is module-private).
declare const wouldBeForgery: {
  readonly evidence: ToolImplementationBindingEvidence;
  readonly successorAssembly: SealedRuntimeAssembly;
  readonly implementationHandle: unknown;
};
// @ts-expect-error the sealed-binding brand is not implementable outside the
// binding module — a caller-constructed object is not a SealedToolImplementationBinding
export const forgedBinding: SealedToolImplementationBinding = wouldBeForgery;

// F5: the bind seam is one input record -> Promise<SealedToolImplementationBinding>.
export type BindSeamShape = Expect<
  Equal<
    typeof bindToolImplementation,
    (input: BindToolImplementationInput) => Promise<SealedToolImplementationBinding>
  >
>;

// F6: the bind input dimensions are exactly the T003C concerns — sealed
// Assembly, T003B selection evidence, current graph, offered candidates,
// optional narrowing, optional exact pin, Sha256Port.
export const bindInputFixture: BindToolImplementationInput = {
  assembly: {} as SealedRuntimeAssembly,
  selection: {} as CurrentCapabilityProviderSelection,
  currentDefinitionGraph: {} as DefinitionGraphEnvelope,
  implementations: [] as readonly ToolImplementationCandidate[],
  requiredOperations: [] as readonly string[],
  exactPin: {
    implementationId: 'impl.alpha',
    implementationVersion: '1.0.0',
    implementationDigest: 'sha256:alpha',
  },
  sha256: {} as Sha256Port,
};
