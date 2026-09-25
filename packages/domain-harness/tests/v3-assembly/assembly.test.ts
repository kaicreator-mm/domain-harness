import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  DomainActivationAuthority,
  ExactPackageCdiAuthority,
} from '../../src/governance/index.js';
import {
  MemoryGovernanceBaselineStore,
  type DomainActivationBinding,
  type GovernancePackageCdiBinding,
} from '../../src/governance/index.js';
import {
  CentralAdmissionError,
  VolatileAdmissionEffectJournal,
} from '../../src/admission/index.js';
import { VolatileRuntimeEvidenceStore } from '../../src/runtime-evidence/index.js';
import { StaticPackageRegistry } from '../../src/package/registry.js';
import { computeCompiledPackageId } from '../../src/package/index.js';
import type { TargetCompiledDomainPackage } from '../../src/v2/index.js';
import {
  createDomainRuntimeV3,
  DomainRuntimeV3Error,
  type CreateDomainRuntimeV3AuthorityOptions,
} from '../../src/runtime/create-domain-runtime-v3.js';
import { createRuntimeHostFake } from '../helpers/runtime-host-fake.js';
import { MemoryRuntimeStore } from './helpers.js';
import {
  CAP_INVARIANT,
  MemoryDurableExecutionStore,
  ScriptedEffectTools,
  makeBaseline,
  makeDefinition,
  makeRequest,
  quoteEvent,
  sha256,
  target,
  workflowInstanceId,
} from '../admission/helpers.js';

class MemoryActivationAuthority implements DomainActivationAuthority {
  current: unknown;

  async readDomainActivationBinding(_domainId: string): Promise<unknown> {
    return this.current;
  }

  async publishDomainActivationBinding(binding: DomainActivationBinding): Promise<void> {
    this.current = binding;
  }
}

class MemoryPackageCdiAuthority implements ExactPackageCdiAuthority {
  readonly #records = new Map<string, GovernancePackageCdiBinding>();

  add(binding: GovernancePackageCdiBinding): void {
    this.#records.set(
      `${binding.domainId} ${binding.packageId} ${binding.domainIntelligenceContentDigest}`,
      binding,
    );
  }

  async resolveExactPackageCdi(
    binding: GovernancePackageCdiBinding,
  ): Promise<GovernancePackageCdiBinding | undefined> {
    return this.#records.get(
      `${binding.domainId} ${binding.packageId} ${binding.domainIntelligenceContentDigest}`,
    );
  }
}

interface AssemblyFixture {
  readonly assembly: Awaited<ReturnType<typeof createDomainRuntimeV3>>;
  readonly evidence: VolatileRuntimeEvidenceStore;
  readonly journal: VolatileAdmissionEffectJournal;
  readonly tools: ScriptedEffectTools;
  readonly durableExecution: MemoryDurableExecutionStore;
  readonly activationAuthority: MemoryActivationAuthority;
  readonly packageId: string;
  readonly b1: Awaited<ReturnType<typeof makeBaseline>>;
}

async function bootablePackage(sha256: {
  digestUtf8(value: string): Promise<string>;
}): Promise<TargetCompiledDomainPackage> {
  const manifest: TargetCompiledDomainPackage['manifest'] = {
    formatVersion: '0.2',
    runtimeContractMajor: 2,
    executionEngineMajor: 2,
    domainId: 'orders',
    domainVersion: '0.3.0-assembly-test',
    packageId: 'pending',
    targetProfileId: 't021-assembly@1',
    requiredCapabilities: [],
    workflows: {
      'order-quote': {
        workflowId: 'order-quote',
        definition: {
          initial: 'review',
          states: {
            review: { final: false, done: [], error: [], events: {} },
            approved: { final: true, done: [], error: [], events: {} },
          },
          limits: { maxSteps: 32 },
        },
        messageContracts: {},
      },
    },
    tools: {},
    projections: {},
    schemas: {},
    bindingDigests: {},
  };
  manifest.packageId = await computeCompiledPackageId(manifest, sha256);
  return { manifest, bindings: {} };
}

async function assemblyFixture(options: {
  readonly evidence?: VolatileRuntimeEvidenceStore;
  readonly onEvidenceError?: (error: unknown) => void;
} = {}): Promise<AssemblyFixture> {
  const b1 = await makeBaseline('B1', [CAP_INVARIANT]);
  const baselines = new MemoryGovernanceBaselineStore();
  await baselines.putBody(b1);
  const durableExecution = new MemoryDurableExecutionStore();
  const activationAuthority = new MemoryActivationAuthority();
  const exactPackageCdi = new MemoryPackageCdiAuthority();
  const journal = new VolatileAdmissionEffectJournal();
  const tools = new ScriptedEffectTools({ 'effect:reserve': 'non-idempotent' });
  const evidence = options.evidence ?? new VolatileRuntimeEvidenceStore();
  const bindings = createRuntimeHostFake({ sha256 });
  const compiledPackage = await bootablePackage(bindings.sha256);
  const v3: CreateDomainRuntimeV3AuthorityOptions = {
    baselines,
    activationAuthority,
    exactPackageCdi,
    durableExecution,
    effectJournal: journal,
    effectTools: tools,
    evidence,
    ...(options.onEvidenceError === undefined
      ? {}
      : { onEvidenceError: options.onEvidenceError }),
  };
  const assembly = await createDomainRuntimeV3({
    packageRegistry: new StaticPackageRegistry([compiledPackage], compiledPackage.manifest.packageId),
    store: new MemoryRuntimeStore(),
    bindings,
    v3,
  });
  return {
    assembly,
    evidence,
    journal,
    tools,
    durableExecution,
    activationAuthority,
    packageId: compiledPackage.manifest.packageId,
    b1,
  };
}

async function pinInstance(fixture: AssemblyFixture): Promise<void> {
  await fixture.assembly.governance.pinExecution({
    workflowTarget: target.workflowId,
    workflowInstanceId,
    binding: {
      domainId: 'orders',
      packageId: fixture.packageId,
      domainIntelligenceContentDigest: 'cdi-orders-b1',
      governanceBaseline: fixture.b1.identity,
    },
  });
}

test('assembly: boots the single existing runtime plus the v0.3 authority stack', async () => {
  const fixture = await assemblyFixture();
  assert.equal(typeof fixture.assembly.runtime.openInstance, 'function', 'the ONE v0.2 runtime is retained');
  assert.equal(typeof fixture.assembly.runtime.send, 'function');
  assert.equal(typeof fixture.assembly.activation.publish, 'function');
  assert.equal(typeof fixture.assembly.governance.pinExecution, 'function');
  assert.equal(typeof fixture.assembly.admitTurn, 'function');
  assert.equal(typeof fixture.assembly.evidenceCapture, 'function');

  await pinInstance(fixture);
  const pin = await fixture.assembly.governance.requirePinnedExecution(workflowInstanceId);
  assert.equal(pin.packageId, fixture.packageId);
  assert.deepEqual(pin.governanceBaseline, fixture.b1.identity);
});

test('assembly: admitTurn runs the authoritative path and captures decision evidence automatically', async () => {
  const fixture = await assemblyFixture();
  await pinInstance(fixture);

  const outcome = await fixture.assembly.admitTurn(makeRequest());
  if (outcome.status !== 'admitted') assert.fail('expected admitted outcome');
  assert.equal(outcome.admitted.effects.length, 1);
  assert.equal(outcome.admitted.effects[0]!.disposition, 'executed');
  assert.equal(fixture.tools.calls.length, 1);
  assert.equal(fixture.journal.getRecords().length, 1);

  const records = fixture.evidence.records();
  assert.equal(records.length, 1, 'decision evidence appended automatically');
  const record = records[0]!;
  assert.equal(record.sourceKind, 'decision');
  assert.equal(record.durability, 'durable-audit');
  assert.equal(record.provenance.packageId, fixture.packageId);
  assert.deepEqual(record.provenance.governanceBaseline, fixture.b1.identity);
  assert.equal(
    record.provenance.sourceExecution?.durableControlTurnId,
    outcome.admitted.durableControlTurnId,
  );
  assert.deepEqual(record.payload, {
    status: 'admitted',
    transitionKey: outcome.admitted.transitionKey,
    targetState: outcome.admitted.targetState,
    effectCount: 1,
    resolver: 'harness-machine',
  });
});

test('assembly: denied admissions record denial evidence with exact provenance', async () => {
  const fixture = await assemblyFixture();
  await pinInstance(fixture);

  const outcome = await fixture.assembly.admitTurn(makeRequest({ event: quoteEvent(5000) }));
  if (outcome.status !== 'denied') assert.fail('expected denied outcome');
  assert.equal(fixture.tools.calls.length, 0);

  const records = fixture.evidence.records();
  assert.equal(records.length, 1);
  assert.equal(records[0]!.sourceKind, 'decision');
  assert.deepEqual(records[0]!.payload, {
    status: 'denied',
    reason: 'hard-invariant',
    invariantId: 'inv:cap-100',
    resolver: 'harness-machine',
  });
});

test('assembly: thrown admission errors surface unchanged and leave failure evidence', async () => {
  const fixture = await assemblyFixture();
  await pinInstance(fixture);

  await assert.rejects(
    () =>
      fixture.assembly.admitTurn(
        makeRequest({
          definition: makeDefinition({
            approveEffects: [{ effectType: 'effect:unbound', input: {} }],
          }),
        }),
      ),
    (error: unknown) =>
      error instanceof CentralAdmissionError && error.code === 'ADMISSION_EFFECT_TOOL_UNBOUND',
  );

  const records = fixture.evidence.records();
  assert.equal(records.length, 1, 'failure evidence appended');
  assert.equal(records[0]!.sourceKind, 'workflow-failure');
  const payload = records[0]!.payload as { readonly code: string; readonly message: string };
  assert.equal(payload.code, 'ADMISSION_EFFECT_TOOL_UNBOUND');
  assert.ok(payload.message.length > 0);
});

test('assembly: evidence-append failure never rewrites the admission outcome', async () => {
  const brokenEvidence = new VolatileRuntimeEvidenceStore();
  brokenEvidence.append = async () => {
    throw new Error('evidence sink unavailable');
  };
  const evidenceErrors: unknown[] = [];
  const fixture = await assemblyFixture({
    evidence: brokenEvidence,
    onEvidenceError: (error) => evidenceErrors.push(error),
  });
  await pinInstance(fixture);

  const outcome = await fixture.assembly.admitTurn(makeRequest());
  assert.equal(outcome.status, 'admitted', 'admission truth is independent of the evidence sink (V8)');
  assert.equal(fixture.tools.calls.length, 1);
  assert.equal(evidenceErrors.length, 1, 'the secondary channel observed the evidence failure');
});

test('assembly: a throwing onEvidenceError observer cannot rewrite an admission outcome', async () => {
  const brokenEvidence = new VolatileRuntimeEvidenceStore();
  brokenEvidence.append = async () => {
    throw new Error('evidence sink unavailable');
  };
  const observed: unknown[] = [];
  const fixture = await assemblyFixture({
    evidence: brokenEvidence,
    onEvidenceError: (error) => {
      observed.push(error);
      throw new Error('observer blew up');
    },
  });
  await pinInstance(fixture);

  const outcome = await fixture.assembly.admitTurn(makeRequest());
  assert.equal(outcome.status, 'admitted', 'observer failure is swallowed with the append failure (V8)');
  assert.equal(fixture.tools.calls.length, 1);
  assert.equal(observed.length, 1);

  await assert.rejects(
    () =>
      fixture.assembly.admitTurn(
        makeRequest({
          definition: makeDefinition({
            approveEffects: [{ effectType: 'effect:unbound', input: {} }],
          }),
        }),
      ),
    (error: unknown) =>
      error instanceof CentralAdmissionError && error.code === 'ADMISSION_EFFECT_TOOL_UNBOUND',
    'the original admission error propagates, never the observer error',
  );
  assert.equal(observed.length, 2);
});

test('assembly: admitTurn on an unpinned instance fails closed without fabricating provenance', async () => {
  const fixture = await assemblyFixture();
  await assert.rejects(
    () => fixture.assembly.admitTurn(makeRequest()),
    (error: unknown) =>
      error instanceof Error && error.name === 'GovernanceExecutionBindingError',
  );
  assert.equal(fixture.evidence.records().length, 0, 'no evidence without exact provenance');
});

test('assembly: missing v0.3 authority ports fail closed at construction', async () => {
  const b1 = await makeBaseline('B1', [CAP_INVARIANT]);
  const baselines = new MemoryGovernanceBaselineStore();
  await baselines.putBody(b1);
  const bindings = createRuntimeHostFake({ sha256 });
  const compiledPackage = await bootablePackage(bindings.sha256);
  const v3 = {
    baselines,
    activationAuthority: new MemoryActivationAuthority(),
    exactPackageCdi: new MemoryPackageCdiAuthority(),
    durableExecution: new MemoryDurableExecutionStore(),
    effectJournal: new VolatileAdmissionEffectJournal(),
    effectTools: new ScriptedEffectTools({}),
    evidence: new VolatileRuntimeEvidenceStore(),
  };
  await assert.rejects(
    () =>
      createDomainRuntimeV3({
        packageRegistry: new StaticPackageRegistry([compiledPackage], compiledPackage.manifest.packageId),
        store: new MemoryRuntimeStore(),
        bindings,
        v3: { ...v3, evidence: undefined } as unknown as CreateDomainRuntimeV3AuthorityOptions,
      }),
    (error: unknown) =>
      error instanceof DomainRuntimeV3Error && error.code === 'RUNTIME_V3_AUTHORITY_REQUIRED',
  );
});
