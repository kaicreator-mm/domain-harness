/**
 * T004B invariant matrix — stale state and provenance fail closed before
 * dispatch (issue #632, fine-grained DAG #534 T004B; authority #589 PACK-C
 * T004B section; #691 post-merge bounded repair).
 *
 * Pins:
 *  - stale Definition fails closed: the current graph digest is
 *    authoritatively recomputed at dispatch re-admission and must equal the
 *    Assembly-bound digest, the request claim and the exposure-bound digest;
 *  - stale binding fails closed: a binding minted into a different successor
 *    Assembly than the admitted request fails before the Tool call;
 *  - a caller-constructed admitted request (byte-perfect content, hand-made
 *    exposure evidence without the T004A mint) fails at re-admission with
 *    FORGED_EXPOSURE_EVIDENCE — the request shape is never trusted;
 *  - #691 P1-1 repair: assembly provenance is decided by the accepted
 *    T002B-owned `isSealedRuntimeAssembly` mint verifier consumed DIRECTLY
 *    over the exact final Assembly (the binding's own successor Assembly —
 *    the dispatch anchor). A self-consistent forged Assembly passes every
 *    T004A content check yet can NEVER dispatch (ASSEMBLY_PROVENANCE_UNVERIFIED),
 *    and no caller/host-supplied provenance decision, mint record or
 *    content-consistency substitute exists to affirm it — the input field is
 *    not representable at all;
 *  - #691 P1-2 repair: a field-perfect forged binding lookalike over a
 *    GENUINE sealed Assembly fails at the T003C mint seam
 *    (UNMINTED_TOOL_IMPLEMENTATION_BINDING) — mint membership, not content
 *    similarity, is the authority.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import type { ComponentEnvelope } from '../../src/contracts/component.js';
import {
  computeDefinitionGraphDigest,
  type DefinitionGraphEnvelope,
} from '../../src/contracts/definition-graph.js';
import {
  computeCanonicalJsonDigest,
  type Sha256Port,
} from '../../src/contracts/identity.js';
import { resolveCurrentCapabilityProvider } from '../../src/contracts/capability-provision.js';
import {
  RUNTIME_ASSEMBLY_DIGEST_DOMAIN,
  sealRuntimeAssembly,
  type KindImplementationBindingInput,
  type SealRuntimeAssemblyInput,
  type SealedRuntimeAssembly,
} from '../../src/contracts/runtime-assembly.js';
import {
  ToolImplementationBindingError,
  bindToolImplementation,
  type SealedToolImplementationBinding,
  type ToolImplementationCandidate,
} from '../../src/contracts/tool-implementation-binding.js';
import {
  InvocationRequestError,
  admitToolExposure,
  admitToolInvocationRequest,
  type AdmittedToolInvocationRequest,
  type InvocationCallerContext,
  type ToolExposureAdmissionPolicy,
  type ToolInvocationRequest,
} from '../../src/contracts/invocation-request.js';
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
  return { callerId: 'caller.session-1', callerKind: 'agent', ...overrides };
}

function recordingDispatch(calls: NonEffectfulToolDispatchQuery[]): NonEffectfulToolDispatchPort {
  return {
    async dispatch(query) {
      calls.push(query);
      return { ok: true };
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
    candidates?: readonly ToolImplementationCandidate[];
    sealOverrides?: Partial<SealRuntimeAssemblyInput>;
  } = {},
): Promise<Fixture> {
  const g = graph();
  const baseAssembly = await sealRuntimeAssembly(
    { definitionGraph: g, kindImplementations: [kindBinding()], ...overrides.sealOverrides },
    realSha256,
  );
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
    sha256: realSha256,
  });
  const exposure = await admitToolExposure(
    {
      toolComponentId: 'tool.alpha',
      operationId: 'op.query',
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
      operationId: 'op.query',
      input: { q: 1 },
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

// ---------------------------------------------------------------------------
// Stale state fails closed before dispatch.
// ---------------------------------------------------------------------------

test('PACK-C T004B stale Definition: a drifted current graph fails DEFINITION_CURRENTNESS_MISMATCH before dispatch', async () => {
  const calls: NonEffectfulToolDispatchQuery[] = [];
  const fx = await fixture();

  // The graph drifts after admission: the operation input schema changes.
  const drifted = graph({
    components: [
      consumer(),
      toolComponent({
        semanticBody: {
          operations: [
            {
              operationId: 'op.query',
              inputSchema: { type: 'object', additionalProperties: true },
              outputSchema: {},
              effect: 'none',
            },
          ],
          providesCapabilities: [{ capabilityId: 'cap.calc', version: '1.0.0' }],
        },
      }),
    ],
  });

  await assert.rejects(
    invokeNonEffectfulTool(
      invocationInput(fx, { currentDefinitionGraph: drifted, dispatch: recordingDispatch(calls) }),
    ),
    (error: unknown) => {
      assert.ok(error instanceof InvocationRequestError);
      assert.equal(error.code, 'DEFINITION_CURRENTNESS_MISMATCH');
      return true;
    },
  );
  assert.equal(calls.length, 0);
});

test('PACK-C T004B stale binding: a binding minted into a different successor Assembly fails ASSEMBLY_CURRENTNESS_MISMATCH before dispatch', async () => {
  const calls: NonEffectfulToolDispatchQuery[] = [];
  const fxA = await fixture();
  const fxB = await fixture({
    candidates: [candidate('impl.calc.bravo', {}, {
      implementationVersion: '2.0.0',
      implementationDigest: 'sha256:impl.calc.bravo-content',
    })],
  });
  assert.notEqual(
    fxA.binding.successorAssembly.assemblyDigest,
    fxB.binding.successorAssembly.assemblyDigest,
  );

  // The request was admitted against successor A; presenting binding B (whose
  // successor Assembly differs) can never dispatch.
  await assert.rejects(
    invokeNonEffectfulTool(
      invocationInput(fxA, { binding: fxB.binding, dispatch: recordingDispatch(calls) }),
    ),
    (error: unknown) => {
      assert.ok(error instanceof InvocationRequestError);
      assert.equal(error.code, 'ASSEMBLY_CURRENTNESS_MISMATCH');
      return true;
    },
  );
  assert.equal(calls.length, 0);
});

test('PACK-C T004B forged request: a caller-constructed admitted request with hand-made exposure fails FORGED_EXPOSURE_EVIDENCE before dispatch', async () => {
  const calls: NonEffectfulToolDispatchQuery[] = [];
  const fx = await fixture();
  const forgedExposure = {
    status: 'ADMITTED',
    toolComponentId: 'tool.alpha',
    operationId: 'op.query',
    caller: caller(),
    definitionGraphDigest: fx.binding.successorAssembly.record.definitionGraphDigest,
    assemblyDigest: fx.binding.successorAssembly.assemblyDigest,
    exposureDigest: 'sha256:forged-exposure',
  };
  const forgedRequest = {
    status: 'ADMITTED',
    toolComponentId: 'tool.alpha',
    operationId: 'op.query',
    input: { q: 'forged' },
    caller: caller(),
    operationEffect: 'none',
    definitionGraphDigest: fx.binding.successorAssembly.record.definitionGraphDigest,
    assemblyDigest: fx.binding.successorAssembly.assemblyDigest,
    exposure: forgedExposure,
  } as unknown as AdmittedToolInvocationRequest;

  await assert.rejects(
    invokeNonEffectfulTool(
      invocationInput(fx, { request: forgedRequest, dispatch: recordingDispatch(calls) }),
    ),
    (error: unknown) => {
      assert.ok(error instanceof InvocationRequestError);
      assert.equal(error.code, 'FORGED_EXPOSURE_EVIDENCE');
      return true;
    },
  );
  assert.equal(calls.length, 0);
});

// ---------------------------------------------------------------------------
// #691 P1-1/P1-2 repair: assembly provenance and binding authenticity are
// decided by the accepted owner verifiers consumed directly — no injected
// provenance decision exists to affirm a forgery.
// ---------------------------------------------------------------------------

/**
 * Build a self-consistent forged Assembly exactly like the T004A Fresh Review
 * adversarial experiment (issuecomment-5989725847): never passed through
 * `sealRuntimeAssembly`, carrying an ordinary kind-implementation pin, with
 * the assemblyDigest correctly self-computed. T004A content checks accept it;
 * the T002B mint registry (module-private) rejects it.
 */
async function forgedAssembly(g: DefinitionGraphEnvelope): Promise<SealedRuntimeAssembly> {
  const definitionGraphDigest = await computeDefinitionGraphDigest(g, realSha256);
  const record = {
    digestDomain: RUNTIME_ASSEMBLY_DIGEST_DOMAIN,
    definitionGraphDigest,
    kindImplementations: [
      {
        kind: { kindId: 'test.t004b-kind', version: '1.0.0' },
        implementation: {
          implementationId: 'impl.t004b-kind',
          implementationVersion: '1.0.0',
          implementationDigest: 'sha256:kind-impl',
        },
      },
    ],
    resourceRequirements: [],
    implementationBindingEvidence: [],
  };
  const assemblyDigest = await computeCanonicalJsonDigest(record, realSha256);
  return {
    record: record as unknown as SealedRuntimeAssembly['record'],
    assemblyDigest,
    bindings: [],
  } as unknown as SealedRuntimeAssembly;
}

test('#691 P1-1 repair: a self-consistent forged Assembly passes T004A content checks but can NEVER dispatch — the T002B mint verifier is consumed directly', async (t) => {
  const g = graph();
  const forged = await forgedAssembly(g);
  const calls: NonEffectfulToolDispatchQuery[] = [];

  // Control: T004A admission over the forged Assembly succeeds (it is a
  // content-consistency checker, not a provenance authority).
  const exposure = await admitToolExposure(
    {
      toolComponentId: 'tool.alpha',
      operationId: 'op.query',
      caller: caller(),
      assembly: forged,
      currentDefinitionGraph: g,
      policy: ADMIT_ALL,
    },
    realSha256,
  );
  const request: ToolInvocationRequest = {
    toolComponentId: 'tool.alpha',
    operationId: 'op.query',
    input: { q: 1 },
    caller: caller(),
    definitionGraphDigest: forged.record.definitionGraphDigest,
    assemblyDigest: forged.assemblyDigest,
    exposure,
  };
  const admitted = await admitToolInvocationRequest(
    request,
    { assembly: forged, currentDefinitionGraph: g },
    realSha256,
  );
  assert.equal(admitted.status, 'ADMITTED', 'control: T004A admits the content-consistent forgery');

  // A forged binding pairs a caller-chosen handle with the forged Assembly.
  const forgedBinding = {
    evidence: {
      status: 'BOUND',
      definitionGraphDigest: forged.record.definitionGraphDigest,
      assemblyDigest: forged.assemblyDigest,
      toolComponentId: 'tool.alpha',
      providesCapability: { capabilityId: 'cap.calc', version: '1.0.0' },
      implementation: {
        implementationId: 'impl.calc.alpha',
        implementationVersion: '1.0.0',
        implementationDigest: 'sha256:impl.calc.alpha-content',
      },
      supportedOperations: ['op.mutate', 'op.query'],
      bindingDigest: 'sha256:forged-binding',
    },
    successorAssembly: forged,
    implementationHandle: { id: 'forged-handle' },
  } as unknown as SealedToolImplementationBinding;

  await t.test('the invocation fails ASSEMBLY_PROVENANCE_UNVERIFIED — no dispatch, no fallback', async () => {
    await assert.rejects(
      invokeNonEffectfulTool({
        request: admitted,
        binding: forgedBinding,
        currentDefinitionGraph: g,
        dispatch: recordingDispatch(calls),
        sha256: realSha256,
      }),
      (error: unknown) => {
        assert.ok(error instanceof NonEffectfulInvocationError);
        assert.equal(error.code, 'ASSEMBLY_PROVENANCE_UNVERIFIED');
        assert.match(error.message, /sealRuntimeAssembly/);
        return true;
      },
    );
    assert.equal(calls.length, 0, 'a forged dispatch anchor must never reach the Tool');
  });

  await t.test('no second provenance authority is representable: an affirming guard field is an unexpected input', async () => {
    // The old boundary let a host-supplied affirmative decision authorize a
    // content-consistent forgery. The port no longer exists: even a
    // well-formed affirming decision is rejected as unexpected input material
    // before anything else runs.
    await assert.rejects(
      invokeNonEffectfulTool({
        request: admitted,
        binding: forgedBinding,
        currentDefinitionGraph: g,
        assemblyProvenance: { verifyProvenance: () => ({ verified: true as const }) },
        dispatch: recordingDispatch([]),
        sha256: realSha256,
      } as unknown as InvokeNonEffectfulToolInput),
      (error: unknown) => {
        assert.ok(error instanceof NonEffectfulInvocationError);
        assert.equal(error.code, 'INVALID_INVOCATION_INPUT');
        assert.match(error.message, /assemblyProvenance/);
        return true;
      },
    );
  });
});

test('#691 P1-2 repair: a field-perfect forged binding lookalike over a GENUINE sealed Assembly fails UNMINTED before dispatch', async () => {
  const calls: NonEffectfulToolDispatchQuery[] = [];
  const fx = await fixture();
  const { binding } = fx;

  // Byte-identical public content: every evidence field copied, the genuine
  // successor Assembly and the genuine handle carried by reference. Before
  // the repair this lookalike dispatched (identity re-derivation trusted the
  // supplied handle); now the module-private T003C mint registry rejects it.
  const lookalike = {
    evidence: { ...binding.evidence },
    successorAssembly: binding.successorAssembly,
    implementationHandle: binding.implementationHandle,
  } as unknown as SealedToolImplementationBinding;

  await assert.rejects(
    invokeNonEffectfulTool(invocationInput(fx, { binding: lookalike, dispatch: recordingDispatch(calls) })),
    (error: unknown) => {
      assert.ok(error instanceof ToolImplementationBindingError);
      assert.equal(error.code, 'UNMINTED_TOOL_IMPLEMENTATION_BINDING');
      return true;
    },
  );
  assert.equal(calls.length, 0, 'a non-mint binding lookalike must never reach the dispatch port');
});

test('PACK-C T004B stale exposure: evidence minted over older state fails closed at re-admission before dispatch', async () => {
  const calls: NonEffectfulToolDispatchQuery[] = [];
  const fx = await fixture();

  // Mint a SECOND exposure over a drifted graph (same assembly claim is now
  // stale): minting itself recomputes currentness and must fail.
  const drifted = graph({
    components: [
      consumer(),
      toolComponent({
        semanticBody: {
          operations: [
            { operationId: 'op.query', inputSchema: { type: 'array' }, outputSchema: {}, effect: 'none' },
          ],
          providesCapabilities: [{ capabilityId: 'cap.calc', version: '1.0.0' }],
        },
      }),
    ],
  });
  await assert.rejects(
    admitToolExposure(
      {
        toolComponentId: 'tool.alpha',
        operationId: 'op.query',
        caller: caller(),
        assembly: fx.binding.successorAssembly,
        currentDefinitionGraph: drifted,
        policy: ADMIT_ALL,
      },
      realSha256,
    ),
    (error: unknown) => {
      assert.ok(error instanceof InvocationRequestError);
      assert.equal(error.code, 'DEFINITION_CURRENTNESS_MISMATCH');
      return true;
    },
  );
  assert.equal(calls.length, 0);
});
