/**
 * T004A invariant matrix — invocation request construction and admission
 * (issue #609, fine-grained DAG #534 T004A; authority #589 PACK-A T004A
 * section).
 *
 * Covers the PACK-A tests-first matrix for the caller-neutral invocation
 * request + caller exposure contract:
 *  - a complete request (exact Definition/currentness + exact
 *    Assembly/currentness + Tool Component id + operationId + input + caller
 *    context + admitted exposure evidence) is admitted and binds every
 *    dimension into frozen, non-aliasing evidence;
 *  - Workflow/Agent/UX/internal and any future caller plane share ONE generic
 *    caller model — `callerKind` is an open provenance string and no branch
 *    on it exists anywhere;
 *  - the Tool's declarative `declaredExposure` material is NOT runtime
 *    authorization: an injected generic `ToolExposureAdmissionPolicy` decides
 *    admission against the exact current state, and an operation without any
 *    declared exposure is still admissible;
 *  - admission binds the operation effect class forward as classification
 *    material only — T004A mints no execution, occurrence or effect authority;
 *  - construction/validation fail-closed matrix: shape, descriptor safety,
 *    exact identities, portable JSON input, digest formats, caller contract,
 *    policy contract, component binding, Tool declaration and operation
 *    existence.
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
  DefinitionGraphContractError,
} from '../../src/contracts/definition-graph.js';
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
          inputSchema: { type: 'object' },
          outputSchema: {},
          effect: 'none',
          declaredExposure: { audiences: ['agent', 'ux'] },
        },
        {
          operationId: 'op.mutate',
          inputSchema: {},
          outputSchema: {},
          effect: 'non-idempotent',
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

function semanticComponent(componentId: string): ComponentEnvelope {
  return {
    family: 'semantic',
    componentId,
    kind: { kindId: 'test.semantic-kind', version: '1.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: { note: 'not a tool' },
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
const DENY_ALL: ToolExposureAdmissionPolicy = {
  decideAdmission: () => ({ admitted: false, reason: 'denied by test policy' }),
};

function caller(overrides: Partial<InvocationCallerContext> = {}): InvocationCallerContext {
  return { callerId: 'caller.session-1', callerKind: 'agent', attributes: { role: 'tester' }, ...overrides };
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

async function buildAdmission(
  overrides: {
    graph?: DefinitionGraphEnvelope;
    exposureOverrides?: Partial<AdmitToolExposureInput>;
    requestOverrides?: Partial<ToolInvocationRequest>;
  } = {},
) {
  const g = overrides.graph ?? graph();
  const sealed = await sealedAssembly(g);
  const exposure = await mintExposure(sealed, g, overrides.exposureOverrides);
  const request: ToolInvocationRequest = {
    toolComponentId: 'tool.alpha',
    operationId: 'op.query',
    input: { q: 1 },
    caller: caller(),
    definitionGraphDigest: sealed.record.definitionGraphDigest,
    assemblyDigest: sealed.assemblyDigest,
    exposure,
    ...overrides.requestOverrides,
  };
  return { g, sealed, exposure, request };
}

test('PACK-A: a complete request is admitted and binds every exact dimension', async () => {
  const { g, sealed, exposure, request } = await buildAdmission();

  const admitted = await admitToolInvocationRequest(
    request,
    { assembly: sealed, currentDefinitionGraph: g },
    realSha256,
  );

  assert.equal(admitted.status, 'ADMITTED');
  assert.equal(admitted.toolComponentId, 'tool.alpha');
  assert.equal(admitted.operationId, 'op.query');
  assert.deepEqual(admitted.input, { q: 1 });
  assert.deepEqual(admitted.caller, caller());
  assert.equal(admitted.operationEffect, 'none');
  assert.equal(admitted.definitionGraphDigest, sealed.record.definitionGraphDigest);
  assert.equal(admitted.assemblyDigest, sealed.assemblyDigest);
  assert.equal(admitted.exposure, exposure);
});

test('PACK-A: an effectful operation is admissible as a request — effect class is bound forward as classification only', async () => {
  const g = graph();
  const sealed = await sealedAssembly(g);
  const exposure = await mintExposure(sealed, g, { operationId: 'op.mutate' });
  const request: ToolInvocationRequest = {
    toolComponentId: 'tool.alpha',
    operationId: 'op.mutate',
    input: { delta: 1 },
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

  assert.equal(admitted.status, 'ADMITTED');
  assert.equal(admitted.operationEffect, 'non-idempotent');
  // No execution/occurrence/effect authority is minted with the request (the
  // key enumeration is pinned by the microkernel suite).
  assert.equal((admitted as unknown as Record<string, unknown>).occurrenceId, undefined);
  assert.equal((admitted as unknown as Record<string, unknown>).journalEntry, undefined);
});

test('PACK-A: Workflow/Agent/UX/internal and future caller planes share one generic caller model — no branch on callerKind', async (t) => {
  const g = graph();
  const sealed = await sealedAssembly(g);

  for (const callerKind of ['workflow', 'agent', 'ux', 'internal', 'brand-new-caller-plane']) {
    await t.test(`callerKind "${callerKind}" admits through the identical path`, async () => {
      const exposure = await mintExposure(sealed, g, {
        caller: caller({ callerId: `caller.${callerKind}`, callerKind }),
      });
      const request: ToolInvocationRequest = {
        toolComponentId: 'tool.alpha',
        operationId: 'op.query',
        input: {},
        caller: caller({ callerId: `caller.${callerKind}`, callerKind }),
        definitionGraphDigest: sealed.record.definitionGraphDigest,
        assemblyDigest: sealed.assemblyDigest,
        exposure,
      };
      const admitted = await admitToolInvocationRequest(
        request,
        { assembly: sealed, currentDefinitionGraph: g },
        realSha256,
      );
      assert.equal(admitted.status, 'ADMITTED');
      assert.equal(admitted.caller.callerKind, callerKind);
    });
  }

  // A caller with no callerKind and no attributes is equally admissible:
  // provenance material is optional, only callerId is required.
  const bare = await mintExposure(sealed, g, { caller: { callerId: 'caller.bare' } });
  const bareRequest: ToolInvocationRequest = {
    toolComponentId: 'tool.alpha',
    operationId: 'op.query',
    input: {},
    caller: { callerId: 'caller.bare' },
    definitionGraphDigest: sealed.record.definitionGraphDigest,
    assemblyDigest: sealed.assemblyDigest,
    exposure: bare,
  };
  const admittedBare = await admitToolInvocationRequest(
    bareRequest,
    { assembly: sealed, currentDefinitionGraph: g },
    realSha256,
  );
  assert.equal(admittedBare.status, 'ADMITTED');
});

test('PACK-A: policy denial fails closed at exposure admission; the request path is never reached', async () => {
  const g = graph();
  const sealed = await sealedAssembly(g);

  await assert.rejects(
    mintExposure(sealed, g, { policy: DENY_ALL }),
    (error: unknown) => {
      assert.ok(error instanceof InvocationRequestError);
      assert.equal(error.code, 'EXPOSURE_NOT_ADMITTED');
      assert.match(error.message, /denied by test policy/);
      return true;
    },
  );
});

test('PACK-A: the policy decides over exact current operation and caller snapshots', async () => {
  const g = graph();
  const sealed = await sealedAssembly(g);
  const seen: unknown[] = [];
  const policy: ToolExposureAdmissionPolicy = {
    decideAdmission(query) {
      seen.push(query);
      return { admitted: true };
    },
  };
  const liveCaller = caller();
  const exposure = await mintExposure(sealed, g, { caller: liveCaller, policy });
  assert.equal(seen.length, 1);

  // Mutating the caller-owned objects after the decision cannot change what
  // the policy observed: the query carried descriptor-safe snapshots.
  (liveCaller.attributes as { role: string }).role = 'MUTATED';
  const query = seen[0] as { operation: { operationId: string }; caller: InvocationCallerContext };
  assert.equal(query.operation.operationId, 'op.query');
  assert.deepEqual(query.caller, caller());

  // The exposure evidence binds the pre-mutation caller snapshot.
  assert.deepEqual(exposure.caller, caller());
  assert.equal((exposure.caller.attributes as { role: string }).role, 'tester');
});

test('PACK-A: declarative exposure is not runtime authorization — presence grants nothing, absence blocks nothing', async () => {
  const g = graph();
  const sealed = await sealedAssembly(g);

  // op.query DECLARES exposure material, yet a denying policy still rejects.
  await assert.rejects(
    mintExposure(sealed, g, { policy: DENY_ALL }),
    (error: unknown) => {
      assert.ok(error instanceof InvocationRequestError && error.code === 'EXPOSURE_NOT_ADMITTED');
      return true;
    },
  );

  // op.mutate declares NO exposure material at all, yet admission is a pure
  // policy decision over exact current state and can admit.
  const exposure = await mintExposure(sealed, g, { operationId: 'op.mutate' });
  assert.equal(exposure.status, 'ADMITTED');
  assert.equal(exposure.operationId, 'op.mutate');
});

test('PACK-A construction matrix: request shape is closed-world and every required field is enforced', async () => {
  const g = graph();
  const sealed = await sealedAssembly(g);
  const exposure = await mintExposure(sealed, g);
  const base = {
    toolComponentId: 'tool.alpha',
    operationId: 'op.query',
    input: {},
    caller: caller(),
    definitionGraphDigest: sealed.record.definitionGraphDigest,
    assemblyDigest: sealed.assemblyDigest,
    exposure,
  };

  for (const field of [
    'toolComponentId',
    'operationId',
    'input',
    'caller',
    'definitionGraphDigest',
    'assemblyDigest',
    'exposure',
  ] as const) {
    const incomplete = { ...base } as Record<string, unknown>;
    delete incomplete[field];
    await assert.rejects(
      admitToolInvocationRequest(
        incomplete as unknown as ToolInvocationRequest,
        { assembly: sealed, currentDefinitionGraph: g },
        realSha256,
      ),
      (error: unknown) => {
        assert.ok(error instanceof InvocationRequestError);
        assert.equal(error.code, 'INVALID_INVOCATION_REQUEST');
        return true;
      },
      `missing ${field} must fail closed`,
    );
  }

  await assert.rejects(
    admitToolInvocationRequest(
      { ...base, extra: 'not-contract-material' } as unknown as ToolInvocationRequest,
      { assembly: sealed, currentDefinitionGraph: g },
      realSha256,
    ),
    (error: unknown) => {
      assert.ok(error instanceof InvocationRequestError);
      assert.equal(error.code, 'INVALID_INVOCATION_REQUEST');
      return true;
    },
  );
});

test('PACK-A construction matrix: exact identities, portable JSON input and digest formats are enforced', async () => {
  const g = graph();
  const sealed = await sealedAssembly(g);
  const exposure = await mintExposure(sealed, g);
  const base: ToolInvocationRequest = {
    toolComponentId: 'tool.alpha',
    operationId: 'op.query',
    input: {},
    caller: caller(),
    definitionGraphDigest: sealed.record.definitionGraphDigest,
    assemblyDigest: sealed.assemblyDigest,
    exposure,
  };
  const options = { assembly: sealed, currentDefinitionGraph: g };

  const cases: Array<[string, Partial<ToolInvocationRequest>, string]> = [
    ['empty component id', { toolComponentId: '' }, 'INVALID_INVOCATION_REQUEST'],
    ['embedded selector component id', { toolComponentId: 'tool.alpha@1.0.0' }, 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN'],
    ['floating operation id', { operationId: 'latest' }, 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN'],
    ['floating caller id', { caller: caller({ callerId: 'default' }) }, 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN'],
    ['floating callerKind', { caller: caller({ callerKind: 'current' }) }, 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN'],
    ['empty definition digest', { definitionGraphDigest: '' }, 'INVALID_INVOCATION_REQUEST'],
    ['empty assembly digest', { assemblyDigest: '' }, 'INVALID_INVOCATION_REQUEST'],
  ];
  for (const [name, overrides, code] of cases) {
    await assert.rejects(
      admitToolInvocationRequest({ ...base, ...overrides }, options, realSha256),
      (error: unknown) => {
        assert.ok(error instanceof InvocationRequestError);
        assert.equal(error.code, code);
        return true;
      },
      name,
    );
  }

  // Input must be portable JSON material — a function value is rejected.
  await assert.rejects(
    admitToolInvocationRequest(
      { ...base, input: (() => 1) as unknown as ToolInvocationRequest['input'] },
      options,
      realSha256,
    ),
    (error: unknown) => {
      assert.ok(error instanceof InvocationRequestError);
      assert.equal(error.code, 'INVALID_INVOCATION_REQUEST');
      return true;
    },
  );
});

test('PACK-A construction matrix: caller contract and policy contract are enforced', async () => {
  const g = graph();
  const sealed = await sealedAssembly(g);
  const exposure = await mintExposure(sealed, g);
  const base: ToolInvocationRequest = {
    toolComponentId: 'tool.alpha',
    operationId: 'op.query',
    input: {},
    caller: caller(),
    definitionGraphDigest: sealed.record.definitionGraphDigest,
    assemblyDigest: sealed.assemblyDigest,
    exposure,
  };
  const options = { assembly: sealed, currentDefinitionGraph: g };

  // caller must be a closed record {callerId, callerKind?, attributes?}.
  for (const badCaller of [
    {},
    { callerId: 'caller.session-1', extra: true },
    { callerId: 42 },
    { callerId: 'caller.session-1', attributes: (() => 1) as unknown as InvocationCallerContext['attributes'] },
  ]) {
    await assert.rejects(
      admitToolInvocationRequest({ ...base, caller: badCaller as unknown as InvocationCallerContext }, options, realSha256),
      (error: unknown) => {
        assert.ok(error instanceof InvocationRequestError);
        assert.ok(
          error.code === 'INVALID_INVOCATION_CALLER' || error.code === 'INVALID_INVOCATION_REQUEST',
          `unexpected code ${error.code}`,
        );
        return true;
      },
    );
  }

  // policy must be an object exposing decideAdmission.
  for (const badPolicy of [null, {}, { decideAdmission: 'not-a-function' }]) {
    await assert.rejects(
      mintExposure(sealed, g, { policy: badPolicy as unknown as ToolExposureAdmissionPolicy }),
      (error: unknown) => {
        assert.ok(error instanceof InvocationRequestError);
        assert.equal(error.code, 'INVALID_EXPOSURE_POLICY');
        return true;
      },
    );
  }
});

test('PACK-A target matrix: component must be bound in the current graph as a valid Tool declaring the operation', async () => {
  const g = graph();
  const sealed = await sealedAssembly(g);
  const exposure = await mintExposure(sealed, g);
  const base = {
    input: {},
    caller: caller(),
    definitionGraphDigest: sealed.record.definitionGraphDigest,
    assemblyDigest: sealed.assemblyDigest,
    exposure,
  };
  const options = { assembly: sealed, currentDefinitionGraph: g };

  // Unknown component id — not bound in the graph; the exposure-authority
  // boundary rejects it there (TOOL_COMPONENT_NOT_BOUND).
  await assert.rejects(
    mintExposure(sealed, g, { toolComponentId: 'tool.unknown' }),
    (error: unknown) => {
      assert.ok(error instanceof InvocationRequestError);
      assert.equal(error.code, 'TOOL_COMPONENT_NOT_BOUND');
      return true;
    },
  );

  // At request admission the same unknown target surfaces earlier as an
  // evidence-transfer refusal: the evidence binds "tool.alpha" and cannot be
  // ridden to any other target.
  await assert.rejects(
    admitToolInvocationRequest(
      { ...base, toolComponentId: 'tool.unknown', operationId: 'op.query' },
      options,
      realSha256,
    ),
    (error: unknown) => {
      assert.ok(error instanceof InvocationRequestError);
      assert.equal(error.code, 'INVOCATION_BINDING_MISMATCH');
      return true;
    },
  );

  // A semantic-family component can never be an invocation target; the
  // policy must never run for it.
  const gSemantic = graph({ components: [toolComponent(), semanticComponent('component.semantic')] });
  const sealedSemantic = await sealRuntimeAssembly(
    {
      definitionGraph: gSemantic,
      kindImplementations: [
        toolBinding(),
        {
          ...toolBinding(),
          pin: {
            kind: { kindId: 'test.semantic-kind', version: '1.0.0' },
            implementation: {
              implementationId: 'impl.test.semantic-kind',
              implementationVersion: '1.0.0',
              implementationDigest: 'sha256:semantic-kind-impl',
            },
          },
        },
      ],
    },
    realSha256,
  );
  await assert.rejects(
    mintExposure(sealedSemantic, gSemantic, {
      toolComponentId: 'component.semantic',
      operationId: 'op.query',
      policy: {
        decideAdmission() {
          throw new Error('policy must never run for a non-Tool target');
        },
      },
    }),
    (error: unknown) => {
      assert.ok(error instanceof InvocationRequestError);
      assert.equal(error.code, 'INVALID_TOOL_INVOCATION_TARGET');
      return true;
    },
  );

  // Unknown operation on a valid Tool.
  await assert.rejects(
    mintExposure(sealed, g, { operationId: 'op.nope' }),
    (error: unknown) => {
      assert.ok(error instanceof InvocationRequestError);
      assert.equal(error.code, 'INVALID_TOOL_INVOCATION_TARGET');
      return true;
    },
  );

  // Broken Tool declaration propagates the original ToolComponentContractError.
  const gBroken = graph({
    components: [toolComponent({ semanticBody: { operations: 'not-an-array' } })],
  });
  const sealedBroken = await sealedAssembly(gBroken);
  await assert.rejects(
    mintExposure(sealedBroken, gBroken, {}),
    (error: unknown) => {
      assert.ok(error instanceof Error && error.name === 'ToolComponentContractError');
      return true;
    },
  );
});

test('PACK-A boundary: graph envelope failures propagate the original typed error unchanged', async () => {
  const g = graph();
  const sealed = await sealedAssembly(g);
  const exposure = await mintExposure(sealed, g);

  // Dangling relation endpoint invalidates the graph before any authority use.
  const staleGraph: DefinitionGraphEnvelope = {
    ...g,
    relations: [
      {
        relationId: 'rel.dangling',
        relationKind: 'uses',
        sourceComponentId: 'tool.alpha',
        targetComponentId: 'tool.missing',
      },
    ],
  };
  await assert.rejects(
    admitToolInvocationRequest(
      {
        toolComponentId: 'tool.alpha',
        operationId: 'op.query',
        input: {},
        caller: caller(),
        definitionGraphDigest: sealed.record.definitionGraphDigest,
        assemblyDigest: sealed.assemblyDigest,
        exposure,
      },
      { assembly: sealed, currentDefinitionGraph: staleGraph },
      realSha256,
    ),
    (error: unknown) => {
      assert.ok(error instanceof DefinitionGraphContractError);
      assert.equal(error.code, 'DANGLING_COMPONENT_REF');
      return true;
    },
  );
});
