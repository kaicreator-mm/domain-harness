import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import Ajv from 'ajv';
// A2 selected-Function invoker (#1542) negative paths: unknown/inherited ids,
// unbound/selected gaps, inconsistent trusted bundles, validator semantics,
// effect-mode gate, executor throw, budget exhaustion and deadline behavior.
// Same module import idiom as function-call-invoker.test.ts (dist for element
// + function-call, source for the self-contained envelope).
import { createFunctionInvoker } from '../dist/function-call/invoker.js';
import type { FunctionBindings, FunctionCallOutcome, FunctionInputValidator, FunctionInvokerConfig } from '../dist/function-call/invoker.js';
import { FunctionCallError } from '../dist/function-call/errors.js';
import { assertFunctionBindings, ELEMENT_MANIFEST_SCHEMA, lockAot, parseElementManifest } from '../dist/element/index.js';
import type { ElementFunctionDecl, ElementManifest } from '../dist/element/index.js';
import { createBoundedEnvelope } from '../src/bounded/envelope.ts';
import type { BoundedClock, BoundedEnvelope } from '../src/bounded/envelope.ts';
import { digest } from '../src/knowledge.ts';

const TARGET = 'linux-x64-node24';

const SOURCES: Record<string, string> = {
  'demo/assess.mjs': 'export function assessTaskEvidence(claims) {\n'
    + '  const admitted = claims.filter((c) => c.status === "PASS" || c.status === "FAIL");\n'
    + '  return { admitted: admitted.length, unknown: claims.length - admitted.length };\n'
    + '}\n',
  'demo/project.mjs': 'export function projectReleaseReadiness(assessment) {\n'
    + '  return { ready: assessment.admitted > 0 && assessment.unknown === 0 };\n'
    + '}\n',
  'demo/policy.mjs': 'export function getPolicy() {\n'
    + '  return { policy: "dis-read-only", scope: "PRIVATE_REFERENCE" };\n'
    + '}\n',
  'demo/effects.mjs': 'export function syncCache(input) { return { synced: true }; }\n'
    + 'export function allocateQuota(input) { return { allocated: true }; }\n'
    + 'export function acquire(input) { return { acquired: true }; }\n',
};

const SOURCE_OF: Record<string, string> = {
  assessTaskEvidence: 'demo/assess.mjs',
  describeBusinessPolicy: 'demo/policy.mjs',
  projectReleaseReadiness: 'demo/project.mjs',
  syncCache: 'demo/effects.mjs',
  allocateQuota: 'demo/effects.mjs',
  acquire: 'demo/effects.mjs',
};

const FUNCTION_IDS = Object.keys(SOURCE_OF);

function gitBlobOf(content: string): string {
  return createHash('sha1').update(`blob ${Buffer.byteLength(content, 'utf8')}\0${content}`).digest('hex');
}

const RAW_MANIFEST = {
  schema: ELEMENT_MANIFEST_SCHEMA,
  relations: [{ from: 'demo.tasks', to: 'demo.release', kind: 'feeds' }],
  consumers: [
    {
      id: 'demo',
      repository: 'kaicreator-mm/domain-harness',
      sourceCommit: 'b1b2c182c1cb49c1b63b1efaf57ff9132d9cf4b0',
      domainId: 'dis-runtime-011-a2-function-call',
      sources: Object.entries(SOURCES).map(([file, content]) => ({
        file, originalPath: 'packages/dis-v011-runtime/tests/fixtures/' + file, gitBlob: gitBlobOf(content),
      })),
      elements: [
        { id: 'demo.tasks', description: 'A2 fixture: evidence assessment and policy description', functions: [
          { id: 'assessTaskEvidence', exportName: 'assessTaskEvidence', source: 'demo/assess.mjs', implementation: 'rule', effects: 'none',
            inputSchemaRef: 'schemas/demo/task-evidence.input.json', outputSchemaRef: 'schemas/demo/task-evidence.output.json' },
          { id: 'describeBusinessPolicy', exportName: 'getPolicy', source: 'demo/policy.mjs', implementation: 'knowledge', effects: 'none',
            inputSchemaRef: 'schemas/demo/policy.input.json', outputSchemaRef: 'schemas/demo/policy.output.json' },
        ] },
        { id: 'demo.release', description: 'A2 fixture: readiness projection', dependsOn: ['demo.tasks'], functions: [
          { id: 'projectReleaseReadiness', exportName: 'projectReleaseReadiness', source: 'demo/project.mjs', implementation: 'rule', effects: 'none',
            inputSchemaRef: 'schemas/demo/release-readiness.input.json', outputSchemaRef: 'schemas/demo/release-readiness.output.json' },
        ] },
        { id: 'demo.effects', description: 'A2 fixture: permit-gated effect implementations', dependsOn: ['demo.tasks'], functions: [
          { id: 'syncCache', exportName: 'syncCache', source: 'demo/effects.mjs', implementation: 'code', effects: 'idempotent',
            inputSchemaRef: 'schemas/demo/sync-cache.input.json', outputSchemaRef: 'schemas/demo/sync-cache.output.json' },
          { id: 'allocateQuota', exportName: 'allocateQuota', source: 'demo/effects.mjs', implementation: 'stateful', effects: 'non-idempotent',
            inputSchemaRef: 'schemas/demo/allocate-quota.input.json', outputSchemaRef: 'schemas/demo/allocate-quota.output.json' },
          { id: 'acquire', exportName: 'acquire', source: 'demo/effects.mjs', implementation: 'external-effect', effects: 'non-idempotent',
            inputSchemaRef: 'schemas/demo/acquire.input.json', outputSchemaRef: 'schemas/demo/acquire.output.json' },
        ] },
      ],
    },
  ],
};

const ajv = new Ajv({ allErrors: true });
const PRECOMPILED: Record<string, FunctionInputValidator> = {
  assessTaskEvidence: ajv.compile({
    type: 'object', additionalProperties: false, required: ['claims'],
    properties: {
      claims: {
        type: 'array', minItems: 1, items: {
          type: 'object', additionalProperties: false, required: ['status'],
          properties: { status: { enum: ['PASS', 'FAIL', 'UNKNOWN'] } },
        },
      },
    },
  }) as (input: unknown) => boolean,
  projectReleaseReadiness: ajv.compile({
    type: 'object', additionalProperties: false, required: ['admitted', 'unknown'],
    properties: { admitted: { type: 'integer', minimum: 0 }, unknown: { type: 'integer', minimum: 0 } },
  }) as (input: unknown) => boolean,
};

const VALID_ASSESS_INPUT = { claims: [{ status: 'PASS' }, { status: 'UNKNOWN' }] };

function buildTrustedBundle(patch?: (raw: typeof RAW_MANIFEST) => void): { manifest: ElementManifest; lock: ReturnType<typeof lockAot> } {
  const raw = structuredClone(RAW_MANIFEST);
  if (patch !== undefined) patch(raw);
  const manifest = parseElementManifest(raw);
  const lock = lockAot(
    manifest,
    Object.fromEntries(FUNCTION_IDS.map((id) =>
      [id, { path: SOURCE_OF[id], sha256: digest(SOURCES[SOURCE_OF[id]]), target: TARGET }])),
    { expectedTarget: TARGET },
  );
  assertFunctionBindings(lock, Object.fromEntries(FUNCTION_IDS.map((id) =>
    [id, { path: SOURCE_OF[id], target: TARGET, content: SOURCES[SOURCE_OF[id]] }])));
  return { manifest, lock };
}

function declaredOf(manifest: ElementManifest, id: string): ElementFunctionDecl {
  for (const consumer of manifest.consumers) {
    for (const element of consumer.elements) {
      const fn = element.functions.find((candidate) => candidate.id === id);
      if (fn !== undefined) return fn;
    }
  }
  throw new Error('fixture bug: undeclared Function ' + id);
}

function makeTrackedCallables() {
  const calls: Record<string, number> = {};
  const callables: Record<string, (input: unknown) => unknown> = {};
  const track = (id: string, fn: (input: unknown) => unknown): void => {
    calls[id] = 0;
    callables[id] = (input: unknown) => { calls[id] += 1; return fn(input); };
  };
  track('assessTaskEvidence', (input) => {
    const claims = (input as { claims: { status: string }[] }).claims;
    const admitted = claims.filter((c) => c.status === 'PASS' || c.status === 'FAIL').length;
    return { admitted, unknown: claims.length - admitted };
  });
  track('describeBusinessPolicy', () => ({ policy: 'dis-read-only', scope: 'PRIVATE_REFERENCE' }));
  track('projectReleaseReadiness', (input) => {
    const assessment = input as { admitted: number; unknown: number };
    return { ready: assessment.admitted > 0 && assessment.unknown === 0 };
  });
  track('syncCache', () => ({ synced: true }));
  track('allocateQuota', () => ({ allocated: true }));
  track('acquire', () => ({ acquired: true }));
  const totalCalls = (): number => Object.values(calls).reduce((sum, count) => sum + count, 0);
  return { calls, callables, totalCalls };
}

function makeFixture(overrides: {
  expectedTarget?: string;
  envelope?: BoundedEnvelope;
  providerKind?: string;
  stepWorkUnits?: number;
  bindings?: FunctionBindings;
  unbound?: string[];
  bindingOverrides?: Record<string, Record<string, unknown>>;
  /** Patch the raw fixture manifest before the real parse/lock/bind chain. */
  manifestPatch?: (raw: typeof RAW_MANIFEST) => void;
} = {}) {
  const { manifest, lock } = buildTrustedBundle(overrides.manifestPatch);
  const tracked = makeTrackedCallables();
  const bindings: Record<string, Record<string, unknown>> = {};
  for (const id of FUNCTION_IDS) {
    if (overrides.unbound?.includes(id)) continue;
    bindings[id] = {
      declaration: declaredOf(manifest, id),
      lockEntry: lock.entries[id],
      callable: tracked.callables[id],
      ...(PRECOMPILED[id] === undefined ? {} : { validator: PRECOMPILED[id] }),
      ...overrides.bindingOverrides?.[id],
    };
  }
  const envelope = overrides.envelope ?? createBoundedEnvelope({
    budget: { maxSteps: 8, maxWorkUnits: 32, wallClockMs: 60_000 },
    providers: [{ kind: 'local-deterministic', id: 'a2-invoker' }],
  });
  const config: FunctionInvokerConfig = {
    manifest,
    lock,
    expectedTarget: overrides.expectedTarget ?? TARGET,
    envelope,
    providerKind: overrides.providerKind ?? 'local-deterministic',
    bindings: overrides.bindings ?? (bindings as unknown as FunctionInvokerConfig['bindings']),
    ...(overrides.stepWorkUnits === undefined ? {} : { stepWorkUnits: overrides.stepWorkUnits }),
  };
  return { config, tracked, envelope, manifest, lock, bindings };
}

type CompletedCall = Extract<FunctionCallOutcome, { status: 'COMPLETED' }>;
type RejectedCall = Extract<FunctionCallOutcome, { status: 'REJECTED' }>;

function completedOf(outcome: FunctionCallOutcome, label = ''): CompletedCall {
  assert.equal(outcome.status, 'COMPLETED', label);
  return outcome as CompletedCall;
}

function rejectedOf(outcome: FunctionCallOutcome, label = ''): RejectedCall {
  assert.equal(outcome.status, 'REJECTED', label);
  return outcome as RejectedCall;
}

const hasCode = (code: string) => (error: unknown): boolean =>
  error instanceof FunctionCallError && error.code === code;

/** Manual clock: deadline behavior is verified by advancing fake time synchronously. */
function makeFakeClock(startNow = 0) {
  let now = startNow;
  let sequence = 0;
  const timers: { at: number; onFire: () => void; order: number }[] = [];
  const clock: BoundedClock = {
    now: () => now,
    schedule: (ms, onFire) => {
      const entry = { at: now + ms, onFire, order: sequence };
      sequence += 1;
      timers.push(entry);
      return () => {
        const index = timers.indexOf(entry);
        if (index >= 0) timers.splice(index, 1);
      };
    },
  };
  const advance = (ms: number): void => {
    now += ms;
    const due = timers.filter((timer) => timer.at <= now).sort((a, b) => a.order - b.order);
    for (const timer of due) {
      timers.splice(timers.indexOf(timer), 1);
      timer.onFire();
    }
  };
  return { clock, advance };
}

test('unknown ids and Object.prototype member names are rejected with zero execution and zero spend', async () => {
  const { config, tracked, envelope } = makeFixture();
  const invoker = createFunctionInvoker(config);
  for (const id of ['unknownFunction', '__proto__', 'constructor', 'toString', 'hasOwnProperty', '__defineGetter__', '']) {
    const outcome = await invoker.invoke({ functionId: id, input: {} });
    assert.equal(outcome.status, 'REJECTED', id);
    const rejected = rejectedOf(outcome, id);
    assert.equal(rejected.code, 'FUNCTION_ID_UNKNOWN', id);
    assert.equal(rejected.output, null, id);
    assert.equal(rejected.disposition, 'UNKNOWN', id);
    assert.equal(rejected.inputValidation, 'NOT_PERFORMED', id);
    assert.equal(rejected.functionId, id, id);
    assert.equal(rejected.attested, false, id);
    assert.equal(rejected.authority, 'NONE', id);
    assert.equal(rejected.effectDispatched, false, id);
  }
  const nonString = await invoker.invoke({ functionId: 42, input: {} });
  assert.equal(rejectedOf(nonString).code, 'FUNCTION_ID_UNKNOWN', 'non-string ids can never hit a binding');
  assert.equal(rejectedOf(nonString).functionId, '<non-string>');
  assert.equal(tracked.totalCalls(), 0, 'no callable may run for unknown ids');
  assert.deepEqual(envelope.remaining(), { steps: 8, workUnits: 32 }, 'rejections never consume budget');
});

test('bindings inherited from a prototype chain are never bound and never callable', async () => {
  const { config } = makeFixture();
  const defaults = config.bindings as Record<string, Record<string, unknown>>;
  const protoCarrier = Object.assign(
    Object.create({ assessTaskEvidence: defaults['assessTaskEvidence'] }),
    Object.fromEntries(Object.entries(defaults).filter(([id]) => id !== 'assessTaskEvidence')),
  );
  const inherited = makeFixture({ bindings: protoCarrier as unknown as FunctionBindings });
  const invoker = createFunctionInvoker(inherited.config);
  const outcome = await invoker.invoke({ functionId: 'assessTaskEvidence', input: VALID_ASSESS_INPUT });
  const rejected = rejectedOf(outcome, 'inherited binding must not be bound');
  assert.equal(rejected.code, 'FUNCTION_NOT_BOUND', 'own-key enumeration must ignore prototype bindings');
  assert.equal(rejected.output, null);
  assert.equal(inherited.tracked.calls['assessTaskEvidence'], 0, 'the inherited callable never runs');
  const sibling = completedOf(await invoker.invoke({
    functionId: 'projectReleaseReadiness', input: { admitted: 1, unknown: 0 },
  }), 'own-key bound sibling still runs');
  assert.deepEqual(sibling.output, { ready: true });
  assert.deepEqual(inherited.envelope.remaining(), { steps: 7, workUnits: 31 });
});

test('an own enumerable __proto__ key is rejected at construction, never materialized as a binding', () => {
  const { config } = makeFixture();
  const defaults = config.bindings as Record<string, Record<string, unknown>>;
  const malicious: Record<string, unknown> = { ...defaults };
  Object.defineProperty(malicious, '__proto__', {
    value: defaults['syncCache'], enumerable: true, configurable: true, writable: true,
  });
  assert.equal(Object.keys(malicious).includes('__proto__'), true, 'fixture precheck: own __proto__ key');
  assert.throws(
    () => createFunctionInvoker({ ...config, bindings: malicious as unknown as FunctionBindings }),
    hasCode('FUNCTION_CALL_ID_NOT_SELECTED'),
    'a planted __proto__ binding can never join the selected set',
  );
});

test('a selected Function without a pre-bound callable is refused while bound siblings still run', async () => {
  const { config, tracked, envelope } = makeFixture({ unbound: ['projectReleaseReadiness'] });
  const invoker = createFunctionInvoker(config);
  const outcome = await invoker.invoke({ functionId: 'projectReleaseReadiness', input: { admitted: 1, unknown: 0 } });
  const rejected = rejectedOf(outcome, 'selected-but-unbound must be refused');
  assert.equal(rejected.code, 'FUNCTION_NOT_BOUND');
  assert.equal(rejected.output, null);
  assert.equal(tracked.calls['projectReleaseReadiness'], 0, 'nothing runs without a pre-bound callable');
  const sibling = completedOf(await invoker.invoke({
    functionId: 'assessTaskEvidence', input: VALID_ASSESS_INPUT,
  }), 'bound sibling still runs');
  assert.deepEqual(sibling.output, { admitted: 1, unknown: 1 });
  assert.deepEqual(envelope.remaining(), { steps: 7, workUnits: 31 }, 'only the sibling consumed budget');
});

test('construction rejects bindings outside the sealed selected set', () => {
  const withExtra = (extra: Record<string, unknown>) => {
    const { config } = makeFixture();
    return { ...config, bindings: { ...(config.bindings as Record<string, unknown>), ...extra } };
  };
  const { config, bindings } = makeFixture();
  assert.throws(
    () => createFunctionInvoker(withExtra({ nonExistentFunction: bindings['assessTaskEvidence'] })),
    hasCode('FUNCTION_CALL_ID_NOT_SELECTED'),
    'an id outside the manifest selection can never be bound',
  );
  assert.throws(
    () => createFunctionInvoker(withExtra({ '': bindings['assessTaskEvidence'] })),
    hasCode('FUNCTION_CALL_ID_NOT_SELECTED'),
    'an empty id is not a selected id',
  );
  assert.throws(
    () => createFunctionInvoker({
      ...config,
      bindings: [
        { functionId: 'assessTaskEvidence', ...bindings['assessTaskEvidence'] },
        { functionId: 'assessTaskEvidence', ...bindings['describeBusinessPolicy'] },
      ] as unknown as FunctionBindings,
    }),
    hasCode('FUNCTION_CALL_ID_DUPLICATE'),
    'duplicate binding ids are structurally rejected',
  );
  assert.throws(
    () => createFunctionInvoker({
      ...config,
      bindings: [{ functionId: '', ...bindings['assessTaskEvidence'] }] as unknown as FunctionBindings,
    }),
    hasCode('FUNCTION_CALL_ID_EMPTY'),
    'an empty entry id is rejected explicitly',
  );
  assert.throws(
    () => createFunctionInvoker({
      ...config,
      bindings: { assessTaskEvidence: null } as unknown as FunctionBindings,
    }),
    hasCode('FUNCTION_CALL_BINDING_INCOMPLETE'),
    'a binding value that is not a complete object is rejected',
  );
});

test('construction rejects forged declarations, forged or missing lock entries and unusable callables', () => {
  const forged = (id: string, patch: Record<string, unknown>) => {
    const { config } = makeFixture({ bindingOverrides: { [id]: patch } });
    return () => createFunctionInvoker(config);
  };
  assert.throws(
    forged('assessTaskEvidence', {
      declaration: { ...declaredOf(parseElementManifest(RAW_MANIFEST), 'assessTaskEvidence'), effects: 'idempotent' },
    }),
    hasCode('FUNCTION_CALL_DECLARATION_MISMATCH'),
    'a declaration that differs from the manifest selection is rejected',
  );
  assert.throws(
    forged('assessTaskEvidence', { lockEntry: { elementId: 'demo.tasks', functionId: 'assessTaskEvidence', path: 'demo/assess.mjs', sha256: 'f'.repeat(64), target: TARGET } }),
    hasCode('FUNCTION_CALL_LOCK_ENTRY_MISMATCH'),
    'a lock entry that differs from the sealed pin is rejected',
  );
  assert.throws(
    forged('assessTaskEvidence', { lockEntry: undefined }),
    hasCode('FUNCTION_CALL_LOCK_ENTRY_INCOMPLETE'),
    'a binding without a lock entry is rejected',
  );
  assert.throws(
    forged('assessTaskEvidence', { callable: 'not-a-function' }),
    hasCode('FUNCTION_CALL_CALLABLE_INVALID'),
    'a binding without a callable is rejected',
  );
  assert.throws(
    forged('assessTaskEvidence', { validator: 42 }),
    hasCode('FUNCTION_CALL_VALIDATOR_INVALID'),
    'a non-function validator is rejected',
  );
  const doctoredLock = () => {
    const { config, lock } = makeFixture();
    const entries = { ...lock.entries };
    delete entries['acquire'];
    return () => createFunctionInvoker({ ...config, lock: { ...lock, entries } as typeof lock });
  };
  assert.throws(
    doctoredLock(),
    hasCode('FUNCTION_CALL_LOCK_ENTRY_MISSING'),
    'a binding whose Function is not sealed in the lock is rejected',
  );
});

test('construction rejects a wrong expected target and channel-level misuse', () => {
  const { config } = makeFixture({ expectedTarget: 'wasm32-wasi' });
  assert.throws(
    () => createFunctionInvoker(config),
    hasCode('FUNCTION_CALL_TARGET_MISMATCH'),
    'sealed targets outside the channel target are rejected at construction',
  );
  const detailProbe = makeFixture();
  assert.throws(
    () => createFunctionInvoker({ ...detailProbe.config, expectedTarget: '' }),
    hasCode('FUNCTION_CALL_TARGET_INVALID'),
  );
  for (const providerKind of ['llm', 'harness']) {
    const { config: reserved } = makeFixture({ providerKind });
    assert.throws(
      () => createFunctionInvoker(reserved),
      hasCode('FUNCTION_CALL_PROVIDER_KIND_FORBIDDEN'),
      providerKind + ' impersonates an authority this channel cannot hold',
    );
  }
  const { config: unregistered } = makeFixture({ providerKind: 'browser-agent' });
  assert.throws(
    () => createFunctionInvoker(unregistered),
    hasCode('FUNCTION_CALL_PROVIDER_KIND_UNREGISTERED'),
    'provider kinds outside the envelope registry are rejected at construction',
  );
  const { config: noEnvelope } = makeFixture({ envelope: {} as unknown as BoundedEnvelope });
  assert.throws(() => createFunctionInvoker(noEnvelope), hasCode('FUNCTION_CALL_ENVELOPE_INVALID'));
  const { config: zeroUnits } = makeFixture({ stepWorkUnits: 0 });
  assert.throws(() => createFunctionInvoker(zeroUnits), hasCode('FUNCTION_CALL_STEP_WORK_UNITS_INVALID'));
});

test('a schema-ref-only Function without a pre-compiled Validator fails closed as UNAVAILABLE', async () => {
  const { config, tracked, envelope } = makeFixture();
  const invoker = createFunctionInvoker(config);
  const outcome = await invoker.invoke({ functionId: 'describeBusinessPolicy', input: { anything: 'unvalidated' } });
  const rejected = rejectedOf(outcome, 'validator-less Function must fail closed');
  assert.equal(rejected.code, 'INPUT_VALIDATION_UNAVAILABLE');
  assert.equal(rejected.inputValidation, 'UNAVAILABLE', 'the channel never claims validation happened');
  assert.equal(rejected.output, null);
  assert.equal(rejected.disposition, 'UNKNOWN');
  assert.ok(rejected.detail.includes('schemas/demo/policy.input.json'), 'detail names the unbacked schema ref');
  assert.equal(tracked.calls['describeBusinessPolicy'], 0, 'nothing executes without a Validator');
  assert.deepEqual(envelope.remaining(), { steps: 8, workUnits: 32 }, 'UNAVAILABLE rejection never consumes budget');
});

test('invalid dynamic input is rejected by the real pre-compiled Validator without execution', async () => {
  const { config, tracked, envelope } = makeFixture();
  const invoker = createFunctionInvoker(config);
  const outcome = await invoker.invoke({
    functionId: 'assessTaskEvidence', input: { claims: [{ status: 'BOGUS' }] },
  });
  const rejected = rejectedOf(outcome, 'schema-invalid input must be rejected');
  assert.equal(rejected.code, 'INPUT_VALIDATION_FAILED');
  assert.equal(rejected.inputValidation, 'FAILED');
  assert.equal(rejected.output, null);
  assert.equal(rejected.functionId, 'assessTaskEvidence');
  assert.equal(tracked.calls['assessTaskEvidence'], 0, 'rejected input never reaches the callable');
  assert.deepEqual(envelope.remaining(), { steps: 8, workUnits: 32 }, 'validation rejection never consumes budget');

  const throwing = makeFixture({
    bindingOverrides: { assessTaskEvidence: { validator: () => { throw new Error('validator exploded'); } } },
  });
  const throwingOutcome = await createFunctionInvoker(throwing.config)
    .invoke({ functionId: 'assessTaskEvidence', input: VALID_ASSESS_INPUT });
  const thrown = rejectedOf(throwingOutcome, 'a throwing validator must fail closed');
  assert.equal(thrown.code, 'INPUT_VALIDATION_FAILED');
  assert.ok(thrown.detail.includes('validator exploded'), 'validator failure detail is surfaced');
  assert.equal(throwing.tracked.calls['assessTaskEvidence'], 0);

  const truthy = makeFixture({
    bindingOverrides: { assessTaskEvidence: { validator: (() => 'yes') as unknown as FunctionInputValidator } },
  });
  const truthyOutcome = await createFunctionInvoker(truthy.config)
    .invoke({ functionId: 'assessTaskEvidence', input: VALID_ASSESS_INPUT });
  assert.equal(
    rejectedOf(truthyOutcome, 'a non-boolean verdict must fail closed').code,
    'INPUT_VALIDATION_FAILED',
    'only an exact true verdict counts as validated',
  );
  assert.equal(truthy.tracked.calls['assessTaskEvidence'], 0);
});

test('non-none effect modes are gated behind an existing Kernel/KDP Permit with zero execution', async () => {
  const { config, tracked, envelope } = makeFixture();
  const invoker = createFunctionInvoker(config);
  const gated: [string, string][] = [
    ['syncCache', 'idempotent'],
    ['allocateQuota', 'non-idempotent'],
    ['acquire', 'non-idempotent'],
  ];
  for (const [id, mode] of gated) {
    const outcome = await invoker.invoke({ functionId: id, input: { anything: true } });
    const rejected = rejectedOf(outcome, id + ' must be effect-gated');
    assert.equal(rejected.code, 'EFFECT_PERMIT_REQUIRED', id);
    assert.equal(rejected.permitRequired, true, id + ' needs an existing Kernel/KDP Permit');
    assert.equal(rejected.output, null, id);
    assert.equal(rejected.disposition, 'UNKNOWN', id);
    assert.ok(rejected.detail.includes(mode), id + ' names its effect mode');
    assert.ok(rejected.detail.includes('Permit'), id + ' names the Permit requirement');
    assert.equal(rejected.attested, false, id);
    assert.equal(rejected.authority, 'NONE', id);
    assert.equal(tracked.calls[id], 0, id + ' must never execute on this channel');
  }
  assert.equal(tracked.calls['acquire'], 0, 'external-effect implementation is never dispatched');
  assert.equal(tracked.totalCalls(), 0, 'no Permit is ever minted and no effect ever runs here');
  assert.deepEqual(envelope.remaining(), { steps: 8, workUnits: 32 }, 'effect gating never consumes budget');
});

test('an external-effect implementation is gated even when declared with effects none', async () => {
  // Pathological but D1-legal declaration: parseElementManifest validates
  // implementation and effects independently, so
  // implementation:'external-effect' + effects:'none' parses, seals and binds
  // normally — and must still never execute on this channel.
  const { config, tracked, envelope } = makeFixture({
    manifestPatch: (raw) => {
      const element = raw.consumers[0].elements.find((candidate) => candidate.id === 'demo.effects');
      if (element === undefined) throw new Error('fixture patch anchor missing: demo.effects');
      const acquire = element.functions.find((candidate) => candidate.id === 'acquire');
      if (acquire === undefined) throw new Error('fixture patch anchor missing: acquire');
      acquire.effects = 'none';
    },
  });
  const invoker = createFunctionInvoker(config);
  const outcome = await invoker.invoke({ functionId: 'acquire', input: { anything: true } });
  const rejected = rejectedOf(outcome, 'external-effect implementation must be gated');
  assert.equal(rejected.code, 'EFFECT_PERMIT_REQUIRED');
  assert.equal(rejected.permitRequired, true, 'an existing Kernel/KDP Permit is required');
  assert.equal(rejected.output, null);
  assert.equal(rejected.disposition, 'UNKNOWN');
  assert.equal(rejected.functionId, 'acquire');
  assert.ok(rejected.detail.includes('implementation:external-effect'), 'detail names the implementation kind');
  assert.ok(rejected.detail.includes('effects:none'), 'detail names the effects mode');
  assert.ok(rejected.detail.includes('Permit'), 'detail names the Permit requirement');
  assert.equal(tracked.calls['acquire'], 0, 'zero execution of the external-effect callable');
  assert.equal(tracked.totalCalls(), 0);
  assert.deepEqual(envelope.remaining(), { steps: 8, workUnits: 32 }, 'zero budget spend on the gated call');
});

test('an executor throw surfaces as structured EXECUTION_FAILED without partial output', async () => {
  const { config, envelope } = makeFixture({
    bindingOverrides: { assessTaskEvidence: { callable: () => { throw new Error('rule exploded'); } } },
  });
  const invoker = createFunctionInvoker(config);
  const outcome = await invoker.invoke({ functionId: 'assessTaskEvidence', input: VALID_ASSESS_INPUT });
  assert.equal(outcome.status, 'EXECUTION_FAILED');
  if (outcome.status !== 'EXECUTION_FAILED') return;
  assert.ok(outcome.reason.includes('rule exploded'));
  assert.equal(outcome.output, null, 'no partial output may appear on failure');
  assert.equal(outcome.disposition, 'UNKNOWN');
  assert.equal(outcome.inputValidation, 'VALIDATED', 'validation did run before the executor threw');
  assert.equal(outcome.functionId, 'assessTaskEvidence');
  assert.equal(outcome.elementId, 'demo.tasks');
  assert.equal(outcome.source, 'demo/assess.mjs');
  assert.equal('provider' in outcome, false, 'no provider/output label may appear on failure');
  assert.equal(outcome.attested, false);
  assert.equal(outcome.authority, 'NONE');
  assert.equal(outcome.effectDispatched, false);
  assert.equal(outcome.trace.some((event) => event.type === 'run-completed'), false);
  assert.equal(outcome.trace.some((event) => event.type === 'execution-failed'), true);
  assert.deepEqual(envelope.remaining(), { steps: 7, workUnits: 31 },
    'the failed step stays consumed (fail-closed, no refund)');
});

test('budget exhaustion rejects without execution and never invents output', async () => {
  const drainedEnvelope = createBoundedEnvelope({
    budget: { maxSteps: 1, maxWorkUnits: 4, wallClockMs: 60_000 },
    providers: [{ kind: 'local-deterministic', id: 'a2-invoker' }],
  });
  const drained = makeFixture({ envelope: drainedEnvelope });
  const drainedInvoker = createFunctionInvoker(drained.config);
  const first = completedOf(await drainedInvoker.invoke({
    functionId: 'assessTaskEvidence', input: { claims: [{ status: 'PASS' }] },
  }), 'the first call consumes the last step');
  assert.deepEqual(first.remaining, { steps: 0, workUnits: 3 });
  const second = await drainedInvoker.invoke({
    functionId: 'assessTaskEvidence', input: { claims: [{ status: 'FAIL' }] },
  });
  assert.equal(second.status, 'BUDGET_EXHAUSTED');
  if (second.status !== 'BUDGET_EXHAUSTED') return;
  assert.equal(second.axis, 'steps');
  assert.equal(second.output, null, 'no output on exhaustion');
  assert.equal(second.disposition, 'UNKNOWN');
  assert.equal(second.functionId, 'assessTaskEvidence');
  assert.equal(second.elementId, 'demo.tasks');
  assert.equal(second.source, 'demo/assess.mjs');
  assert.equal(second.target, TARGET);
  assert.equal(second.inputValidation, 'VALIDATED');
  assert.equal(second.attested, false);
  assert.equal(second.authority, 'NONE');
  assert.equal(second.effectDispatched, false);
  assert.equal(drained.tracked.calls['assessTaskEvidence'], 1, 'the exhausted second call never reaches the callable');

  const starvedEnvelope = createBoundedEnvelope({
    budget: { maxSteps: 4, maxWorkUnits: 1, wallClockMs: 60_000 },
    providers: [{ kind: 'local-deterministic', id: 'a2-invoker' }],
  });
  const starved = makeFixture({ envelope: starvedEnvelope, stepWorkUnits: 2 });
  const starvedOutcome = await createFunctionInvoker(starved.config)
    .invoke({ functionId: 'assessTaskEvidence', input: VALID_ASSESS_INPUT });
  assert.equal(starvedOutcome.status, 'BUDGET_EXHAUSTED');
  assert.equal((starvedOutcome as Extract<FunctionCallOutcome, { status: 'BUDGET_EXHAUSTED' }>).axis, 'workUnits');
  assert.equal(starved.tracked.totalCalls(), 0, 'reserve denial happens before the callable runs');
});

test('deadline cancellation and late executor resolution never masquerade as success', async () => {
  const { clock, advance } = makeFakeClock();
  const envelope = createBoundedEnvelope({
    budget: { maxSteps: 4, maxWorkUnits: 8, wallClockMs: 50 },
    providers: [{ kind: 'local-deterministic', id: 'a2-invoker' }],
    clock,
  });
  let callableStarted = false;
  let resolveCallable: (value: unknown) => void = () => {};
  const hung = new Promise<unknown>((resolve) => { resolveCallable = resolve; });
  const fixture = makeFixture({
    envelope,
    bindingOverrides: {
      assessTaskEvidence: {
        callable: () => { callableStarted = true; return hung; },
      },
    },
  });
  const invoker = createFunctionInvoker(fixture.config);
  const pending = invoker.invoke({ functionId: 'assessTaskEvidence', input: VALID_ASSESS_INPUT });
  for (let spins = 0; spins < 100 && !callableStarted; spins += 1) await Promise.resolve();
  assert.equal(callableStarted, true, 'the callable must reach its bounded step');
  advance(60);
  const outcome = await pending;
  assert.equal(outcome.status, 'BUDGET_EXHAUSTED');
  if (outcome.status !== 'BUDGET_EXHAUSTED') return;
  assert.equal(outcome.axis, 'wallClockMs');
  assert.equal(outcome.output, null);
  assert.equal(outcome.disposition, 'UNKNOWN');
  assert.equal(outcome.functionId, 'assessTaskEvidence');
  assert.equal(outcome.attested, false);
  assert.equal(outcome.authority, 'NONE');
  assert.equal(outcome.trace.some((event) => event.type === 'run-completed'), false,
    'an abandoned run is never recorded as completed');
  // The late truth must never upgrade the recorded outcome.
  resolveCallable({ admitted: 999, unknown: 999 });
  for (let spins = 0; spins < 50; spins += 1) await Promise.resolve();
  assert.equal(outcome.status, 'BUDGET_EXHAUSTED', 'recorded outcome is immutable after the deadline');
  assert.equal(outcome.output, null);
});
