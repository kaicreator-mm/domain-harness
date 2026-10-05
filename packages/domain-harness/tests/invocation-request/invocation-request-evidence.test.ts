/**
 * T004A invariant matrix — exposure evidence minting authority, immutability
 * and non-aliasing (issue #609, fine-grained DAG #534 T004A; authority #589
 * PACK-A T004A section).
 *
 * PACK-A authority rules pinned here:
 *  - the caller can NEVER mint exposure evidence: hand-forged evidence —
 *    even byte-perfect over public digest material — fails closed, including
 *    the prototype-chain and symbol-theft forgery classes repaired for the
 *    sealed Assembly in #601 (WeakSet minting registry + own-property brand);
 *  - request/evidence are immutable and non-aliasing: every authority-bearing
 *    field is synchronously snapshotted before the first await and the minted
 *    evidence is deeply frozen, so post-admission caller mutation cannot
 *    alter admitted material (torn-snapshot discipline, #587 §E same posture);
 *  - descriptor-safe input: accessor-backed, symbol-keyed, non-enumerable or
 *    exotic-prototype input is rejected before any authority use, and
 *    diagnostics never execute hidden getters.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import type { ComponentEnvelope } from '../../src/contracts/component.js';
import type { DefinitionGraphEnvelope } from '../../src/contracts/definition-graph.js';
import type { Sha256Port } from '../../src/contracts/identity.js';
import {
  sealRuntimeAssembly,
  type KindImplementationBindingInput,
  type SealedRuntimeAssembly,
} from '../../src/contracts/runtime-assembly.js';
import {
  InvocationRequestError,
  admitToolExposure,
  admitToolInvocationRequest,
  type AdmitToolExposureInput,
  type InvocationCallerContext,
  type ToolExposureAdmissionPolicy,
  type ToolInvocationRequest,
} from '../../src/contracts/invocation-request.js';

const realSha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

function toolComponent(overrides: Partial<ComponentEnvelope> = {}): ComponentEnvelope {
  return {
    family: 'tool',
    componentId: 'tool.alpha',
    kind: { kindId: 'test.tool-kind', version: '1.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: {
      operations: [
        {
          operationId: 'op.query',
          inputSchema: {},
          outputSchema: {},
          effect: 'none',
          declaredExposure: { audiences: ['agent'] },
        },
      ],
      providesCapabilities: [],
    },
    ...overrides,
  };
}

function graph(overrides: Partial<DefinitionGraphEnvelope> = {}): DefinitionGraphEnvelope {
  return {
    graphId: 'graph.invocation',
    components: [toolComponent()],
    relations: [],
    ...overrides,
  };
}

function toolBinding(overrides: Partial<KindImplementationBindingInput> = {}): KindImplementationBindingInput {
  return {
    pin: {
      kind: { kindId: 'test.tool-kind', version: '1.0.0' },
      implementation: {
        implementationId: 'impl.test.tool-kind',
        implementationVersion: '1.0.0',
        implementationDigest: 'sha256:tool-kind-impl',
      },
    },
    understoodSemanticContracts: [],
    understoodCapabilities: [],
    validateComponent: () => {},
    ...overrides,
  };
}

async function sealedAssembly(g: DefinitionGraphEnvelope): Promise<SealedRuntimeAssembly> {
  return sealRuntimeAssembly(
    { definitionGraph: g, kindImplementations: [toolBinding()] },
    realSha256,
  );
}

const ADMIT_ALL: ToolExposureAdmissionPolicy = { decideAdmission: () => ({ admitted: true }) };

function caller(overrides: Partial<InvocationCallerContext> = {}): InvocationCallerContext {
  return { callerId: 'caller.session-1', callerKind: 'agent', attributes: { scopes: ['read'] }, ...overrides };
}

async function mintExposure(
  sealed: SealedRuntimeAssembly,
  g: DefinitionGraphEnvelope,
  overrides: Partial<AdmitToolExposureInput> = {},
) {
  return admitToolExposure(
    {
      toolComponentId: 'tool.alpha',
      operationId: 'op.query',
      caller: caller(),
      assembly: sealed,
      currentDefinitionGraph: g,
      policy: ADMIT_ALL,
      ...overrides,
    },
    realSha256,
  );
}

test('PACK-A minting authority: a hand-forged exposure record fails closed even with byte-perfect public material', async () => {
  const g = graph();
  const sealed = await sealedAssembly(g);
  const genuine = await mintExposure(sealed, g);

  // The forger copies every serializable field — all digest identity material
  // is public by design. Only the module-private mint registry can authorize.
  const forged = {
    status: 'ADMITTED',
    toolComponentId: genuine.toolComponentId,
    operationId: genuine.operationId,
    caller: genuine.caller,
    definitionGraphDigest: genuine.definitionGraphDigest,
    assemblyDigest: genuine.assemblyDigest,
    exposureDigest: genuine.exposureDigest,
  } as unknown as typeof genuine;

  const request: ToolInvocationRequest = {
    toolComponentId: 'tool.alpha',
    operationId: 'op.query',
    input: {},
    caller: caller(),
    definitionGraphDigest: sealed.record.definitionGraphDigest,
    assemblyDigest: sealed.assemblyDigest,
    exposure: forged,
  };
  await assert.rejects(
    admitToolInvocationRequest(request, { assembly: sealed, currentDefinitionGraph: g }, realSha256),
    (error: unknown) => {
      assert.ok(error instanceof InvocationRequestError);
      assert.equal(error.code, 'FORGED_EXPOSURE_EVIDENCE');
      return true;
    },
  );
});

test('PACK-A minting authority: prototype-chain and symbol-theft forgeries fail closed', async () => {
  const g = graph();
  const sealed = await sealedAssembly(g);
  const genuine = await mintExposure(sealed, g);

  const requestWith = (exposure: unknown): ToolInvocationRequest => ({
    toolComponentId: 'tool.alpha',
    operationId: 'op.query',
    input: {},
    caller: caller(),
    definitionGraphDigest: sealed.record.definitionGraphDigest,
    assemblyDigest: sealed.assemblyDigest,
    exposure: exposure as ToolInvocationRequest['exposure'],
  });

  // Prototype-chain forgery: inherits every genuine field, shadows nothing.
  const protoForgery = Object.create(genuine);
  await assert.rejects(
    admitToolInvocationRequest(requestWith(protoForgery), { assembly: sealed, currentDefinitionGraph: g }, realSha256),
    (error: unknown) => {
      assert.ok(error instanceof InvocationRequestError);
      assert.equal(error.code, 'FORGED_EXPOSURE_EVIDENCE');
      return true;
    },
  );

  // Symbol-theft forgery: extract the brand symbol from a genuine evidence
  // object and rebuild the full record around it. The unique-symbol brand is
  // necessary defense in depth but not sufficient (#601 lesson): the WeakSet
  // mint registry is the authoritative test and the forgery is not a member.
  const stolen = Object.getOwnPropertySymbols(genuine);
  assert.ok(stolen.length > 0, 'sanity: the genuine evidence carries its brand symbol');
  const theftForgery = {
    status: 'ADMITTED',
    toolComponentId: genuine.toolComponentId,
    operationId: genuine.operationId,
    caller: genuine.caller,
    definitionGraphDigest: genuine.definitionGraphDigest,
    assemblyDigest: genuine.assemblyDigest,
    exposureDigest: genuine.exposureDigest,
    [stolen[0]!]: true,
  };
  await assert.rejects(
    admitToolInvocationRequest(requestWith(theftForgery), { assembly: sealed, currentDefinitionGraph: g }, realSha256),
    (error: unknown) => {
      assert.ok(error instanceof InvocationRequestError);
      assert.equal(error.code, 'FORGED_EXPOSURE_EVIDENCE');
      return true;
    },
  );

  // Negative control: the genuine evidence still admits normally.
  const admitted = await admitToolInvocationRequest(
    requestWith(genuine),
    { assembly: sealed, currentDefinitionGraph: g },
    realSha256,
  );
  assert.equal(admitted.status, 'ADMITTED');
});

test('PACK-A immutability: evidence and admitted request are deeply frozen and caller mutation cannot alter them', async () => {
  const g = graph();
  const sealed = await sealedAssembly(g);

  const liveCaller = caller();
  const exposure = await mintExposure(sealed, g, { caller: liveCaller });
  assert.ok(Object.isFrozen(exposure));
  assert.ok(Object.isFrozen(exposure.caller));
  assert.ok(Object.isFrozen(exposure.caller.attributes));
  assert.ok(Object.isFrozen((exposure.caller.attributes as { scopes: unknown }).scopes));

  // Mutate the caller-owned object graph after minting.
  (liveCaller.attributes as { scopes: string[] }).scopes.push('ADMIN');
  (liveCaller as { callerKind?: string }).callerKind = 'MUTATED';
  assert.deepEqual(exposure.caller, caller(), 'evidence keeps the pre-mutation snapshot');

  const liveInput = { q: 1, nested: { list: [1, 2, 3] } };
  const request: ToolInvocationRequest = {
    toolComponentId: 'tool.alpha',
    operationId: 'op.query',
    input: liveInput,
    caller: caller(),
    definitionGraphDigest: sealed.record.definitionGraphDigest,
    assemblyDigest: sealed.assemblyDigest,
    exposure,
  };
  const admitted = await admitToolInvocationRequest(
    request,
    { assembly: sealed, currentDefinitionGraph: g },
    realSha256,
  );

  assert.ok(Object.isFrozen(admitted));
  assert.ok(Object.isFrozen(admitted.input));
  assert.ok(Object.isFrozen((admitted.input as { nested: unknown }).nested));
  assert.ok(Object.isFrozen((admitted.input as { nested: { list: unknown } }).nested.list));
  assert.ok(Object.isFrozen(admitted.caller));
  assert.ok(Object.isFrozen(admitted.exposure));

  // Mutate the original request material after admission.
  liveInput.q = 999;
  liveInput.nested.list.push(4);
  assert.deepEqual(admitted.input, { q: 1, nested: { list: [1, 2, 3] } });
});

test('PACK-A torn snapshot: caller mutation mid-admission cannot change the admitted material', async () => {
  const g = graph();
  const sealed = await sealedAssembly(g);
  const exposure = await mintExposure(sealed, g);

  // A Sha256Port that suspends admission at the async boundary until the
  // test has mutated every caller-owned object.
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  const gatedSha256: Sha256Port = {
    async digestUtf8(value: string): Promise<string> {
      calls += 1;
      if (calls === 1) await gate;
      return createHash('sha256').update(value, 'utf8').digest('hex');
    },
  };

  const liveInput = { q: 1 };
  const liveCaller = caller();
  const request: ToolInvocationRequest = {
    toolComponentId: 'tool.alpha',
    operationId: 'op.query',
    input: liveInput,
    caller: liveCaller,
    definitionGraphDigest: sealed.record.definitionGraphDigest,
    assemblyDigest: sealed.assemblyDigest,
    exposure,
  };

  const pending = admitToolInvocationRequest(
    request,
    { assembly: sealed, currentDefinitionGraph: g },
    gatedSha256,
  );

  // Mutate all caller-owned material while the digest work is suspended.
  liveInput.q = 424242;
  (liveCaller.attributes as { scopes: string[] }).scopes.push('MUTATED-MID-FLIGHT');
  (request as { toolComponentId: string }).toolComponentId = 'tool.HIJACKED';
  release();
  const admitted = await pending;

  assert.equal(admitted.toolComponentId, 'tool.alpha');
  assert.deepEqual(admitted.input, { q: 1 });
  assert.deepEqual(admitted.caller.attributes, { scopes: ['read'] });
});

test('PACK-A descriptor safety: accessor, symbol-keyed, non-enumerable and exotic-prototype inputs fail closed with getters never executed', async () => {
  const g = graph();
  const sealed = await sealedAssembly(g);
  const exposure = await mintExposure(sealed, g);

  let getterExecutions = 0;
  const trappingGetter = () => {
    getterExecutions += 1;
    return {};
  };

  // Accessor-backed request field: rejected from property descriptors alone.
  const baseRequest = {
    toolComponentId: 'tool.alpha',
    operationId: 'op.query',
    caller: caller(),
    definitionGraphDigest: sealed.record.definitionGraphDigest,
    assemblyDigest: sealed.assemblyDigest,
    exposure,
  };
  const accessorRequest = Object.defineProperty(
    { ...baseRequest, input: {} },
    'input',
    { enumerable: true, get: trappingGetter },
  ) as unknown as ToolInvocationRequest;
  await assert.rejects(
    admitToolInvocationRequest(accessorRequest, { assembly: sealed, currentDefinitionGraph: g }, realSha256),
    (error: unknown) => {
      assert.ok(error instanceof InvocationRequestError);
      assert.equal(error.code, 'INVALID_INVOCATION_REQUEST');
      return true;
    },
  );

  // Symbol-keyed hidden material on the request.
  const symbolRequest: Record<string | symbol, unknown> = { ...baseRequest, input: {} };
  symbolRequest[Symbol('hidden')] = 'surprise';
  await assert.rejects(
    admitToolInvocationRequest(symbolRequest as unknown as ToolInvocationRequest, { assembly: sealed, currentDefinitionGraph: g }, realSha256),
    (error: unknown) => {
      assert.ok(error instanceof InvocationRequestError && error.code === 'INVALID_INVOCATION_REQUEST');
      return true;
    },
  );

  // Non-enumerable hidden material on the request.
  const nonEnumerableRequest: Record<string, unknown> = { ...baseRequest, input: {} };
  Object.defineProperty(nonEnumerableRequest, 'hidden', { enumerable: false, value: 'x' });
  await assert.rejects(
    admitToolInvocationRequest(nonEnumerableRequest as unknown as ToolInvocationRequest, { assembly: sealed, currentDefinitionGraph: g }, realSha256),
    (error: unknown) => {
      assert.ok(error instanceof InvocationRequestError && error.code === 'INVALID_INVOCATION_REQUEST');
      return true;
    },
  );

  // Exotic prototype (class instance) is not contract input.
  class ExoticRequest {
    readonly toolComponentId = 'tool.alpha';
    readonly operationId = 'op.query';
    readonly input = {};
    readonly caller = caller();
    readonly definitionGraphDigest = sealed.record.definitionGraphDigest;
    readonly assemblyDigest = sealed.assemblyDigest;
    readonly exposure = exposure;
  }
  await assert.rejects(
    admitToolInvocationRequest(new ExoticRequest(), { assembly: sealed, currentDefinitionGraph: g }, realSha256),
    (error: unknown) => {
      assert.ok(error instanceof InvocationRequestError && error.code === 'INVALID_INVOCATION_REQUEST');
      return true;
    },
  );

  // Accessor-backed caller attributes inside an otherwise valid request.
  const accessorCaller = Object.defineProperty(
    { callerId: 'caller.session-1' },
    'attributes',
    { enumerable: true, get: trappingGetter },
  ) as unknown as InvocationCallerContext;
  await assert.rejects(
    admitToolInvocationRequest(
      {
        toolComponentId: 'tool.alpha',
        operationId: 'op.query',
        input: {},
        caller: accessorCaller,
        definitionGraphDigest: sealed.record.definitionGraphDigest,
        assemblyDigest: sealed.assemblyDigest,
        exposure,
      },
      { assembly: sealed, currentDefinitionGraph: g },
      realSha256,
    ),
    (error: unknown) => {
      assert.ok(error instanceof InvocationRequestError && error.code === 'INVALID_INVOCATION_CALLER');
      return true;
    },
  );

  // Diagnostics must never execute the hidden getter.
  assert.equal(getterExecutions, 0);
});
