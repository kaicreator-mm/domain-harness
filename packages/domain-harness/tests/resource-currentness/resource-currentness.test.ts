/**
 * T005C invariant matrix — behaviorally relevant Runtime Resource
 * identity/currentness evidence (issue #656; planning authority #589 PACK-B
 * T005C + #589 currentness rebind; seam authority: accepted T002C
 * activation/execution pin (PR #631) and repaired T002D class authority
 * (#688 / PR #755, merged as version/v0.7 061e443)).
 *
 * Frozen scope under test (#589 T005C):
 *  - stable NON-SECRET resource-instance/currentness evidence only: exact
 *    provider/resource identity + exact revision/currentness digest; secret
 *    values, credentials, live handles, connection objects, functions/module
 *    paths and provider objects are structurally unrepresentable in identity,
 *    evidence and diagnostics;
 *  - the evidence is woven into the ONE existing T002C
 *    `GovernanceExecutionPin` / `bindingDigest` hierarchy — no third resource
 *    registry/currentness/pin plane, no second store;
 *  - a REQUIRED sealed-Assembly resource requirement makes pinned evidence
 *    mandatory at activation (typed fail-closed BEFORE any durable bind);
 *    an OPTIONAL resource stays outside exact occurrence currentness exactly
 *    when the owning declaration's explicit `required: false` posture permits
 *    and no pin is supplied;
 *  - a resource revision replacement invalidates the affected occurrence's
 *    activation/execution currentness and replay, never Definition identity
 *    and never the sealed logical `resourceRequirements`;
 *  - stale/replaced/missing/incompatible evidence fails closed with
 *    deterministic typed failures; no latest/default/first/order fallback;
 *  - torn-snapshot discipline: caller mutation around async resolution or
 *    activation cannot mint hybrid currentness evidence; returned evidence is
 *    frozen, fresh and non-aliased.
 *
 * Inherited #622 currentness regression equivalents covered where applicable:
 * `Runtime.ResourceRequirementsForwarding`, `Runtime.FailedRecordImmutability`,
 * `Runtime.SecretRefPublicSplit`, and byte-exact preservation of unrelated
 * sealed Assembly ledger fields.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import type { ComponentEnvelope } from '../../src/contracts/component.js';
import {
  computeDefinitionGraphDigest,
  type DefinitionGraphEnvelope,
} from '../../src/contracts/definition-graph.js';
import type { Sha256Port } from '../../src/contracts/identity.js';
import type {
  ResourceContractRef,
  ToolResourceRequirement,
} from '../../src/contracts/resource-requirements.js';
import {
  ResourceResolutionError,
  resolveToolResources,
  type ResourceCurrentnessEvidence,
  type ResourceCurrentnessPin,
  type ResourceProvider,
  type ResourceProviderResponse,
  type ResourceResolutionRequest,
  type ResolveToolResourcesOptions,
} from '../../src/contracts/resource-resolution.js';
import {
  sealRuntimeAssembly,
  type KindImplementationBindingInput,
  type SealedRuntimeAssembly,
} from '../../src/contracts/runtime-assembly.js';
import {
  AssemblyExecutionActivator,
  GovernanceBaselineRegistry,
  GovernanceExecutionBindingError,
  GovernanceExecutionCoordinator,
  MemoryGovernanceBaselineStore,
  createGovernanceBaselineBody,
  createGovernanceExecutionPin,
  type DurableExecutionStore,
  type ExactPackageCdiAuthority,
  type GovernanceBaselineBody,
  type GovernanceBoundSnapshot,
  type GovernanceExecutionPin,
  type GovernancePackageCdiBinding,
} from '../../src/governance/index.js';
import type { DomainActivationBinding } from '../../src/governance/index.js';

const sha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

/**
 * A Sha256Port whose next digest call blocks until the test releases it, so
 * the test can interleave adversarial caller mutation mid-await (same torn
 * fixture as the T002C matrix).
 */
class GatedSha256 implements Sha256Port {
  #gate: { readonly entered: () => void; readonly release: () => Promise<void> } | undefined;

  pauseNext(): { readonly entered: Promise<void>; readonly release: () => void } {
    let enteredResolve!: () => void;
    let releaseResolve!: () => void;
    const entered = new Promise<void>((resolve) => {
      enteredResolve = resolve;
    });
    const releasePromise = new Promise<void>((resolve) => {
      releaseResolve = resolve;
    });
    this.#gate = {
      entered: enteredResolve,
      release: () => {
        enteredResolve();
        return releasePromise;
      },
    };
    return { entered, release: () => releaseResolve() };
  }

  async digestUtf8(value: string): Promise<string> {
    const gate = this.#gate;
    if (gate !== undefined) {
      this.#gate = undefined;
      gate.entered();
      await gate.release();
    }
    return createHash('sha256').update(value, 'utf8').digest('hex');
  }
}

class MemoryExactPackageCdiAuthority implements ExactPackageCdiAuthority {
  readonly #records = new Map<string, GovernancePackageCdiBinding>();

  add(binding: GovernancePackageCdiBinding): void {
    this.#records.set(this.#key(binding), { ...binding });
  }

  async resolveExactPackageCdi(
    binding: GovernancePackageCdiBinding,
  ): Promise<GovernancePackageCdiBinding | undefined> {
    const record = this.#records.get(this.#key(binding));
    return record === undefined ? undefined : { ...record };
  }

  #key(binding: GovernancePackageCdiBinding): string {
    return `${binding.domainId} ${binding.packageId} ${binding.domainIntelligenceContentDigest}`;
  }
}

class MemoryDurableExecutionStore implements DurableExecutionStore {
  readonly events: string[] = [];
  readonly #pins = new Map<string, unknown>();
  readonly #snapshots = new Map<string, unknown>();

  async getGovernanceExecutionPin(workflowInstanceId: string): Promise<unknown> {
    return this.#pins.get(workflowInstanceId);
  }

  async bindGovernanceExecutionPin(
    pin: GovernanceExecutionPin,
  ): Promise<'inserted' | 'existing' | 'conflict'> {
    this.events.push(`pin:${pin.workflowInstanceId}`);
    const existing = this.#pins.get(pin.workflowInstanceId);
    if (existing === undefined) {
      this.#pins.set(pin.workflowInstanceId, pin);
      return 'inserted';
    }
    if (JSON.stringify(existing) === JSON.stringify(pin)) return 'existing';
    return 'conflict';
  }

  async getGovernanceBoundSnapshot(workflowInstanceId: string): Promise<unknown> {
    return this.#snapshots.get(workflowInstanceId);
  }

  async putGovernanceBoundSnapshot(snapshot: GovernanceBoundSnapshot): Promise<void> {
    this.events.push(`snapshot:${snapshot.workflowInstanceId}`);
    this.#snapshots.set(snapshot.workflowInstanceId, snapshot);
  }

  /** Test-only: durably replace the raw stored pin (tamper/replay fixtures). */
  tamperRawPin(workflowInstanceId: string, raw: unknown): void {
    this.#pins.set(workflowInstanceId, raw);
  }
}

// ---------------------------------------------------------------------------
// Resource / Assembly fixtures (T005A declaration + T002B genuine sealing)
// ---------------------------------------------------------------------------

const OWNER_ID = 'credit.rating.tool';
const OPERATION_LOOKUP = 'lookup.credit-rating';
const POSTGRES_KEY = 'runtime.postgres.cluster';
const CACHE_KEY = 'runtime.cache.cluster';
const POSTGRES_CONTRACT: ResourceContractRef = {
  contractId: 'runtime.postgres.contract',
  version: '1.2.0',
};
const PG_REVISION_1 = 'sha256:pg-revision-0001';
const PG_REVISION_2 = 'sha256:pg-revision-0002';

function pgPin(overrides: {
  readonly providerId?: string;
  readonly resourceKey?: string;
  readonly revisionDigest?: string;
} = {}): ResourceCurrentnessPin {
  return Object.freeze({
    providerId: overrides.providerId ?? 'provider.postgres.primary',
    resourceKey: overrides.resourceKey ?? POSTGRES_KEY,
    revisionDigest: overrides.revisionDigest ?? PG_REVISION_1,
  });
}

function evidence(
  overrides: Partial<ResourceCurrentnessEvidence> = {},
): ResourceCurrentnessEvidence {
  return {
    componentId: overrides.componentId ?? OWNER_ID,
    providerId: overrides.providerId ?? 'provider.postgres.primary',
    resourceKey: overrides.resourceKey ?? POSTGRES_KEY,
    revisionDigest: overrides.revisionDigest ?? PG_REVISION_1,
  };
}

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
      operations: [operation(OPERATION_LOOKUP, 'idempotent')],
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

function graph(): DefinitionGraphEnvelope {
  return { graphId: 'graph.credit-rating', components: [toolEnvelope()], relations: [] };
}

async function sealedAssembly(
  requirements: readonly ToolResourceRequirement[],
  overrides: { readonly withBindingEvidence?: boolean } = {},
): Promise<SealedRuntimeAssembly> {
  const owner = toolEnvelope();
  return sealRuntimeAssembly(
    {
      definitionGraph: graph(),
      kindImplementations: [toolBinding()],
      resourceRequirements: [{ owner, declaration: { componentId: OWNER_ID, requirements } }],
      ...(overrides.withBindingEvidence
        ? {
            implementationBindingEvidence: [
              { subject: 'tool.credit-rating.v1', bindingDigest: 'sha256:binding-evidence-1' },
            ],
          }
        : {}),
    },
    sha256,
  );
}

function postgresRequirement(overrides: { readonly required?: boolean } = {}): ToolResourceRequirement {
  return { resourceKey: POSTGRES_KEY, contract: POSTGRES_CONTRACT, required: overrides.required ?? true };
}

function cacheRequirement(): ToolResourceRequirement {
  return { resourceKey: CACHE_KEY, required: false };
}

interface ProviderStub {
  readonly provider: ResourceProvider;
  readonly calls: ResourceResolutionRequest[];
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

function resolutionOptions(
  assembly: SealedRuntimeAssembly,
  provider: ResourceProvider,
): ResolveToolResourcesOptions {
  return { assembly, componentId: OWNER_ID, provider };
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

async function expectBindingError(
  promise: Promise<unknown>,
  code: string,
): Promise<GovernanceExecutionBindingError> {
  return promise.then(
    () => {
      throw new Error(`expected GovernanceExecutionBindingError(${code}), but the call succeeded`);
    },
    (error: unknown) => {
      assert.ok(
        error instanceof GovernanceExecutionBindingError,
        `expected GovernanceExecutionBindingError, got ${String(error)}`,
      );
      assert.equal(error.code, code);
      assert.equal(error.name, 'GovernanceExecutionBindingError');
      return error;
    },
  );
}

// ---------------------------------------------------------------------------
// Governance / activation fixtures (T002C seam, repaired T002D class authority)
// ---------------------------------------------------------------------------

async function governanceBody(label: string): Promise<GovernanceBaselineBody> {
  return createGovernanceBaselineBody(
    {
      domainId: 'orders',
      governanceId: 'orders-governance',
      schemaVersion: '1',
      version: label,
      semantics: {
        hardInvariants: [{ id: `invariant-${label}`, kind: 'deny-negative-total' }],
        operatorAuthority: label,
      },
    },
    sha256,
  );
}

interface Fixture {
  readonly baselines: MemoryGovernanceBaselineStore;
  readonly packageCdi: MemoryExactPackageCdiAuthority;
  readonly store: MemoryDurableExecutionStore;
  readonly activator: AssemblyExecutionActivator;
  readonly binding: DomainActivationBinding;
  readonly assembly: SealedRuntimeAssembly;
  readonly currentGraph: DefinitionGraphEnvelope;
}

async function fixture(
  requirements: readonly ToolResourceRequirement[],
  port: Sha256Port = sha256,
): Promise<Fixture> {
  const b1 = await governanceBody('B1');
  const baselines = new MemoryGovernanceBaselineStore();
  const registry = new GovernanceBaselineRegistry(baselines, sha256);
  await registry.register(b1);
  const packageCdi = new MemoryExactPackageCdiAuthority();
  packageCdi.add({
    domainId: 'orders',
    packageId: 'pkg-orders-1',
    domainIntelligenceContentDigest: 'cdi-orders-1',
  });
  const store = new MemoryDurableExecutionStore();
  const activator = new AssemblyExecutionActivator(store, packageCdi, baselines, port);
  const binding: DomainActivationBinding = {
    domainId: 'orders',
    packageId: 'pkg-orders-1',
    domainIntelligenceContentDigest: 'cdi-orders-1',
    governanceBaseline: b1.identity,
  };
  const currentGraph = graph();
  const assembly = await sealedAssembly(requirements);
  return { baselines, packageCdi, store, activator, binding, assembly, currentGraph };
}

const OCCURRENCE = { workflowTarget: 'orders.fulfill', workflowInstanceId: 'instance-1' };

function activationRequest(
  input: {
    readonly binding: DomainActivationBinding;
    readonly assembly: SealedRuntimeAssembly;
    readonly currentGraph: DefinitionGraphEnvelope;
  },
  overrides: {
    readonly resourceCurrentness?: readonly ResourceCurrentnessEvidence[];
  } = {},
) {
  return {
    workflowTarget: OCCURRENCE.workflowTarget,
    workflowInstanceId: OCCURRENCE.workflowInstanceId,
    binding: input.binding,
    assembly: input.assembly,
    authorityClass: 'PRODUCTION' as const,
    currentDefinitionGraph: input.currentGraph,
    ...(overrides.resourceCurrentness === undefined
      ? {}
      : { resourceCurrentness: overrides.resourceCurrentness }),
  };
}

// ---------------------------------------------------------------------------
// T005B seam: stable non-secret pin capture (resolved responses)
// ---------------------------------------------------------------------------

test('T005B seam: a resolved response may carry a stable non-secret currentness pin; the entry snapshots it frozen and non-aliased', async () => {
  const assembly = await sealedAssembly([postgresRequirement()]);
  const rawPin = { ...pgPin() };
  const { provider } = providerStub(() => ({
    status: 'resolved',
    handle: { connection: 'opaque-host-object' },
    contract: POSTGRES_CONTRACT,
    currentnessPin: rawPin,
  }));

  const result = await resolveToolResources(resolutionOptions(assembly, provider));
  const entry = result.resources.get(POSTGRES_KEY);
  assert.ok(entry !== undefined && entry.status === 'resolved', 'required resource resolved');
  assert.deepEqual(entry.currentnessPin, {
    providerId: 'provider.postgres.primary',
    resourceKey: POSTGRES_KEY,
    revisionDigest: PG_REVISION_1,
  });
  assert.ok(entry.currentnessPin !== undefined && Object.isFrozen(entry.currentnessPin), 'pin evidence is frozen');

  // Adversarial mutation AFTER the await: the snapshotted pin never aliases
  // the provider's raw response object (no hybrid/torn evidence).
  rawPin.revisionDigest = 'sha256:tampered-mid-flight';
  assert.equal(entry.currentnessPin.revisionDigest, PG_REVISION_1);
});

test('T005B seam: the pin whitelist is closed — secret-bearing/unknown fields and non-identity values fail typed and never reach evidence or diagnostics', async () => {
  const assembly = await sealedAssembly([postgresRequirement()]);

  // Secret-bearing extra field on the pin.
  const withSecret = providerStub(() => ({
    status: 'resolved',
    handle: 'h',
    contract: POSTGRES_CONTRACT,
    currentnessPin: { ...pgPin(), accessToken: 'sk-live-SUPER-SECRET-123' },
  }));
  const secretError = await expectResolutionError(
    resolveToolResources(resolutionOptions(assembly, withSecret.provider)),
    'INVALID_RESOURCE_PROVIDER_RESPONSE',
  );
  assert.ok(
    !secretError.message.includes('accessToken'),
    'the offending KEY name itself is provider-controlled and is never echoed verbatim (#837 P1_01)',
  );
  assert.match(secretError.message, /<redacted:/, 'a bounded deterministic key classification participates');
  assert.ok(
    !secretError.message.includes('sk-live-SUPER-SECRET-123'),
    'the secret VALUE never enters diagnostics',
  );

  // A function / an object can never be revision evidence (structural fence).
  const withFunction = providerStub(() => ({
    status: 'resolved',
    handle: 'h',
    contract: POSTGRES_CONTRACT,
    currentnessPin: { ...pgPin(), revisionDigest: (() => 'live-fn') as unknown as string },
  }));
  await expectResolutionError(
    resolveToolResources(resolutionOptions(assembly, withFunction.provider)),
    'INVALID_RESOURCE_PROVIDER_RESPONSE',
  );
  const withObject = providerStub(() => ({
    status: 'resolved',
    handle: 'h',
    contract: POSTGRES_CONTRACT,
    currentnessPin: { ...pgPin(), revisionDigest: { digest: 'not-an-identity' } as unknown as string },
  }));
  await expectResolutionError(
    resolveToolResources(resolutionOptions(assembly, withObject.provider)),
    'INVALID_RESOURCE_PROVIDER_RESPONSE',
  );
});

test('T005B seam: pin identity must be exact — floating/range/selector revisions and a mismatched resourceKey fail typed', async () => {
  const assembly = await sealedAssembly([postgresRequirement()]);
  for (const badRevision of ['latest', 'current', '1.x', 'postgres@1.2.3', '@latest']) {
    const stub = providerStub(() => ({
      status: 'resolved',
      handle: 'h',
      contract: POSTGRES_CONTRACT,
      currentnessPin: pgPin({ revisionDigest: badRevision }),
    }));
    await expectResolutionError(
      resolveToolResources(resolutionOptions(assembly, stub.provider)),
      'INVALID_RESOURCE_PROVIDER_RESPONSE',
    );
  }

  const wrongKey = providerStub(() => ({
    status: 'resolved',
    handle: 'h',
    contract: POSTGRES_CONTRACT,
    currentnessPin: pgPin({ resourceKey: 'runtime.other.cluster' }),
  }));
  await expectResolutionError(
    resolveToolResources(resolutionOptions(assembly, wrongKey.provider)),
    'INVALID_RESOURCE_PROVIDER_RESPONSE',
  );
});

test('T005B seam: an optional resource may carry a pin; a required resource resolved WITHOUT a pin still resolves (capture only — no fallback pin is ever minted)', async () => {
  const optionalAssembly = await sealedAssembly([cacheRequirement()]);
  const withPin = providerStub(() => ({
    status: 'resolved',
    handle: 'cache-handle',
    currentnessPin: pgPin({ resourceKey: CACHE_KEY, revisionDigest: 'sha256:cache-revision-1' }),
  }));
  const optionalResult = await resolveToolResources(resolutionOptions(optionalAssembly, withPin.provider));
  const optionalEntry = optionalResult.resources.get(CACHE_KEY);
  assert.ok(optionalEntry !== undefined && optionalEntry.status === 'resolved');
  assert.deepEqual(optionalEntry.currentnessPin, {
    providerId: 'provider.postgres.primary',
    resourceKey: CACHE_KEY,
    revisionDigest: 'sha256:cache-revision-1',
  });

  // Capture-only at the T005B seam: a required resource without a pin still
  // resolves with an explicit handle and NO invented/default/fallback pin —
  // the typed fail-closed gate is owned by T005C activation.
  const requiredAssembly = await sealedAssembly([postgresRequirement()]);
  const withoutPin = providerStub(() => ({
    status: 'resolved',
    handle: 'pg-handle',
    contract: POSTGRES_CONTRACT,
  }));
  const requiredResult = await resolveToolResources(resolutionOptions(requiredAssembly, withoutPin.provider));
  const requiredEntry = requiredResult.resources.get(POSTGRES_KEY);
  assert.ok(requiredEntry !== undefined && requiredEntry.status === 'resolved');
  assert.equal((requiredEntry as { currentnessPin?: unknown }).currentnessPin, undefined);
});

// ---------------------------------------------------------------------------
// T002C seam: evidence binds into the ONE GovernanceExecutionPin hierarchy
// ---------------------------------------------------------------------------

test('T005C: required-resource pin evidence binds INTO the ONE GovernanceExecutionPin — one durable write, same store, no second hierarchy', async () => {
  const fx = await fixture([postgresRequirement(), cacheRequirement()]);
  const evidenceSet = [evidence(), evidence({ resourceKey: CACHE_KEY, providerId: 'provider.cache.alpha', revisionDigest: 'sha256:cache-revision-1' })];

  const pin = await fx.activator.activate(
    activationRequest(fx, { resourceCurrentness: evidenceSet }),
  );

  assert.deepEqual(
    pin.resourceCurrentness,
    [
      {
        componentId: OWNER_ID,
        providerId: 'provider.cache.alpha',
        resourceKey: CACHE_KEY,
        revisionDigest: 'sha256:cache-revision-1',
      },
      evidence(),
    ],
    'evidence is order-normalized (componentId, then resourceKey) and carried on the pin',
  );
  assert.ok(Object.isFrozen(pin.resourceCurrentness), 'evidence array is frozen');
  for (const entry of pin.resourceCurrentness ?? []) {
    assert.ok(Object.isFrozen(entry), 'every evidence entry is frozen');
  }

  // Exactly ONE durable write, through the shared store and pin shape; the
  // pre-existing coordinator reads the SAME authority — no second hierarchy.
  assert.deepEqual(fx.store.events, ['pin:instance-1']);
  const viaExistingCoordinator = await new GovernanceExecutionCoordinator(
    fx.store,
    sha256,
  ).requirePinnedExecution(OCCURRENCE.workflowInstanceId);
  assert.equal(viaExistingCoordinator.bindingDigest, pin.bindingDigest);
  assert.deepEqual(viaExistingCoordinator.resourceCurrentness, pin.resourceCurrentness);

  // The digest commits to the evidence: the same activation without evidence
  // produces a different pin currentness.
  const noEvidencePin = await createGovernanceExecutionPin(
    {
      workflowTarget: OCCURRENCE.workflowTarget,
      workflowInstanceId: OCCURRENCE.workflowInstanceId,
      binding: fx.binding,
      assemblyDigest: fx.assembly.assemblyDigest,
      authorityClass: 'PRODUCTION' as const,
    },
    sha256,
  );
  assert.notEqual(pin.bindingDigest, noEvidencePin.bindingDigest, 'bindingDigest covers resource currentness');
});

test('T005C: an optional resource without a pin stays outside occurrence currentness exactly when the explicit required:false posture permits', async () => {
  const fx = await fixture([cacheRequirement()]);

  const pin = await fx.activator.activate(activationRequest(fx));
  assert.equal(pin.resourceCurrentness, undefined, 'no evidence, no invented pin');
  const noEvidencePin = await createGovernanceExecutionPin(
    {
      workflowTarget: OCCURRENCE.workflowTarget,
      workflowInstanceId: OCCURRENCE.workflowInstanceId,
      binding: fx.binding,
      assemblyDigest: fx.assembly.assemblyDigest,
      authorityClass: 'PRODUCTION' as const,
    },
    sha256,
  );
  assert.equal(pin.bindingDigest, noEvidencePin.bindingDigest);

  // Supplying the optional pin is equally legal — then it participates.
  const withOptionalPin = await fx.activator.activate({
    ...activationRequest(fx),
    workflowInstanceId: 'instance-2',
    resourceCurrentness: [evidence({ resourceKey: CACHE_KEY, providerId: 'provider.cache.alpha', revisionDigest: 'sha256:cache-revision-1' })],
  });
  assert.equal(withOptionalPin.resourceCurrentness?.length, 1);
  assert.notEqual(withOptionalPin.bindingDigest, noEvidencePin.bindingDigest);
});

test('T005C: a required resource without pinned evidence fails closed typed BEFORE any durable bind (missing + partial coverage)', async () => {
  const fx = await fixture([postgresRequirement(), cacheRequirement()]);

  await expectBindingError(
    fx.activator.activate(activationRequest(fx)),
    'RESOURCE_CURRENTNESS_PIN_REQUIRED',
  );
  assert.deepEqual(fx.store.events, [], 'no partial pin is ever bound');

  // Optional evidence alone does not satisfy the required requirement.
  await expectBindingError(
    fx.activator.activate(
      activationRequest(fx, {
        resourceCurrentness: [evidence({ resourceKey: CACHE_KEY, providerId: 'provider.cache.alpha', revisionDigest: 'sha256:cache-revision-1' })],
      }),
    ),
    'RESOURCE_CURRENTNESS_PIN_REQUIRED',
  );
  assert.deepEqual(fx.store.events, [], 'still all-or-nothing');
});

test('T005C: evidence outside the exact sealed Assembly requirement material fails closed (incompatible, no parallel identity)', async () => {
  const fx = await fixture([postgresRequirement()]);

  await expectBindingError(
    fx.activator.activate(
      activationRequest(fx, {
        resourceCurrentness: [evidence({ resourceKey: 'runtime.unknown.cluster' })],
      }),
    ),
    'INVALID_RESOURCE_CURRENTNESS',
  );
  await expectBindingError(
    fx.activator.activate(
      activationRequest(fx, {
        resourceCurrentness: [evidence({ componentId: 'other.domain.tool' })],
      }),
    ),
    'INVALID_RESOURCE_CURRENTNESS',
  );
  assert.deepEqual(fx.store.events, [], 'nothing is bound on incompatible evidence');
});

test('T005C: torn-activation — mutating the caller evidence array mid-await cannot mint hybrid currentness evidence', async () => {
  const port = new GatedSha256();
  const fx = await fixture([postgresRequirement()], port);
  const callerEvidence = [evidence()];
  const request = activationRequest(fx, { resourceCurrentness: callerEvidence });
  const gate = port.pauseNext();

  const activating = fx.activator.activate(request);
  await gate.entered;

  // Adversarial mid-flight mutation of the caller-owned evidence array.
  callerEvidence.push(evidence({ resourceKey: CACHE_KEY, providerId: 'provider.cache.alpha', revisionDigest: 'sha256:cache-EVIL' }));
  callerEvidence[0] = { ...callerEvidence[0]!, revisionDigest: 'sha256:pg-EVIL' };

  gate.release();
  const pin = await activating;

  assert.deepEqual(pin.resourceCurrentness, [evidence()], 'the synchronous snapshot survived');
  assert.ok(
    !pin.resourceCurrentness?.some((entry) => entry.revisionDigest.includes('EVIL')),
    'no hybrid evidence was minted',
  );
});

test('T005C: no fallback/order semantics — evidence order is normalized (same digest), duplicates and floating tokens fail typed', async () => {
  const fx = await fixture([postgresRequirement(), cacheRequirement()]);
  const cacheEvidence = evidence({ resourceKey: CACHE_KEY, providerId: 'provider.cache.alpha', revisionDigest: 'sha256:cache-revision-1' });

  const forward = await fx.activator.activate({
    ...activationRequest(fx, { resourceCurrentness: [evidence(), cacheEvidence] }),
    workflowInstanceId: 'instance-fwd',
  });
  const backward = await fx.activator.activate({
    ...activationRequest(fx, { resourceCurrentness: [cacheEvidence, evidence()] }),
    workflowInstanceId: 'instance-bwd',
  });
  assert.equal(forward.bindingDigest, backward.bindingDigest, 'order-invariant identity, never insertion/first order');

  await expectBindingError(
    fx.activator.activate({
      ...activationRequest(fx, { resourceCurrentness: [evidence(), evidence()] }),
      workflowInstanceId: 'instance-dup',
    }),
    'INVALID_RESOURCE_CURRENTNESS',
  );

  for (const badRevision of ['latest', '@current', '1.x', '']) {
    await expectBindingError(
      fx.activator.activate({
        ...activationRequest(fx, { resourceCurrentness: [evidence({ revisionDigest: badRevision })] }),
        workflowInstanceId: 'instance-bad',
      }),
      'INVALID_RESOURCE_CURRENTNESS',
    );
  }
});

// ---------------------------------------------------------------------------
// Replay / occurrence currentness gates
// ---------------------------------------------------------------------------

test('T005C: replay accepts the exact pinned resource evidence and the digest verifies it unconditionally', async () => {
  const fx = await fixture([postgresRequirement()]);
  await fx.activator.activate(activationRequest(fx, { resourceCurrentness: [evidence()] }));

  const recovered = await fx.activator.recover({ workflowInstanceId: OCCURRENCE.workflowInstanceId });
  assert.deepEqual(recovered.pin.resourceCurrentness, [evidence()]);

  const matched = await fx.activator.recover({
    workflowInstanceId: OCCURRENCE.workflowInstanceId,
    expectedResourceCurrentness: [evidence()],
  });
  assert.deepEqual(matched.pin.resourceCurrentness, [evidence()]);

  // The evidence is woven into bindingDigest: tampering the durable pin's
  // evidence (without re-binding) fails the digest verification typed.
  const durable = await fx.activator.requireActivatedExecution(OCCURRENCE.workflowInstanceId);
  fx.store.tamperRawPin(OCCURRENCE.workflowInstanceId, {
    ...durable,
    resourceCurrentness: [evidence({ revisionDigest: PG_REVISION_2 })],
  });
  await expectBindingError(
    fx.activator.recover({ workflowInstanceId: OCCURRENCE.workflowInstanceId }),
    'INVALID_GOVERNANCE_EXECUTION_PIN',
  );
});

test('T005C: a different exact revision/provider rejects the old occurrence — stale and replaced evidence fail deterministically', async () => {
  const fx = await fixture([postgresRequirement()]);
  await fx.activator.activate(activationRequest(fx, { resourceCurrentness: [evidence()] }));

  const staleRevision = evidence({ revisionDigest: PG_REVISION_2 });
  await expectBindingError(
    fx.activator.requireResourceCurrentness(OCCURRENCE.workflowInstanceId, [staleRevision]),
    'RESOURCE_CURRENTNESS_MISMATCH',
  );
  await expectBindingError(
    fx.activator.recover({
      workflowInstanceId: OCCURRENCE.workflowInstanceId,
      expectedResourceCurrentness: [staleRevision],
    }),
    'RESOURCE_CURRENTNESS_MISMATCH',
  );

  // Provider replacement with a different exact identity is a different pin.
  const replacedProvider = evidence({ providerId: 'provider.postgres.replica' });
  await expectBindingError(
    fx.activator.requireResourceCurrentness(OCCURRENCE.workflowInstanceId, [replacedProvider]),
    'RESOURCE_CURRENTNESS_MISMATCH',
  );
});

test('T005C: provider implementation replacement alone never rewrites Definition identity; occurrence currentness changes only when the exact pin changes', async () => {
  const fx = await fixture([postgresRequirement()]);

  // Definition identity anchor: the graph digest is exactly the sealed one and
  // is independent of any provider/resource runtime material.
  const graphDigest = await computeDefinitionGraphDigest(fx.currentGraph, sha256);
  assert.equal(graphDigest, fx.assembly.record.definitionGraphDigest);
  assert.equal(fx.assembly.assemblyDigest, fx.assembly.assemblyDigest);

  await fx.activator.activate(activationRequest(fx, { resourceCurrentness: [evidence()] }));

  // Same revision, different provider implementation: the Definition graph
  // digest is untouched, but the exact pin changed, so occurrence currentness
  // changes truthfully.
  const replacementEvidence = [evidence({ providerId: 'provider.postgres.replica', revisionDigest: PG_REVISION_1 })];
  assert.deepEqual(await computeDefinitionGraphDigest(fx.currentGraph, sha256), graphDigest);
  await expectBindingError(
    fx.activator.requireResourceCurrentness(OCCURRENCE.workflowInstanceId, replacementEvidence),
    'RESOURCE_CURRENTNESS_MISMATCH',
  );

  // Same provider, same revision: identical currentness identity, accepted.
  const sameEvidence = [evidence()];
  const matched = await fx.activator.requireResourceCurrentness(OCCURRENCE.workflowInstanceId, sameEvidence);
  assert.deepEqual(matched.resourceCurrentness, sameEvidence);
});

test('T005C: currentness cannot be asserted onto a pin that carries none, and caller evidence is never aliased into authority', async () => {
  const fx = await fixture([cacheRequirement()]);
  const cacheEvidence = evidence({
    resourceKey: CACHE_KEY,
    providerId: 'provider.cache.alpha',
    revisionDigest: 'sha256:cache-revision-1',
  });
  const pin = await fx.activator.activate(activationRequest(fx));
  assert.equal(pin.resourceCurrentness, undefined);

  await expectBindingError(
    fx.activator.requireResourceCurrentness(OCCURRENCE.workflowInstanceId, [cacheEvidence]),
    'RESOURCE_CURRENTNESS_MISMATCH',
  );
  await expectBindingError(
    fx.activator.recover({
      workflowInstanceId: OCCURRENCE.workflowInstanceId,
      expectedResourceCurrentness: [cacheEvidence],
    }),
    'RESOURCE_CURRENTNESS_MISMATCH',
  );

  // Fresh/frozen/non-aliased: the caller mutating its own array afterwards
  // cannot change the already-pinned authority.
  const callerEvidence = [cacheEvidence];
  const pinned = await fx.activator.activate({
    ...activationRequest(fx, { resourceCurrentness: callerEvidence }),
    workflowInstanceId: 'instance-3',
  });
  callerEvidence.pop();
  assert.equal(pinned.resourceCurrentness?.length, 1, 'pinned evidence is a frozen snapshot, not an alias');
  const reread = await fx.activator.requireResourceCurrentness('instance-3', [cacheEvidence]);
  assert.ok(Object.isFrozen(reread.resourceCurrentness));
});

// ---------------------------------------------------------------------------
// Definition / Assembly fidelity + inherited #622 regression equivalents
// ---------------------------------------------------------------------------

test('T005C: resource revision changes never alter Definition identity nor the sealed logical resourceRequirements', async () => {
  const assembly = await sealedAssembly([postgresRequirement()]);
  const recordBefore = JSON.stringify(assembly.record.resourceRequirements);
  const assemblyDigestBefore = assembly.assemblyDigest;
  const graphDigestBefore = await computeDefinitionGraphDigest(graph(), sha256);

  for (const revision of [PG_REVISION_1, PG_REVISION_2]) {
    const stub = providerStub(() => ({
      status: 'resolved',
      handle: 'pg-handle',
      contract: POSTGRES_CONTRACT,
      currentnessPin: pgPin({ revisionDigest: revision }),
    }));
    const result = await resolveToolResources(resolutionOptions(assembly, stub.provider));
    const entry = result.resources.get(POSTGRES_KEY);
    assert.ok(entry !== undefined && entry.status === 'resolved');
    assert.equal(entry.currentnessPin?.revisionDigest, revision);
  }

  assert.equal(JSON.stringify(assembly.record.resourceRequirements), recordBefore, 'sealed logical requirements stay byte-identical');
  assert.equal(assembly.assemblyDigest, assemblyDigestBefore, 'Assembly identity is untouched');
  assert.equal(await computeDefinitionGraphDigest(graph(), sha256), graphDigestBefore, 'Definition identity is untouched');
});

test('Runtime.ResourceRequirementsForwarding (inherited): evidence forwards exactly the sealed requirement material — nothing invented, nothing dropped', async () => {
  const fx = await fixture([postgresRequirement(), cacheRequirement()]);
  const cacheEvidence = evidence({ resourceKey: CACHE_KEY, providerId: 'provider.cache.alpha', revisionDigest: 'sha256:cache-revision-1' });

  const pin = await fx.activator.activate(
    activationRequest(fx, { resourceCurrentness: [evidence(), cacheEvidence] }),
  );
  assert.deepEqual(
    new Set((pin.resourceCurrentness ?? []).map((entry) => entry.resourceKey)),
    new Set([POSTGRES_KEY, CACHE_KEY]),
    'forwarded evidence keys are exactly the sealed Assembly requirement keys',
  );

  // The optional requirement may legitimately remain unforwarded; the required
  // one may not. Nothing is ever added that the Assembly does not declare.
  const requiredOnly = await fx.activator.activate({
    ...activationRequest(fx, { resourceCurrentness: [evidence()] }),
    workflowInstanceId: 'instance-fwd-2',
  });
  assert.deepEqual(
    (requiredOnly.resourceCurrentness ?? []).map((entry) => entry.resourceKey),
    [POSTGRES_KEY],
  );
});

test('Runtime.FailedRecordImmutability (inherited): typed failure records are deterministic and stable across attempts', async () => {
  const fx = await fixture([postgresRequirement()]);
  const callerEvidence: ResourceCurrentnessEvidence[] = [];

  const first = await expectBindingError(
    fx.activator.activate(activationRequest(fx, { resourceCurrentness: callerEvidence })),
    'RESOURCE_CURRENTNESS_PIN_REQUIRED',
  );
  callerEvidence.push(evidence({ resourceKey: 'runtime.unknown.cluster' }));
  const second = await expectBindingError(
    fx.activator.activate(activationRequest(fx, { resourceCurrentness: callerEvidence })),
    'INVALID_RESOURCE_CURRENTNESS',
  );
  const third = await expectBindingError(
    fx.activator.activate(activationRequest(fx)),
    'RESOURCE_CURRENTNESS_PIN_REQUIRED',
  );

  assert.equal(first.code, third.code, 'the same failure always carries the same typed code');
  assert.equal(first.message, third.message, 'failure records never bleed caller state');
  assert.notEqual(first.code, second.code);
});

test('Runtime.SecretRefPublicSplit (inherited): secret material never enters durable evidence or diagnostics', async () => {
  const fx = await fixture([postgresRequirement()]);

  const invalid = await expectBindingError(
    fx.activator.activate(
      activationRequest(fx, {
        resourceCurrentness: [
          { ...evidence(), serviceAccountToken: 'opaque-secret-value-XYZ' } as unknown as ResourceCurrentnessEvidence,
        ],
      }),
    ),
    'INVALID_RESOURCE_CURRENTNESS',
  );
  assert.match(invalid.message, /serviceAccountToken/, 'the offending KEY name participates');
  assert.ok(!invalid.message.includes('opaque-secret-value-XYZ'), 'the secret VALUE never enters diagnostics');

  // Durable-path: a tampered pin whose evidence smuggles an extra secret
  // field fails typed parse, and the value never reaches the message.
  await fx.activator.activate(activationRequest(fx, { resourceCurrentness: [evidence()] }));
  const durable = await fx.activator.requireActivatedExecution(OCCURRENCE.workflowInstanceId);
  fx.store.tamperRawPin(OCCURRENCE.workflowInstanceId, {
    ...durable,
    resourceCurrentness: [
      { ...evidence(), credential: 'durably-hidden-secret-QQQ' } as unknown as ResourceCurrentnessEvidence,
    ],
  });
  const tampered = await expectBindingError(
    fx.activator.requireActivatedExecution(OCCURRENCE.workflowInstanceId),
    'INVALID_GOVERNANCE_EXECUTION_PIN',
  );
  assert.ok(!tampered.message.includes('durably-hidden-secret-QQQ'), 'durable diagnostics stay secret-free');
});

test('Assembly ledger fidelity: the T005C flow preserves every unrelated sealed Assembly field byte-exactly', async () => {
  const b1 = await governanceBody('B1');
  const baselines = new MemoryGovernanceBaselineStore();
  const registry = new GovernanceBaselineRegistry(baselines, sha256);
  await registry.register(b1);
  const packageCdi = new MemoryExactPackageCdiAuthority();
  packageCdi.add({
    domainId: 'orders',
    packageId: 'pkg-orders-1',
    domainIntelligenceContentDigest: 'cdi-orders-1',
  });
  const activator = new AssemblyExecutionActivator(
    new MemoryDurableExecutionStore(),
    packageCdi,
    baselines,
    sha256,
  );
  const assembly = await sealedAssembly(
    [postgresRequirement(), cacheRequirement()],
    { withBindingEvidence: true },
  );
  const recordBefore = JSON.stringify(assembly.record);

  const stub = providerStub((request) => ({
    status: 'resolved',
    handle: 'h',
    ...(request.resourceKey === POSTGRES_KEY ? { contract: POSTGRES_CONTRACT } : {}),
  }));
  await resolveToolResources(resolutionOptions(assembly, stub.provider));

  await activator.activate(
    activationRequest(
      {
        binding: {
          domainId: 'orders',
          packageId: 'pkg-orders-1',
          domainIntelligenceContentDigest: 'cdi-orders-1',
          governanceBaseline: b1.identity,
        },
        assembly,
        currentGraph: graph(),
      },
      { resourceCurrentness: [evidence()] },
    ),
  );
  await activator.recover({ workflowInstanceId: OCCURRENCE.workflowInstanceId });

  assert.equal(JSON.stringify(assembly.record), recordBefore, 'all sealed ledger fields stay byte-identical');
});
