/**
 * T004B tests-first matrix — Non-effectful Tool invocation path
 * (issue #632, fine-grained DAG #534 T004B; authority #589 PACK-C T004B
 * section; #691 post-merge bounded repair).
 *
 * Covers the PACK-C T004B test list:
 *  - pure success: an operation classified `effect=none` dispatches the exact
 *    runtime handle paired with the exact current implementation pin and
 *    returns frozen, non-aliasing observational output;
 *  - effectful operation rejected: any effect class other than `none` fails
 *    closed before the dispatch port runs — never rerouted, never fallen
 *    back to an effectful path;
 *  - exact implementation dispatch: the handle that runs is the handle paired
 *    with the exact pin in the T003C sealed binding, and the result binds
 *    that exact pin + binding digest for audit;
 *  - #691 binding authenticity matrix: hand-built binding forgeries — however
 *    field-perfect — fail closed at the T003C mint seam
 *    (UNMINTED_TOOL_IMPLEMENTATION_BINDING propagates unchanged); a GENUINE
 *    binding still fails INVALID_BINDING_EVIDENCE when its verified subject
 *    or bound operation set does not match the admitted request;
 *  - required resources go through T005B resolution before dispatch; a
 *    resource failure is terminal and fails before the Tool call; assembly
 *    requirements without a provider fail closed;
 *  - Tool thrown failures propagate unchanged and no authoritative outcome is
 *    synthesized; a non-portable Tool output fails closed.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import type { ComponentEnvelope } from '../../src/contracts/component.js';
import {
  computeDefinitionGraphDigest,
  type DefinitionGraphEnvelope,
} from '../../src/contracts/definition-graph.js';
import type { Sha256Port } from '../../src/contracts/identity.js';
import { resolveCurrentCapabilityProvider } from '../../src/contracts/capability-provision.js';
import {
  sealRuntimeAssembly,
  type KindImplementationBindingInput,
  type SealRuntimeAssemblyInput,
} from '../../src/contracts/runtime-assembly.js';
import {
  ToolImplementationBindingError,
  bindToolImplementation,
  type SealedToolImplementationBinding,
  type ToolImplementationCandidate,
  type ToolImplementationIdentity,
} from '../../src/contracts/tool-implementation-binding.js';
import {
  admitToolExposure,
  admitToolInvocationRequest,
  type AdmittedToolInvocationRequest,
  type InvocationCallerContext,
  type ToolExposureAdmissionPolicy,
} from '../../src/contracts/invocation-request.js';
import {
  ResourceResolutionError,
  type ResourceProvider,
  type ResourceProviderResponse,
} from '../../src/contracts/resource-resolution.js';
import {
  NonEffectfulInvocationError,
  invokeNonEffectfulTool,
  type InvokeNonEffectfulToolInput,
  type NonEffectfulToolDispatchPort,
  type NonEffectfulToolDispatchQuery,
} from '../../src/contracts/non-effectful-invocation.js';

const realSha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

// ---------------------------------------------------------------------------
// Fixtures: one consumer + one Domain Tool provider over one exact Kind.
// ---------------------------------------------------------------------------

function consumer(): ComponentEnvelope {
  return {
    family: 'semantic',
    componentId: 'consumer.a',
    kind: { kindId: 'test.t004b-kind', version: '1.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: [{ capabilityId: 'cap.calc', version: '1.0.0' }],
    semanticBody: { note: 'consumer' },
  };
}

function toolComponent(overrides: Partial<ComponentEnvelope> = {}): ComponentEnvelope {
  return {
    family: 'tool',
    componentId: 'tool.alpha',
    kind: { kindId: 'test.t004b-kind', version: '1.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: {
      operations: [
        {
          operationId: 'op.query',
          inputSchema: { type: 'object' },
          outputSchema: {},
          effect: 'none',
          declaredExposure: { audiences: ['agent', 'ux'] },
        },
        { operationId: 'op.mutate', inputSchema: {}, outputSchema: {}, effect: 'non-idempotent' },
      ],
      providesCapabilities: [{ capabilityId: 'cap.calc', version: '1.0.0' }],
    },
    ...overrides,
  };
}

/** A second consumer of the same Kind requiring a second capability. */
function consumerB(): ComponentEnvelope {
  return {
    family: 'semantic',
    componentId: 'consumer.b',
    kind: { kindId: 'test.t004b-kind', version: '1.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: [{ capabilityId: 'cap.calc2', version: '1.0.0' }],
    semanticBody: { note: 'consumer-b' },
  };
}

/** A second genuine Tool Component of the same Kind providing cap.calc2. */
function toolComponentBeta(): ComponentEnvelope {
  return {
    family: 'tool',
    componentId: 'tool.beta',
    kind: { kindId: 'test.t004b-kind', version: '1.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: {
      operations: [
        {
          operationId: 'op.beta.query',
          inputSchema: { type: 'object' },
          outputSchema: {},
          effect: 'none',
        },
      ],
      providesCapabilities: [{ capabilityId: 'cap.calc2', version: '1.0.0' }],
    },
  };
}

function graph(overrides: Partial<DefinitionGraphEnvelope> = {}): DefinitionGraphEnvelope {
  return {
    graphId: 'graph.t004b',
    components: [consumer(), toolComponent()],
    relations: [],
    ...overrides,
  };
}

function kindBinding(overrides: Partial<KindImplementationBindingInput> = {}): KindImplementationBindingInput {
  return {
    pin: {
      kind: { kindId: 'test.t004b-kind', version: '1.0.0' },
      implementation: {
        implementationId: 'impl.t004b-kind',
        implementationVersion: '1.0.0',
        implementationDigest: 'sha256:kind-impl',
      },
    },
    understoodSemanticContracts: [],
    understoodCapabilities: [],
    validateComponent: () => {},
    ...overrides,
  };
}

function candidate(
  implementationId: string,
  overrides: Partial<ToolImplementationCandidate> = {},
  implementationOverrides: Record<string, string> = {},
): ToolImplementationCandidate {
  return {
    implementation: {
      implementationId,
      implementationVersion: '1.0.0',
      implementationDigest: `sha256:${implementationId}-content`,
      ...implementationOverrides,
    },
    supportedOperations: ['op.mutate', 'op.query'],
    ...overrides,
  };
}

const ADMIT_ALL: ToolExposureAdmissionPolicy = { decideAdmission: () => ({ admitted: true }) };

function caller(overrides: Partial<InvocationCallerContext> = {}): InvocationCallerContext {
  return { callerId: 'caller.session-1', callerKind: 'agent', attributes: { role: 'tester' }, ...overrides };
}

/** A dispatch port that records its queries and returns a fixed output. */
function recordingDispatch(
  calls: NonEffectfulToolDispatchQuery[],
  output: unknown = { ok: true, answer: 42 },
): NonEffectfulToolDispatchPort {
  return {
    async dispatch(query) {
      calls.push(query);
      return output;
    },
  };
}

interface Fixture {
  g: DefinitionGraphEnvelope;
  binding: SealedToolImplementationBinding;
  admitted: AdmittedToolInvocationRequest;
}

async function fixture(
  overrides: {
    operationId?: string;
    input?: unknown;
    candidates?: readonly ToolImplementationCandidate[];
    exactPin?: ToolImplementationIdentity;
    requiredOperations?: readonly string[];
    sealOverrides?: Partial<SealRuntimeAssemblyInput>;
  } = {},
): Promise<Fixture> {
  const g = graph();
  const sealInput: SealRuntimeAssemblyInput = {
    definitionGraph: g,
    kindImplementations: [kindBinding()],
    ...overrides.sealOverrides,
  };
  const baseAssembly = await sealRuntimeAssembly(sealInput, realSha256);
  const digest = await computeDefinitionGraphDigest(g, realSha256);
  const selection = await resolveCurrentCapabilityProvider(
    g,
    { capabilityId: 'cap.calc', version: '1.0.0' },
    'consumer.a',
    digest,
    realSha256,
  );
  const binding = await bindToolImplementation({
    assembly: baseAssembly,
    selection: JSON.parse(JSON.stringify(selection)),
    currentDefinitionGraph: g,
    implementations: overrides.candidates ?? [candidate('impl.calc.alpha')],
    ...(overrides.exactPin !== undefined ? { exactPin: overrides.exactPin } : {}),
    ...(overrides.requiredOperations !== undefined
      ? { requiredOperations: overrides.requiredOperations }
      : {}),
    sha256: realSha256,
  });
  const operationId = overrides.operationId ?? 'op.query';
  const exposure = await admitToolExposure(
    {
      toolComponentId: 'tool.alpha',
      operationId,
      caller: caller(),
      assembly: binding.successorAssembly,
      currentDefinitionGraph: g,
      policy: ADMIT_ALL,
    },
    realSha256,
  );
  const admitted = await admitToolInvocationRequest(
    {
      toolComponentId: 'tool.alpha',
      operationId,
      input: (overrides.input ?? { q: 1 }) as never,
      caller: caller(),
      definitionGraphDigest: binding.successorAssembly.record.definitionGraphDigest,
      assemblyDigest: binding.successorAssembly.assemblyDigest,
      exposure,
    },
    { assembly: binding.successorAssembly, currentDefinitionGraph: g },
    realSha256,
  );
  return { g, binding, admitted };
}

function invocationInput(
  fx: Fixture,
  overrides: Partial<InvokeNonEffectfulToolInput> = {},
): InvokeNonEffectfulToolInput {
  return {
    request: fx.admitted,
    binding: fx.binding,
    currentDefinitionGraph: fx.g,
    dispatch: recordingDispatch([]),
    sha256: realSha256,
    ...overrides,
  };
}

function expectInvocationError(
  promise: Promise<unknown>,
  code: string,
): Promise<NonEffectfulInvocationError> {
  return promise.then(
    () => {
      throw new Error(`expected NonEffectfulInvocationError(${code}), but invocation resolved`);
    },
    (error: unknown) => {
      assert.ok(
        error instanceof NonEffectfulInvocationError,
        `expected NonEffectfulInvocationError, got ${String(error)}`,
      );
      assert.equal(error.code, code);
      return error;
    },
  );
}

/**
 * T003C typed binding failures propagate UNCHANGED through the non-effectful
 * invocation boundary (#691 repair): T004B never re-owns the binding
 * authenticity semantics, so their codes surface as thrown.
 */
function expectBindingError(
  promise: Promise<unknown>,
  code: string,
): Promise<ToolImplementationBindingError> {
  return promise.then(
    () => {
      throw new Error(`expected ToolImplementationBindingError(${code}), but invocation resolved`);
    },
    (error: unknown) => {
      assert.ok(
        error instanceof ToolImplementationBindingError,
        `expected ToolImplementationBindingError, got ${String(error)}`,
      );
      assert.equal(error.code, code);
      return error;
    },
  );
}

// ---------------------------------------------------------------------------
// PACK-C T004B: pure success.
// ---------------------------------------------------------------------------

test('PACK-C T004B pure success: effect=none dispatches the exact paired handle and returns frozen observational output', async () => {
  const handle = { kind: 'runtime-handle', id: 'impl.calc.alpha#1' };
  const calls: NonEffectfulToolDispatchQuery[] = [];
  const fx = await fixture({ candidates: [candidate('impl.calc.alpha', { handle })] });

  const result = await invokeNonEffectfulTool(
    invocationInput(fx, { dispatch: recordingDispatch(calls) }),
  );

  assert.equal(result.status, 'OBSERVED');
  assert.equal(result.toolComponentId, 'tool.alpha');
  assert.equal(result.operationId, 'op.query');
  assert.deepEqual(result.output, { ok: true, answer: 42 });
  assert.deepEqual(result.implementation, {
    implementationId: 'impl.calc.alpha',
    implementationVersion: '1.0.0',
    implementationDigest: 'sha256:impl.calc.alpha-content',
  });
  assert.equal(result.bindingDigest, fx.binding.evidence.bindingDigest);
  assert.equal(result.definitionGraphDigest, fx.binding.successorAssembly.record.definitionGraphDigest);
  assert.equal(result.assemblyDigest, fx.binding.successorAssembly.assemblyDigest);

  // Exactly one dispatch, with the paired handle + the admitted operation and
  // input, and no resource material (the Assembly declares none).
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.handle, handle);
  assert.equal(calls[0]!.operationId, 'op.query');
  assert.deepEqual(calls[0]!.input, { q: 1 });
  assert.equal(calls[0]!.resources.size, 0);

  // The result is observational identity + output only: no transition,
  // occurrence or journal material is minted with it.
  assert.deepEqual(Object.keys(result).sort(), [
    'assemblyDigest',
    'bindingDigest',
    'definitionGraphDigest',
    'implementation',
    'operationId',
    'output',
    'status',
    'toolComponentId',
  ]);
  for (const forbidden of ['occurrenceId', 'journalEntry', 'transition', 'effectAuthority']) {
    assert.equal((result as unknown as Record<string, unknown>)[forbidden], undefined);
  }
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.output));
});

// ---------------------------------------------------------------------------
// PACK-C T004B: effectful operation rejected.
// ---------------------------------------------------------------------------

test('PACK-C T004B effectful rejected: a non-none effect class fails closed before dispatch — no reroute, no fallback', async () => {
  const calls: NonEffectfulToolDispatchQuery[] = [];
  const fx = await fixture({ operationId: 'op.mutate' });
  assert.equal(fx.admitted.operationEffect, 'non-idempotent');

  await expectInvocationError(
    invokeNonEffectfulTool(invocationInput(fx, { dispatch: recordingDispatch(calls) })),
    'EFFECTFUL_OPERATION_REJECTED',
  );
  assert.equal(calls.length, 0, 'the dispatch port must never run for an effectful operation');
});

// ---------------------------------------------------------------------------
// PACK-C T004B: exact implementation dispatch.
// ---------------------------------------------------------------------------

test('PACK-C T004B exact dispatch: the handle paired with the exact pin runs — never a sibling candidate handle', async () => {
  const pinAlpha: ToolImplementationIdentity = {
    implementationId: 'impl.calc.alpha',
    implementationVersion: '1.0.0',
    implementationDigest: 'sha256:impl.calc.alpha-content',
  };
  const handleAlpha = { id: 'handle.alpha' };
  const handleBravo = { id: 'handle.bravo' };
  const calls: NonEffectfulToolDispatchQuery[] = [];
  const fx = await fixture({
    candidates: [
      candidate('impl.calc.alpha', { handle: handleAlpha }),
      candidate('impl.calc.bravo', { handle: handleBravo }, {
        implementationVersion: '2.0.0',
        implementationDigest: 'sha256:impl.calc.bravo-content',
      }),
    ],
    exactPin: pinAlpha,
  });

  const result = await invokeNonEffectfulTool(
    invocationInput(fx, { dispatch: recordingDispatch(calls) }),
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.handle, handleAlpha, 'the exact pinned implementation handle must be dispatched');
  assert.notEqual(calls[0]!.handle, handleBravo);
  assert.deepEqual(result.implementation, pinAlpha);
  assert.equal(result.bindingDigest, fx.binding.evidence.bindingDigest);
});

// ---------------------------------------------------------------------------
// PACK-C T004B: binding authenticity + binding/request consistency matrix.
//
// #691 repair: binding AUTHENTICITY (module-private mint membership + evidence
// digest + exact final-Assembly slot/currentness) is owned by the T003C
// consumer verifier and its typed failures propagate UNCHANGED; hand-built
// lookalikes — however field-perfect — can never dispatch. T004B owns only the
// dispatch-gating consistency of a VERIFIED genuine binding against the
// admitted request (subject alignment, bound-operation containment).
// ---------------------------------------------------------------------------

test('PACK-C T004B consistency matrix: hand-built binding forgeries fail closed at the T003C mint seam before dispatch', async (t) => {
  const calls: NonEffectfulToolDispatchQuery[] = [];
  const fx = await fixture();
  const { binding } = fx;

  await t.test('a field-perfect lookalike of the genuine binding fails UNMINTED_TOOL_IMPLEMENTATION_BINDING', async () => {
    // Byte-identical public content: every evidence field copied, the genuine
    // successor Assembly and the genuine handle carried by reference. The
    // module-private T003C mint registry is the only authority — content
    // similarity contributes nothing.
    const lookalike = {
      evidence: { ...binding.evidence },
      successorAssembly: binding.successorAssembly,
      implementationHandle: binding.implementationHandle,
    } as unknown as SealedToolImplementationBinding;
    await expectBindingError(
      invokeNonEffectfulTool(invocationInput(fx, { binding: lookalike, dispatch: recordingDispatch(calls) })),
      'UNMINTED_TOOL_IMPLEMENTATION_BINDING',
    );
  });

  await t.test('evidence bound to a different Tool Component fails UNMINTED_TOOL_IMPLEMENTATION_BINDING', async () => {
    const forged = {
      evidence: { ...binding.evidence, toolComponentId: 'tool.other' },
      successorAssembly: binding.successorAssembly,
      implementationHandle: binding.implementationHandle,
    } as unknown as SealedToolImplementationBinding;
    await expectBindingError(
      invokeNonEffectfulTool(invocationInput(fx, { binding: forged, dispatch: recordingDispatch(calls) })),
      'UNMINTED_TOOL_IMPLEMENTATION_BINDING',
    );
  });

  await t.test('evidence carrying a different assembly digest fails UNMINTED_TOOL_IMPLEMENTATION_BINDING', async () => {
    const forged = {
      evidence: { ...binding.evidence, assemblyDigest: 'sha256:foreign-assembly' },
      successorAssembly: binding.successorAssembly,
      implementationHandle: binding.implementationHandle,
    } as unknown as SealedToolImplementationBinding;
    await expectBindingError(
      invokeNonEffectfulTool(invocationInput(fx, { binding: forged, dispatch: recordingDispatch(calls) })),
      'UNMINTED_TOOL_IMPLEMENTATION_BINDING',
    );
  });

  await t.test('evidence that dropped the admitted operation from the bound set fails UNMINTED_TOOL_IMPLEMENTATION_BINDING', async () => {
    const forged = {
      evidence: { ...binding.evidence, supportedOperations: ['op.mutate'] },
      successorAssembly: binding.successorAssembly,
      implementationHandle: binding.implementationHandle,
    } as unknown as SealedToolImplementationBinding;
    await expectBindingError(
      invokeNonEffectfulTool(invocationInput(fx, { binding: forged, dispatch: recordingDispatch(calls) })),
      'UNMINTED_TOOL_IMPLEMENTATION_BINDING',
    );
  });

  await t.test('a binding not carrying sealed binding evidence fails UNMINTED_TOOL_IMPLEMENTATION_BINDING', async () => {
    const forged = {
      successorAssembly: binding.successorAssembly,
      implementationHandle: binding.implementationHandle,
    } as unknown as SealedToolImplementationBinding;
    await expectBindingError(
      invokeNonEffectfulTool(invocationInput(fx, { binding: forged, dispatch: recordingDispatch(calls) })),
      'UNMINTED_TOOL_IMPLEMENTATION_BINDING',
    );
  });

  await t.test('binding evidence with an empty binding digest fails UNMINTED_TOOL_IMPLEMENTATION_BINDING', async () => {
    const forged = {
      evidence: { ...binding.evidence, bindingDigest: '' },
      successorAssembly: binding.successorAssembly,
      implementationHandle: binding.implementationHandle,
    } as unknown as SealedToolImplementationBinding;
    await expectBindingError(
      invokeNonEffectfulTool(invocationInput(fx, { binding: forged, dispatch: recordingDispatch(calls) })),
      'UNMINTED_TOOL_IMPLEMENTATION_BINDING',
    );
  });

  assert.equal(calls.length, 0, 'no authenticity failure may ever reach the dispatch port');
});

test('PACK-C T004B consistency: a GENUINE binding for a different Tool Component fails INVALID_BINDING_EVIDENCE before dispatch', async () => {
  const calls: NonEffectfulToolDispatchQuery[] = [];
  // tool.beta is a second genuine Tool Component of the SAME graph, bound
  // genuinely into its own successor Assembly. The request targets tool.alpha
  // and is admitted against bindingBeta's own successor Assembly (T004A is
  // Definition-plane and does not consult binding slots): everything is
  // genuine and current, but the verified binding's subject is tool.beta —
  // a binding can never dispatch another target's handle.
  const g = graph({
    components: [
      consumer(),
      consumerB(),
      toolComponent(),
      toolComponentBeta(),
    ],
  });
  const baseAssembly = await sealRuntimeAssembly(
    { definitionGraph: g, kindImplementations: [kindBinding()] },
    realSha256,
  );
  const digest = await computeDefinitionGraphDigest(g, realSha256);
  const selectionBeta = await resolveCurrentCapabilityProvider(
    g, { capabilityId: 'cap.calc2', version: '1.0.0' }, 'consumer.b', digest, realSha256,
  );
  const bindingBeta = await bindToolImplementation({
    assembly: baseAssembly,
    selection: JSON.parse(JSON.stringify(selectionBeta)),
    currentDefinitionGraph: g,
    implementations: [{
      implementation: {
        implementationId: 'impl.calc.beta',
        implementationVersion: '1.0.0',
        implementationDigest: 'sha256:impl.calc.beta-content',
      },
      supportedOperations: ['op.beta.query'],
      handle: { id: 'handle.beta' },
    }],
    sha256: realSha256,
  });
  const exposure = await admitToolExposure(
    {
      toolComponentId: 'tool.alpha',
      operationId: 'op.query',
      caller: caller(),
      assembly: bindingBeta.successorAssembly,
      currentDefinitionGraph: g,
      policy: ADMIT_ALL,
    },
    realSha256,
  );
  const admitted = await admitToolInvocationRequest(
    {
      toolComponentId: 'tool.alpha',
      operationId: 'op.query',
      input: { q: 1 },
      caller: caller(),
      definitionGraphDigest: bindingBeta.successorAssembly.record.definitionGraphDigest,
      assemblyDigest: bindingBeta.successorAssembly.assemblyDigest,
      exposure,
    },
    { assembly: bindingBeta.successorAssembly, currentDefinitionGraph: g },
    realSha256,
  );

  await expectInvocationError(
    invokeNonEffectfulTool({
      request: admitted,
      binding: bindingBeta,
      currentDefinitionGraph: g,
      dispatch: recordingDispatch(calls),
      sha256: realSha256,
    }),
    'INVALID_BINDING_EVIDENCE',
  );
  assert.equal(calls.length, 0);
});

test('PACK-C T004B consistency: a GENUINE binding whose bound operation set excludes the admitted operation fails INVALID_BINDING_EVIDENCE', async () => {
  const calls: NonEffectfulToolDispatchQuery[] = [];
  const fx = await fixture({ requiredOperations: ['op.mutate'] });
  assert.deepEqual([...fx.binding.evidence.supportedOperations], ['op.mutate']);

  // op.query is declared by the same Tool Component and admits fine, but the
  // verified binding pairs the handle only with the exact bound operation set.
  await expectInvocationError(
    invokeNonEffectfulTool(invocationInput(fx, { dispatch: recordingDispatch(calls) })),
    'INVALID_BINDING_EVIDENCE',
  );
  assert.equal(calls.length, 0);
});

test('PACK-C T004B input matrix: the invocation input is closed-world and every required field is enforced', async () => {
  const fx = await fixture();
  const base = invocationInput(fx);

  for (const field of [
    'request',
    'binding',
    'currentDefinitionGraph',
    'dispatch',
    'sha256',
  ] as const) {
    const incomplete = { ...base } as Record<string, unknown>;
    delete incomplete[field];
    await expectInvocationError(
      invokeNonEffectfulTool(incomplete as unknown as InvokeNonEffectfulToolInput),
      'INVALID_INVOCATION_INPUT',
    );
  }

  await expectInvocationError(
    invokeNonEffectfulTool(
      { ...base, extra: 'not-contract-material' } as unknown as InvokeNonEffectfulToolInput,
    ),
    'INVALID_INVOCATION_INPUT',
  );

  // #691 repair: no injected provenance port exists — assembly provenance is
  // decided by the directly consumed T002B mint verifier, and a second
  // caller/host-supplied authority is structurally unrepresentable (even a
  // well-formed affirming guard is rejected as an unexpected input field).
  await expectInvocationError(
    invokeNonEffectfulTool({
      ...base,
      assemblyProvenance: { verifyProvenance: () => ({ verified: true as const }) },
    } as unknown as InvokeNonEffectfulToolInput),
    'INVALID_INVOCATION_INPUT',
  );
  await expectInvocationError(
    invokeNonEffectfulTool({
      ...base,
      assemblyProvenance: null,
    } as unknown as InvokeNonEffectfulToolInput),
    'INVALID_INVOCATION_INPUT',
  );
  await expectInvocationError(
    invokeNonEffectfulTool({
      ...base,
      dispatch: { dispatch: 'not-a-function' } as unknown as NonEffectfulToolDispatchPort,
    }),
    'INVALID_TOOL_DISPATCH_PORT',
  );
});

// ---------------------------------------------------------------------------
// PACK-C T004B: resources through T005B before dispatch.
// ---------------------------------------------------------------------------

function resourceSealOverrides(): Partial<SealRuntimeAssemblyInput> {
  return {
    resourceRequirements: [
      {
        owner: toolComponent(),
        declaration: {
          componentId: 'tool.alpha',
          requirements: [
            {
              resourceKey: 'res.config',
              required: true,
              contract: { contractId: 'res.contract.config', version: '1.0.0' },
            },
            { resourceKey: 'res.cache', required: false },
          ],
        },
      },
    ],
  };
}

test('PACK-C T004B resources: required resources resolve through T005B and reach the dispatch port; optional absence is explicit', async () => {
  const handle = { id: 'handle.with-resources' };
  const calls: NonEffectfulToolDispatchQuery[] = [];
  const fx = await fixture({
    candidates: [candidate('impl.calc.alpha', { handle })],
    sealOverrides: resourceSealOverrides(),
  });

  const providerRequests: unknown[] = [];
  const provider: ResourceProvider = {
    async resolve(request) {
      providerRequests.push(request);
      if (request.resourceKey === 'res.config') {
        return {
          status: 'resolved',
          handle: { id: 'handle.res.config' },
          contract: { contractId: 'res.contract.config', version: '1.0.0' },
        } satisfies ResourceProviderResponse;
      }
      return { status: 'absent' } satisfies ResourceProviderResponse;
    },
  };

  const result = await invokeNonEffectfulTool(
    invocationInput(fx, { dispatch: recordingDispatch(calls), resourceProvider: provider }),
  );

  assert.equal(result.status, 'OBSERVED');
  assert.equal(calls.length, 1);
  const resources = calls[0]!.resources;
  assert.equal(resources.size, 2);
  assert.deepEqual(resources.get('res.config'), {
    resourceKey: 'res.config',
    status: 'resolved',
    handle: { id: 'handle.res.config' },
  });
  assert.deepEqual(resources.get('res.cache'), { resourceKey: 'res.cache', status: 'absent' });
  // Canonical (resourceKey) order: exactly one provider call per requirement.
  assert.deepEqual(
    (providerRequests as Array<{ resourceKey: string }>).map((r) => r.resourceKey),
    ['res.cache', 'res.config'],
  );
});

test('PACK-C T004B resources: assembly requirements without a provider fail MISSING_RESOURCE_PROVIDER before dispatch', async () => {
  const calls: NonEffectfulToolDispatchQuery[] = [];
  const fx = await fixture({ sealOverrides: resourceSealOverrides() });

  await expectInvocationError(
    invokeNonEffectfulTool(invocationInput(fx, { dispatch: recordingDispatch(calls) })),
    'MISSING_RESOURCE_PROVIDER',
  );
  assert.equal(calls.length, 0);
});

test('PACK-C T004B resources: operation-scoped requirements of another operation are not resolved for this call', async () => {
  const calls: NonEffectfulToolDispatchQuery[] = [];
  const fx = await fixture({
    candidates: [candidate('impl.calc.alpha')],
    sealOverrides: {
      resourceRequirements: [
        {
          owner: toolComponent(),
          declaration: {
            componentId: 'tool.alpha',
            requirements: [
              { resourceKey: 'res.mutate-only', required: true, operationId: 'op.mutate' },
            ],
          },
        },
      ],
    },
  });

  // op.query has no applicable requirements: dispatch proceeds without a provider.
  const result = await invokeNonEffectfulTool(
    invocationInput(fx, { dispatch: recordingDispatch(calls) }),
  );
  assert.equal(result.status, 'OBSERVED');
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.resources.size, 0);
});

// ---------------------------------------------------------------------------
// PACK-C T004B: resource failure is terminal before the Tool call.
// ---------------------------------------------------------------------------

test('PACK-C T004B resource failure: a missing required resource fails closed before dispatch and never retries', async () => {
  const handle = { id: 'handle.resource-failure' };
  const calls: NonEffectfulToolDispatchQuery[] = [];
  const fx = await fixture({
    candidates: [candidate('impl.calc.alpha', { handle })],
    sealOverrides: resourceSealOverrides(),
  });
  const providerCalls: string[] = [];
  const provider: ResourceProvider = {
    async resolve(request) {
      providerCalls.push(request.resourceKey);
      return { status: 'absent' } satisfies ResourceProviderResponse;
    },
  };

  await assert.rejects(
    invokeNonEffectfulTool(
      invocationInput(fx, { dispatch: recordingDispatch(calls), resourceProvider: provider }),
    ),
    (error: unknown) => {
      assert.ok(error instanceof ResourceResolutionError);
      assert.equal(error.code, 'MISSING_REQUIRED_RESOURCE');
      return true;
    },
  );
  assert.equal(calls.length, 0, 'the Tool must never be dispatched after a resource failure');
  // Resolution is terminal: exactly one provider call PER requirement
  // (canonical resourceKey order), never a retry of the failed requirement.
  assert.deepEqual(providerCalls.sort(), ['res.cache', 'res.config']);
});

test('PACK-C T004B resource failure: a throwing provider surfaces as typed RESOURCE_PROVIDER_FAILURE without leaking provider text', async () => {
  const calls: NonEffectfulToolDispatchQuery[] = [];
  const fx = await fixture({ sealOverrides: resourceSealOverrides() });
  const provider: ResourceProvider = {
    async resolve() {
      throw new Error('provider internal secret 5ecret-token');
    },
  };

  await assert.rejects(
    invokeNonEffectfulTool(
      invocationInput(fx, { dispatch: recordingDispatch(calls), resourceProvider: provider }),
    ),
    (error: unknown) => {
      assert.ok(error instanceof ResourceResolutionError);
      assert.equal(error.code, 'RESOURCE_PROVIDER_FAILURE');
      assert.doesNotMatch(error.message, /5ecret-token/);
      return true;
    },
  );
  assert.equal(calls.length, 0);
});

// ---------------------------------------------------------------------------
// PACK-C T004B: Tool failures remain failures.
// ---------------------------------------------------------------------------

test('PACK-C T004B tool failure: a thrown Tool error propagates unchanged — no authoritative outcome is synthesized', async () => {
  const calls: NonEffectfulToolDispatchQuery[] = [];
  const fx = await fixture();
  const toolError = new Error('tool exploded');
  const dispatch: NonEffectfulToolDispatchPort = {
    async dispatch() {
      throw toolError;
    },
  };

  await assert.rejects(
    invokeNonEffectfulTool(invocationInput(fx, { dispatch })),
    (error: unknown) => {
      assert.equal(error, toolError, 'the Tool failure must propagate unchanged');
      return true;
    },
  );
  assert.equal(calls.length, 0);
});

test('PACK-C T004B tool failure: a typed Tool failure return is observational output, never converted to success', async () => {
  const fx = await fixture();
  const typedFailure = { status: 'FAILED', code: 'DOMAIN_RULE_VIOLATION' };
  const dispatch: NonEffectfulToolDispatchPort = {
    async dispatch() {
      return typedFailure;
    },
  };

  const result = await invokeNonEffectfulTool(invocationInput(fx, { dispatch }));
  assert.equal(result.status, 'OBSERVED');
  assert.deepEqual(result.output, typedFailure);
  // The observational result never mints authority from a Tool failure.
  assert.equal((result as unknown as Record<string, unknown>).occurrenceId, undefined);
});

test('PACK-C T004B tool output: a non-portable Tool return fails closed INVALID_TOOL_OUTPUT', async () => {
  const fx = await fixture();
  const dispatch: NonEffectfulToolDispatchPort = {
    async dispatch() {
      return { handle: () => 1 };
    },
  };

  await expectInvocationError(
    invokeNonEffectfulTool(invocationInput(fx, { dispatch })),
    'INVALID_TOOL_OUTPUT',
  );
});
