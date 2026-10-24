/**
 * v0.10.2 T04 (#1324) — the frozen Microkernel public surface (L2 §3).
 * Value namespace of the `.` entry, the frozen DomainApp shape, and the
 * redaction fixture for the load/send/query refusal families.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import * as microkernel from '../src/index.js';
import { V10Error } from '@kaicreator/domain-harness-contracts';
import {
  BUSINESS_PACKAGE_ID,
  INTENT,
  PlainCasDocStore,
  basicComposition,
} from '../../../tests/assembly/helpers-v010.js';
import { buildV10App } from '../../../tooling/build/src/index.js';

/** The exact value allowlist of the public entry (types are compile-time). */
const PUBLIC_VALUES = [
  'load',
  'V10Error',
  'V10BuildError',
  'V10ActivationError',
  'V10ExternalEffectError',
  'V10PortDeniedError',
  'V10MultiBQueryError',
] as const;

test('T04-PUB-1: the `.` namespace equals the frozen allowlist exactly', async () => {
  assert.deepEqual(Object.keys(microkernel).sort(), [...PUBLIC_VALUES].sort());
  for (const name of PUBLIC_VALUES) {
    assert.ok(name in microkernel, `${name} is exported`);
  }
  // Error identities are the Contracts classes themselves (single identity).
  assert.equal(microkernel.V10Error, V10Error);
  assert.ok(new microkernel.V10PortDeniedError('docs') instanceof V10Error);
  assert.ok(new microkernel.V10MultiBQueryError('X', 'x') instanceof Error);
});

test('T04-PUB-2: exports map exposes only the curated subpaths (deep internals deny)', async () => {
  const manifest = JSON.parse(await readFile(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')) as {
    exports: Record<string, unknown>;
  };
  // The frozen end state is [".", "./host-seam"]; the subpath registration
  // itself is owned by the exclusive manifest task (T07), so at this pin the
  // "." entry exists and every deep dist/internal/* path is denied by the
  // present map (Node ERR_PACKAGE_PATH_NOT_EXPORTED).
  assert.ok(typeof manifest.exports['.'] === 'object' || typeof manifest.exports['.'] === 'string');
  for (const subpath of ['*/internal/*', './internal/activation']) {
    assert.equal(subpath in manifest.exports, false);
  }
  await assert.rejects(
    () => import('@kaicreator/domain-harness-microkernel/dist/internal/activation.js'),
    (error: unknown) => (error as NodeJS.ErrnoException).code === 'ERR_PACKAGE_PATH_NOT_EXPORTED',
    'a deep internal import must be denied by the exports map',
  );
});

test('T04-PUB-3: DomainApp own keys are exactly [send, query, subscribe, stop], frozen', async () => {
  const app = buildV10App(await basicComposition());
  const domainApp = await microkernel.load(app, { store: new PlainCasDocStore() });
  assert.deepEqual(Object.keys(domainApp), ['send', 'query', 'subscribe', 'stop']);
  assert.ok(Object.isFrozen(domainApp));
  domainApp.stop();
  domainApp.stop(); // idempotent
});

test('T04-PUB-4: load/send/query refusal families carry name, code and a safe message only', async () => {
  // load: structurally invalid App data.
  const invalid = await refuseCode(() => microkernel.load({ formatVersion: 'nope' } as never, { store: new PlainCasDocStore() }));
  assert.equal(invalid.name, 'V10ActivationError');
  assert.equal(invalid.code, 'V10_APP_INVALID');
  assertSafePublicError(invalid);

  // query without Host wiring (no authority / no deployment identity).
  const app = buildV10App(await basicComposition());
  const domainApp = await microkernel.load(app, { store: new PlainCasDocStore() });
  const refused = await refuseCode(() => domainApp.query({ workflowId: 'order-quote', instanceKey: 'instance:x' }));
  assert.equal(refused.code, 'QUERY_AUTHORIZATION_REQUIRED');
  assertSafePublicError(refused);

  // send after stop: the closed facade.
  domainApp.stop();
  const closed = await refuseCode(() => domainApp.send({ ...INTENT }));
  assert.equal(closed.code, 'FACADE_CLOSED');
  assertSafePublicError(closed);
});

test('T04-PUB-5: physical send/query over the real selected kernel through the public facade', { timeout: 60_000 }, async () => {
  const app = buildV10App(await basicComposition());
  const store = new PlainCasDocStore();
  const deploymentIdentity = {
    deployedAppId: 'deployment:v0102-t04-pub',
    tenantId: 'tenant:v0102-t04',
    appId: app.appId,
  };
  const queryAuthority = {
    principal: { role: 'reader' },
    authorize: (_principal: unknown, target: { businessPackageId: string }) =>
      target.businessPackageId === BUSINESS_PACKAGE_ID,
  };
  const domainApp = await microkernel.load(app, {
    store,
    deploymentIdentity,
    queryAuthority,
    now: () => Date.UTC(2026, 9, 25, 9, 0, 0),
  });
  const receipt = await domainApp.send({ ...INTENT });
  assert.equal(receipt.status, 'admitted', `the public facade admits through the real kernel (${JSON.stringify(receipt).slice(0, 160)})`);
  const answer = await domainApp.query({ workflowId: 'order-quote', instanceKey: INTENT.instanceKey });
  assert.ok(answer.snapshot !== null && answer.snapshot !== undefined, 'the single answer carries the scoped snapshot');
  assert.equal(answer.target.businessPackageId, BUSINESS_PACKAGE_ID);
  const many = await domainApp.query([{ workflowId: 'order-quote', instanceKey: INTENT.instanceKey }, { workflowId: 'order-quote', instanceKey: 'instance:absent' }]);
  assert.equal(many.length, 2);
  assert.equal(many[0]?.status, 'answered');
  assert.equal(many[1]?.status, 'refused');
  domainApp.stop();
});

test('T04-PUB-6: subscribe enforces the exact query preconditions; no delivery is claimed at this pin', async () => {
  const app = buildV10App(await basicComposition());
  const domainApp = await microkernel.load(app, { store: new PlainCasDocStore() });
  // Without query wiring the same typed refusals as query (L2 §8).
  const refused = await refuseCode(() => domainApp.subscribe({ workflowId: 'order-quote', instanceKey: 'instance:x' }, () => {}));
  assert.equal(refused.code, 'QUERY_AUTHORIZATION_REQUIRED');
  // A malformed selector refuses without any registration.
  const malformed = await refuseCode(() => domainApp.subscribe({ instanceKey: 'instance:x' } as never, () => {}));
  assert.equal(malformed.code, 'QUERY_SELECTOR_INVALID');
  // A listener that is not a function refuses typed.
  const noListener = await refuseCode(() => domainApp.subscribe({ workflowId: 'q', instanceKey: 'i' }, undefined as never));
  assert.equal(noListener.code, 'V10_ACTIVATION_OPTIONS_INVALID');
  domainApp.stop();
  // After stop a new subscription refuses FACADE_CLOSED (the §8 teardown rule).
  const closed = await refuseCode(() => domainApp.subscribe({ workflowId: 'q', instanceKey: 'i' }, () => {}));
  assert.equal(closed.code, 'FACADE_CLOSED');
});

/** Capture one typed refusal (assert.rejects with a validator returns undefined). */
async function refuseCode(run: () => Promise<unknown>): Promise<V10Error> {
  try {
    await run();
  } catch (error) {
    assert.ok(error instanceof V10Error, `expected a typed V10Error, got ${String(error)}`);
    return error;
  }
  assert.fail('expected the operation to refuse typed');
}

/** The frozen public error contract: name, code, safe message — no key grammar, no paths. */
function assertSafePublicError(error: V10Error): void {
  const serialized = JSON.stringify({ name: error.name, code: error.code, message: error.message });
  for (const forbidden of ['v08-kernel:', 'v010-k02:', 'v10/k/']) {
    assert.equal(serialized.includes(forbidden), false, `the public message leaks ${forbidden}`);
  }
  assert.doesNotMatch(error.message, /(?:[A-Za-z]:[\\/]|\/(?:home|Users|root|tmp|var)\/)/u);
}
