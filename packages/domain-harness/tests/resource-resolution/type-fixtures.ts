/**
 * T005B compile-time type fixtures (issue #608, planning authority #589
 * PACK-A T005B).
 *
 * Proof-only fixtures: typechecked by `tsc -p tsconfig.test.json --noEmit`
 * but never executed. `Expect`/`Equal` force compile failures when the
 * resource resolution contract regresses (taxonomy drift, digest/secret
 * material smuggled into the result surface, mutable authority fields), and
 * `@ts-expect-error` blocks prove negative boundaries stay unrepresentable:
 * floating provider statuses, resolved responses without handles, secret or
 * endpoint fields on any T005B surface, and fallback-provider material in the
 * resolution options.
 */
import type { ComponentEnvelope } from '../../src/contracts/component.js';
import type {
  ResourceProvider,
  ResourceProviderResponse,
  ResourceResolutionError,
  ResourceResolutionErrorCode,
  ResourceResolutionRequest,
  ResolvedResourceEntry,
  ResolvedToolResources,
  ResolveToolResourcesOptions,
} from '../../src/contracts/resource-resolution.js';
import type { SealedRuntimeAssembly } from '../../src/contracts/runtime-assembly.js';

type Expect<T extends true> = T;
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// F1: the failure taxonomy is exactly the five PACK-A T005B categories.
export type ErrorCodesExactly = Expect<
  Equal<
    ResourceResolutionErrorCode,
    | 'INVALID_RESOLUTION_INPUT'
    | 'INVALID_RESOURCE_PROVIDER_RESPONSE'
    | 'MISSING_REQUIRED_RESOURCE'
    | 'INCOMPATIBLE_RESOURCE'
    | 'RESOURCE_PROVIDER_FAILURE'
  >
>;
export type ErrorCodeField = Expect<Equal<ResourceResolutionError['code'], ResourceResolutionErrorCode>>;

// F2: the request handed to the provider is exact identity + requiredness
// only — no handle, secret, endpoint, or digest material is representable.
export type RequestShape = Expect<
  Equal<
    ResourceResolutionRequest,
    {
      readonly componentId: string;
      readonly resourceKey: string;
      readonly contract?: { readonly contractId: string; readonly version: string };
      readonly operationId?: string;
      readonly required: boolean;
    }
  >
>;
export const requestSecretSmuggling: ResourceResolutionRequest = {
  componentId: 'tool.alpha',
  resourceKey: 'runtime.postgres',
  required: true,
  // @ts-expect-error live secrets are structurally unrepresentable on the request
  password: 'hunter2',
};
export const requestEndpointSmuggling: ResourceResolutionRequest = {
  componentId: 'tool.alpha',
  resourceKey: 'runtime.postgres',
  required: true,
  // @ts-expect-error endpoints/locations are structurally unrepresentable on the request
  connectionString: 'postgres://host:5432',
};

// F3: provider responses are a closed three-status union; handles are opaque
// (unknown); a resolved response MUST carry a handle; statuses are exact
// literals, never floating tokens.
export type ResponseUnion = Expect<
  Equal<
    ResourceProviderResponse,
    | { readonly status: 'resolved'; readonly handle: unknown; readonly contract?: { readonly contractId: string; readonly version: string } }
    | { readonly status: 'absent' }
    | { readonly status: 'incompatible'; readonly supportedContracts?: readonly { readonly contractId: string; readonly version: string }[] }
  >
>;
// @ts-expect-error a resolved response must carry the opaque handle
export const resolvedWithoutHandle: ResourceProviderResponse = {
  status: 'resolved',
};
export const floatingStatus: ResourceProviderResponse = {
  // @ts-expect-error provider statuses are the exact closed union; floating tokens are forbidden
  status: 'latest',
};
export const absentWithHandleSmuggling: ResourceProviderResponse = {
  status: 'absent',
  // @ts-expect-error an absent response carries no handle material
  handle: { connection: 'opaque' },
};

// F4: the result surface is runtime-only — no digest, evidence, or secret
// fields exist on it, and entries are the exact resolved|absent union.
export type ResultShape = Expect<
  Equal<keyof ResolvedToolResources, 'componentId' | 'operationId' | 'resources'>
>;
export type EntryUnion = Expect<
  Equal<
    ResolvedResourceEntry,
    | { readonly resourceKey: string; readonly status: 'resolved'; readonly handle: unknown }
    | { readonly resourceKey: string; readonly status: 'absent' }
  >
>;
export const resultDigestSmuggling: ResolvedToolResources = {
  componentId: 'tool.alpha',
  resources: new Map(),
  // @ts-expect-error the resolution result is never digest/currentness authority material (T005C owns identity)
  assemblyDigest: 'sha256:assembly',
};
export const absentEntryWithHandle: ResolvedResourceEntry = {
  resourceKey: 'runtime.postgres',
  status: 'absent',
  // @ts-expect-error an absent entry never carries a stand-in/default handle
  handle: 'ambient-default',
};

// F5: the options surface is exactly {assembly, componentId, operationId?,
// provider} — no fallback/downgrade/ordering material is representable.
export type OptionsShape = Expect<
  Equal<keyof ResolveToolResourcesOptions, 'assembly' | 'componentId' | 'operationId' | 'provider'>
>;
declare const sealedAssembly: SealedRuntimeAssembly;
declare const provider: ResourceProvider;
export const fallbackProviderSmuggling: ResolveToolResourcesOptions = {
  assembly: sealedAssembly,
  componentId: 'tool.alpha',
  provider,
  // @ts-expect-error there is exactly one injected provider; no fallback/downgrade chain exists
  fallbackProvider: provider,
};
export const unknownExtraOption: ResolveToolResourcesOptions = {
  assembly: sealedAssembly,
  componentId: 'tool.alpha',
  provider,
  // @ts-expect-error closed-world options; ambient/default knobs are unrepresentable
  defaultResources: {},
};

// F6: provider replacement is structural — any object with a compatible
// resolve seam is a ResourceProvider; the core consumes the port only.
const alternativeProvider: ResourceProvider = {
  async resolve(request) {
    const envelope: ComponentEnvelope | undefined = undefined;
    void envelope;
    void request;
    return { status: 'resolved', handle: { db: 'opaque-host-object' } };
  },
};
export const replacementIsStructural: ResourceProvider = alternativeProvider;
