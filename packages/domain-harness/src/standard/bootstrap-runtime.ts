/**
 * v0.7 E7 production Standard candidates — Assembly/runtime consumption
 * (issue #906, E7-BOOT successor; authority #713@6041746570 RELEASED_BOUNDED;
 * acceptance packet #713@6041458190; companion Definition-plane module
 * `./bootstrap-definition.ts`).
 *
 * This module carries the two production-owned Standard candidates of
 * `bootstrap-definition.ts` through the EXISTING generic authorities — the
 * same entry points an app-defined control uses, with no Standard-only
 * registry/admission/activation/binding/invocation path:
 *
 * - the Standard Semantic candidate rides the existing Workflow Kind
 *   implementation/pin consumption: the T007A adapter factory
 *   (`createWorkflowKindImplementation`, `adapters/workflow-kind.ts`) mints
 *   the ordinary `KindImplementationBindingInput` for the exact
 *   `kaicreator.workflow@1.0.0` KindRef, consumed by the generic T002B seal
 *   (`sealRuntimeAssembly`, `contracts/runtime-assembly.ts`);
 * - the Standard Tool candidate gets ONE deterministic `effect=none`
 *   reference implementation over the EXISTING production concern of the
 *   canonical-JSON content-digest seam (`computeCanonicalJsonDigest`,
 *   `contracts/identity.js`): the opaque reference handle is paired with the
 *   exact pin by the generic T003C mint (`bindToolImplementation`,
 *   `contracts/tool-implementation-binding.ts`) after the exact T003B
 *   provider selection (`resolveCurrentCapabilityProvider`,
 *   `contracts/capability-provision.ts`);
 * - invocation rides the generic T004A exposure/request admission
 *   (`admitToolExposure` + `admitToolInvocationRequest`,
 *   `contracts/invocation-request.ts`) into the REAL T004B invocation
 *   (`invokeNonEffectfulTool`, `contracts/non-effectful-invocation.ts`) —
 *   the dispatch executes the reference implementation through the injected
 *   host calling-convention port only.
 *
 * Plane discipline: this module owns Assembly-plane material ONLY — exact
 * implementation pins (real content digests over the material each
 * implementation honors, frozen below) and the opaque reference handle.
 * Definition identity lives in `bootstrap-definition.ts`; Standard Set
 * sealing/currentness remains ordinary Assembly-plane currentness, proven in
 * tests/standard/e7-production-candidates.test.ts through the unedited
 * `contracts/standard.ts` authorities. Deliberately ABSENT here: any
 * Standard registry, selector, provider table, admission shortcut or
 * dispatch bypass — and any import of `contracts/standard.ts` (the frozen
 * no-privileged-coupling source scan of the landed E7 suite stays green;
 * the descriptor records are consumed as plain data).
 *
 * Host neutrality: no Node built-in is imported. The digest port is injected
 * (`Sha256Port`); the reference dispatch port factory takes the same injected
 * port, so any host binds its own SHA-256.
 */

import { createWorkflowKindImplementation } from '../adapters/workflow-kind.js';
import type { CurrentCapabilityProviderSelection } from '../contracts/capability-provision.js';
import { resolveCurrentCapabilityProvider } from '../contracts/capability-provision.js';
import {
  computeDefinitionGraphDigest,
  type DefinitionGraphEnvelope,
} from '../contracts/definition-graph.js';
import {
  computeCanonicalJsonDigest,
  type Sha256Port,
} from '../contracts/identity.js';
import type { JsonValue } from '../contracts/json.js';
import {
  admitToolExposure,
  admitToolInvocationRequest,
  type InvocationCallerContext,
  type ToolExposureAdmissionPolicy,
} from '../contracts/invocation-request.js';
import {
  invokeNonEffectfulTool,
  type NonEffectfulToolDispatchPort,
  type NonEffectfulToolInvocationResult,
} from '../contracts/non-effectful-invocation.js';
import {
  admitComponentWithAssembly,
  sealRuntimeAssembly,
  type SealedRuntimeAssembly,
} from '../contracts/runtime-assembly.js';
import { validateToolComponent } from '../contracts/tool-component.js';
import {
  bindToolImplementation,
  type SealedToolImplementationBinding,
} from '../contracts/tool-implementation-binding.js';
import {
  STANDARD_APPROVAL_WORKFLOW_COMPONENT,
  STANDARD_CANONICAL_DIGEST_CAPABILITY,
  STANDARD_CANONICAL_DIGEST_COMPONENT,
  STANDARD_CANONICAL_DIGEST_KIND_REF,
  STANDARD_CANONICAL_DIGEST_OPERATION_ID,
  standardBootstrapDefinitionGraph,
} from './bootstrap-definition.js';

// ---------------------------------------------------------------------------
// Assembly-plane implementation pins (real content digests)
// ---------------------------------------------------------------------------
//
// Each `implementationDigest` is a real SHA-256 content digest (hex, the
// `sha256:` convention) computed over the canonical JSON of the exact
// material the implementation honors — frozen identity material, never a
// placeholder:
// - the Workflow reference identity digest covers the canonical JSON of the
//   exact closed-world Workflow semantic body it implements;
// - the Tool Kind-binding identity digest covers the canonical JSON of the
//   exact Tool Component contract envelope;
// - the Tool execution reference identity digest covers the canonical JSON
//   of the exact operation contract it dispatches.

/**
 * Exact reference implementation pin of the Standard approval-workflow
 * Semantic candidate, bound to the exact `kaicreator.workflow@1.0.0` KindRef
 * through the ordinary T007A adapter factory.
 */
export const STANDARD_APPROVAL_WORKFLOW_IMPLEMENTATION = Object.freeze({
  implementationId: 'kaicreator.standard.implementation.approval-workflow',
  implementationVersion: '1.0.0',
  implementationDigest:
    'sha256:4b6fd135044d02a302bc16cf281ffe4be105769aa2bbedd17595a5cb57d2d09a',
});

/**
 * Exact KindImplementation pin of the canonical-digest Tool's Kind binding
 * (the T002B Kind-level binding whose validator is the generic
 * `validateToolComponent`).
 */
export const STANDARD_CANONICAL_DIGEST_KIND_IMPLEMENTATION = Object.freeze({
  implementationId: 'kaicreator.standard.implementation.canonical-digest-kind',
  implementationVersion: '1.0.0',
  implementationDigest:
    'sha256:a3d402236971091b8a7977d0bf601e1e2b3a1836c91a340ae356bc2f2b1bf731',
});

/**
 * Exact reference implementation pin of the canonical-digest Tool execution
 * candidate (the T003C-bound operation implementation).
 */
export const STANDARD_CANONICAL_DIGEST_IMPLEMENTATION = Object.freeze({
  implementationId: 'kaicreator.standard.implementation.canonical-digest',
  implementationVersion: '1.0.0',
  implementationDigest:
    'sha256:a7311355619d7ff5113ced63ed51e5f8217ca7f3bd2cf5ec04e894be0c34b43f',
});

// ---------------------------------------------------------------------------
// The deterministic effect=none reference implementation (opaque handle)
// ---------------------------------------------------------------------------

/**
 * Opaque runtime handle of the ONE deterministic `effect=none` reference
 * implementation of `op.digestCanonicalJson`: canonicalizes the portable
 * JSON input value through the EXISTING production digest seam and returns
 * `{ digest }`. The handle is plain frozen identity data — it carries no
 * function, closure, secret or host object; the executable behavior lives in
 * `createStandardCanonicalDigestDispatchPort` below, and T003C pairs this
 * handle with the exact pin OUTSIDE digest material.
 */
export const STANDARD_CANONICAL_DIGEST_REFERENCE_HANDLE = Object.freeze({
  toolComponentId: STANDARD_CANONICAL_DIGEST_COMPONENT.componentId,
  operationId: STANDARD_CANONICAL_DIGEST_OPERATION_ID,
  concern: 'kaicreator.standard.concern.canonical-json-digest',
});

/**
 * The reference implementation failure taxonomy (Tool-own thrown failures
 * propagate unchanged through the T004B dispatch, per PACK-C).
 */
export class StandardCanonicalDigestImplementationError extends Error {
  readonly code:
    | 'STANDARD_DIGEST_HANDLE_MISMATCH'
    | 'STANDARD_DIGEST_OPERATION_MISMATCH'
    | 'STANDARD_DIGEST_INPUT_INVALID';

  constructor(
    code:
      | 'STANDARD_DIGEST_HANDLE_MISMATCH'
      | 'STANDARD_DIGEST_OPERATION_MISMATCH'
      | 'STANDARD_DIGEST_INPUT_INVALID',
    message: string,
  ) {
    super(message);
    this.name = 'StandardCanonicalDigestImplementationError';
    this.code = code;
  }
}

/**
 * Mint the host calling-convention port for the reference implementation.
 * The injected `sha256` port keeps this module host-neutral; the returned
 * port dispatches ONLY the exact paired reference handle and the exact
 * admitted operation — a foreign handle or operation is the implementation's
 * own typed thrown failure (propagating unchanged through T004B, never
 * converted into an outcome by the kernel).
 */
export function createStandardCanonicalDigestDispatchPort(
  sha256: Sha256Port,
): NonEffectfulToolDispatchPort {
  return {
    async dispatch(query): Promise<unknown> {
      if (!Object.is(query.handle, STANDARD_CANONICAL_DIGEST_REFERENCE_HANDLE)) {
        throw new StandardCanonicalDigestImplementationError(
          'STANDARD_DIGEST_HANDLE_MISMATCH',
          'the dispatched handle is not the exact paired canonical-digest reference handle; the reference implementation never executes a foreign handle',
        );
      }
      if (query.operationId !== STANDARD_CANONICAL_DIGEST_OPERATION_ID) {
        throw new StandardCanonicalDigestImplementationError(
          'STANDARD_DIGEST_OPERATION_MISMATCH',
          `the reference implementation dispatches only "${STANDARD_CANONICAL_DIGEST_OPERATION_ID}"; "${query.operationId}" is refused`,
        );
      }
      const input = query.input as { readonly value?: unknown };
      if (
        typeof input !== 'object' ||
        input === null ||
        !Object.hasOwn(input, 'value')
      ) {
        throw new StandardCanonicalDigestImplementationError(
          'STANDARD_DIGEST_INPUT_INVALID',
          'the canonical-digest operation consumes exactly one portable JSON field "value"; missing or malformed input is the implementation\'s own typed failure',
        );
      }
      // The REAL production concern: the existing canonical-JSON digest seam
      // of contracts/identity.js — deterministic and effect=none.
      const digest = await computeCanonicalJsonDigest(input.value, sha256);
      return Object.freeze({ digest });
    },
  };
}

// ---------------------------------------------------------------------------
// Generic bootstrap: T002B seal -> T003B exact selection -> T003C binding
// ---------------------------------------------------------------------------

/** Complete generic-path bootstrap evidence for the two Standard candidates. */
export interface StandardBootstrapEvidence {
  /** The ordinary Definition graph (Definition plane, from the definition module). */
  readonly definitionGraph: DefinitionGraphEnvelope;
  /** The base sealed Runtime Assembly (generic T002B mint over both Kind bindings). */
  readonly assembly: SealedRuntimeAssembly;
  /** The exact T003B provider selection of the canonical-digest Tool. */
  readonly selection: CurrentCapabilityProviderSelection;
  /** The genuine T003C sealed Tool implementation binding (pin + paired handle). */
  readonly binding: SealedToolImplementationBinding;
  /** The T003C successor Assembly — the T004A/T004B currentness anchor. */
  readonly successorAssembly: SealedRuntimeAssembly;
}

/**
 * Carry both production-owned Standard candidates through the EXISTING
 * generic authorities, in the exact order an app-defined control would:
 *
 * 1. T002B `sealRuntimeAssembly` over the ordinary Definition graph with the
 *    two ordinary KindImplementation bindings — the Workflow Kind binding
 *    minted by the existing T007A adapter factory (pin consumption), the
 *    Tool Kind binding over the generic `validateToolComponent` validator
 *    understanding the canonical-digest Capability;
 * 2. T003B `resolveCurrentCapabilityProvider` — the EXACT provider selection
 *    of the canonical-digest Tool for the approval-workflow consumer;
 * 3. T003C `bindToolImplementation` — the genuine sealed binding pairing the
 *    exact reference pin with the opaque reference handle, minted into the
 *    successor Assembly.
 *
 * No Standard-only step exists: every call is the identical generic entry
 * point an app calls with its own material.
 */
export async function bootstrapStandardCandidates(
  sha256: Sha256Port,
): Promise<StandardBootstrapEvidence> {
  const definitionGraph = standardBootstrapDefinitionGraph();
  const definitionGraphDigest = await computeDefinitionGraphDigest(definitionGraph, sha256);

  // Existing Workflow Kind implementation/pin consumption (T007A adapter):
  // the factory mints the ordinary KindImplementationBindingInput; the Kind
  // binding understands the Capability the workflow Component requires.
  const workflowKindBinding = createWorkflowKindImplementation({
    implementation: { ...STANDARD_APPROVAL_WORKFLOW_IMPLEMENTATION },
    understoodCapabilities: [{ ...STANDARD_CANONICAL_DIGEST_CAPABILITY }],
  });

  const assembly = await sealRuntimeAssembly(
    {
      definitionGraph,
      kindImplementations: [
        workflowKindBinding,
        Object.freeze({
          pin: Object.freeze({
            kind: Object.freeze({
              kindId: STANDARD_CANONICAL_DIGEST_KIND_REF.kindId,
              version: STANDARD_CANONICAL_DIGEST_KIND_REF.version,
            }),
            implementation: Object.freeze({
              ...STANDARD_CANONICAL_DIGEST_KIND_IMPLEMENTATION,
            }),
          }),
          understoodSemanticContracts: Object.freeze([]),
          understoodCapabilities: Object.freeze([]),
          validateComponent: validateToolComponent,
        }),
      ],
    },
    sha256,
  );

  // T003B exact provider selection: the canonical-digest Tool is the exact
  // provider of the Capability the approval-workflow consumer requires.
  const selection = await resolveCurrentCapabilityProvider(
    definitionGraph,
    STANDARD_CANONICAL_DIGEST_CAPABILITY,
    STANDARD_APPROVAL_WORKFLOW_COMPONENT.componentId,
    definitionGraphDigest,
    sha256,
  );

  // T003C genuine binding: the exact reference pin paired with the opaque
  // reference handle, minted into the successor Assembly.
  const binding = await bindToolImplementation({
    assembly,
    selection: JSON.parse(JSON.stringify(selection)) as CurrentCapabilityProviderSelection,
    currentDefinitionGraph: definitionGraph,
    implementations: Object.freeze([
      Object.freeze({
        implementation: Object.freeze({ ...STANDARD_CANONICAL_DIGEST_IMPLEMENTATION }),
        supportedOperations: Object.freeze([STANDARD_CANONICAL_DIGEST_OPERATION_ID]),
        handle: STANDARD_CANONICAL_DIGEST_REFERENCE_HANDLE,
      }),
    ]),
    sha256,
  });

  return Object.freeze({
    definitionGraph,
    assembly,
    selection,
    binding,
    successorAssembly: binding.successorAssembly,
  });
}

// ---------------------------------------------------------------------------
// Generic invocation: T004A exposure/request admission -> REAL T004B invocation
// ---------------------------------------------------------------------------

/** Reference exposure-admission policy: admit every caller. Real hosts inject
 * their own trusted policy port through the generic T004A seam; this
 * reference policy exists so the Standard bootstrap concern is executable
 * end-to-end without granting any authority (admission remains T004A-owned). */
export const STANDARD_OPEN_EXPOSURE_POLICY: ToolExposureAdmissionPolicy = Object.freeze({
  decideAdmission(): { readonly admitted: true } {
    return Object.freeze({ admitted: true } as const);
  },
});

/** Complete input of ONE Standard canonical-digest invocation. */
export interface InvokeStandardCanonicalDigestInput {
  /** Bootstrap evidence from `bootstrapStandardCandidates` (generic path). */
  readonly bootstrap: StandardBootstrapEvidence;
  /** Portable JSON value to digest. */
  readonly value: JsonValue;
  /** Injected Sha256Port (host-neutral). */
  readonly sha256: Sha256Port;
  /** Optional generic caller context (provenance only, never authority). */
  readonly caller?: InvocationCallerContext;
  /** Optional trusted exposure-admission policy (defaults to the open reference). */
  readonly exposurePolicy?: ToolExposureAdmissionPolicy;
}

/**
 * Invoke the Standard canonical-digest Tool through the REAL generic
 * T004A -> T004B path — the mandatory E7 invocation witness:
 *
 * 1. T004A `admitToolExposure` over the exact current state (successor
 *    Assembly anchor), with the caller-supplied (or reference open) policy;
 * 2. T004A `admitToolInvocationRequest` binding the frozen input
 *    `{ value }`, the caller provenance and the exposure evidence;
 * 3. T004B `invokeNonEffectfulTool`, which independently re-admits the
 *    request, re-derives the `effect=none` class, re-verifies the T003C
 *    sealed binding against the anchor and dispatches ONLY the
 *    verifier-paired reference handle through the injected host port.
 *
 * The result is the ordinary observational T004B outcome — identical in
 * shape to an app-defined Tool control's outcome.
 */
export async function invokeStandardCanonicalDigest(
  input: InvokeStandardCanonicalDigestInput,
): Promise<NonEffectfulToolInvocationResult> {
  const caller: InvocationCallerContext = input.caller ??
    Object.freeze({ callerId: 'kaicreator.standard.bootstrap' });
  const policy = input.exposurePolicy ?? STANDARD_OPEN_EXPOSURE_POLICY;
  const { definitionGraph, binding, successorAssembly } = input.bootstrap;

  // T004A exposure admission (generic seam; typed failures propagate unchanged).
  const exposure = await admitToolExposure(
    {
      toolComponentId: STANDARD_CANONICAL_DIGEST_COMPONENT.componentId,
      operationId: STANDARD_CANONICAL_DIGEST_OPERATION_ID,
      caller,
      assembly: successorAssembly,
      currentDefinitionGraph: definitionGraph,
      policy,
    },
    input.sha256,
  );

  // T004A request admission over the exact current state.
  const admitted = await admitToolInvocationRequest(
    {
      toolComponentId: STANDARD_CANONICAL_DIGEST_COMPONENT.componentId,
      operationId: STANDARD_CANONICAL_DIGEST_OPERATION_ID,
      input: Object.freeze({ value: input.value }),
      caller,
      definitionGraphDigest: exposure.definitionGraphDigest,
      assemblyDigest: exposure.assemblyDigest,
      exposure,
    },
    { assembly: successorAssembly, currentDefinitionGraph: definitionGraph },
    input.sha256,
  );

  // REAL T004B invocation through the injected host calling-convention port.
  return await invokeNonEffectfulTool({
    request: admitted,
    binding,
    currentDefinitionGraph: definitionGraph,
    dispatch: createStandardCanonicalDigestDispatchPort(input.sha256),
    sha256: input.sha256,
  });
}

// ---------------------------------------------------------------------------
// Assembly-plane admission helper (the existing Workflow Kind path)
// ---------------------------------------------------------------------------

/**
 * Admit the Standard approval-workflow Component through the SAME generic
 * T002B Assembly admission an app Component uses, against the base sealed
 * Assembly — existing Workflow Kind implementation/pin consumption with the
 * ordinary evidence shape (exact admitted pin, Definition/Assembly digests).
 */
export async function admitStandardApprovalWorkflow(
  bootstrap: StandardBootstrapEvidence,
  sha256: Sha256Port,
) {
  return await admitComponentWithAssembly(
    Object.freeze({
      family: STANDARD_APPROVAL_WORKFLOW_COMPONENT.family,
      componentId: STANDARD_APPROVAL_WORKFLOW_COMPONENT.componentId,
      kind: Object.freeze({
        kindId: STANDARD_APPROVAL_WORKFLOW_COMPONENT.kind.kindId,
        version: STANDARD_APPROVAL_WORKFLOW_COMPONENT.kind.version,
      }),
      requiredSemanticContracts: Object.freeze([]),
      requiredCapabilities: Object.freeze([{ ...STANDARD_CANONICAL_DIGEST_CAPABILITY }]),
      semanticBody: STANDARD_APPROVAL_WORKFLOW_COMPONENT.semanticBody,
    }),
    bootstrap.assembly,
    { currentDefinitionGraph: bootstrap.definitionGraph, sha256 },
  );
}
