/**
 * T004B invariant matrix — stale state and provenance fail closed before
 * dispatch (issue #632, fine-grained DAG #534 T004B; authority #589 PACK-C
 * T004B section + the BINDING P1-1 constraint from T004A Fresh Review
 * issuecomment-5989725847).
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
 *  - P1-1 boundary: a self-consistent forged Assembly (content digest
 *    recomputes exactly, never passed through T002B sealing) passes the T004A
 *    content checks but can NEVER dispatch: the injected
 *    `SealedAssemblyProvenanceGuard` is a typed fail-closed seam — denial,
 *    absence, malformed decisions or a throwing guard all block dispatch with
 *    ASSEMBLY_PROVENANCE_UNVERIFIED / INVALID_INVOCATION_INPUT. Content
 *    consistency of `assemblyDigest` is never silently trusted as mint proof.
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
  type SealedAssemblyProvenanceGuard,
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
    assemblyProvenance: { verifyProvenance: () => ({ verified: true as const }) },
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
// P1-1 boundary: assembly provenance is a typed fail-closed seam.
// ---------------------------------------------------------------------------

/**
 * Build a self-consistent forged Assembly exactly like the T004A Fresh Review
 * adversarial experiment (issuecomment-5989725847): never passed through
 * `sealRuntimeAssembly`, carrying an ordinary (here: ordinary, not extra)
 * kind-implementation pin, with the assemblyDigest correctly self-computed.
 * T004A content checks accept it; the T002B mint registry (module-private)
 * would reject it — and T004B cannot consult that registry from exported
 * seams, so the injected guard is the explicit fail-closed boundary.
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

test('P1-1 boundary: a self-consistent forged Assembly passes T004A content checks but never dispatches — provenance denial fails closed', async () => {
  const g = graph();
  const forged = await forgedAssembly(g);
  const calls: NonEffectfulToolDispatchQuery[] = [];
  const guardQueries: unknown[] = [];

  // T004A admission over the forged Assembly succeeds (content-consistent).
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

  const denials: string[] = [];
  const guard: SealedAssemblyProvenanceGuard = {
    verifyProvenance(query) {
      guardQueries.push(query);
      return { verified: false, reason: 'assembly object not present in the host mint registry' };
    },
  };

  await assert.rejects(
    invokeNonEffectfulTool({
      request: admitted,
      binding: forgedBinding,
      currentDefinitionGraph: g,
      assemblyProvenance: guard,
      dispatch: recordingDispatch(calls),
      sha256: realSha256,
    }),
    (error: unknown) => {
      assert.ok(error instanceof NonEffectfulInvocationError);
      assert.equal(error.code, 'ASSEMBLY_PROVENANCE_UNVERIFIED');
      assert.match(error.message, /host mint registry/);
      return true;
    },
  );
  assert.equal(calls.length, 0, 'a provenance denial must block dispatch');

  // The guard saw the exact assembly object and the exact digests — the seam
  // is the explicit replacement for the missing T002B mint-guard export.
  assert.equal(guardQueries.length, 1);
  const query = guardQueries[0] as {
    assembly: unknown;
    assemblyDigest: string;
    definitionGraphDigest: string;
  };
  assert.equal(query.assembly, forged);
  assert.equal(query.assemblyDigest, forged.assemblyDigest);
  assert.equal(query.definitionGraphDigest, forged.record.definitionGraphDigest);
  void denials;
});

test('P1-1 boundary: the guard decision is the explicit trust point — an affirmative decision is what authorizes dispatch', async () => {
  const g = graph();
  const forged = await forgedAssembly(g);
  const calls: NonEffectfulToolDispatchQuery[] = [];

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
  const admitted = await admitToolInvocationRequest(
    {
      toolComponentId: 'tool.alpha',
      operationId: 'op.query',
      input: { q: 1 },
      caller: caller(),
      definitionGraphDigest: forged.record.definitionGraphDigest,
      assemblyDigest: forged.assemblyDigest,
      exposure,
    },
    { assembly: forged, currentDefinitionGraph: g },
    realSha256,
  );
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

  // The kernel never inspects the mint itself; a wired guard that affirms
  // provenance (e.g. backed by the future T002B mint-guard export or by
  // host-held mint records) is what unblocks the boundary.
  const result = await invokeNonEffectfulTool({
    request: admitted,
    binding: forgedBinding,
    currentDefinitionGraph: g,
    assemblyProvenance: { verifyProvenance: () => ({ verified: true as const }) },
    dispatch: recordingDispatch(calls),
    sha256: realSha256,
  });
  assert.equal(result.status, 'OBSERVED');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]!.handle, { id: 'forged-handle' });
});

test('P1-1 boundary: a malformed guard decision or a throwing guard fails closed', async (t) => {
  const fx = await fixture();
  const calls: NonEffectfulToolDispatchQuery[] = [];

  await t.test('a decision without a boolean verified flag fails INVALID_INVOCATION_INPUT', async () => {
    const guard = { verifyProvenance: () => ({ verified: 'yes' }) } as unknown as SealedAssemblyProvenanceGuard;
    await assert.rejects(
      invokeNonEffectfulTool(invocationInput(fx, { assemblyProvenance: guard, dispatch: recordingDispatch(calls) })),
      (error: unknown) => {
        assert.ok(error instanceof NonEffectfulInvocationError);
        assert.equal(error.code, 'INVALID_INVOCATION_INPUT');
        return true;
      },
    );
  });

  await t.test('a throwing guard fails ASSEMBLY_PROVENANCE_UNVERIFIED — provenance can never pass by accident', async () => {
    const guard: SealedAssemblyProvenanceGuard = {
      verifyProvenance() {
        throw new Error('guard exploded');
      },
    };
    await assert.rejects(
      invokeNonEffectfulTool(invocationInput(fx, { assemblyProvenance: guard, dispatch: recordingDispatch(calls) })),
      (error: unknown) => {
        assert.ok(error instanceof NonEffectfulInvocationError);
        assert.equal(error.code, 'ASSEMBLY_PROVENANCE_UNVERIFIED');
        return true;
      },
    );
  });

  await t.test('a denied decision for a GENUINE sealed assembly still fails closed', async () => {
    const guard: SealedAssemblyProvenanceGuard = {
      verifyProvenance: () => ({ verified: false, reason: 'mint record missing' }),
    };
    await assert.rejects(
      invokeNonEffectfulTool(invocationInput(fx, { assemblyProvenance: guard, dispatch: recordingDispatch(calls) })),
      (error: unknown) => {
        assert.ok(error instanceof NonEffectfulInvocationError);
        assert.equal(error.code, 'ASSEMBLY_PROVENANCE_UNVERIFIED');
        assert.match(error.message, /mint record missing/);
        return true;
      },
    );
  });

  assert.equal(calls.length, 0);
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
