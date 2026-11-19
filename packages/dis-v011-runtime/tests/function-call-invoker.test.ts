import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import Ajv from 'ajv';
// A2 selected-Function invoker (#1542) composes the D1 element contract layer
// (runtime sibling imports) with the D2 bounded envelope (self-contained).
// Tests consume the compiled dist output for element + function-call modules
// (same idiom as element-*.test.ts) and the bounded envelope from source
// (same idiom as bounded-*.test.ts).
import { createFunctionInvoker } from '../dist/function-call/invoker.js';
import type {
  FunctionBindings, FunctionCallOutcome, FunctionInputValidator, FunctionInvokerConfig,
} from '../dist/function-call/invoker.js';
import { assertFunctionBindings, ELEMENT_MANIFEST_SCHEMA, lockAot, parseElementManifest } from '../dist/element/index.js';
import type { ElementFunctionDecl, ElementManifest } from '../dist/element/index.js';
import { createBoundedEnvelope } from '../src/bounded/envelope.ts';
import type { BoundedEnvelope } from '../src/bounded/envelope.ts';
import { digest } from '../src/knowledge.ts';

const TARGET = 'linux-x64-node24';

// Rule/knowledge/effect implementation bytes sealed by the AOT lock; the
// invoker callables mirror their behavior (same as the I0 integration idiom).
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

// Real pre-compiled Validators (Ajv) for the typed input schemas referenced
// by the two no-effect rule Functions; the knowledge Function deliberately
// has none (schema-ref-only => UNAVAILABLE, exercised in the negative file).
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

function buildTrustedBundle(): { manifest: ElementManifest; lock: ReturnType<typeof lockAot> } {
  const manifest = parseElementManifest(RAW_MANIFEST);
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

/** Callables that count every invocation so tests can prove zero execution. */
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
} = {}) {
  const { manifest, lock } = buildTrustedBundle();
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

function completedOf(outcome: FunctionCallOutcome, label = ''): CompletedCall {
  assert.equal(outcome.status, 'COMPLETED', label);
  return outcome as CompletedCall;
}

test('construction seals the trusted bundle into a frozen channel with per-function validation visibility', () => {
  const { config } = makeFixture();
  const invoker = createFunctionInvoker(config);
  assert.equal(Object.isFrozen(invoker), true);
  assert.equal(invoker.expectedTarget, TARGET);
  assert.equal(invoker.providerKind, 'local-deterministic');
  assert.deepEqual(invoker.functions.map((fn) => fn.functionId).sort(), [...FUNCTION_IDS].sort());
  assert.equal(Object.isFrozen(invoker.functions), true);
  const assess = invoker.functions.find((fn) => fn.functionId === 'assessTaskEvidence');
  assert.deepEqual(assess, {
    functionId: 'assessTaskEvidence', elementId: 'demo.tasks', source: 'demo/assess.mjs',
    target: TARGET, effects: 'none', inputSchemaRef: 'schemas/demo/task-evidence.input.json',
    validation: 'AVAILABLE',
  });
  const policy = invoker.functions.find((fn) => fn.functionId === 'describeBusinessPolicy');
  assert.equal(policy?.validation, 'UNAVAILABLE', 'schema-ref-only Functions are visible as UNAVAILABLE');
  const acquire = invoker.functions.find((fn) => fn.functionId === 'acquire');
  assert.equal(acquire?.effects, 'non-idempotent', 'effect modes stay visible on the channel view');
});

test('one selected no-effect Function yields actually different observable outputs for different inputs', async () => {
  const { config } = makeFixture();
  const invoker = createFunctionInvoker(config);
  const first = completedOf(await invoker.invoke({
    functionId: 'assessTaskEvidence',
    input: { claims: [{ status: 'PASS' }, { status: 'FAIL' }, { status: 'UNKNOWN' }] },
  }), 'mixed claims must complete');
  assert.deepEqual(first.output, { admitted: 2, unknown: 1 });
  assert.equal(first.disposition, 'OBSERVED');
  // Observable output carries Function id / source / budget observation fields.
  assert.equal(first.functionId, 'assessTaskEvidence');
  assert.equal(first.elementId, 'demo.tasks');
  assert.equal(first.source, 'demo/assess.mjs');
  assert.equal(first.target, TARGET);
  assert.equal(first.inputValidation, 'VALIDATED');
  assert.deepEqual(first.provider, { kind: 'local-deterministic', id: 'a2-invoker', attested: false, verified: false });
  assert.deepEqual(first.remaining, { steps: 7, workUnits: 31 });
  assert.equal(first.attested, false);
  assert.equal(first.verified, false);
  assert.equal(first.qualified, false);
  assert.equal(first.authority, 'NONE');
  assert.equal(first.effectDispatched, false);
  assert.equal(first.trace.some((event) => event.type === 'run-completed'), true);

  const second = completedOf(await invoker.invoke({
    functionId: 'assessTaskEvidence',
    input: { claims: [{ status: 'PASS' }, { status: 'PASS' }] },
  }), 'all-pass claims must complete');
  assert.deepEqual(second.output, { admitted: 2, unknown: 0 });
  assert.notDeepEqual(second.output, first.output, 'different inputs must produce actually different results');
  assert.deepEqual(second.remaining, { steps: 6, workUnits: 30 }, 'each invocation consumes its bounded step');
});

test('a second legal selected Function runs on its own binding and never mis-invokes the first', async () => {
  const { config, tracked } = makeFixture();
  const invoker = createFunctionInvoker(config);
  const readiness = completedOf(await invoker.invoke({
    functionId: 'projectReleaseReadiness',
    input: { admitted: 2, unknown: 1 },
  }), 'readiness projection must complete');
  assert.equal(readiness.functionId, 'projectReleaseReadiness');
  assert.equal(readiness.elementId, 'demo.release');
  assert.equal(readiness.source, 'demo/project.mjs');
  assert.deepEqual(readiness.output, { ready: false });
  assert.equal(readiness.inputValidation, 'VALIDATED');
  assert.deepEqual(readiness.remaining, { steps: 7, workUnits: 31 });
  assert.equal(tracked.calls['assessTaskEvidence'], 0, 'the first Function must never be mis-invoked');
  assert.equal(tracked.calls['projectReleaseReadiness'], 1);
  assert.equal(tracked.calls['describeBusinessPolicy'], 0);
  assert.equal(tracked.calls['acquire'], 0);
});

test('fixture-provider results stay unattested, unverified and authority-free (test-only kind)', async () => {
  const envelope = createBoundedEnvelope({
    budget: { maxSteps: 4, maxWorkUnits: 8, wallClockMs: 60_000 },
    providers: [{ kind: 'fixture', id: 'fixture-a2-test' }],
  });
  const { config } = makeFixture({ envelope, providerKind: 'fixture' });
  const invoker = createFunctionInvoker(config);
  const outcome = completedOf(await invoker.invoke({
    functionId: 'assessTaskEvidence',
    input: { claims: [{ status: 'FAIL' }] },
  }), 'fixture-routed call must complete');
  assert.deepEqual(outcome.output, { admitted: 1, unknown: 0 });
  assert.deepEqual(outcome.provider, { kind: 'fixture', id: 'fixture-a2-test', attested: false, verified: false },
    'fixture output is never promoted to attested/verified');
  assert.equal(outcome.attested, false);
  assert.equal(outcome.verified, false);
  assert.equal(outcome.qualified, false);
  assert.equal(outcome.authority, 'NONE');
  assert.equal(outcome.effectDispatched, false);
  for (const event of outcome.trace) {
    assert.equal(event.attested, false, 'every trace event stays an unattested observation');
    assert.equal(event.authority, 'NONE', 'trace never carries authority');
  }
});

test('per-call step cost is charged against the shared ledger exactly as configured', async () => {
  const envelope = createBoundedEnvelope({
    budget: { maxSteps: 2, maxWorkUnits: 5, wallClockMs: 60_000 },
    providers: [{ kind: 'local-deterministic', id: 'a2-invoker' }],
  });
  const { config } = makeFixture({ envelope, stepWorkUnits: 2 });
  const invoker = createFunctionInvoker(config);
  const first = completedOf(await invoker.invoke({
    functionId: 'assessTaskEvidence', input: { claims: [{ status: 'PASS' }] },
  }));
  assert.deepEqual(first.remaining, { steps: 1, workUnits: 3 });
  const second = completedOf(await invoker.invoke({
    functionId: 'assessTaskEvidence', input: { claims: [{ status: 'FAIL' }] },
  }));
  assert.deepEqual(second.remaining, { steps: 0, workUnits: 1 });
  const third = await invoker.invoke({
    functionId: 'assessTaskEvidence', input: { claims: [{ status: 'UNKNOWN' }] },
  });
  assert.equal(third.status, 'BUDGET_EXHAUSTED', 'the drained ledger fails the next call closed');
  assert.equal(third.axis, 'steps');
  assert.equal(third.output, null);
});
