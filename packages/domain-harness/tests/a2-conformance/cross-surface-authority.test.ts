// Issue #311 / A2 I-008 — INCREMENTAL cross-surface authority regression over
// the A2 surfaces landed in v0.3 at the time of this slice: the DAC
// cross-layer reference adapter (I-002/#305) together with the durable
// observation stream (#312) and generic runtime control (#313).
//
// Per the reviewed dispatch, this slice must ensure #312 observation and #313
// control neither collapse DAC authority distinctions nor acquire
// promotion/selection/binding/activation authority, and must pin the
// adversarial cases those landed surfaces already own (C11 dispatch/acceptance
// != commit at the observation layer; C12/C13 timeout/ambiguity/no-blind-retry
// at the control layer).
//
// It deliberately reuses the #312/#313 in-memory reference stores (VOLATILE
// fixtures, never durability evidence) and adds only the A2 cross-concern
// assertions; single-concern behavior of observation/control stays pinned by
// their own suites. Final I-008 PASS remains gated on I-003..I-007 (DAG #300).
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createDomainRuntime } from '../../src/runtime/index.js';
import { StaticPackageRegistry } from '../../src/package/registry.js';
import { computeCompiledPackageId } from '../../src/package/validation.js';
import { getDacReferenceRole, isDacReference } from '../../src/dac/index.js';
import { adoptRuntimeBindingRef } from '../../src/dac/index.js';
import type { DomainIntelligencePackageIdentity } from '../../src/contracts/domain-data.js';
import type {
  RuntimeHostBindings,
  TargetCompiledDomainPackage,
} from '../../src/v2/index.js';
import type { ScriptExecutorPort } from '../../src/v2/contracts/host.js';
import type {
  RuntimeControlCapability,
  RuntimeControlRequest,
} from '../../src/control/index.js';
import { createRuntimeHostFake } from '../helpers/runtime-host-fake.js';
import { InMemoryObservationStore } from '../observation/in-memory-observation-store.js';
import { InMemoryControlRuntimeStore } from '../control/in-memory-control-runtime-store.js';
import { InMemoryRuntimeControlStore } from '../control/in-memory-runtime-control-store.js';
import { dacInput } from './dac-fixtures.js';

const DOMAIN_ID = 'a2-i008-conformance';
const DAC_ADAPTER_MARKER = 'dac-reference-adapter/1';
/** DAC lifecycle authority nouns no observation/control field may claim. */
const DAC_AUTHORITY_NOUNS = ['promotion', 'selection', 'binding', 'activation'] as const;

function workflow(
  workflowId: string,
  definition: TargetCompiledDomainPackage['manifest']['workflows'][string]['definition'],
  messageTypes: readonly string[],
) {
  return {
    workflowId,
    definition,
    messageContracts: Object.fromEntries(
      messageTypes.map((type) => [type, { type, payloadSchema: {} }]),
    ),
  };
}

function basePackage(): TargetCompiledDomainPackage {
  return {
    manifest: {
      formatVersion: '0.2',
      runtimeContractMajor: 2,
      executionEngineMajor: 2,
      domainId: DOMAIN_ID,
      domainVersion: '1.0.0-a2i008',
      packageId: 'pending',
      targetProfileId: 'a2i008-host@1',
      requiredCapabilities: [],
      workflows: {
        happy: workflow('happy', {
          initial: 'waiting',
          states: {
            waiting: {
              final: false,
              done: [],
              error: [],
              events: { FINISH: { routes: [{ target: 'done' }] } },
            },
            done: { final: true, done: [], error: [], events: {} },
          },
          limits: { maxSteps: 32 },
        }, ['FINISH']),
        poison: workflow('poison', {
          initial: 'waiting',
          states: {
            waiting: {
              final: false,
              invoke: { kind: 'expr', expression: 'explode' },
              done: [],
              error: [],
              events: { BAD: { routes: [{ target: 'waiting' }] } },
            },
          },
          limits: { maxSteps: 32 },
        }, ['BAD']),
        working: workflow('working', {
          initial: 'waiting',
          states: {
            waiting: {
              final: false,
              done: [],
              error: [],
              events: { GO: { routes: [{ target: 'running' }] } },
            },
            running: {
              final: false,
              invoke: { kind: 'tool', ref: 'work' },
              done: [{ target: 'done' }],
              error: [],
              events: {},
            },
            done: { final: true, done: [], error: [], events: {} },
          },
          limits: { maxSteps: 32 },
        }, ['GO']),
      },
      tools: {
        work: {
          toolId: 'work',
          inputSchema: { type: 'object' },
          outputSchema: {
            type: 'object',
            required: ['ok'],
            additionalProperties: false,
            properties: { ok: { type: 'boolean' } },
          },
          effect: 'non-idempotent',
          execution: { kind: 'script@1', bindingId: 'work-binding', digest: 'sha256:work-v1' },
          requiredCapabilities: [],
        },
      },
      projections: {},
      schemas: {},
      bindingDigests: { 'work-binding': 'sha256:work-v1' },
    },
    bindings: { 'work-binding': { kind: 'script@1', opaque: true } },
  };
}

function explodingExpressionHost(): RuntimeHostBindings {
  const base = createRuntimeHostFake();
  return {
    ...base,
    expression: {
      async evaluate(request) {
        if (request.expression === 'explode') {
          throw new Error('injected expression failure');
        }
        return request.input;
      },
    },
  };
}

/** Deterministic script executor that blocks until released and honors the abort signal. */
class BlockingScript implements ScriptExecutorPort {
  readonly started: Promise<void>;
  readonly signalObserved: Promise<void>;
  calls = 0;
  #startedResolve: (() => void) | undefined;
  #signalResolve: (() => void) | undefined;
  #released: Promise<void>;

  constructor() {
    this.started = new Promise((resolve) => {
      this.#startedResolve = resolve;
    });
    this.signalObserved = new Promise((resolve) => {
      this.#signalResolve = resolve;
    });
    this.#released = new Promise((resolve) => {
      this.release = resolve;
    });
  }

  release: () => void = () => {};

  async execute(request: { signal?: AbortSignal; input: unknown }): Promise<{ ok: boolean }> {
    this.calls += 1;
    this.#startedResolve?.();
    if (request.signal !== undefined) {
      await Promise.race([
        this.#released,
        new Promise<never>((_, reject) => {
          request.signal!.addEventListener('abort', () => {
            this.#signalResolve?.();
            reject(new Error('aborted by runtime control signal'));
          });
        }),
      ]);
    } else {
      this.#signalResolve?.();
      await this.#released;
    }
    return { ok: true };
  }
}

/** Recursively collects every object key reachable from a value. */
function reachableKeys(value: unknown, into: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) reachableKeys(item, into);
    return into;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      into.add(key);
      reachableKeys(child, into);
    }
  }
  return into;
}

/**
 * No adopted DAC reference is minted inside `value`. Marker-only: observation
 * records may legitimately CARRY host-provided opaque DAC provenance strings
 * (by design), but can never originate an adopted reference themselves.
 */
function assertNoMintedDacReference(value: unknown, label: string): void {
  const serialized = JSON.stringify(value);
  assert.ok(
    serialized === undefined || !serialized.includes(DAC_ADAPTER_MARKER),
    `${label} must not mint adopted DAC references`,
  );
}

/**
 * Stronger than the marker scan: the control surface has no legitimate DAC
 * lifecycle surface at all — no field of any reachable object may even claim
 * promotion/selection/binding/activation authority.
 */
function assertNoDacLifecycleAuthority(value: unknown, label: string): void {
  assertNoMintedDacReference(value, label);
  for (const noun of DAC_AUTHORITY_NOUNS) {
    const offenders = [...reachableKeys(value)].filter((key) => key.toLowerCase().includes(noun));
    assert.deepEqual(
      offenders,
      [],
      `${label} must carry no DAC ${noun} authority field (offending keys: ${offenders.join(', ')})`,
    );
  }
}

// --------------------------------------------------- source-level separation

test('a2 x-surface boundary: #312 observation and #313 control never import the DAC adapter, and vice versa', () => {
  const srcRoot = fileURLToPath(new URL('../../src/', import.meta.url));
  const sources = (dir: string): readonly string[] =>
    readdirSync(`${srcRoot}${dir}`, { withFileTypes: true }).map((entry) =>
      readFileSync(`${srcRoot}${dir}/${entry.name}`, 'utf8'),
    );
  for (const text of [...sources('observation'), ...sources('control')]) {
    assert.ok(!/from\s+['"][^'"]*\/dac\//.test(text), 'observation/control must not import src/dac');
    for (const row of ['adoptPromotionDecisionRef', 'adoptApplicationSelectionRef',
      'adoptSelectedDomainDataRef', 'adoptRuntimeContractRef', 'adoptRuntimeImplementationRef',
      'adoptCompatibilityTargetRef', 'adoptRuntimeBindingRef', 'adoptRuntimeActivationRef']) {
      assert.ok(!text.includes(row), `observation/control must not mint DAC refs (${row})`);
    }
  }
  for (const text of sources('dac')) {
    assert.ok(!/from\s+['"][^'"]*(observation|control)/.test(text), 'src/dac must stay leaf-only');
  }
});

// ------------------------------------------------- observation x DAC opacity

test('a2 x-surface: DAC binding/activation provenance carried by the observation stream stays an opaque uninterpreted string', async () => {
  const store = new InMemoryObservationStore();
  // The host already holds DAC evidence; it hands the stream string refs.
  // A DAC-ref-shaped JSON string is indistinguishable from any other host
  // string to the observation contract — that is exactly what must be proven.
  const bindingRef = adoptRuntimeBindingRef(dacInput() as never);
  const bindingString = JSON.stringify(bindingRef);
  assert.ok(bindingString.includes(DAC_ADAPTER_MARKER), 'fixture must carry the DAC marker');
  const activationString = 'a2://activation/host-held-evidence-7';

  const compiled = basePackage();
  const bindings = createRuntimeHostFake();
  compiled.manifest.packageId = await computeCompiledPackageId(compiled.manifest, bindings.sha256);
  const runtime = await createDomainRuntime({
    packageRegistry: new StaticPackageRegistry([compiled], compiled.manifest.packageId),
    store,
    bindings,
    observation: {
      mode: 'enabled',
      runtimeBindingRef: bindingString,
      runtimeActivationRef: activationString,
    },
  });
  const target = { workflowId: 'happy', instanceKey: 'u1' };
  await runtime.openInstance({ address: target, correlationId: 'c1', input: {} });

  const capability = runtime.observation;
  assert.ok(capability !== undefined && capability.status === 'ENABLED');
  const page = await capability.readObservations({
    stream: {
      target,
      package: {
        domainId: DOMAIN_ID,
        version: '1.0.0-a2i008',
        packageId: compiled.manifest.packageId,
        contentDigest: compiled.manifest.packageId,
        formatVersion: '0.2',
        runtimeContractMajor: 2,
        executionEngineMajor: 2,
        requiredCapabilities: [],
      } satisfies DomainIntelligencePackageIdentity,
      epochId: '1',
    },
  });
  assert.ok(page.records.length >= 1);
  for (const record of page.records) {
    // Carried verbatim — byte-for-byte the host string, never parsed,
    // re-minted or structurally interpreted.
    assert.equal(record.stream.runtimeBindingRef, bindingString);
    assert.equal(record.stream.runtimeActivationRef, activationString);
    assert.equal(typeof record.stream.runtimeBindingRef, 'string');
    // The stream field itself is not and does not become an adopted reference.
    assert.equal(isDacReference(record.stream.runtimeBindingRef), false);
    assert.equal(getDacReferenceRole(record.stream.runtimeBindingRef), undefined);
  }
  await runtime.dispose();
});

test('a2 x-surface: reading observations confers no transition or mutation authority', async () => {
  const store = new InMemoryObservationStore();
  const compiled = basePackage();
  const bindings = createRuntimeHostFake();
  compiled.manifest.packageId = await computeCompiledPackageId(compiled.manifest, bindings.sha256);
  const runtime = await createDomainRuntime({
    packageRegistry: new StaticPackageRegistry([compiled], compiled.manifest.packageId),
    store,
    bindings,
    observation: { mode: 'enabled' },
  });
  const target = { workflowId: 'happy', instanceKey: 'u2' };
  await runtime.openInstance({ address: target, correlationId: 'c1', input: {} });
  await runtime.send({ messageId: 'f1', target, type: 'FINISH', payload: {} });
  await runtime.awaitIdle();

  const capability = runtime.observation;
  assert.ok(capability !== undefined && capability.status === 'ENABLED');
  const stream = {
    target,
    package: {
      domainId: DOMAIN_ID,
      version: '1.0.0-a2i008',
      packageId: compiled.manifest.packageId,
      contentDigest: compiled.manifest.packageId,
      formatVersion: '0.2',
      runtimeContractMajor: 2,
      executionEngineMajor: 2,
      requiredCapabilities: [],
    } satisfies DomainIntelligencePackageIdentity,
    epochId: '1',
  };
  const first = await capability.readObservations({ stream });
  const before = await runtime.query({ kind: 'instance', target });
  const second = await capability.readObservations({ stream });

  // Pure evidence reads: no state transition, no new records, no authority.
  assert.equal(second.records.length, first.records.length);
  assert.equal(second.highWatermark, first.highWatermark);
  assert.equal(before.kind, 'instance');
  const instance = (before as { value?: { stateRevision?: number; lifecycle?: string } }).value;
  const after = await runtime.query({ kind: 'instance', target });
  const instanceAfter = (after as { value?: { stateRevision?: number; lifecycle?: string } }).value;
  assert.equal(instanceAfter?.stateRevision, instance?.stateRevision);
  assert.equal(instanceAfter?.lifecycle, instance?.lifecycle);
  assertNoMintedDacReference(second, 'observation page');
  await runtime.dispose();
});

// ------------------------------------------- C11 / N13 at the observation layer

test('a2 C11/N13 (observation layer): message acceptance never fabricates a turn commit', async () => {
  const store = new InMemoryObservationStore();
  const compiled = basePackage();
  const bindings = explodingExpressionHost();
  compiled.manifest.packageId = await computeCompiledPackageId(compiled.manifest, bindings.sha256);
  const runtime = await createDomainRuntime({
    packageRegistry: new StaticPackageRegistry([compiled], compiled.manifest.packageId),
    store,
    bindings,
    observation: { mode: 'enabled' },
  });
  const target = { workflowId: 'poison', instanceKey: 'u3' };
  await runtime.openInstance({ address: target, correlationId: 'c3', input: {} });
  // The message is ACCEPTED (dispatch into the durable mailbox) and its turn
  // then fails: acceptance and commit are separate durable facts.
  await runtime.send({ messageId: 'bad1', target, type: 'BAD', payload: {} });
  await runtime.awaitIdle();

  const capability = runtime.observation;
  assert.ok(capability !== undefined && capability.status === 'ENABLED');
  const page = await capability.readObservations({
    stream: {
      target,
      package: {
        domainId: DOMAIN_ID,
        version: '1.0.0-a2i008',
        packageId: compiled.manifest.packageId,
        contentDigest: compiled.manifest.packageId,
        formatVersion: '0.2',
        runtimeContractMajor: 2,
        executionEngineMajor: 2,
        requiredCapabilities: [],
      } satisfies DomainIntelligencePackageIdentity,
      epochId: '1',
    },
  });
  const kinds = page.records.map((record) => record.kind);
  assert.deepEqual(kinds, ['INSTANCE_OPENED', 'MESSAGE_ACCEPTED', 'TURN_RECOVERY_REQUIRED']);
  // No record anywhere in the page claims the accepted message committed.
  for (const record of page.records) {
    assert.notEqual(record.kind, 'TURN_COMMITTED');
    assert.notEqual(record.kind, 'RECOVERY_COMMITTED');
  }
  assert.ok(!JSON.stringify(page).includes('"TURN_COMMITTED"'));
  await runtime.dispose();
});

// ------------------------------------- C12 / C13 / N14 / N15 at the control layer

test('a2 C12/C13/N14/N15 (control layer): an unresolved non-idempotent effect stays ambiguous — no fabricated commit, non-commit, or blind retry', async () => {
  const runtimeStore = new InMemoryControlRuntimeStore();
  const controlStore = new InMemoryRuntimeControlStore();
  const script = new BlockingScript();
  const bindings: RuntimeHostBindings = { ...createRuntimeHostFake(), script };
  const compiled = basePackage();
  compiled.manifest.packageId = await computeCompiledPackageId(compiled.manifest, bindings.sha256);
  const runtime = await createDomainRuntime({
    packageRegistry: new StaticPackageRegistry([compiled], compiled.manifest.packageId),
    store: runtimeStore,
    bindings,
    control: {
      mode: 'enabled',
      authorizer: {
        async authorize() {
          return {
            status: 'AUTHORIZED',
            authorizationRef: 'auth-a2i008',
            policyRevision: 'policy-a2i008',
          };
        },
      },
      store: controlStore,
    },
  });
  const control: RuntimeControlCapability = runtime.control as RuntimeControlCapability;
  const workAddress = { workflowId: 'working', instanceKey: 'w1' };
  await runtime.openInstance({ address: workAddress, correlationId: 'c1', input: {} });
  await runtime.send({ messageId: 'go-1', target: workAddress, type: 'GO', payload: {} });
  await script.started;

  // Interrupt while the non-idempotent external effect is in flight: the
  // outcome must preserve the ambiguity (N14) — it can neither claim the
  // external effect committed nor that it did not happen.
  const receipt = await control.requestControl({
    controlRequestId: 'a2-ctl-1',
    callerRef: 'simulator:t126',
    action: 'INTERRUPT',
    target: { target: workAddress },
    reason: 'a2 i-008 adversarial: ambiguous external effect',
  });
  assert.equal(receipt.outcome, 'REQUIRES_RECONCILIATION');

  const record = await controlStore.getRequest('a2-ctl-1');
  assert.ok(record !== null);
  const evidence = record.effectEvidence?.[0];
  assert.ok(evidence !== undefined);
  assert.equal(evidence.semantics, 'non-idempotent');
  assert.equal(evidence.durableStatus, 'started');
  // The effect journal — not the control record — stays the authority, and it
  // records neither a fabricated completion nor a fabricated failure.
  const journal = await runtimeStore.getEffect(evidence.effectId);
  assert.ok(journal !== null);
  assert.equal(journal.status, 'started');
  const instance = await runtimeStore.getInstance(workAddress);
  assert.equal(instance?.lifecycle, 'recovery_required');
  assert.notEqual(instance?.lifecycle, 'cancelled');

  // N15: an exact-duplicate reissue must not blindly re-execute the
  // ambiguous external effect while it is unresolved.
  const attemptsBefore = script.calls;
  const duplicate = await control.requestControl({
    controlRequestId: 'a2-ctl-1',
    callerRef: 'simulator:t126',
    action: 'INTERRUPT',
    target: { target: workAddress },
    reason: 'a2 i-008 adversarial: ambiguous external effect',
  });
  assert.equal(duplicate.disposition, 'DUPLICATE');
  assert.equal(script.calls, attemptsBefore);

  // The control record is control evidence only: no DAC lifecycle authority
  // is minted anywhere on the control path.
  assertNoDacLifecycleAuthority(receipt.record, 'control record');
  await runtime.dispose();
});

test('a2 x-surface: control authorization is admission-only and mints no DAC lifecycle authority', async () => {
  const runtimeStore = new InMemoryControlRuntimeStore();
  const controlStore = new InMemoryRuntimeControlStore();
  const script = new BlockingScript();
  const bindings: RuntimeHostBindings = { ...createRuntimeHostFake(), script };
  const compiled = basePackage();
  compiled.manifest.packageId = await computeCompiledPackageId(compiled.manifest, bindings.sha256);
  const runtime = await createDomainRuntime({
    packageRegistry: new StaticPackageRegistry([compiled], compiled.manifest.packageId),
    store: runtimeStore,
    bindings,
    control: {
      mode: 'enabled',
      authorizer: {
        async authorize() {
          return {
            status: 'AUTHORIZED',
            authorizationRef: 'auth-a2i008-idle',
            policyRevision: 'policy-a2i008',
          };
        },
      },
      store: controlStore,
    },
  });
  const control = runtime.control;
  assert.ok(control !== undefined);
  const idleAddress = { workflowId: 'happy', instanceKey: 'u4' };
  await runtime.openInstance({ address: idleAddress, correlationId: 'c4', input: {} });

  const request: RuntimeControlRequest = {
    controlRequestId: 'a2-ctl-2',
    callerRef: 'operator:console',
    action: 'CANCEL',
    target: { target: idleAddress },
    reason: 'a2 i-008: admission must not become lifecycle authority',
  };
  const receipt = await control.requestControl(request);
  assert.equal(receipt.disposition, 'ACCEPTED');
  assert.equal(receipt.outcome, 'CANCELLED_AT_SAFE_BOUNDARY');

  // An AUTHORIZED decision admitted one control request; it did not select,
  // bind or activate any Domain Data. Authorization evidence is an opaque
  // host string, never an adopted DAC reference.
  const authorized = receipt.record.authorization;
  assert.equal(authorized.decision, 'AUTHORIZED');
  assert.equal(typeof authorized.authorizationRef, 'string');
  assert.equal(isDacReference(authorized), false);
  assertNoDacLifecycleAuthority(receipt.record, 'control record');
  assertNoDacLifecycleAuthority(await controlStore.getRequest('a2-ctl-2'), 'durable control record');
  await runtime.dispose();
});
