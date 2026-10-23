/**
 * #1003 FR07-KH2 — selected Kernel bounded continuation contract
 * (B2 trusted model-call aggregate, B4 absolute MAX_FR07_STEPS, K-owned
 * query authorization, B3 latch input shape).
 * =====================================================================
 *
 * Contract tests for the PHYSICAL selected Kernel payload and the PHYSICAL
 * selected Standard SDK payload, both imported from their exact sealed
 * BYTES (data-URL import — the installer discipline), never from a build
 * artifact. The S side is the merged FR07-S1 `invokeStep` (PR #1022)
 * bound to a test ModelPort through the real `createHostBoundModelResolver`
 * factory. The physical Host/SQLite/gateway journey lives in
 * packages/domain-harness/tests/v08-integration/fr07-kh2-continuation-physical.test.ts;
 * this file covers the K-local boundaries that are cheaper and more
 * exhaustive to falsify here:
 *
 *   - B4: every non-integer / out-of-range sealed `maxSteps` fails typed at
 *     WIRING (trusted load boundary) before any ModelPort/query/admission
 *     activity; MAX_FR07_STEPS itself is accepted; MAX+1 is not;
 *   - the wiring snapshot of the harness policy is authoritative: live
 *     mutation after wiring cannot raise the budget or add a capability;
 *   - malformed capability descriptors fail typed at wiring;
 *   - B2: K accepts per-step evidence ONLY in the exact trusted shape
 *     (`measured` count 1 per physical turn, or `unmeasured`); a forged
 *     step count fails closed before admission; `unmeasured` never becomes
 *     numeric; the legacy numeric `freshModelCallCount` never reaches the
 *     admitted resolver evidence;
 *   - an invalid model query input is an ordinary observation (bounded
 *     recovery), never a K read;
 *   - an SDK endpoint without the step surface refuses typed with zero
 *     activity; a malformed cancellation control refuses typed.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

function readPayload(name: string): string {
  const dir = name === 'kernel-mechanism-v1.mjs' ? 'kernel/basic' : 'standard/basic';
  return readFileSync(fileURLToPath(new URL(`../../../domain-packages/${dir}/${name}`, import.meta.url)), 'utf8');
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function importSource(source: string): Promise<Record<string, any>> {
  return import('data:text/javascript;base64,' + Buffer.from(source, 'utf8').toString('base64'));
}

const KERNEL_SOURCE = readPayload('kernel-mechanism-v1.mjs');
const SDK_SOURCE = readPayload('standard-sdk-v1.mjs');
const kernel = await importSource(KERNEL_SOURCE);
const sdk = await importSource(SDK_SOURCE);

const NOW = '2026-10-14T00:00:00.000Z';
const TARGET = { workflowId: 'continuation-quote', instanceKey: 'unit:1' };

// ---------------------------------------------------------------------------
// FIXTURE Host primitives (TEST ONLY — the physical SQLite proof is the
// domain-harness v08-integration FR07 file).
// ---------------------------------------------------------------------------

function memoryDocs() {
  const docs = new Map<string, { value: any; revision: number }>();
  const reads: string[] = [];
  const clone = (value: any) => JSON.parse(JSON.stringify(value));
  return {
    reads,
    async get(key: string) {
      reads.push(key);
      const doc = docs.get(key);
      return doc === undefined ? null : { value: clone(doc.value), revision: doc.revision };
    },
    async put(key: string, value: any, conditions: Record<string, unknown> = {}) {
      const existing = docs.get(key);
      if (conditions.mustBeAbsent === true && existing !== undefined) {
        throw Object.assign(new Error(`host doc ${key} exists`), { code: 'HOST_KEY_EXISTS' });
      }
      if (conditions.mustMatchRevision !== undefined && existing?.revision !== conditions.mustMatchRevision) {
        throw Object.assign(new Error(`host doc ${key} CAS conflict`), { code: 'HOST_CAS_CONFLICT' });
      }
      const revision = existing === undefined ? 0 : existing.revision + 1;
      docs.set(key, { value: clone(value), revision });
      return { revision };
    },
    async list(prefix: string) {
      return [...docs.keys()].filter((key) => key.startsWith(prefix)).sort();
    },
  };
}

function hostPorts() {
  const resourceCalls: unknown[] = [];
  return {
    docs: memoryDocs(),
    sha256: { async digestUtf8(value: string) { return sha256Hex(value); } },
    resources: {
      async call(_resourceKey: string, _operation: string, payload: unknown) {
        resourceCalls.push(payload);
        return { reserved: true };
      },
    },
    clock: () => NOW,
    resourceCalls,
  };
}

/** Real S bytes: the merged FR07-S1 resolver bound to a scripted port. */
function sdkEndpoint(script: (input: any) => unknown, options: Record<string, unknown> = {}) {
  const calls: any[] = [];
  const resolver = sdk.createHostBoundModelResolver({
    invoke: async (request: { operation: string; input: unknown }) => {
      const input = JSON.parse(JSON.stringify(request.input));
      calls.push(input);
      return script(input);
    },
  }, options);
  return {
    calls,
    endpoint: {
      packageId: 'standard-sdk@v08.1.0.0',
      interpret: (declaration: unknown, input: unknown, context: unknown) => resolver.interpret(declaration, input, context),
      invokeStep: (declaration: unknown, input: unknown, context: unknown) => resolver.invokeStep(declaration, input, context),
    },
  };
}

const definition = {
  workflowKey: 'continuation-quote',
  initialState: 'review',
  initialContext: {},
  guards: [{ guardId: 'guard:ok', predicate: { op: 'constant', value: true } }],
  states: [
    {
      stateKey: 'review',
      transitions: [
        {
          transitionKey: 'approve',
          trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
          targetState: 'approved',
          guardId: 'guard:ok',
          effectIntents: [],
        },
      ],
    },
    { stateKey: 'approved', kind: 'final' },
  ],
};

function harness(overrides: Record<string, unknown> = {}) {
  return {
    maxSteps: 3,
    capabilities: {
      'quote.readCustomer': { mode: 'read', source: 'instance-context', fields: { tier: 'customerTier' }, outputSchema: { tier: 'string' } },
      'quote.reserveFunds': { mode: 'mutation' },
    },
    allowedOutcomes: ['approve-quote'],
    allowedEvents: ['QUOTE_DECIDED'],
    ...overrides,
  };
}

function businessPolicy(harnessPolicy: unknown) {
  return {
    packageId: 'business-unit@v08.1.0.0',
    policyId: 'unit-continuation',
    domainId: 'orders',
    workflowDefinition: definition,
    decisionSchema: { isValid: (value: any) => typeof value?.decision?.outcome === 'string' && typeof value?.event?.type === 'string' },
    governanceSemantics: { hardInvariants: [] },
    initialStateKey: 'review',
    initialContext: { customerTier: 'gold' },
    rules: {
      'rule:harness': { kind: 'model-decision', id: 'rule:harness', modelOperation: 'quote.continue', harness: harnessPolicy },
      'rule:plain': { ruleId: 'rule:plain', eventType: 'QUOTE_DECIDED', payloadFromInput: { amount: 'amount' } },
    },
    intentBindings: {
      submitHarness: { trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' }, ruleId: 'rule:harness' },
      submitPlain: { trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' }, ruleId: 'rule:plain' },
    },
    effectBindings: {},
  };
}

function runtime(policy: any, endpoint: any, ports = hostPorts()) {
  return {
    ports,
    runtime: kernel.createOccurrenceRuntime({
      moduleIdentity: { packageId: kernel.MODULE_ID, moduleSha256: sha256Hex(KERNEL_SOURCE) },
      hostPorts: ports,
      sdkEndpoint: endpoint,
      businessEndpoint: policy,
    }),
  };
}

function final(): unknown {
  return {
    kind: 'final',
    result: { decision: { outcome: 'approve-quote', data: {} }, event: { type: 'QUOTE_DECIDED', payload: {} } },
  };
}

async function opened(policy: any, endpoint: any) {
  const built = runtime(policy, endpoint);
  await built.runtime.openInstance({ target: TARGET });
  return built;
}

function intent(intentType = 'submitHarness', input: Record<string, unknown> = {}) {
  return { intentType, messageId: `m:${intentType}`, target: TARGET, input };
}

// ---------------------------------------------------------------------------
// B4 — absolute K ceiling
// ---------------------------------------------------------------------------

test('B4: MAX_FR07_STEPS is an immutable K constant (exported data, not a Business choice)', () => {
  assert.equal(kernel.MAX_FR07_STEPS, 8);
  assert.throws(() => { (kernel as Record<string, unknown>).MAX_FR07_STEPS = 64; }, TypeError, 'an ESM namespace binding cannot be reassigned');
  assert.equal(kernel.MAX_FR07_STEPS, 8);
});

test('B4-N: 0 / negative / fraction / non-finite / string / MAX+1 maxSteps fail typed at WIRING with zero activity', () => {
  for (const maxSteps of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '3', kernel.MAX_FR07_STEPS + 1, undefined]) {
    const { endpoint, calls } = sdkEndpoint(() => final());
    const ports = hostPorts();
    assert.throws(
      () => runtime(businessPolicy(harness({ maxSteps })), endpoint, ports),
      (error: { code?: string }) => error.code === 'CONTINUATION_MAX_STEPS_INVALID',
      `maxSteps=${String(maxSteps)}`,
    );
    assert.equal(calls.length, 0);
    assert.equal(ports.docs.reads.length, 0);
    assert.equal(ports.resourceCalls.length, 0);
  }
});

test('B4-P: maxSteps = MAX_FR07_STEPS is accepted and bounds the loop exactly', async () => {
  const { endpoint, calls } = sdkEndpoint(() => ({ kind: 'query', call: { capabilityId: 'quote.readCustomer', input: {} } }));
  const { runtime: rt } = await opened(businessPolicy(harness({ maxSteps: kernel.MAX_FR07_STEPS })), endpoint);
  const receipt = await rt.submitOccurrence(intent());
  assert.equal(receipt.status, 'terminated');
  assert.equal(receipt.terminal.code, 'MAX_STEPS_EXHAUSTED');
  assert.equal(calls.length, kernel.MAX_FR07_STEPS);
  assert.equal(rt.counters.journalBegins, 0);
  assert.equal(rt.counters.engineCommits, 0);
});

test('wiring snapshot is authoritative: live mutation after wiring cannot raise the budget or add capabilities', async () => {
  const policy = businessPolicy(harness({ maxSteps: 1 }));
  const { endpoint, calls } = sdkEndpoint((input) => (input.step === 1
    ? { kind: 'query', call: { capabilityId: 'quote.injected', input: {} } }
    : final()));
  const { runtime: rt } = await opened(policy, endpoint);
  const rule = policy.rules['rule:harness'] as any;
  rule.harness.maxSteps = 8;
  rule.harness.capabilities['quote.injected'] = { mode: 'read', source: 'instance-context', fields: { tier: 'customerTier' } };
  const receipt = await rt.submitOccurrence(intent());
  assert.equal(receipt.status, 'terminated');
  assert.equal(receipt.terminal.code, 'UNKNOWN_CAPABILITY', 'the injected capability was never wired');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].maxSteps, 1, 'the wired budget is advertised, not the mutated one');
});

test('malformed harness declarations fail typed at wiring', () => {
  const bad: unknown[] = [
    'not-an-object',
    harness({ capabilities: {} }),
    harness({ capabilities: { 'quote.x': { mode: 'execute' } } }),
    harness({ capabilities: { 'quote.x': { mode: 'read', source: 'host-docs', fields: { a: 'b' } } } }),
    harness({ capabilities: { 'quote.x': { mode: 'read', source: 'instance-context', fields: {} } } }),
    harness({ capabilities: { 'quote.x': { mode: 'read', source: 'instance-context', fields: { a: 'b' }, outputSchema: { a: 'date' } } } }),
    harness({ capabilities: { 'quote.x': { mode: 'mutation', fields: { a: 'b' } } } }),
    harness({ capabilities: { 'quote.x': { mode: 'read', source: 'instance-context', fields: { a: 'b' }, execute: 'x' } } }),
    harness({ allowedOutcomes: [] }),
    harness({ allowedEvents: ['ok', 7] }),
    harness({ extra: true }),
  ];
  for (const harnessPolicy of bad) {
    const { endpoint } = sdkEndpoint(() => final());
    assert.throws(
      () => runtime(businessPolicy(harnessPolicy), endpoint),
      (error: { code?: string }) => error.code === 'CONTINUATION_DECLARATION_INVALID',
      JSON.stringify(harnessPolicy),
    );
  }
});

// ---------------------------------------------------------------------------
// B2 — trusted model-call evidence aggregate
// ---------------------------------------------------------------------------

test('B2: unmeasured Host metering aggregates to unmeasured — never a number', async () => {
  const { endpoint } = sdkEndpoint((input) => (input.step === 1
    ? { kind: 'query', call: { capabilityId: 'quote.readCustomer', input: {} } }
    : final()), { metering: 'unmeasured' });
  const { runtime: rt } = await opened(businessPolicy(harness()), endpoint);
  const receipt = await rt.submitOccurrence(intent());
  assert.equal(receipt.status, 'admitted');
  assert.deepEqual(receipt.admitted.resolver.modelCallEvidence, { status: 'unmeasured' });
});

test('B2-N: a forged per-step count from the step surface fails closed before admission', async () => {
  const forged = {
    packageId: 'forged-sdk',
    interpret: () => { throw new Error('unused'); },
    invokeStep: async () => ({
      ...(final() as object),
      structuredDecision: { decision: { outcome: 'approve-quote', data: {} }, event: { type: 'QUOTE_DECIDED', payload: {} } },
      source: 'host-model-port',
      llmAvoided: false,
      modelCallEvidence: { status: 'measured', count: 5, scope: 'bound-model-port-invocations' },
    }),
  };
  const { runtime: rt } = await opened(businessPolicy(harness()), forged);
  await assert.rejects(rt.submitOccurrence(intent()), (error: { code?: string }) => error.code === 'CONTINUATION_MODEL_EVIDENCE_INVALID');
  assert.equal(rt.counters.journalBegins, 0);
  assert.equal(rt.counters.engineCommits, 0);
});

test('B2: the legacy numeric freshModelCallCount never reaches admitted resolver evidence', async () => {
  const legacy = {
    packageId: 'legacy-sdk',
    interpret: () => ({
      source: 'harness-machine',
      structuredDecision: { decision: { outcome: 'decide', data: {} }, event: { type: 'QUOTE_DECIDED', payload: {} } },
      freshModelCallCount: 1,
      llmAvoided: true,
      cacheDisposition: { read: 'disabled' },
      telemetry: [],
    }),
  };
  const { runtime: rt } = await opened(businessPolicy(harness()), legacy);
  const receipt = await rt.submitOccurrence(intent('submitPlain', { amount: 1 }));
  assert.equal(receipt.status, 'admitted');
  assert.equal('freshModelCallCount' in receipt.admitted.resolver, false);
  assert.deepEqual(receipt.admitted.resolver.modelCallEvidence, { status: 'unsupported' }, 'no structured trusted evidence ⇒ unsupported, never a fabricated measurement');
});

test('B2: the real S model-free path stays honest — measured(0) scoped to the bound port', async () => {
  const { endpoint } = sdkEndpoint(() => final());
  const { runtime: rt } = await opened(businessPolicy(harness()), endpoint);
  const receipt = await rt.submitOccurrence(intent('submitPlain', { amount: 1 }));
  assert.equal(receipt.status, 'admitted');
  assert.deepEqual(receipt.admitted.resolver.modelCallEvidence, { status: 'measured', count: 0, scope: 'bound-model-port-invocations' });
});

// ---------------------------------------------------------------------------
// K-owned query authorization edges
// ---------------------------------------------------------------------------

test('an invalid model query input is an ordinary observation (recoverable), never a K read', async () => {
  const { endpoint, calls } = sdkEndpoint((input) => (input.step === 1
    ? { kind: 'query', call: { capabilityId: 'quote.readCustomer', input: { fields: ['undeclared'] } } }
    : final()));
  const { runtime: rt, ports } = await opened(businessPolicy(harness()), endpoint);
  const readsBefore = ports.docs.reads.length;
  const receipt = await rt.submitOccurrence(intent());
  assert.equal(receipt.status, 'admitted');
  assert.deepEqual(calls[1].observations, [
    { step: 1, capabilityId: 'quote.readCustomer', ok: false, error: { code: 'QUERY_INPUT_INVALID' } },
  ]);
  const instanceReads = ports.docs.reads.slice(readsBefore).filter((key) => key.startsWith('v08-kernel:wf-instance:'));
  assert.equal(instanceReads.length, 4, 'lane start + admission-fence freshness read (v0.8.1 R02) + two commit reads; the refused query never read');
});

test('an SDK endpoint without the step surface refuses typed with zero activity', async () => {
  const noStep = { packageId: 'plain-sdk', interpret: sdk.interpret };
  const { runtime: rt } = await opened(businessPolicy(harness()), noStep);
  await assert.rejects(rt.submitOccurrence(intent()), (error: { code?: string }) => error.code === 'CONTINUATION_STEP_ENDPOINT_UNAVAILABLE');
  assert.equal(rt.counters.journalBegins, 0);
});

test('B3: a malformed cancellation control refuses typed before the lane', async () => {
  const { endpoint, calls } = sdkEndpoint(() => final());
  const { runtime: rt } = await opened(businessPolicy(harness()), endpoint);
  for (const control of [{ signal: {} }, { signal: { aborted: 'no', addEventListener() {}, removeEventListener() {} } }, 'cancel']) {
    await assert.rejects(rt.submitOccurrence(intent(), control), (error: { code?: string }) => error.code === 'OCCURRENCE_CONTROL_INVALID');
  }
  assert.equal(calls.length, 0);
});

test('B3: an already-aborted signal terminates CANCELLED before any model turn', async () => {
  const { endpoint, calls } = sdkEndpoint(() => final());
  const { runtime: rt } = await opened(businessPolicy(harness()), endpoint);
  const controller = new AbortController();
  controller.abort();
  const receipt = await rt.submitOccurrence(intent(), { signal: controller.signal });
  assert.equal(receipt.status, 'terminated');
  assert.equal(receipt.terminal.code, 'CANCELLED');
  assert.equal(calls.length, 0);
  assert.equal(rt.counters.journalBegins, 0);
});
