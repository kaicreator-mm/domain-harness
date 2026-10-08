/**
 * T004B invariant matrix — torn-snapshot discipline (issue #632, fine-grained
 * DAG #534 T004B; authority #589 PACK-C T004B section).
 *
 * Pins the PACK-C snapshot rules:
 *  - all authority/currentness is snapshotted before any async Tool call; the
 *    caller mutating its own request input, caller context, Definition graph
 *    or binding-adjacent material while the dispatch is pending can never
 *    change what the Tool observes or what the result binds;
 *  - no caller-owned reread after await: the Tool output is snapshotted into
 *    frozen module-owned material immediately after the dispatch suspension,
 *    so post-resolution caller mutation cannot retroactively alter the
 *    observational result.
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
import { sealRuntimeAssembly } from '../../src/contracts/runtime-assembly.js';
import {
  bindToolImplementation,
  type SealedToolImplementationBinding,
  type ToolImplementationCandidate,
} from '../../src/contracts/tool-implementation-binding.js';
import {
  admitToolExposure,
  admitToolInvocationRequest,
  type AdmittedToolInvocationRequest,
  type InvocationCallerContext,
  type ToolExposureAdmissionPolicy,
} from '../../src/contracts/invocation-request.js';
import {
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

const ADMIT_ALL: ToolExposureAdmissionPolicy = { decideAdmission: () => ({ admitted: true }) };

function caller(overrides: Partial<InvocationCallerContext> = {}): InvocationCallerContext {
  return { callerId: 'caller.session-1', callerKind: 'agent', attributes: { role: 'tester' }, ...overrides };
}

interface Fixture {
  g: DefinitionGraphEnvelope;
  binding: SealedToolImplementationBinding;
  admitted: AdmittedToolInvocationRequest;
}

async function fixture(
  liveInput: unknown,
): Promise<Fixture> {
  const g = graph();
  const baseAssembly = await sealRuntimeAssembly(
    {
      definitionGraph: g,
      kindImplementations: [
        {
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
        },
      ],
    },
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
  const candidates: readonly ToolImplementationCandidate[] = [
    {
      implementation: {
        implementationId: 'impl.calc.alpha',
        implementationVersion: '1.0.0',
        implementationDigest: 'sha256:impl.calc.alpha-content',
      },
      supportedOperations: ['op.query'],
      handle: { id: 'handle.alpha' },
    },
  ];
  const binding = await bindToolImplementation({
    assembly: baseAssembly,
    selection: JSON.parse(JSON.stringify(selection)),
    currentDefinitionGraph: g,
    implementations: candidates,
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
      input: liveInput as never,
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

test('PACK-C T004B torn snapshot: caller mutating request input, caller context and graph during the dispatch await changes nothing', async () => {
  const liveInput = { q: 1, nested: { keep: 'original' } };
  const liveCaller = caller();
  const fx = await fixture(liveInput);
  const calls: NonEffectfulToolDispatchQuery[] = [];

  // The dispatch port mutates every caller-owned object it can reach while
  // the invocation is pending, then returns.
  const dispatch: NonEffectfulToolDispatchPort = {
    async dispatch(query) {
      calls.push(query);
      (liveInput as { q: number }).q = 999;
      (liveInput as { nested: { keep: string } }).nested.keep = 'MUTATED';
      (liveCaller.attributes as { role: string }).role = 'MUTATED';
      const tool = fx.g.components.find((c) => c.componentId === 'tool.alpha')!;
      (tool.semanticBody as { operations: Array<{ operationId: string }> }).operations[0]!.operationId =
        'op.SWAPPED';
      return { echo: (query.input as { q: number }).q };
    },
  };

  const input: InvokeNonEffectfulToolInput = {
    request: fx.admitted,
    binding: fx.binding,
    currentDefinitionGraph: fx.g,
    dispatch,
    sha256: realSha256,
  };
  const result = await invokeNonEffectfulTool(input);

  // The Tool observed the pre-mutation snapshot — a canonicalized,
  // non-aliasing module-owned copy.
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]!.input, { q: 1, nested: { keep: 'original' } });
  assert.notEqual(
    (calls[0]!.input as { nested: object }).nested,
    (liveInput as { nested: object }).nested,
    'the input snapshot must not alias caller-owned material',
  );
  assert.deepEqual(result.output, { echo: 1 });

  // The result binds the exact pre-mutation authority identities.
  assert.equal(result.toolComponentId, 'tool.alpha');
  assert.equal(result.operationId, 'op.query');
  assert.equal(result.assemblyDigest, fx.binding.successorAssembly.assemblyDigest);

  // Mutating the caller-owned input after resolution cannot retroactively
  // change the frozen observational result.
  (liveInput as { q: number }).q = 12345;
  assert.deepEqual(result.output, { echo: 1 });
  assert.ok(Object.isFrozen(result.output));
  assert.throws(
    () => {
      (result.output as { echo: number }).echo = 0;
    },
    TypeError,
    'the output snapshot is deeply frozen',
  );
});

test('PACK-C T004B torn snapshot: the verifier-paired handle is dispatched unchanged and never re-read from caller-owned material', async () => {
  const fx = await fixture({ q: 1 });
  const observedHandles: unknown[] = [];

  const dispatch: NonEffectfulToolDispatchPort = {
    async dispatch(query) {
      observedHandles.push(query.handle);
      return { ok: true };
    },
  };

  const result = await invokeNonEffectfulTool({
    request: fx.admitted,
    binding: fx.binding,
    currentDefinitionGraph: fx.g,
    dispatch,
    sha256: realSha256,
  });

  assert.equal(observedHandles.length, 1);
  assert.deepEqual(observedHandles[0], { id: 'handle.alpha' });
  assert.equal(result.status, 'OBSERVED');
});

test('PACK-C T004B torn snapshot: a mid-flight resourceProvider response mutation cannot change the resolved snapshot', async () => {
  const g = graph();
  const baseAssembly = await sealRuntimeAssembly(
    {
      definitionGraph: g,
      kindImplementations: [
        {
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
        },
      ],
      resourceRequirements: [
        {
          owner: toolComponent(),
          declaration: {
            componentId: 'tool.alpha',
            requirements: [{ resourceKey: 'res.config', required: true }],
          },
        },
      ],
    },
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
    implementations: [
      {
        implementation: {
          implementationId: 'impl.calc.alpha',
          implementationVersion: '1.0.0',
          implementationDigest: 'sha256:impl.calc.alpha-content',
        },
        supportedOperations: ['op.query'],
        handle: { id: 'handle.alpha' },
      },
    ],
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
      input: {},
      caller: caller(),
      definitionGraphDigest: binding.successorAssembly.record.definitionGraphDigest,
      assemblyDigest: binding.successorAssembly.assemblyDigest,
      exposure,
    },
    { assembly: binding.successorAssembly, currentDefinitionGraph: g },
    realSha256,
  );

  const calls: NonEffectfulToolDispatchQuery[] = [];
  let providerResponse: { status: 'resolved'; handle: { id: string } } | undefined;
  const provider = {
    async resolve() {
      providerResponse = { status: 'resolved', handle: { id: 'res.handle' } };
      return providerResponse;
    },
  };

  const result = await invokeNonEffectfulTool({
    request: admitted,
    binding,
    currentDefinitionGraph: g,
    dispatch: {
      async dispatch(query) {
        calls.push(query);
        // Mutate the provider-owned response object before the snapshot read.
        providerResponse!.handle = { id: 'MUTATED' };
        return { ok: true };
      },
    },
    resourceProvider: provider,
    sha256: realSha256,
  });

  assert.equal(result.status, 'OBSERVED');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]!.resources.get('res.config'), {
    resourceKey: 'res.config',
    status: 'resolved',
    handle: { id: 'res.handle' },
  });
});
