/**
 * T005B invariant matrix — Runtime Resource injection/resolution
 * (issues #608, planning authority #589 PACK-A T005B).
 *
 * Covers the PACK-A T005B test mandate:
 *  - required/optional resolution, missing and incompatible fail-closed
 *    semantics (failure BEFORE any affected invocation/effect authority);
 *  - explicit absence for optional resources (never ambient/default fallback);
 *  - redaction: handles/secrets/provider free text never enter diagnostics;
 *  - torn-snapshot discipline: caller/async mutation during resolution cannot
 *    change the synchronously snapshotted requirement material;
 *  - hostile descriptor input on every authority-bearing surface;
 *  - provider replacement with zero core source edits (injected port only);
 *  - #643: provider-controlled key names / symbol descriptions / secret-shaped
 *    key material are classified (never echoed) in
 *    INVALID_RESOURCE_PROVIDER_RESPONSE diagnostics; the typed code and fixed
 *    diagnostic context stay stable; legitimate resolution is unchanged.
 *
 * Composition note: assemblies are GENUINELY sealed through
 * `sealRuntimeAssembly` (T002B) with T005A declarations over a real Tool
 * Component, so resolution consumes the true canonical #568 material. Only
 * the hostile-input/mutation tests use hand-forged assembly-shaped records
 * (the T002B brand is T002B's anti-forgery boundary, not T005B's; the
 * resolver structurally re-validates everything it consumes).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { ComponentEnvelope } from '../../src/contracts/component.js';
import type { Sha256Port } from '../../src/contracts/identity.js';
import {
  ResourceResolutionError,
  resolveToolResources,
  type ResolveToolResourcesOptions,
  type ResourceProvider,
  type ResourceProviderResponse,
  type ResourceResolutionRequest,
} from '../../src/contracts/resource-resolution.js';
import type {
  ResourceContractRef,
  ToolResourceRequirement,
} from '../../src/contracts/resource-requirements.js';
import {
  sealRuntimeAssembly,
  type KindImplementationBindingInput,
  type RuntimeAssemblyRecord,
  type SealedRuntimeAssembly,
} from '../../src/contracts/runtime-assembly.js';

const realSha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

const OWNER_ID = 'credit.rating.tool';
const OPERATION_LOOKUP = 'lookup.credit-rating';
const OPERATION_FREEZE = 'submit.credit-freeze';
const POSTGRES_CONTRACT: ResourceContractRef = {
  contractId: 'runtime.postgres.contract',
  version: '1.2.0',
};

function operation(operationId: string, effect: 'idempotent' | 'non-idempotent'): Record<string, unknown> {
  return { operationId, inputSchema: { type: 'object' }, outputSchema: { type: 'object' }, effect };
}

function toolEnvelope(): ComponentEnvelope {
  return {
    family: 'tool',
    componentId: OWNER_ID,
    kind: { kindId: 'tool.credit-rating.v1', version: '2.0.0' },
    requiredSemanticContracts: [{ contractId: 'credit.rating.schema', version: '1.0.0' }],
    requiredCapabilities: [{ capabilityId: 'outbound-http', version: '1.4.0' }],
    semanticBody: {
      operations: [
        operation(OPERATION_LOOKUP, 'idempotent'),
        operation(OPERATION_FREEZE, 'non-idempotent'),
      ],
      providesCapabilities: [{ capabilityId: 'credit-rating-lookup', version: '1.1.0' }],
    } as unknown as ComponentEnvelope['semanticBody'],
  };
}

function toolBinding(): KindImplementationBindingInput {
  return {
    pin: {
      kind: { kindId: 'tool.credit-rating.v1', version: '2.0.0' },
      implementation: {
        implementationId: 'impl.credit-tool',
        implementationVersion: '1.0.0',
        implementationDigest: 'sha256:credit-tool-impl',
      },
    },
    understoodSemanticContracts: [{ contractId: 'credit.rating.schema', version: '1.0.0' }],
    understoodCapabilities: [{ capabilityId: 'outbound-http', version: '1.4.0' }],
    validateComponent: () => {},
  };
}

function requirement(overrides: {
  resourceKey?: string;
  contract?: ResourceContractRef;
  operationId?: string;
  required?: boolean;
} = {}): ToolResourceRequirement {
  return {
    resourceKey: overrides.resourceKey ?? 'runtime.postgres.cluster',
    ...(overrides.contract !== undefined ? { contract: overrides.contract } : {}),
    ...(overrides.operationId !== undefined ? { operationId: overrides.operationId } : {}),
    required: overrides.required ?? true,
  };
}

/** Seal a genuine Assembly carrying one owner's T005A declaration. */
async function sealedAssembly(
  requirements: readonly ToolResourceRequirement[],
): Promise<SealedRuntimeAssembly> {
  const owner = toolEnvelope();
  return sealRuntimeAssembly(
    {
      definitionGraph: { graphId: 'graph.credit-rating', components: [owner], relations: [] },
      kindImplementations: [toolBinding()],
      resourceRequirements: [{ owner, declaration: { componentId: OWNER_ID, requirements } }],
    },
    realSha256,
  );
}

/** Seal a genuine Assembly with NO resource requirement bindings at all. */
async function sealedAssemblyWithoutRequirements(): Promise<SealedRuntimeAssembly> {
  const owner = toolEnvelope();
  return sealRuntimeAssembly(
    {
      definitionGraph: { graphId: 'graph.credit-rating', components: [owner], relations: [] },
      kindImplementations: [toolBinding()],
    },
    realSha256,
  );
}

interface ProviderStub {
  readonly provider: ResourceProvider;
  /** Frozen request snapshots exactly as handed to the provider, in call order. */
  readonly calls: readonly ResourceResolutionRequest[];
}

function providerStub(
  impl: (request: ResourceResolutionRequest) => ResourceProviderResponse | Promise<ResourceProviderResponse>,
): ProviderStub {
  const calls: ResourceResolutionRequest[] = [];
  const provider: ResourceProvider = {
    async resolve(request: ResourceResolutionRequest): Promise<ResourceProviderResponse> {
      calls.push(request);
      return impl(request);
    },
  };
  return { provider, calls };
}

/** A provider that resolves everything with a per-key opaque handle. */
function resolvingProvider(handles: Record<string, unknown>, calls?: ResourceResolutionRequest[]): ResourceProvider {
  return {
    async resolve(request: ResourceResolutionRequest): Promise<ResourceProviderResponse> {
      calls?.push(request);
      const contract = request.contract;
      return {
        status: 'resolved',
        handle: handles[request.resourceKey],
        ...(contract !== undefined ? { contract } : {}),
      };
    },
  };
}

function options(
  assembly: SealedRuntimeAssembly,
  provider: ResourceProvider,
  overrides: { componentId?: string; operationId?: string } = {},
): ResolveToolResourcesOptions {
  const resolved: {
    assembly: SealedRuntimeAssembly;
    componentId: string;
    operationId?: string;
    provider: ResourceProvider;
  } = {
    assembly,
    componentId: overrides.componentId ?? OWNER_ID,
    provider,
  };
  if (overrides.operationId !== undefined) {
    resolved.operationId = overrides.operationId;
  }
  return resolved;
}

async function expectResolutionError(
  promise: Promise<unknown>,
  code: string,
): Promise<ResourceResolutionError> {
  return promise.then(
    () => {
      throw new Error(`expected ResourceResolutionError(${code}), but resolution succeeded`);
    },
    (error: unknown) => {
      assert.ok(
        error instanceof ResourceResolutionError,
        `expected ResourceResolutionError, got ${String(error)}`,
      );
      assert.equal(error.code, code);
      assert.equal(error.name, 'ResourceResolutionError');
      return error;
    },
  );
}

/**
 * Hand-forge an assembly-shaped object with a MUTABLE deep clone of a sealed
 * record (the genuine object is deeply frozen). Used only to prove the
 * resolver's torn-snapshot discipline against caller-side mutation; the
 * forged object intentionally lacks the T002B brand.
 */
function forgeMutableAssembly(sealed: SealedRuntimeAssembly): {
  forged: SealedRuntimeAssembly;
  mutableRecord: RuntimeAssemblyRecord;
} {
  const mutableRecord = JSON.parse(JSON.stringify(sealed.record)) as RuntimeAssemblyRecord;
  const forged = {
    record: mutableRecord,
    assemblyDigest: sealed.assemblyDigest,
    bindings: sealed.bindings,
  } as unknown as SealedRuntimeAssembly;
  return { forged, mutableRecord };
}

// ---------------------------------------------------------------------------
// Required / optional resolution
// ---------------------------------------------------------------------------

test('T005B required resource resolved: opaque handle returned, provider consulted exactly once', async () => {
  const assembly = await sealedAssembly([requirement()]);
  const handle = { connection: 'opaque-host-object' };
  const { provider, calls } = providerStub(() => ({ status: 'resolved', handle, contract: POSTGRES_CONTRACT }));

  const result = await resolveToolResources(options(assembly, provider));

  assert.equal(result.componentId, OWNER_ID);
  assert.equal(calls.length, 1);
  const entry = result.resources.get('runtime.postgres.cluster');
  assert.deepEqual(entry, { resourceKey: 'runtime.postgres.cluster', status: 'resolved', handle });
  assert.equal((entry as { handle: unknown }).handle, handle, 'handle returned by reference, opaque');
});

test('T005B optional resource resolved carries required=false verbatim to the provider', async () => {
  const assembly = await sealedAssembly([requirement({ required: false })]);
  const { provider, calls } = providerStub(() => ({ status: 'resolved', handle: 'cache-handle' }));

  const result = await resolveToolResources(options(assembly, provider));

  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.required, false);
  assert.deepEqual(result.resources.get('runtime.postgres.cluster'), {
    resourceKey: 'runtime.postgres.cluster',
    status: 'resolved',
    handle: 'cache-handle',
  });
});

test('T005B component with no Assembly requirement material resolves to an empty result without provider contact', async () => {
  const assembly = await sealedAssemblyWithoutRequirements();
  const { provider, calls } = providerStub(() => ({ status: 'resolved', handle: 'x' }));

  const result = await resolveToolResources(options(assembly, provider));

  assert.equal(calls.length, 0);
  assert.equal(result.resources.size, 0);
});

test('T005B componentId absent from the Assembly resolves to an empty result (only Assembly-contained requirements are ever requested)', async () => {
  const assembly = await sealedAssembly([requirement()]);
  const { provider, calls } = providerStub(() => ({ status: 'resolved', handle: 'x' }));

  const result = await resolveToolResources(
    options(assembly, provider, { componentId: 'other.tool' }),
  );

  assert.equal(calls.length, 0);
  assert.equal(result.resources.size, 0);
});

test('T005B the provider receives frozen exact-identity request snapshots, never caller-owned objects', async () => {
  const assembly = await sealedAssembly([
    requirement({ contract: POSTGRES_CONTRACT, operationId: OPERATION_LOOKUP }),
  ]);
  const { provider, calls } = providerStub(() => ({ status: 'resolved', handle: 'h', contract: POSTGRES_CONTRACT }));

  await resolveToolResources(options(assembly, provider, { operationId: OPERATION_LOOKUP }));

  assert.equal(calls.length, 1);
  const request = calls[0]!;
  assert.ok(Object.isFrozen(request), 'request snapshot is frozen');
  assert.deepEqual(request, {
    componentId: OWNER_ID,
    resourceKey: 'runtime.postgres.cluster',
    contract: POSTGRES_CONTRACT,
    operationId: OPERATION_LOOKUP,
    required: true,
  });
});

// ---------------------------------------------------------------------------
// Missing / incompatible fail-closed, explicit absence
// ---------------------------------------------------------------------------

test('T005B required missing => MISSING_REQUIRED_RESOURCE before any result (terminal, exactly one provider call)', async () => {
  const assembly = await sealedAssembly([requirement()]);
  const { provider, calls } = providerStub(() => ({ status: 'absent' }));

  const error = await expectResolutionError(
    resolveToolResources(options(assembly, provider)),
    'MISSING_REQUIRED_RESOURCE',
  );

  assert.ok(error.message.includes('runtime.postgres.cluster'));
  assert.ok(error.message.includes(OWNER_ID));
  assert.equal(calls.length, 1, 'no retry after a terminal required-resource failure');
});

test('T005B optional missing => explicit absence entry, resolution succeeds', async () => {
  const assembly = await sealedAssembly([requirement({ required: false })]);
  const { provider } = providerStub(() => ({ status: 'absent' }));

  const result = await resolveToolResources(options(assembly, provider));

  assert.deepEqual(result.resources.get('runtime.postgres.cluster'), {
    resourceKey: 'runtime.postgres.cluster',
    status: 'absent',
  });
  assert.equal(result.resources.size, 1);
});

test('T005B required incompatible (provider status) => INCOMPATIBLE_RESOURCE fails closed', async () => {
  const assembly = await sealedAssembly([requirement({ contract: POSTGRES_CONTRACT })]);
  const { provider, calls } = providerStub(() => ({
    status: 'incompatible',
    supportedContracts: [{ contractId: 'runtime.mysql.contract', version: '3.0.0' }],
  }));

  const error = await expectResolutionError(
    resolveToolResources(options(assembly, provider)),
    'INCOMPATIBLE_RESOURCE',
  );

  assert.ok(error.message.includes('runtime.postgres.cluster'));
  assert.equal(calls.length, 1);
});

test('T005B required resolved under a different exact contract version => INCOMPATIBLE_RESOURCE (status string never trusted alone)', async () => {
  const assembly = await sealedAssembly([requirement({ contract: POSTGRES_CONTRACT })]);
  const { provider } = providerStub(() => ({
    status: 'resolved',
    handle: 'mysql-handle',
    contract: { contractId: 'runtime.postgres.contract', version: '2.0.0' },
  }));

  await expectResolutionError(
    resolveToolResources(options(assembly, provider)),
    'INCOMPATIBLE_RESOURCE',
  );
});

test('T005B required resolved without the contract proof the Assembly pins => INCOMPATIBLE_RESOURCE', async () => {
  const assembly = await sealedAssembly([requirement({ contract: POSTGRES_CONTRACT })]);
  const { provider } = providerStub(() => ({ status: 'resolved', handle: 'unproven-handle' }));

  await expectResolutionError(
    resolveToolResources(options(assembly, provider)),
    'INCOMPATIBLE_RESOURCE',
  );
});

test('T005B required resolved under a different contract identity => INCOMPATIBLE_RESOURCE', async () => {
  const assembly = await sealedAssembly([requirement({ contract: POSTGRES_CONTRACT })]);
  const { provider } = providerStub(() => ({
    status: 'resolved',
    handle: 'h',
    contract: { contractId: 'runtime.mysql.contract', version: '1.2.0' },
  }));

  await expectResolutionError(
    resolveToolResources(options(assembly, provider)),
    'INCOMPATIBLE_RESOURCE',
  );
});

test('T005B optional incompatible (status and contract-mismatch variants) => explicit absence, never a throw', async () => {
  const assembly = await sealedAssembly([
    requirement({ resourceKey: 'runtime.pg.status', contract: POSTGRES_CONTRACT, required: false }),
    requirement({ resourceKey: 'runtime.pg.mismatch', contract: POSTGRES_CONTRACT, required: false }),
  ]);
  const { provider } = providerStub((request) =>
    request.resourceKey === 'runtime.pg.status'
      ? { status: 'incompatible' }
      : { status: 'resolved', handle: 'h', contract: { contractId: 'runtime.mysql.contract', version: '1.2.0' } },
  );

  const result = await resolveToolResources(options(assembly, provider));

  assert.deepEqual(result.resources.get('runtime.pg.status'), {
    resourceKey: 'runtime.pg.status',
    status: 'absent',
  });
  assert.deepEqual(result.resources.get('runtime.pg.mismatch'), {
    resourceKey: 'runtime.pg.mismatch',
    status: 'absent',
  });
});

test('T005B exact contract match resolves; the pinned contract is handed verbatim to the provider', async () => {
  const assembly = await sealedAssembly([requirement({ contract: POSTGRES_CONTRACT })]);
  const { provider, calls } = providerStub((request) => ({
    status: 'resolved',
    handle: 'pg-handle',
    ...(request.contract !== undefined ? { contract: request.contract } : {}),
  }));

  const result = await resolveToolResources(options(assembly, provider));

  assert.equal((result.resources.get('runtime.postgres.cluster') as { status: string }).status, 'resolved');
  assert.deepEqual(calls[0]!.contract, POSTGRES_CONTRACT);
});

test('T005B a requirement without a contract resolves under any provider-reported contract proof', async () => {
  const assembly = await sealedAssembly([requirement({ resourceKey: 'runtime.cache' })]);
  const { provider } = providerStub(() => ({
    status: 'resolved',
    handle: 'cache-handle',
    contract: { contractId: 'runtime.cache.contract', version: '4.0.0' },
  }));

  const result = await resolveToolResources(options(assembly, provider));

  assert.equal(
    (result.resources.get('runtime.cache') as { status: string }).status,
    'resolved',
  );
});

// ---------------------------------------------------------------------------
// Operation scoping and canonical order
// ---------------------------------------------------------------------------

test('T005B operation-scoped requirements apply only to the exact invocation operation; component-scope applies always', async () => {
  const assembly = await sealedAssembly([
    requirement({ resourceKey: 'runtime.postgres.cluster' }),
    requirement({ resourceKey: 'runtime.secrets.vault', operationId: OPERATION_LOOKUP }),
  ]);
  const { provider, calls } = providerStub(() => ({ status: 'resolved', handle: 'h' }));

  const lookup = await resolveToolResources(
    options(assembly, provider, { operationId: OPERATION_LOOKUP }),
  );
  assert.deepEqual([...lookup.resources.keys()].sort(), [
    'runtime.postgres.cluster',
    'runtime.secrets.vault',
  ]);
  assert.equal(calls.length, 2);

  const freeze = await resolveToolResources(
    options(assembly, provider, { operationId: OPERATION_FREEZE }),
  );
  assert.deepEqual([...freeze.resources.keys()], ['runtime.postgres.cluster']);

  const componentScope = await resolveToolResources(options(assembly, provider));
  assert.deepEqual([...componentScope.resources.keys()], ['runtime.postgres.cluster']);
});

test('T005B provider calls happen in canonical resourceKey order regardless of declaration order', async () => {
  const assembly = await sealedAssembly([
    requirement({ resourceKey: 'runtime.zeta' }),
    requirement({ resourceKey: 'runtime.alpha' }),
    requirement({ resourceKey: 'runtime.mid' }),
  ]);
  const { provider, calls } = providerStub(() => ({ status: 'resolved', handle: 'h' }));

  await resolveToolResources(options(assembly, provider));

  assert.deepEqual(
    calls.map((call) => call.resourceKey),
    ['runtime.alpha', 'runtime.mid', 'runtime.zeta'],
  );
});

test('T005B result map exposes entries in canonical insertion order', async () => {
  const assembly = await sealedAssembly([
    requirement({ resourceKey: 'runtime.zeta' }),
    requirement({ resourceKey: 'runtime.alpha' }),
  ]);
  const { provider } = providerStub(() => ({ status: 'resolved', handle: 'h' }));

  const result = await resolveToolResources(options(assembly, provider));

  assert.deepEqual([...result.resources.keys()], ['runtime.alpha', 'runtime.zeta']);
});

// ---------------------------------------------------------------------------
// Redaction discipline
// ---------------------------------------------------------------------------

test('T005B redaction: an opaque secret-bearing handle never enters any failure diagnostic', async () => {
  const secretHandle = 'live-token-hunter2-primary';
  const assembly = await sealedAssembly([
    requirement({ resourceKey: 'runtime.pg.ok' }),
    requirement({ resourceKey: 'runtime.pg.gone' }),
  ]);
  const { provider } = providerStub((request) =>
    request.resourceKey === 'runtime.pg.ok'
      ? { status: 'resolved', handle: secretHandle }
      : { status: 'absent' },
  );

  const error = await expectResolutionError(
    resolveToolResources(options(assembly, provider)),
    'MISSING_REQUIRED_RESOURCE',
  );

  assert.ok(!error.message.includes(secretHandle), 'handle value leaked into diagnostics');
  assert.ok(!JSON.stringify(Object.getOwnPropertyNames(error)).includes(secretHandle));
});

test('T005B redaction: a provider-thrown error message (possibly secret-bearing) is never propagated', async () => {
  const assembly = await sealedAssembly([requirement()]);
  const provider: ResourceProvider = {
    async resolve(): Promise<ResourceProviderResponse> {
      throw new Error('connection refused: password=hunter2-db-secret');
    },
  };

  const error = await expectResolutionError(
    resolveToolResources(options(assembly, provider)),
    'RESOURCE_PROVIDER_FAILURE',
  );

  assert.ok(!error.message.includes('hunter2'), 'provider free text leaked into diagnostics');
  assert.ok(!error.message.includes('connection refused'));
  assert.ok(error.message.includes('runtime.postgres.cluster'), 'only exact identity participates');
});

test('T005B redaction: a smuggled secret-bearing provider-response field fails closed without leaking its value', async () => {
  const assembly = await sealedAssembly([requirement()]);
  const { provider } = providerStub(
    () =>
      ({
        status: 'resolved',
        handle: 'h',
        apiKey: 'hunter2-provider-secret',
      }) as unknown as ResourceProviderResponse,
  );

  const error = await expectResolutionError(
    resolveToolResources(options(assembly, provider)),
    'INVALID_RESOURCE_PROVIDER_RESPONSE',
  );

  assert.ok(!error.message.includes('hunter2'), 'secret value leaked into diagnostics');
  assert.ok(
    !error.message.includes('apiKey'),
    'the offending key name itself is provider-controlled and is never echoed verbatim (#837 P1_01)',
  );
  assert.ok(error.message.includes('<redacted:'), 'bounded deterministic key classification participates');
  assert.ok(error.message.includes('unexpected field'), 'fixed diagnostic context preserved');
});

test('T005B redaction: incompatible-response supportedContracts never enter the INCOMPATIBLE_RESOURCE message', async () => {
  const assembly = await sealedAssembly([requirement({ contract: POSTGRES_CONTRACT })]);
  const { provider } = providerStub(() => ({
    status: 'incompatible',
    supportedContracts: [{ contractId: 'runtime.mysql.contract', version: '3.0.0' }],
  }));

  const error = await expectResolutionError(
    resolveToolResources(options(assembly, provider)),
    'INCOMPATIBLE_RESOURCE',
  );

  assert.ok(!error.message.includes('runtime.mysql.contract'));
  assert.ok(error.message.includes('runtime.postgres.cluster'));
});

// ---------------------------------------------------------------------------
// Torn-snapshot discipline (async mutation)
// ---------------------------------------------------------------------------

test('T005B torn-snapshot: caller mutating its own options and mutable assembly record mid-resolution cannot change the result', async () => {
  const sealed = await sealedAssembly([requirement({ required: true })]);
  const { forged, mutableRecord } = forgeMutableAssembly(sealed);
  const resolutionOptions = options(forged, resolvingProvider({ 'runtime.postgres.cluster': 'pg-handle' }));

  let mutated = false;
  const gate: ResourceProvider = {
    async resolve(): Promise<ResourceProviderResponse> {
      if (!mutated) {
        mutated = true;
        // Hostile caller: rewrite the requirement material and the options mid-flight.
        (mutableRecord as unknown as { resourceRequirements: { requirements: unknown[] }[] }).resourceRequirements[0]!.requirements = [
          { resourceKey: 'runtime.sneaked.in', required: true },
        ];
        (resolutionOptions as { componentId: string }).componentId = 'hijacked.tool';
      }
      return { status: 'resolved', handle: 'pg-handle' };
    },
  };
  (resolutionOptions as { provider: ResourceProvider }).provider = gate;

  const result = await resolveToolResources(resolutionOptions);

  assert.deepEqual([...result.resources.keys()], ['runtime.postgres.cluster']);
  assert.equal((result.resources.get('runtime.postgres.cluster') as { status: string }).status, 'resolved');
  assert.equal(result.componentId, OWNER_ID, 'caller identity mutation ignored');
});

test('T005B torn-snapshot: a provider mutating the frozen request object it received has no effect (silent no-op or terminal typed failure, never corrupted authority)', async () => {
  const assembly = await sealedAssembly([
    requirement({ resourceKey: 'runtime.alpha' }),
    requirement({ resourceKey: 'runtime.beta' }),
  ]);

  // Case 1: the provider swallows the strict-mode TypeError its mutation
  // attempt throws; the module-owned request stays intact and the failure is
  // still attributed to the exact Assembly identity.
  const swallowingProvider: ResourceProvider = {
    async resolve(request: ResourceResolutionRequest): Promise<ResourceProviderResponse> {
      try {
        (request as { resourceKey: string }).resourceKey = 'runtime.corrupted';
        (request as { required: boolean }).required = false;
      } catch {
        // strict-mode frozen-object write — swallowed by the hostile provider
      }
      assert.equal(request.resourceKey, 'runtime.alpha', 'request snapshot was corrupted');
      assert.equal(request.required, true, 'request snapshot was corrupted');
      return { status: 'absent' };
    },
  };
  const error = await expectResolutionError(
    resolveToolResources(options(assembly, swallowingProvider)),
    'MISSING_REQUIRED_RESOURCE',
  );
  assert.ok(error.message.includes('runtime.alpha'));
  assert.ok(!error.message.includes('runtime.corrupted'));

  // Case 2: the provider lets the mutation attempt throw; the failure is
  // terminal and typed — never a corrupted continuation.
  const throwingMutator: ResourceProvider = {
    async resolve(request: ResourceResolutionRequest): Promise<ResourceProviderResponse> {
      (request as { resourceKey: string }).resourceKey = 'runtime.corrupted';
      return { status: 'resolved', handle: 'h' };
    },
  };
  const providerError = await expectResolutionError(
    resolveToolResources(options(assembly, throwingMutator)),
    'RESOURCE_PROVIDER_FAILURE',
  );
  assert.ok(providerError.message.includes('runtime.alpha'));
  assert.ok(!providerError.message.includes('runtime.corrupted'));
});

test('T005B torn-snapshot: a provider mutating a previously returned response object during a later call cannot rewrite earlier entries', async () => {
  const assembly = await sealedAssembly([
    requirement({ resourceKey: 'runtime.alpha' }),
    requirement({ resourceKey: 'runtime.beta' }),
  ]);
  const retained: ResourceProviderResponse[] = [];
  const provider: ResourceProvider = {
    async resolve(request: ResourceResolutionRequest): Promise<ResourceProviderResponse> {
      if (request.resourceKey === 'runtime.alpha') {
        const response: ResourceProviderResponse = { status: 'resolved', handle: 'alpha-handle' };
        retained.push(response);
        return response;
      }
      // During the SECOND call, corrupt the response returned for the FIRST.
      const first = retained[0] as { status?: string; handle?: unknown };
      first.status = 'absent';
      first.handle = 'corrupted-handle';
      return { status: 'resolved', handle: 'beta-handle' };
    },
  };

  const result = await resolveToolResources(options(assembly, provider));

  assert.deepEqual(result.resources.get('runtime.alpha'), {
    resourceKey: 'runtime.alpha',
    status: 'resolved',
    handle: 'alpha-handle',
  });
  assert.deepEqual(result.resources.get('runtime.beta'), {
    resourceKey: 'runtime.beta',
    status: 'resolved',
    handle: 'beta-handle',
  });
});

// ---------------------------------------------------------------------------
// Hostile descriptor input
// ---------------------------------------------------------------------------

test('T005B hostile input: unknown option field fails closed', async () => {
  const assembly = await sealedAssembly([requirement()]);
  const hostile = {
    ...options(assembly, resolvingProvider({})),
    fallback: 'ambient-default',
  } as unknown as ResolveToolResourcesOptions;

  const error = await expectResolutionError(resolveToolResources(hostile), 'INVALID_RESOLUTION_INPUT');

  assert.ok(error.message.includes('fallback'));
});

test('T005B hostile input: floating/embedded-selector componentId and operationId fail closed', async () => {
  const assembly = await sealedAssembly([requirement()]);
  const cases: Array<[Record<string, string>, string]> = [
    [{ componentId: 'latest' }, 'componentId'],
    [{ componentId: 'credit.rating.tool@2.0.0' }, 'componentId'],
    [{ componentId: '*' }, 'componentId'],
    [{ operationId: 'default' }, 'operationId'],
    [{ operationId: 'current' }, 'operationId'],
  ];
  for (const [override, which] of cases) {
    const error = await expectResolutionError(
      resolveToolResources(options(assembly, resolvingProvider({}), override)),
      'INVALID_RESOLUTION_INPUT',
    );
    assert.ok(error.message.includes(which), `${which} not identified in: ${error.message}`);
  }
});

test('T005B hostile input: malformed assembly (null, missing record, missing resourceRequirements) fails closed', async () => {
  const provider = resolvingProvider({});

  for (const hostile of [
    null,
    {},
    { record: null },
    { record: {} },
    { record: { resourceRequirements: undefined } },
  ]) {
    await expectResolutionError(
      resolveToolResources(
        options(hostile as unknown as SealedRuntimeAssembly, provider),
      ),
      'INVALID_RESOLUTION_INPUT',
    );
  }
  // Also: an ARRAY is not an assembly.
  await expectResolutionError(
    resolveToolResources(options([] as unknown as SealedRuntimeAssembly, provider)),
    'INVALID_RESOLUTION_INPUT',
  );
});

test('T005B hostile input: descriptor-unsafe forged requirement material fails closed without executing getters', async () => {
  const sealed = await sealedAssembly([requirement()]);
  const { forged, mutableRecord } = forgeMutableAssembly(sealed);
  const ownerMaterial = (mutableRecord as unknown as {
    resourceRequirements: { requirements: unknown[] }[];
  }).resourceRequirements[0]!;

  // Accessor-backed requirement: the getter must NEVER execute (descriptor-safety).
  let getterRan = false;
  const accessorRequirement = Object.defineProperty(
    { resourceKey: 'runtime.postgres.cluster', required: true },
    'secret',
    {
      enumerable: true,
      get(): unknown {
        getterRan = true;
        return 'hunter2';
      },
    },
  );
  ownerMaterial.requirements = [accessorRequirement];

  const error = await expectResolutionError(
    resolveToolResources(options(forged, resolvingProvider({}))),
    'INVALID_RESOLUTION_INPUT',
  );

  assert.equal(getterRan, false, 'hidden getter executed during validation');
  assert.ok(!error.message.includes('hunter2'));
});

type MutableMaterials = Array<{ componentId: string; requirements: unknown[] }>;

test('T005B hostile input: forged requirement material with unknown field / floating key / duplicate owner / duplicate key / non-boolean required / floating contract version fails closed', async () => {
  const sealed = await sealedAssembly([requirement()]);
  const freshMaterials = (): MutableMaterials =>
    JSON.parse(JSON.stringify(sealed.record.resourceRequirements)) as MutableMaterials;

  const caseList: Array<{ mutate: (materials: MutableMaterials) => void; marker: string }> = [
    {
      mutate: (materials) => {
        materials[0]!.requirements = [
          { resourceKey: 'runtime.postgres.cluster', required: true, endpoint: 'https://evil' },
        ];
      },
      marker: 'endpoint',
    },
    {
      mutate: (materials) => {
        materials[0]!.requirements = [{ resourceKey: 'default', required: true }];
      },
      marker: 'default',
    },
    {
      mutate: (materials) => {
        materials.push({
          componentId: OWNER_ID,
          requirements: [{ resourceKey: 'runtime.other', required: true }],
        });
      },
      marker: 'more than once',
    },
    {
      mutate: (materials) => {
        materials[0]!.requirements = [
          { resourceKey: 'runtime.dup', required: true },
          { resourceKey: 'runtime.dup', required: false },
        ];
      },
      marker: 'more than once',
    },
    {
      mutate: (materials) => {
        materials[0]!.requirements = [{ resourceKey: 'runtime.postgres.cluster', required: 'yes' }];
      },
      marker: 'boolean',
    },
    {
      mutate: (materials) => {
        materials[0]!.requirements = [
          { resourceKey: 'runtime.postgres.cluster', required: true, contract: { contractId: 'c', version: '1.x' } },
        ];
      },
      marker: 'exact version',
    },
  ];

  for (const { mutate, marker } of caseList) {
    const materials = freshMaterials();
    mutate(materials);
    const record = {
      ...(JSON.parse(JSON.stringify(sealed.record)) as RuntimeAssemblyRecord),
      resourceRequirements: materials,
    };
    const forged = {
      record,
      assemblyDigest: sealed.assemblyDigest,
      bindings: sealed.bindings,
    } as unknown as SealedRuntimeAssembly;

    const error = await expectResolutionError(
      resolveToolResources(options(forged, resolvingProvider({}))),
      'INVALID_RESOLUTION_INPUT',
    );
    assert.ok(error.message.includes(marker), `expected "${marker}" in: ${error.message}`);
  }
});

test('T005B hostile input: symbol-keyed forged assembly record fails closed', async () => {
  const sealed = await sealedAssembly([requirement()]);
  const { forged } = forgeMutableAssembly(sealed);
  const recordWithSymbol = Object.defineProperty(
    { ...(forged as unknown as { record: object }).record },
    Symbol('hidden'),
    { enumerable: true, value: 'smuggled' },
  );

  await expectResolutionError(
    resolveToolResources(
      options(
        { record: recordWithSymbol } as unknown as SealedRuntimeAssembly,
        resolvingProvider({}),
      ),
    ),
    'INVALID_RESOLUTION_INPUT',
  );
});

test('T005B hostile input: malformed provider port fails closed', async () => {
  const assembly = await sealedAssembly([requirement()]);
  for (const hostile of [null, undefined, 'provider', 42, {}, { resolve: 'not-a-function' }]) {
    await expectResolutionError(
      resolveToolResources(options(assembly, hostile as unknown as ResourceProvider)),
      'INVALID_RESOLUTION_INPUT',
    );
  }
});

test('T005B hostile input: provider returning a bare handle / unknown status / handle-less resolved / floating response contract / symbol-keyed response fails closed', async () => {
  const assembly = await sealedAssembly([requirement({ contract: POSTGRES_CONTRACT })]);
  const cases: Array<[() => unknown, string]> = [
    [() => 'bare-handle-string', 'record'],
    [() => ({ status: 'latest' }), 'status'],
    [() => ({ status: 'resolved' }), 'handle'],
    [
      () => ({
        status: 'resolved',
        handle: 'h',
        contract: { contractId: 'runtime.postgres.contract', version: '2.x' },
      }),
      'exact version',
    ],
    [
      () => ({ status: 'absent', handle: 'smuggled' }),
      'unexpected field',
    ],
  ];
  for (const [response, marker] of cases) {
    const provider: ResourceProvider = {
      async resolve(): Promise<ResourceProviderResponse> {
        return response() as ResourceProviderResponse;
      },
    };
    const error = await expectResolutionError(
      resolveToolResources(options(assembly, provider)),
      'INVALID_RESOURCE_PROVIDER_RESPONSE',
    );
    assert.ok(error.message.includes(marker), `expected "${marker}" in: ${error.message}`);
  }

  const symbolKeyed: ResourceProvider = {
    async resolve(): Promise<ResourceProviderResponse> {
      return Object.defineProperty({ status: 'resolved', handle: 'h' }, Symbol('hidden'), {
        enumerable: true,
        value: 'x',
      }) as unknown as ResourceProviderResponse;
    },
  };
  await expectResolutionError(
    resolveToolResources(options(assembly, symbolKeyed)),
    'INVALID_RESOURCE_PROVIDER_RESPONSE',
  );
});

// ---------------------------------------------------------------------------
// Provider replacement with zero core source edits
// ---------------------------------------------------------------------------

test('T005B provider replacement: swapping the injected provider changes resolved handles with zero core source edits', async () => {
  const moduleUrl = new URL('../../src/contracts/resource-resolution.ts', import.meta.url);
  const sourceBefore = createHash('sha256').update(readFileSync(moduleUrl)).digest('hex');

  const assembly = await sealedAssembly([requirement()]);
  const providerA = resolvingProvider({ 'runtime.postgres.cluster': 'handle-from-provider-A' });
  const providerB = resolvingProvider({ 'runtime.postgres.cluster': 'handle-from-provider-B' });

  const fromA = await resolveToolResources(options(assembly, providerA));
  const fromB = await resolveToolResources(options(assembly, providerB));
  const fromA2 = await resolveToolResources(options(assembly, providerA));

  assert.equal((fromA.resources.get('runtime.postgres.cluster') as { handle: string }).handle, 'handle-from-provider-A');
  assert.equal((fromB.resources.get('runtime.postgres.cluster') as { handle: string }).handle, 'handle-from-provider-B');
  assert.equal((fromA2.resources.get('runtime.postgres.cluster') as { handle: string }).handle, 'handle-from-provider-A');

  const sourceAfter = createHash('sha256').update(readFileSync(moduleUrl)).digest('hex');
  assert.equal(sourceBefore, sourceAfter, 'core source changed as a side effect of provider replacement');
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

test('T005B determinism: identical inputs resolve to identical entry structure across runs', async () => {
  const assembly = await sealedAssembly([
    requirement({ resourceKey: 'runtime.alpha' }),
    requirement({ resourceKey: 'runtime.beta', required: false }),
  ]);
  const handles = { 'runtime.alpha': 'alpha-handle', 'runtime.beta': 'beta-handle' };

  const first = await resolveToolResources(options(assembly, resolvingProvider(handles)));
  const second = await resolveToolResources(options(assembly, resolvingProvider(handles)));

  assert.deepEqual(
    [...first.resources.entries()].map(([key, entry]) => [key, entry.status, entry.status === 'resolved' ? entry.handle : undefined]),
    [...second.resources.entries()].map(([key, entry]) => [key, entry.status, entry.status === 'resolved' ? entry.handle : undefined]),
  );
});

// ---------------------------------------------------------------------------
// Failure ordering: required failure precedes any invocation authority
// ---------------------------------------------------------------------------

test('T005B all-or-nothing: one required failure means no resolution result is produced at all', async () => {
  const assembly = await sealedAssembly([
    requirement({ resourceKey: 'runtime.ok' }),
    requirement({ resourceKey: 'runtime.gone' }),
    requirement({ resourceKey: 'runtime.never-asked', required: false }),
  ]);
  let askedAfterFailure = 0;
  const provider: ResourceProvider = {
    async resolve(request: ResourceResolutionRequest): Promise<ResourceProviderResponse> {
      if (request.resourceKey === 'runtime.gone') {
        return { status: 'absent' };
      }
      askedAfterFailure += 1;
      return { status: 'resolved', handle: 'h' };
    },
  };

  // canonical order: runtime.gone is asked second; the third optional
  // requirement must never be requested after the terminal required failure.
  await expectResolutionError(resolveToolResources(options(assembly, provider)), 'MISSING_REQUIRED_RESOURCE');
  assert.ok(askedAfterFailure <= 1, 'resolution continued after a terminal required failure');
});

// ---------------------------------------------------------------------------
// Provider-controlled key/symbol diagnostic redaction (issue #643)
// ---------------------------------------------------------------------------
//
// A provider controls the own-key names of the objects it returns. Those names
// may BE the secret material (`sk-…` keys), prototype-pollution material
// (`__proto__` / `constructor`), control-character payloads, or symbol
// descriptions — none of it may reach an INVALID_RESOURCE_PROVIDER_RESPONSE
// diagnostic. Only bounded, non-secret, deterministic classifications may
// participate; the typed code and fixed diagnostic context stay stable.

/** Attach one own enumerable data property without invoking magic setters. */
function withOwnKey(target: Record<string, unknown>, key: string | symbol, value: unknown): unknown {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
  return target;
}

const VALID_PIN = {
  providerId: 'postgres.provider',
  resourceKey: 'runtime.postgres.cluster',
  revisionDigest: 'sha256:pg-revision-0001',
};

test('T005B #643 redaction: a provider-controlled __proto__ own key is classified, never echoed', async () => {
  const assembly = await sealedAssembly([requirement()]);
  const { provider } = providerStub(
    () =>
      withOwnKey({ status: 'resolved', handle: 'h' }, '__proto__', 'polluting-material') as ResourceProviderResponse,
  );

  const error = await expectResolutionError(
    resolveToolResources(options(assembly, provider)),
    'INVALID_RESOURCE_PROVIDER_RESPONSE',
  );

  assert.ok(!error.message.includes('__proto__'), `provider-controlled key leaked: ${error.message}`);
  assert.ok(error.message.includes('unexpected field'), 'fixed diagnostic context preserved');
  assert.ok(
    error.message.includes('<redacted:prototype-name'),
    'bounded deterministic classification participates',
  );
});

test('T005B #643 redaction: a provider-controlled constructor-name own key is classified, never echoed', async () => {
  const assembly = await sealedAssembly([requirement()]);
  const { provider } = providerStub(
    () => ({ status: 'resolved', handle: 'h', constructor: 'confused-deputy' }) as unknown as ResourceProviderResponse,
  );

  const error = await expectResolutionError(
    resolveToolResources(options(assembly, provider)),
    'INVALID_RESOURCE_PROVIDER_RESPONSE',
  );

  assert.ok(!error.message.includes('"constructor"'), `provider-controlled key leaked: ${error.message}`);
  assert.ok(error.message.includes('unexpected field'), 'fixed diagnostic context preserved');
  assert.ok(error.message.includes('<redacted:prototype-name'), 'bounded deterministic classification');
});

test('T005B #643 redaction: a control-character own key is classified, never echoed raw', async () => {
  const assembly = await sealedAssembly([requirement()]);
  const hostileKey = "evil\u001fkey";
  const { provider } = providerStub(
    () =>
      withOwnKey({ status: 'resolved', handle: 'h' }, hostileKey, 'x') as ResourceProviderResponse,
  );

  const error = await expectResolutionError(
    resolveToolResources(options(assembly, provider)),
    'INVALID_RESOURCE_PROVIDER_RESPONSE',
  );

  assert.ok(!error.message.includes("\u001f"), "control character reached the diagnostic");
  assert.ok(!error.message.includes('evil'), `provider-controlled key leaked: ${error.message}`);
  assert.ok(error.message.includes('<redacted:'), 'bounded deterministic classification participates');
});

test('T005B #643 redaction: secret-shaped own keys (sk-/Bearer/JWT forms) never enter diagnostics', async () => {
  const assembly = await sealedAssembly([requirement()]);
  const secretKeys = [
    'sk-live-4eC39HqLyjWDarjtT1zdp7dc',
    'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJVadQssw5c',
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
  ];

  for (const secretKey of secretKeys) {
    const { provider } = providerStub(
      () => withOwnKey({ status: 'resolved', handle: 'h' }, secretKey, 'x') as ResourceProviderResponse,
    );

    const error = await expectResolutionError(
      resolveToolResources(options(assembly, provider)),
      'INVALID_RESOURCE_PROVIDER_RESPONSE',
    );

    assert.ok(!error.message.includes(secretKey), `secret-shaped key leaked: ${error.message}`);
    assert.ok(!error.message.includes('eyJ'), 'JWT material leaked into diagnostics');
    assert.ok(!error.message.includes('sk-live'), 'API-key material leaked into diagnostics');
    assert.ok(error.message.includes('unexpected field'), 'fixed diagnostic context preserved');
    assert.ok(error.message.includes('<redacted:secret-shaped'), 'bounded deterministic classification');
  }
});

test('T005B #643 redaction: a symbol-keyed provider response never leaks its description', async () => {
  const assembly = await sealedAssembly([requirement()]);
  const { provider } = providerStub(
    () =>
      withOwnKey({ status: 'resolved', handle: 'h' }, Symbol('sk-live-4eC39HqLyjWDarjt'), 'x') as ResourceProviderResponse,
  );

  const error = await expectResolutionError(
    resolveToolResources(options(assembly, provider)),
    'INVALID_RESOURCE_PROVIDER_RESPONSE',
  );

  assert.ok(!error.message.includes('sk-live'), `symbol description leaked: ${error.message}`);
  assert.ok(!error.message.includes('Symbol(sk-live'), 'symbol description leaked');
  assert.ok(
    error.message.includes('symbol-keyed properties'),
    'fixed diagnostic context (violation kind) preserved',
  );
});

test('T005B #643 redaction: secret-shaped or symbol-keyed currentness-pin material is classified, never echoed', async () => {
  const assembly = await sealedAssembly([requirement()]);

  // Secret-shaped KEY name on an otherwise valid pin.
  const withSecretKey = providerStub(
    () =>
      ({
        status: 'resolved',
        handle: 'h',
        currentnessPin: withOwnKey({ ...VALID_PIN }, 'sk-test-abcdef0123456789', 'x'),
      }) as unknown as ResourceProviderResponse,
  );
  const secretError = await expectResolutionError(
    resolveToolResources(options(assembly, withSecretKey.provider)),
    'INVALID_RESOURCE_PROVIDER_RESPONSE',
  );
  assert.ok(!secretError.message.includes('sk-test-abcdef0123456789'), `pin key leaked: ${secretError.message}`);
  assert.ok(secretError.message.includes('unexpected field'), 'fixed diagnostic context preserved');
  assert.ok(secretError.message.includes('<redacted:secret-shaped'), 'bounded deterministic classification');

  // Symbol-keyed hidden material on an otherwise valid pin.
  const withSymbol = providerStub(
    () =>
      ({
        status: 'resolved',
        handle: 'h',
        currentnessPin: withOwnKey({ ...VALID_PIN }, Symbol('bearer-token-material'), 'x'),
      }) as unknown as ResourceProviderResponse,
  );
  const symbolError = await expectResolutionError(
    resolveToolResources(options(assembly, withSymbol.provider)),
    'INVALID_RESOURCE_PROVIDER_RESPONSE',
  );
  assert.ok(!symbolError.message.includes('bearer-token-material'), `symbol description leaked: ${symbolError.message}`);
  assert.ok(symbolError.message.includes('symbol-keyed properties'), 'fixed diagnostic context preserved');
});

test('T005B #643 redaction: classification is deterministic — identical hostile responses produce byte-identical diagnostics', async () => {
  const assembly = await sealedAssembly([requirement()]);
  const makeProvider = (): ResourceProvider => ({
    async resolve(): Promise<ResourceProviderResponse> {
      return withOwnKey(
        { status: 'resolved', handle: 'h' },
        'sk-live-4eC39HqLyjWDarjtT1zdp7dc',
        'x',
      ) as ResourceProviderResponse;
    },
  });

  const first = await expectResolutionError(
    resolveToolResources(options(assembly, makeProvider())),
    'INVALID_RESOURCE_PROVIDER_RESPONSE',
  );
  const second = await expectResolutionError(
    resolveToolResources(options(assembly, makeProvider())),
    'INVALID_RESOURCE_PROVIDER_RESPONSE',
  );

  assert.equal(first.code, 'INVALID_RESOURCE_PROVIDER_RESPONSE', 'typed code is stable');
  assert.equal(first.message, second.message, 'same hostile input => identical bounded diagnostic');
  assert.ok(first.message.length < 400, 'diagnostic stays bounded');
});

// ---------------------------------------------------------------------------
// #837 bounded repair R1 — the classification-only closure: NO provider-
// controlled key material is echoed verbatim (not even short plain
// identifiers), and the hard length cap runs BEFORE any content scan.
// ---------------------------------------------------------------------------

test('T005B #837 P1_01: short plain provider identifier keys are classified, never echoed verbatim', async () => {
  const assembly = await sealedAssembly([requirement()]);
  const plainIdentifierKeys = ['accessToken', 'password', 'sessionToken'];

  for (const plainKey of plainIdentifierKeys) {
    const { provider } = providerStub(
      () =>
        withOwnKey({ status: 'resolved', handle: 'h' }, plainKey, 'material') as ResourceProviderResponse,
    );

    const error = await expectResolutionError(
      resolveToolResources(options(assembly, provider)),
      'INVALID_RESOURCE_PROVIDER_RESPONSE',
    );

    assert.ok(!error.message.includes(plainKey), `provider-controlled key leaked: ${error.message}`);
    assert.ok(error.message.includes('unexpected field'), 'fixed diagnostic context preserved');
    assert.ok(error.message.includes('<redacted:'), 'bounded deterministic classification participates');
  }
});

test('T005B #837 P1_01: identifier-shaped token keys outside the secret recognizer are classified, never echoed verbatim', async () => {
  const assembly = await sealedAssembly([requirement()]);
  // Identifier-SHAPED credential material the previous recognizer did not
  // cover (no `sk-`/`Bearer`/JWT marker): the closed classification-only
  // path must still never echo it.
  const tokenKeys = ['ghp_16C7e42F292c6912E7710c838347Ae178B4a', 'AKIAIOSFODNN7EXAMPLE'];

  for (const tokenKey of tokenKeys) {
    const { provider } = providerStub(
      () =>
        withOwnKey({ status: 'resolved', handle: 'h' }, tokenKey, 'material') as ResourceProviderResponse,
    );

    const error = await expectResolutionError(
      resolveToolResources(options(assembly, provider)),
      'INVALID_RESOURCE_PROVIDER_RESPONSE',
    );

    assert.ok(!error.message.includes(tokenKey), `provider-controlled key leaked: ${error.message}`);
    assert.ok(error.message.includes('unexpected field'), 'fixed diagnostic context preserved');
    assert.ok(error.message.includes('<redacted:'), 'bounded deterministic classification participates');
  }
});

test('T005B #837 P1_02: an overlong hostile key is length-gated BEFORE any content scan (bounded deterministic overlong classification)', async () => {
  const assembly = await sealedAssembly([requirement()]);
  // The hostile key embeds control-character AND secret-shaped material well
  // past any sane length boundary: if any content scan ran before the hard
  // length cap, the classification would name that material instead of the
  // overlong bound.
  const overlongHostileKey = `${'a'.repeat(4096)}\u0000sk-live-4eC39HqLyjWDarjtT1zdp7dc`;
  const makeProvider = (): ResourceProvider => ({
    async resolve(): Promise<ResourceProviderResponse> {
      return withOwnKey(
        { status: 'resolved', handle: 'h' },
        overlongHostileKey,
        'x',
      ) as ResourceProviderResponse;
    },
  });

  const first = await expectResolutionError(
    resolveToolResources(options(assembly, makeProvider())),
    'INVALID_RESOURCE_PROVIDER_RESPONSE',
  );
  const second = await expectResolutionError(
    resolveToolResources(options(assembly, makeProvider())),
    'INVALID_RESOURCE_PROVIDER_RESPONSE',
  );

  assert.ok(first.message.includes('<redacted:overlong'), 'the hard pre-scan length gate classifies overlong keys from their length alone');
  assert.ok(
    !first.message.includes('<redacted:control-character'),
    'no content-sensitive scan may run before the length gate',
  );
  assert.ok(
    !first.message.includes('<redacted:secret-shaped'),
    'no content-sensitive scan may run before the length gate',
  );
  assert.ok(!first.message.includes('sk-live'), 'overlong key content leaked');
  assert.ok(!first.message.includes('\u0000'), 'control character leaked');
  assert.ok(!first.message.includes('aaaa'), 'overlong key fragment leaked');
  assert.equal(first.code, 'INVALID_RESOURCE_PROVIDER_RESPONSE', 'typed code is stable');
  assert.equal(first.message, second.message, 'same hostile input => identical bounded diagnostic');
  assert.ok(first.message.length < 400, 'diagnostic stays bounded regardless of key length');
});

// ---------------------------------------------------------------------------
// #794 Proxy-trap containment — hostile provider-response objects fail closed
// ---------------------------------------------------------------------------
//
// A provider.resolve() throw/rejection is typed/contained
// (RESOURCE_PROVIDER_FAILURE), but a hostile Proxy RETURNED as the response
// can throw during `snapshotProviderResponse` / descriptor inspection, which
// runs after that catch (#772 adjacent-probes evidence, #775 P1-1). Every
// escape from the response-inspection path must be a deterministic typed
// ResourceResolutionError whose fixed message never echoes the provider-
// controlled trap/error material (its message, name, or any property).

/** Provider-controlled hostile marker material that must never reach a diagnostic. */
const TRAP_MARKER = 'hunter2-sk-live-51H8xQ2eZvKYlo2C';

/** One hostile response Proxy whose named trap throws provider-controlled material. */
function trapThrowingProxy(trap: string): unknown {
  return new Proxy(
    { status: 'resolved', handle: 'h' },
    {
      [trap](): never {
        throw new Error(`${trap} trap threw ${TRAP_MARKER}`);
      },
    },
  );
}

/** One hostile ARRAY Proxy whose get('length') trap throws provider-controlled material. */
function trapThrowingArrayProxy(): unknown {
  return new Proxy([VALID_PIN], {
    get(_target, property): never {
      throw new Error(`get trap (${String(property)}) threw ${TRAP_MARKER}`);
    },
  });
}

/** Assert one provider response object is contained: typed, fixed, non-echoing. */
async function expectTrapContained(
  response: unknown,
): Promise<ResourceResolutionError> {
  const assembly = await sealedAssembly([requirement()]);
  const { provider } = providerStub(() => response as ResourceProviderResponse);
  const error = await expectResolutionError(
    resolveToolResources(options(assembly, provider)),
    'INVALID_RESOURCE_PROVIDER_RESPONSE',
  );
  assert.ok(
    !error.message.includes(TRAP_MARKER),
    `provider-controlled trap/error material leaked: ${error.message}`,
  );
  assert.ok(
    error.message.includes('runtime.postgres.cluster'),
    'only the exact sealed-Assembly identity participates',
  );
  return error;
}

test('T005B #794: a hostile getOwnPropertyDescriptor trap during response snapshot fails closed typed', async () => {
  await expectTrapContained(trapThrowingProxy('getOwnPropertyDescriptor'));
});

test('T005B #794: a hostile ownKeys trap during response snapshot fails closed typed', async () => {
  await expectTrapContained(trapThrowingProxy('ownKeys'));
});

test('T005B #794: a hostile get trap during array snapshot (supportedContracts length read) fails closed typed', async () => {
  // The response root is consumed through its plain descriptor snapshot, so a
  // root-level get trap is only ever dispatched by the await's thenable
  // unwrapping. A get trap DOES dispatch inside the inspection path when a
  // nested array is snapshotted (`safeArraySnapshot` reads `value.length`).
  await expectTrapContained({
    status: 'incompatible',
    supportedContracts: trapThrowingArrayProxy(),
  });
});

test('T005B #794: an all-throwing get trap (including "then") is contained typed and non-leaking', async () => {
  // A root Proxy whose get trap throws for everything — including the `then`
  // probe the await performs — is contained by the provider-call boundary as a
  // typed RESOURCE_PROVIDER_FAILURE with a fixed message. This guards that
  // containment: the provider-controlled trap text must never surface.
  const assembly = await sealedAssembly([requirement()]);
  const { provider } = providerStub(
    () => trapThrowingProxy('get') as ResourceProviderResponse,
  );
  const error = await expectResolutionError(
    resolveToolResources(options(assembly, provider)),
    'RESOURCE_PROVIDER_FAILURE',
  );
  assert.ok(
    !error.message.includes(TRAP_MARKER),
    `provider-controlled trap material leaked: ${error.message}`,
  );
});

test('T005B #794 negative control: a has trap cannot influence inspection (the response is consumed through its plain descriptor snapshot)', async () => {
  const assembly = await sealedAssembly([requirement()]);
  const { provider } = providerStub(
    () => trapThrowingProxy('has') as ResourceProviderResponse,
  );

  const result = await resolveToolResources(options(assembly, provider));

  assert.deepEqual(result.resources.get('runtime.postgres.cluster'), {
    resourceKey: 'runtime.postgres.cluster',
    status: 'resolved',
    handle: 'h',
  });
});

test('T005B #794: an engine proxy-invariant TypeError during response inspection fails closed typed', async () => {
  // Duplicate ownKeys entries make the ENGINE throw a TypeError before any
  // trap throws — still an untyped escape from the inspection path unless it
  // is contained like every other provider-controlled failure.
  const invariantHostile = new Proxy(
    { status: 'resolved', handle: 'h' },
    { ownKeys: () => ['status', 'status', 'handle'] },
  );
  const error = await expectTrapContained(invariantHostile);
  assert.ok(error.message.length < 400, 'contained diagnostic stays bounded');
});

test('T005B #794: a hostile Proxy nested in currentnessPin/supportedContracts fails closed typed', async () => {
  // T005C pin seam: a hostile Proxy riding as the pin material.
  await expectTrapContained({
    status: 'resolved',
    handle: 'h',
    currentnessPin: trapThrowingProxy('getOwnPropertyDescriptor'),
  });
  // supportedContracts diagnostic seam: a hostile Proxy riding as one ref.
  await expectTrapContained({
    status: 'incompatible',
    supportedContracts: [trapThrowingProxy('ownKeys')],
  });
});

test('T005B #794: containment is deterministic and bounded for the same hostile input', async () => {
  const first = await expectTrapContained(trapThrowingProxy('getOwnPropertyDescriptor'));
  const second = await expectTrapContained(trapThrowingProxy('getOwnPropertyDescriptor'));

  assert.equal(first.code, 'INVALID_RESOURCE_PROVIDER_RESPONSE', 'typed code is stable');
  assert.equal(first.message, second.message, 'same hostile input => identical fixed diagnostic');
  assert.ok(first.message.length < 400, 'diagnostic stays bounded');
});

test('T005B #794 negative control: a transparent Proxy wrapping a legitimate response resolves unchanged', async () => {
  const assembly = await sealedAssembly([requirement({ contract: POSTGRES_CONTRACT })]);
  const handle = { connection: 'opaque-host-object' };
  const { provider } = providerStub(() =>
    new Proxy(
      { status: 'resolved', handle, contract: POSTGRES_CONTRACT, currentnessPin: VALID_PIN },
      {},
    ) as unknown as ResourceProviderResponse,
  );

  const result = await resolveToolResources(options(assembly, provider));

  assert.deepEqual(result.resources.get('runtime.postgres.cluster'), {
    resourceKey: 'runtime.postgres.cluster',
    status: 'resolved',
    handle,
    currentnessPin: VALID_PIN,
  });
});

test('T005B #643 regression: legitimate resolution behavior is unchanged (contract match, pin capture, provider replacement semantics)', async () => {
  const assembly = await sealedAssembly([requirement({ contract: POSTGRES_CONTRACT })]);
  const handle = { connection: 'opaque-host-object' };
  const { provider, calls } = providerStub(() => ({
    status: 'resolved',
    handle,
    contract: POSTGRES_CONTRACT,
    currentnessPin: VALID_PIN,
  }));

  const result = await resolveToolResources(options(assembly, provider));

  assert.equal(calls.length, 1);
  assert.deepEqual(result.resources.get('runtime.postgres.cluster'), {
    resourceKey: 'runtime.postgres.cluster',
    status: 'resolved',
    handle,
    currentnessPin: VALID_PIN,
  });
  assert.ok(
    Object.isFrozen(result.resources.get('runtime.postgres.cluster')),
    'resolved entry remains a frozen snapshot',
  );
});
