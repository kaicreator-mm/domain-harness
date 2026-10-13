/**
 * V08-FR07-S1 — Standard SDK single-step query/final envelope contract
 * (T-D #1003 slice 1, admission comment IC_kwDOUd_jbM8AAAABbk-L8Q;
 * adopted runtime contract #1003@6122627750 §4.2; adversarial review
 * #1003@6130723310 — B2 aggregate/B3 cancellation/B4 maxSteps stay KH2).
 *
 * Historic v0.7 envelope pins (@86110c616b8cb18c730553e4cdab7ef555214521):
 *   harness/harness-machine.ts            f2fe5d49138be550555e6b88863961778cb2ce0f
 *   tests/harness/business-harness-machine.test.ts
 *                                         0c5622b5206ec15622f3ad706c67a4545f6e418b
 * Retained observable semantics: parseModelEnvelope / parseQueryCall /
 * parseStructuredResult exact-key shapes —
 *   {kind:'query', call:{capabilityId,input}}
 *   {kind:'final', result:{decision:{outcome,data}, event:{type,payload}}}
 *
 * v0.8 sealed-module scope (documented delta; NO v0.7 ABI promise):
 *   - the step surface is an ADDITIVE resolver method `invokeStep`; the
 *     Kernel does not select it yet (disabled/unselected extension until
 *     K owns the bounded continuation loop in the FR07 K/H successor);
 *   - S executes exactly ONE physical ModelPort invocation per step and
 *     parses the output into a data-only envelope plus trusted per-step
 *     modelCallEvidence measured ONLY from that observed bound-port call;
 *   - S never executes the query, never reads Host storage, never commits
 *     state/effect/journal: the query call is an inert proposal for
 *     K-owned authorization (KH2), and authority/effect/provenance fields
 *     in the model output fail closed typed;
 *   - no cancellation signal, no maxSteps, no continuation: those belong
 *     to the K/H successor per the admission comment.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  ABI_VERSION, ENDPOINTS, MODULE_ID, STANDARD_KINDS,
  StandardSdkError, interpret, createHostBoundModelResolver,
} from '../src/qualified-package/payload/standard-sdk-v1.mjs';
import { qualifyPackageClosure } from '../src/qualified-package/qualify.js';

const MEASURED_ONE = { status: 'measured', count: 1, scope: 'bound-model-port-invocations' };
const STEP_PLAN = { id: 'decision:quote-step', kind: 'model-decision', modelOperation: 'quote.advise' };

const QUERY_OUTPUT = {
  kind: 'query',
  call: { capabilityId: 'capability:quote-read', input: { requestId: 'Q-9' } },
};
const FINAL_OUTPUT = {
  kind: 'final',
  result: {
    decision: { outcome: 'model-proposed', data: { amount: 30 } },
    event: { type: 'MODEL_QUOTE_DECIDED', payload: { requestId: 'Q-9' } },
  },
};

async function refusedAsync(code: string, execute: () => Promise<unknown>): Promise<void> {
  await assert.rejects(execute, (error: unknown) => error instanceof StandardSdkError && error.code === code);
}

function spyPort(responses: unknown[]) {
  const calls: { operation: string; input: unknown }[] = [];
  const port = {
    calls,
    invoke: async (request: { operation: string; input: unknown }) => {
      calls.push({ operation: request.operation, input: request.input });
      const response = responses[Math.min(calls.length - 1, responses.length - 1)];
      if (response instanceof Error) throw response;
      return response;
    },
  };
  return port;
}

/** No callable and no Host object may hide anywhere inside an S envelope. */
function assertInertData(value: unknown, port: object, path = '$'): void {
  if (typeof value === 'function') {
    throw new Error(`envelope carries a callable at ${path}`);
  }
  assertNeverReaches(value, port, path);
}

/** The raw ModelPort object must be unreachable from any nested value. */
function assertNeverReaches(value: unknown, port: object, path = '$'): void {
  assert.notEqual(value, port, `envelope reaches the raw ModelPort at ${path}`);
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNeverReaches(item, port, `${path}[${index}]`));
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) assertNeverReaches(item, port, `${path}.${key}`);
  }
}

test('V08-FR07-S1-P1 one model turn returning the query envelope yields an inert data step with trusted measured(1)', async () => {
  const port = spyPort([QUERY_OUTPUT]);
  const bound = createHostBoundModelResolver(port);
  const step = await bound.invokeStep(STEP_PLAN, { amount: 30, requestId: 'Q-9' }) as Record<string, unknown>;

  assert.deepEqual(Object.keys(step).sort(), ['cacheDisposition', 'call', 'kind', 'llmAvoided', 'modelCallEvidence', 'provenance', 'source', 'telemetry']);
  assert.equal(step.kind, 'query');
  assert.deepEqual({ ...(step.call as object) }, { capabilityId: 'capability:quote-read', input: { requestId: 'Q-9' } });
  assert.deepEqual(step.modelCallEvidence, MEASURED_ONE);
  assert.deepEqual(step.provenance, { sdkModule: MODULE_ID, declarationId: 'decision:quote-step' });
  assert.equal(step.source, 'host-model-port');
  assert.equal(step.llmAvoided, false);
  assert.equal(Object.hasOwn(step, 'freshModelCallCount'), false);

  // Exactly ONE physical model turn: the declared operation with the
  // canonical intent input (prototype-free record — the documented I04
  // port contract; compare serialized like the physical-path test), and
  // nothing else was invoked from S.
  assert.equal(port.calls.length, 1);
  assert.equal(port.calls[0]?.operation, 'quote.advise');
  assert.equal(
    JSON.stringify(port.calls[0]?.input),
    JSON.stringify({ amount: 30, requestId: 'Q-9' }),
  );

  // The query call is a data-only PROPOSAL: JSON round-trips, contains no
  // callable and never reaches the raw port or any Host handle.
  assertInertData(step, port);
  const roundTripped = JSON.parse(JSON.stringify(step)) as { call: { input: unknown } };
  assert.deepEqual(roundTripped.call.input, { requestId: 'Q-9' });
});

test('V08-FR07-S1-P2 one model turn returning the final envelope carries the exact structured decision', async () => {
  const port = spyPort([FINAL_OUTPUT]);
  const bound = createHostBoundModelResolver(port);
  const step = await bound.invokeStep(STEP_PLAN, { amount: 30, requestId: 'Q-9' }) as Record<string, unknown>;

  assert.deepEqual(Object.keys(step).sort(), ['cacheDisposition', 'kind', 'llmAvoided', 'modelCallEvidence', 'provenance', 'source', 'structuredDecision', 'telemetry']);
  assert.equal(step.kind, 'final');
  assert.deepEqual(step.structuredDecision, {
    decision: { outcome: 'model-proposed', data: { amount: 30 } },
    event: { type: 'MODEL_QUOTE_DECIDED', payload: { requestId: 'Q-9' } },
  });
  assert.deepEqual(step.modelCallEvidence, MEASURED_ONE);
  assert.equal(port.calls.length, 1);
  assertInertData(step, port);
});

test('V08-FR07-S1-P3 the I04 single-model path (interpret/invokeDecision) is retained unchanged; invokeStep is additive and unselected', async () => {
  const port = spyPort([
    { decision: { outcome: 'model-proposed' }, event: { type: 'MODEL_QUOTE_DECIDED', payload: { amount: 30, requestId: 'MP-1' } } },
    QUERY_OUTPUT,
  ]);
  const bound = createHostBoundModelResolver(port);

  // Model-free path stays honest measured(0) with zero port traffic.
  const modelFree = bound.interpret(
    { ruleId: 'rule:quote-decision-request', eventType: 'QUOTE_DECIDED', payloadFromInput: { amount: 'amount' } },
    { amount: 30 },
  ) as Record<string, unknown>;
  assert.deepEqual(modelFree.modelCallEvidence, { status: 'measured', count: 0, scope: 'bound-model-port-invocations' });
  assert.equal(port.calls.length, 0);

  // The physical I04 contract surface is byte-unchanged: one port call,
  // structured decision, measured(1).
  const decision = await bound.invokeDecision(
    { id: 'md:1', kind: 'model-decision', modelOperation: 'quote.advise' },
    { amount: 30, requestId: 'MP-1' },
    { freshModelCallCount: 999 },
  ) as Record<string, unknown>;
  assert.equal(decision.kind, 'model-decision');
  assert.deepEqual(decision.modelCallEvidence, MEASURED_ONE);
  assert.equal(decision.source, 'host-model-port');
  assert.equal(port.calls.length, 1);

  // The microkernel activation contract (interpret + invokeDecision both
  // callable) still holds; the step surface is only an additive method on
  // the frozen resolver, so the Kernel path stays exactly as selected.
  assert.equal(typeof bound.interpret, 'function');
  assert.equal(typeof bound.invokeDecision, 'function');
  assert.equal(typeof bound.invokeStep, 'function');
  assert.equal(Object.isFrozen(bound), true);
  assert.deepEqual(Object.keys(bound).sort(), ['interpret', 'invokeDecision', 'invokeStep']);

  const step = await bound.invokeStep(STEP_PLAN, { amount: 30 }) as Record<string, unknown>;
  assert.equal(step.kind, 'query');
  assert.equal(port.calls.length, 2);
});

test('V08-FR07-S1-P4 the extended payload module still passes sealed BUILD closure qualification', async () => {
  const source = await readFile(
    fileURLToPath(new URL('../src/qualified-package/payload/standard-sdk-v1.mjs', import.meta.url)),
    'utf8',
  );
  const business = [
    'export const MODULE_ID="business:fixture";',
    'export const PACKAGE_KIND="business";',
    'export const ABI_VERSION="v08-business-abi/1";',
    'export const ENDPOINTS=[{endpointId:"policy",kind:"business-policy"}];',
    'export const INTENT_TYPES=["request"];',
    'export function getPolicy(){return {}};',
  ].join('\n');
  const k = [
    'export const MODULE_ID="kernel:fixture";',
    'export const PACKAGE_KIND="kernel";',
    'export const ABI_VERSION="v08-kernel-abi/1";',
    'export const ENDPOINTS=[{endpointId:"runtime",kind:"occurrence-runtime"}];',
    'export function createOccurrenceRuntime(){return {}};',
  ].join('\n');
  const res = qualifyPackageClosure({
    rootPackageId: 'app:standard-fr07s1',
    packages: [
      { packageId: 'kernel:fixture', kind: 'kernel', abiVersion: 'v08-kernel-abi/1', modulePath: 'modules/kernel.mjs', moduleSource: k, endpoints: [{ endpointId: 'runtime', kind: 'occurrence-runtime' }] },
      { packageId: MODULE_ID, kind: 'standard-sdk', abiVersion: ABI_VERSION, modulePath: 'modules/sdk.mjs', moduleSource: source, endpoints: [{ endpointId: ENDPOINTS[0].endpointId, kind: ENDPOINTS[0].kind }] },
      { packageId: 'business:fixture', kind: 'business', abiVersion: 'v08-business-abi/1', modulePath: 'modules/business.mjs', moduleSource: business, endpoints: [{ endpointId: 'policy', kind: 'business-policy' }], intentTypes: ['request'] },
    ],
    bindings: [
      { role: 'kernel', packageId: 'kernel:fixture', endpointId: 'runtime' },
      { role: 'standard-sdk', packageId: MODULE_ID, endpointId: ENDPOINTS[0].endpointId },
      { role: 'business', packageId: 'business:fixture', endpointId: 'policy' },
      { role: 'intent', intentType: 'request', packageId: 'business:fixture', endpointId: 'policy' },
    ],
  });
  assert.equal(res.formatVersion, 'v08-build-qualification/1');
  // Sealed-module floor: the step extension added no import, no dynamic
  // code evaluation, no sixth Standard Kind and no new endpoint.
  assert.doesNotMatch(source, /(?:^|\n)\s*import\b/);
  assert.doesNotMatch(source, /\beval\s*\(/);
  assert.doesNotMatch(source, /\bnew\s+Function\b/);
  assert.deepEqual(STANDARD_KINDS, ['schema', 'rule', 'decision', 'workflow', 'operation']);
  assert.deepEqual(ENDPOINTS.map((x: { kind: string }) => x.kind), ['rule-interpreter']);
  // Unselected baseline: plain interpret evidence stays unsupported.
  assert.deepEqual(
    (interpret({ ruleId: 'rule:x', eventType: 'TEST' }, {}) as Record<string, unknown>).modelCallEvidence,
    { status: 'unsupported' },
  );
});

test('V08-FR07-S1-N1 non-canonical model outputs fail typed with no second model call', async () => {
  const wellFormedCall = { capabilityId: 'capability:quote-read', input: {} };
  const wellFormedFinal = { decision: { outcome: 'model-proposed', data: {} }, event: { type: 'MODEL_QUOTE_DECIDED', payload: {} } };
  const malformed = [
    { call: wellFormedCall }, // missing kind
    { kind: 'observation' }, // unknown kind
    { kind: 'query', call: { capabilityId: 'capability:quote-read' } }, // call missing input
    { kind: 'query', call: { capabilityId: 'bad id!', input: {} } }, // non-identifier capabilityId
    { kind: 'query', call: { ...wellFormedCall, extra: 1 } }, // call extra key
    { kind: 'query', call: wellFormedCall, reason: 'why' }, // envelope extra key
    { kind: 'final', result: { decision: wellFormedFinal.decision } }, // result missing event
    { kind: 'final', result: { decision: { ...wellFormedFinal.decision, extra: 1 }, event: wellFormedFinal.event } }, // decision extra key
    { kind: 'final', result: { decision: { outcome: 'model-proposed' }, event: wellFormedFinal.event } }, // decision missing data
    { kind: 'final', result: { decision: wellFormedFinal.decision, event: { ...wellFormedFinal.event, extra: true } } }, // event extra key
    { kind: 'final', result: { decision: { outcome: 5, data: {} }, event: wellFormedFinal.event } }, // non-string outcome
    { kind: 7 }, // non-string kind
  ];
  for (const output of malformed) {
    const port = spyPort([output]);
    const bound = createHostBoundModelResolver(port);
    await refusedAsync('SDK_MODEL_OUTPUT_INVALID', () => bound.invokeStep(STEP_PLAN, {}));
    // The single model turn physically happened; NOTHING further ran.
    assert.equal(port.calls.length, 1);
  }
});

test('V08-FR07-S1-N2 model authority/effect/provenance pre-claims fail typed and leak no measured count', async () => {
  const reservedKeys = [
    'nextState', 'transition', 'mutation', 'effect', 'journal',
    'promotion', 'activation', 'governanceBaseline', 'privateReasoning',
    'modelCallEvidence', 'freshModelCallCount',
  ];
  for (const key of reservedKeys) {
    for (const shape of [QUERY_OUTPUT, FINAL_OUTPUT]) {
      const output = { ...shape, [key]: key.startsWith('fresh') ? 999 : 'attacker' };
      const port = spyPort([output]);
      const bound = createHostBoundModelResolver(port);
      await refusedAsync('SDK_MODEL_AUTHORITY_REFUSED', () => bound.invokeStep(STEP_PLAN, {}));
      assert.equal(port.calls.length, 1);
    }
  }
});

test('V08-FR07-S1-N3 unsafe model output values fail closed without reading them', async () => {
  let getterCalls = 0;
  const accessorOutput = { kind: 'query', call: { capabilityId: 'capability:quote-read', input: {} } };
  Object.defineProperty(accessorOutput.call, 'input', {
    enumerable: true,
    get() { getterCalls += 1; return {}; },
  });
  const accessorPort = spyPort([accessorOutput]);
  await refusedAsync('SDK_DATA_UNSAFE', () => createHostBoundModelResolver(accessorPort).invokeStep(STEP_PLAN, {}));
  assert.equal(getterCalls, 0);

  const protoOutput = JSON.parse('{"kind":"query","call":{"capabilityId":"capability:quote-read","input":{}},"__proto__":1}');
  await refusedAsync('SDK_DATA_UNSAFE', () => createHostBoundModelResolver(spyPort([protoOutput])).invokeStep(STEP_PLAN, {}));

  const cyclicOutput: Record<string, unknown> = { kind: 'query', call: { capabilityId: 'capability:quote-read', input: {} } };
  cyclicOutput.self = cyclicOutput;
  await refusedAsync('SDK_DATA_BOUNDS', () => createHostBoundModelResolver(spyPort([cyclicOutput])).invokeStep(STEP_PLAN, {}));

  const instanceOutput = { kind: 'final', result: { decision: { outcome: 'model-proposed', data: new Date() }, event: { type: 'MODEL_QUOTE_DECIDED', payload: {} } } };
  await refusedAsync('SDK_DATA_UNSAFE', () => createHostBoundModelResolver(spyPort([instanceOutput])).invokeStep(STEP_PLAN, {}));
});

test('V08-FR07-S1-N4 ModelPort failure and unmeasured mode stay truthful; forged counts never become evidence', async () => {
  const failing = createHostBoundModelResolver(spyPort([new Error('provider fault')]));
  await refusedAsync('SDK_MODEL_PORT_FAILED', () => failing.invokeStep(STEP_PLAN, {}));

  const unmeasured = createHostBoundModelResolver(spyPort([QUERY_OUTPUT]), { metering: 'unmeasured' });
  const unmeasuredStep = await unmeasured.invokeStep(STEP_PLAN, {}) as Record<string, unknown>;
  assert.deepEqual(unmeasuredStep.modelCallEvidence, { status: 'unmeasured' });
  assert.equal(Object.hasOwn(unmeasuredStep.modelCallEvidence as object, 'count'), false);

  const forgedContext = { freshModelCallCount: 999, modelCallEvidence: { status: 'measured', count: 999 } };
  const honest = createHostBoundModelResolver(spyPort([QUERY_OUTPUT]));
  const honestStep = await honest.invokeStep(STEP_PLAN, {}, forgedContext) as Record<string, unknown>;
  assert.deepEqual(honestStep.modelCallEvidence, MEASURED_ONE);
  assert.equal(Object.hasOwn(honestStep, 'freshModelCallCount'), false);
});

test('V08-FR07-S1-N5 no callable Host read or side-effect surface leaks from S', async () => {
  const port = spyPort([QUERY_OUTPUT]);
  const bound = createHostBoundModelResolver(port);
  // Callables in declaration/input/context are refused before any port call.
  // invokeStep is async, so even its synchronous validation surfaces as a
  // rejected promise — every refusal here must be awaited.
  await refusedAsync('SDK_DATA_UNSAFE', () => bound.invokeStep({ ...STEP_PLAN, execute: () => null }, {}));
  await refusedAsync('SDK_DATA_UNSAFE', () => bound.invokeStep(STEP_PLAN, { fn: () => null }));
  await refusedAsync('SDK_DATA_UNSAFE', () => bound.invokeStep(STEP_PLAN, {}, { query: () => null }));
  assert.equal(port.calls.length, 0);

  // The resolver exposes exactly the three interpreter surfaces; the raw
  // port is reachable through NONE of them (the interpreter methods are
  // the legitimate callable surface, so only port identity is checked).
  assertNeverReaches(bound, port);

  const step = await bound.invokeStep(STEP_PLAN, {}) as Record<string, unknown>;
  // The query envelope carries no execute/observe/cancel surface at all —
  // only the inert K-boundary proposal data.
  const call = step.call as Record<string, unknown>;
  assert.deepEqual(Object.keys(call).sort(), ['capabilityId', 'input']);
  assert.equal(Object.hasOwn(step, 'execute'), false);
  assert.equal(Object.hasOwn(step, 'observe'), false);
  assert.equal(Object.hasOwn(step, 'cancel'), false);
  assertInertData(step, port);
});

test('V08-FR07-S1-N6 the step surface requires an explicit model-decision declaration', async () => {
  const port = spyPort([QUERY_OUTPUT]);
  const bound = createHostBoundModelResolver(port);
  await refusedAsync('SDK_KIND_UNSUPPORTED', () => bound.invokeStep({ id: 'rule:1', kind: 'rule', eventType: 'TEST' }, {}));
  await refusedAsync('SDK_DECLARATION_INVALID', () => bound.invokeStep({ kind: 'model-decision', modelOperation: 'quote.advise' }, {}));
  await refusedAsync('SDK_DECLARATION_INVALID', () => bound.invokeStep({ id: 'decision:x', kind: 'model-decision' }, {}));
  assert.equal(port.calls.length, 0);
});
