/**
 * T004A compile-time type fixtures (issue #609, fine-grained DAG #534 T004A;
 * authority #589 PACK-A T004A section).
 *
 * Proof-only fixtures: typechecked by `tsc -p tsconfig.test.json --noEmit`
 * but never executed. `Expect`/`Equal` force compile failures when the
 * invocation request contract regresses (taxonomy drift, mutable authority
 * surfaces, smuggled runtime-handle or effect-authority material), and
 * `@ts-expect-error` blocks prove negative boundaries stay unrepresentable:
 * callers cannot mint an `AdmittedToolExposure` by hand (the minting brand
 * is module-private), and the admitted request never carries dispatch,
 * occurrence or journal handles.
 */
import type {
  AdmittedToolExposure,
  AdmittedToolInvocationRequest,
  InvocationCallerContext,
  InvocationRequestError,
  InvocationRequestErrorCode,
  ToolExposureAdmissionPolicy,
  ToolInvocationRequest,
} from '../../src/contracts/invocation-request.js';
import type { ComponentId } from '../../src/contracts/component.js';
import type { ContentDigest } from '../../src/contracts/identity.js';
import type { JsonValue } from '../../src/contracts/json.js';
import type { ToolOperationEffect } from '../../src/contracts/tool-component.js';

type Expect<T extends true> = T;
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// F1: the failure taxonomy is exactly the sixteen T004A categories.
export type ErrorCodesExactly = Expect<
  Equal<
    InvocationRequestErrorCode,
    | 'INVALID_INVOCATION_INPUT'
    | 'INVALID_INVOCATION_CALLER'
    | 'INVALID_INVOCATION_REQUEST'
    | 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN'
    | 'INVALID_EXPOSURE_POLICY'
    | 'INVALID_ASSEMBLY_EVIDENCE'
    | 'ASSEMBLY_DIGEST_MISMATCH'
    | 'DEFINITION_CURRENTNESS_MISMATCH'
    | 'ASSEMBLY_CURRENTNESS_MISMATCH'
    | 'EXPOSURE_CURRENTNESS_MISMATCH'
    | 'FORGED_EXPOSURE_EVIDENCE'
    | 'INVOCATION_BINDING_MISMATCH'
    | 'INVOCATION_CALLER_MISMATCH'
    | 'TOOL_COMPONENT_NOT_BOUND'
    | 'INVALID_TOOL_INVOCATION_TARGET'
    | 'EXPOSURE_NOT_ADMITTED'
  >
>;
export type ErrorCodeField = Expect<Equal<InvocationRequestError['code'], InvocationRequestErrorCode>>;

// F2: the caller context is ONE generic, caller-neutral shape: exact
// callerId plus optional open provenance material. callerKind is an open
// string — never a closed workflow|agent|ux|internal union, so no adapter
// plane can require a kernel branch.
export type CallerContextShape = Expect<
  Equal<
    InvocationCallerContext,
    {
      readonly callerId: string;
      readonly callerKind?: string;
      readonly attributes?: JsonValue;
    }
  >
>;
export type CallerKindIsOpenString = Expect<Equal<InvocationCallerContext['callerKind'], string | undefined>>;

// F3: the request binds exactly the seven PACK-A dimensions — nothing more.
export type RequestShape = Expect<
  Equal<
    ToolInvocationRequest,
    {
      readonly toolComponentId: ComponentId;
      readonly operationId: string;
      readonly input: JsonValue;
      readonly caller: InvocationCallerContext;
      readonly definitionGraphDigest: ContentDigest;
      readonly assemblyDigest: ContentDigest;
      readonly exposure: AdmittedToolExposure;
    }
  >
>;

// F4: the admitted request is serializable identity + classification
// material only — no function, handle, dispatch, occurrence or journal
// surface exists anywhere in the type.
export type AdmittedRequestShape = Expect<
  Equal<
    AdmittedToolInvocationRequest,
    {
      readonly status: 'ADMITTED';
      readonly toolComponentId: ComponentId;
      readonly operationId: string;
      readonly input: JsonValue;
      readonly caller: InvocationCallerContext;
      readonly operationEffect: ToolOperationEffect;
      readonly definitionGraphDigest: ContentDigest;
      readonly assemblyDigest: ContentDigest;
      readonly exposure: AdmittedToolExposure;
    }
  >
>;

// F5: exposure evidence binds identity + caller snapshot + exposure digest —
// the operation effect class is deliberately NOT part of exposure evidence,
// and the only symbol-keyed member is the module-private minting brand.
export type ExposureEvidenceFieldsExactly = Expect<
  Equal<
    Exclude<keyof AdmittedToolExposure, symbol>,
    | 'status'
    | 'toolComponentId'
    | 'operationId'
    | 'caller'
    | 'definitionGraphDigest'
    | 'assemblyDigest'
    | 'exposureDigest'
  >
>;

// F6: the exposure policy is one generic injected port; the operation
// contract and caller context flow in, an admit/deny decision flows out.
export type PolicyDecisionShape = Expect<
  Equal<
    ReturnType<ToolExposureAdmissionPolicy['decideAdmission']>,
    { readonly admitted: true } | { readonly admitted: false; readonly reason?: string }
  >
>;

// F7: negative boundaries — the minting brand is module-private, so no
// caller can construct evidence by hand, and no admitted-request field can
// be widened into a handle.
declare const wouldBeEvidenceForgery: {
  readonly status: 'ADMITTED';
  readonly toolComponentId: ComponentId;
  readonly operationId: string;
  readonly caller: InvocationCallerContext;
  readonly definitionGraphDigest: ContentDigest;
  readonly assemblyDigest: ContentDigest;
  readonly exposureDigest: ContentDigest;
};
// @ts-expect-error the exposure-evidence brand is not implementable outside
// the minting module — a caller-constructed object is not AdmittedToolExposure
export const forgedEvidence: AdmittedToolExposure = wouldBeEvidenceForgery;

declare const genuineExposure: AdmittedToolExposure;
export const admittedRequestHasNoDispatchHandle: AdmittedToolInvocationRequest = {
  status: 'ADMITTED',
  toolComponentId: 'tool.alpha',
  operationId: 'op.query',
  input: {},
  caller: { callerId: 'caller.x' },
  operationEffect: 'none',
  definitionGraphDigest: 'sha256:graph',
  assemblyDigest: 'sha256:assembly',
  exposure: genuineExposure,
  // @ts-expect-error no dispatch/execute/occurrence/journal field exists on the admitted request.
  execute: () => undefined,
};
