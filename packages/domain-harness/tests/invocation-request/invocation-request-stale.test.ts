/**
 * T004A invariant matrix — stale state fails closed before dispatch
 * (issue #609, fine-grained DAG #534 T004A; authority #589 PACK-A T004A
 * section).
 *
 * PACK-A authority rules pinned here:
 *  - stale Definition fails closed: the current graph digest is
 *    authoritatively recomputed and must equal the Assembly-bound digest, the
 *    request claim and the exposure-bound digest;
 *  - stale Assembly fails closed: the Assembly record digest is
 *    authoritatively recomputed and must equal the claimed assemblyDigest;
 *  - stale exposure fails closed: evidence minted against older exact state
 *    can never authorize a request against newer state;
 *  - caller cannot ride on evidence minted for another caller: caller context
 *    mismatch between request and evidence fails closed;
 *  - the request target (component + operation) must match the evidence.
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
  return { callerId: 'caller.session-1', callerKind: 'agent', ...overrides };
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

test('PACK-A stale rule: a Definition graph advanced after sealing fails closed at exposure admission', async () => {
  const g = graph();
  const sealed = await sealedAssembly(g);

  // The Definition advances: a new component is bound. The sealed Assembly is
  // bound to the exact old graph digest and never tracks drift.
  const advancedGraph = graph({
    components: [
      toolComponent(),
      {
        family: 'semantic',
        componentId: 'component.new',
        kind: { kindId: 'test.semantic-kind', version: '1.0.0' },
        requiredSemanticContracts: [],
        requiredCapabilities: [],
        semanticBody: { note: 'added after sealing' },
      },
    ],
  });

  await assert.rejects(
    mintExposure(sealed, advancedGraph),
    (error: unknown) => {
      assert.ok(error instanceof InvocationRequestError);
      assert.equal(error.code, 'DEFINITION_CURRENTNESS_MISMATCH');
      return true;
    },
  );
});

test('PACK-A stale rule: a Definition graph advanced after exposure minting fails closed at request admission', async () => {
  const g = graph();
  const sealed = await sealedAssembly(g);
  const exposure = await mintExposure(sealed, g);

  // After exposure evidence is minted, the graph advances again (the Tool
  // declaration itself changes). The request is rejected before any dispatch.
  const advancedGraph = graph({
    components: [
      toolComponent({
        semanticBody: {
          operations: [
            {
              operationId: 'op.query',
              inputSchema: {},
              outputSchema: {},
              effect: 'none',
              declaredExposure: { audiences: ['agent', 'ux', 'added-later'] },
            },
          ],
          providesCapabilities: [],
        },
      }),
    ],
  });

  const request: ToolInvocationRequest = {
    toolComponentId: 'tool.alpha',
    operationId: 'op.query',
    input: {},
    caller: caller(),
    definitionGraphDigest: sealed.record.definitionGraphDigest,
    assemblyDigest: sealed.assemblyDigest,
    exposure,
  };
  await assert.rejects(
    admitToolInvocationRequest(request, { assembly: sealed, currentDefinitionGraph: advancedGraph }, realSha256),
    (error: unknown) => {
      assert.ok(error instanceof InvocationRequestError);
      assert.equal(error.code, 'DEFINITION_CURRENTNESS_MISMATCH');
      return true;
    },
  );
});

test('PACK-A stale rule: a request claiming a different Assembly identity fails closed', async () => {
  const g = graph();
  const sealed = await sealedAssembly(g);
  const exposure = await mintExposure(sealed, g);

  const request: ToolInvocationRequest = {
    toolComponentId: 'tool.alpha',
    operationId: 'op.query',
    input: {},
    caller: caller(),
    definitionGraphDigest: sealed.record.definitionGraphDigest,
    assemblyDigest: 'sha256:some-other-assembly',
    exposure,
  };
  await assert.rejects(
    admitToolInvocationRequest(request, { assembly: sealed, currentDefinitionGraph: g }, realSha256),
    (error: unknown) => {
      assert.ok(error instanceof InvocationRequestError);
      assert.equal(error.code, 'ASSEMBLY_CURRENTNESS_MISMATCH');
      return true;
    },
  );
});

test('PACK-A stale rule: exposure evidence minted against older exact state fails closed against newer state', async () => {
  // v1 state: seal + mint exposure.
  const g1 = graph();
  const sealedV1 = await sealedAssembly(g1);
  const exposureV1 = await mintExposure(sealedV1, g1);

  // v2 state: the Tool declaration changes (exposure audience widened), a new
  // Assembly is sealed over the new exact graph.
  const g2 = graph({
    components: [
      toolComponent({
        semanticBody: {
          operations: [
            {
              operationId: 'op.query',
              inputSchema: {},
              outputSchema: {},
              effect: 'none',
              declaredExposure: { audiences: ['agent', 'ux'] },
            },
          ],
          providesCapabilities: [],
        },
      }),
    ],
  });
  const sealedV2 = await sealedAssembly(g2);
  assert.notEqual(sealedV1.assemblyDigest, sealedV2.assemblyDigest);

  // The v1 evidence binds v1 digests; the current state is v2. Stale
  // exposure fails closed before dispatch.
  const request: ToolInvocationRequest = {
    toolComponentId: 'tool.alpha',
    operationId: 'op.query',
    input: {},
    caller: caller(),
    definitionGraphDigest: sealedV2.record.definitionGraphDigest,
    assemblyDigest: sealedV2.assemblyDigest,
    exposure: exposureV1,
  };
  await assert.rejects(
    admitToolInvocationRequest(request, { assembly: sealedV2, currentDefinitionGraph: g2 }, realSha256),
    (error: unknown) => {
      assert.ok(error instanceof InvocationRequestError);
      assert.equal(error.code, 'EXPOSURE_CURRENTNESS_MISMATCH');
      return true;
    },
  );
});

test('PACK-A stale rule: a structurally invalid or digest-tampered Assembly object fails closed', async () => {
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

  // Structurally invalid: no record at all.
  await assert.rejects(
    admitToolInvocationRequest(base, {
      assembly: { assemblyDigest: 'sha256:x' } as unknown as SealedRuntimeAssembly,
      currentDefinitionGraph: g,
    }, realSha256),
    (error: unknown) => {
      assert.ok(error instanceof InvocationRequestError);
      assert.equal(error.code, 'INVALID_ASSEMBLY_EVIDENCE');
      return true;
    },
  );

  // Digest-tampered: genuine record content, forged assemblyDigest claim.
  // The record digest is authoritatively recomputed and mismatches.
  const tampered = {
    record: sealed.record,
    assemblyDigest: 'sha256:forged-assembly-digest',
    bindings: sealed.bindings,
  } as unknown as SealedRuntimeAssembly;
  await assert.rejects(
    admitToolInvocationRequest(base, { assembly: tampered, currentDefinitionGraph: g }, realSha256),
    (error: unknown) => {
      assert.ok(error instanceof InvocationRequestError);
      assert.equal(error.code, 'ASSEMBLY_DIGEST_MISMATCH');
      return true;
    },
  );
});

test('PACK-A authority rule: a caller cannot ride on exposure evidence minted for a different caller', async () => {
  const g = graph();
  const sealed = await sealedAssembly(g);
  const exposure = await mintExposure(sealed, g, { caller: caller({ callerId: 'caller.alice' }) });

  const base = {
    toolComponentId: 'tool.alpha',
    operationId: 'op.query',
    input: {},
    definitionGraphDigest: sealed.record.definitionGraphDigest,
    assemblyDigest: sealed.assemblyDigest,
    exposure,
  };

  // Different caller id.
  await assert.rejects(
    admitToolInvocationRequest(
      { ...base, caller: caller({ callerId: 'caller.mallory' }) },
      { assembly: sealed, currentDefinitionGraph: g },
      realSha256,
    ),
    (error: unknown) => {
      assert.ok(error instanceof InvocationRequestError);
      assert.equal(error.code, 'INVOCATION_CALLER_MISMATCH');
      return true;
    },
  );

  // Same caller id but different attributes: the evidence binds the full
  // caller context, not just the id.
  await assert.rejects(
    admitToolInvocationRequest(
      { ...base, caller: caller({ callerId: 'caller.alice', attributes: { role: 'elevated' } }) },
      { assembly: sealed, currentDefinitionGraph: g },
      realSha256,
    ),
    (error: unknown) => {
      assert.ok(error instanceof InvocationRequestError);
      assert.equal(error.code, 'INVOCATION_CALLER_MISMATCH');
      return true;
    },
  );
});

test('PACK-A authority rule: request target must match the evidence-bound component and operation', async () => {
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

  await assert.rejects(
    admitToolInvocationRequest(
      { ...base, toolComponentId: 'tool.beta', operationId: 'op.query' },
      { assembly: sealed, currentDefinitionGraph: g },
      realSha256,
    ),
    (error: unknown) => {
      assert.ok(error instanceof InvocationRequestError);
      assert.equal(error.code, 'INVOCATION_BINDING_MISMATCH');
      return true;
    },
  );

  await assert.rejects(
    admitToolInvocationRequest(
      { ...base, toolComponentId: 'tool.alpha', operationId: 'op.other' },
      { assembly: sealed, currentDefinitionGraph: g },
      realSha256,
    ),
    (error: unknown) => {
      assert.ok(error instanceof InvocationRequestError);
      assert.equal(error.code, 'INVOCATION_BINDING_MISMATCH');
      return true;
    },
  );
});
