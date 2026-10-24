/**
 * v0.10.2 T04 (#1324) — the frozen Microkernel public surface (L2 §3).
 * Value namespace of the `.` entry, the frozen DomainApp shape, and the
 * redaction/normalization fixtures for the load/send/query/subscribe
 * refusal families — including the forged-Host-error negatives of R1 P1-03
 * (a thrown typed error instance, its `cause` and its extra own properties
 * never cross the entry; only the exact allowlisted surface is rebuilt).
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
  // The frozen surface is exactly [".", "./host-seam"]; the seam entry was
  // published by the A7-authorized manifest fix (af6cdb27, #1359) — the live
  // bare-specifier import of the five seam values is proven by
  // selected-runtime-boundary.test.ts; here the map denies every deep
  // dist/internal/* path (Node ERR_PACKAGE_PATH_NOT_EXPORTED).
  assert.ok(typeof manifest.exports['.'] === 'object' || typeof manifest.exports['.'] === 'string');
  assert.ok(typeof manifest.exports['./host-seam'] === 'object' || typeof manifest.exports['./host-seam'] === 'string');
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

/** The R1 P1-03 vector: a Host store whose reads raise a forged typed error. */
class PoisonedDocStore extends PlainCasDocStore {
  poison: unknown = null;
  override async get(key: string): Promise<{ value: unknown; revision: number } | null> {
    if (this.poison !== null) throw this.poison;
    return await super.get(key);
  }
}

/**
 * Mirrors the BUILD-owned `V10DeploymentError` shape (qualified-package
 * v10build/deployment.ts): the wrapper cannot import the BUILD class, so it
 * reduces any deployment-named `detail` by the frozen wire `name` — this
 * local mirror proves that reduction against the real constructor shape.
 */
class ForgedDeploymentError extends V10Error {
  readonly detail: Readonly<Record<string, unknown>> | undefined;
  constructor(code: string, message: string, detail?: Record<string, unknown>) {
    super(code, message);
    this.name = 'V10DeploymentError';
    this.detail = detail === undefined ? undefined : Object.freeze({ ...detail });
  }
}

test('T04-PUB-7: a forged Host store error never crosses send as itself (R1 P1-03)', { timeout: 60_000 }, async () => {
  const app = buildV10App(await basicComposition());
  const store = new PoisonedDocStore();
  const domainApp = await microkernel.load(app, { store });

  // Forged base-class error: a valid code and a SAFE message, but the thrown
  // instance carries an ErrorOptions `cause` plus host-attached own fields.
  const forged = new V10Error(
    'HOST_DOC_READ_FAILED',
    'a safe host store diagnostic',
    { cause: { secret: 'tenant:v0102 grant:private' } },
  );
  (forged as unknown as Record<string, unknown>).tenantId = 'tenant:other';
  store.poison = forged;
  const sent = await refuseCode(() => domainApp.send({ ...INTENT }));
  assert.ok(sent !== forged, 'the thrown instance itself never crosses the entry');
  assert.equal(sent.code, 'HOST_DOC_READ_FAILED');
  assert.equal(sent.message, 'a safe host store diagnostic');
  assertSafePublicError(sent);
  // The vector was real: the forged instance still carries its secrets inside.
  assert.deepEqual((forged.cause as { secret: string }).secret, 'tenant:v0102 grant:private');

  // Forbidden-grammar message: redacted AND stripped in the same rebuild.
  const grammar = new V10Error(
    'HOST_DOC_READ_FAILED',
    'read failed under v010-k02:deployment/x/doc/y',
    { cause: { secret: 'tenant:v0102 grant:private' } },
  );
  (grammar as unknown as Record<string, unknown>).tenantId = 'tenant:other';
  store.poison = grammar;
  const redacted = await refuseCode(() => domainApp.send({ ...INTENT }));
  assert.ok(redacted !== grammar);
  assert.equal(redacted.code, 'HOST_DOC_READ_FAILED');
  assert.match(redacted.message, /^\[HOST_DOC_READ_FAILED\] the public facade refused/u);
  assertSafePublicError(redacted);

  // Deployment-shaped forged error: `detail` reduced to exactly `{ retryable }`.
  const deployment = new ForgedDeploymentError(
    'V10_DEPLOYMENT_REFUSED',
    'a safe deployment refusal',
    { retryable: true, approvalRef: 'v10/k/secret' },
  );
  store.poison = deployment;
  const reduced = await refuseCode(() => domainApp.send({ ...INTENT }));
  assert.ok(reduced !== deployment);
  assert.ok(reduced instanceof ForgedDeploymentError, 'class identity is preserved');
  assert.deepEqual((reduced as ForgedDeploymentError).detail, { retryable: true });
  assertSafePublicError(reduced);

  // A non-boolean `retryable` drops the whole detail instead of copying it.
  const unretryable = new ForgedDeploymentError(
    'V10_DEPLOYMENT_REFUSED',
    'a safe deployment refusal',
    { retryable: 'yes', approvalRef: 'v10/k/secret' },
  );
  store.poison = unretryable;
  const dropped = await refuseCode(() => domainApp.send({ ...INTENT }));
  assert.equal((dropped as ForgedDeploymentError).detail, undefined);
  assertSafePublicError(dropped);

  domainApp.stop();
});

test('T04-PUB-8: query isolates forged Host read/authority faults; subscribe refusals share the exact surface', { timeout: 60_000 }, async () => {
  const app = buildV10App(await basicComposition());
  const store = new PoisonedDocStore();
  const deploymentIdentity = {
    deployedAppId: 'deployment:v0102-t04-pub8',
    tenantId: 'tenant:v0102-t04',
    appId: app.appId,
  };
  const domainApp = await microkernel.load(app, {
    store,
    deploymentIdentity,
    queryAuthority: {
      principal: { role: 'reader' },
      authorize: () => true,
    },
  });

  // ANY reader fault is converted into the selector's own fresh typed
  // refusal: the forged instance, its cause and its key grammar never cross.
  const forged = new V10Error(
    'HOST_DOC_READ_FAILED',
    'read failed under v010-k02:deployment/x/doc/y',
    { cause: { secret: 'tenant:v0102 grant:private' } },
  );
  store.poison = forged;
  const readFault = await refuseCoded(() => domainApp.query({ workflowId: 'order-quote', instanceKey: INTENT.instanceKey }));
  assert.ok(readFault !== (forged as unknown as Error));
  assert.equal(readFault.name, 'V10MultiBQueryError');
  assert.equal(readFault.code, 'QUERY_READ_FAILED');
  assertSafePublicError(readFault);

  // A Host authority callback that throws is isolated the same way.
  const throwing = new V10Error('QUERY_AUTHORIZATION_UNAVAILABLE', 'safe', { cause: { secret: 'x' } });
  const throwingAuth = await microkernel.load(app, {
    store: new PlainCasDocStore(),
    deploymentIdentity,
    queryAuthority: {
      principal: { role: 'reader' },
      authorize: () => {
        throw throwing;
      },
    },
  });
  const authFault = await refuseCoded(() => throwingAuth.query({ workflowId: 'order-quote', instanceKey: INTENT.instanceKey }));
  assert.ok(authFault !== (throwing as unknown as Error));
  assert.equal(authFault.code, 'QUERY_AUTHORIZATION_UNAVAILABLE');
  assertSafePublicError(authFault);

  // Consistent wrapping on the subscribe seam: its Host-wiring refusal is a
  // fresh typed error with the same exact surface (no cause, no extras).
  const bare = await microkernel.load(app, { store: new PlainCasDocStore() });
  const subscribeRefusal = await refuseCoded(() => bare.subscribe({ workflowId: 'order-quote', instanceKey: 'instance:x' }, () => {}));
  assert.equal(subscribeRefusal.code, 'QUERY_AUTHORIZATION_REQUIRED');
  assertSafePublicError(subscribeRefusal);

  domainApp.stop();
  throwingAuth.stop();
  bare.stop();
});
/** Capture one typed V10Error refusal (assert.rejects with a validator returns undefined). */
async function refuseCode(run: () => Promise<unknown>): Promise<V10Error> {
  try {
    await run();
  } catch (error) {
    assert.ok(error instanceof V10Error, `expected a typed V10Error, got ${String(error)}`);
    return error;
  }
  assert.fail('expected the operation to refuse typed');
}

/** Capture one typed refusal of any public error family (V10Error or the multib family). */
async function refuseCoded(run: () => Promise<unknown>): Promise<Error & { code: string }> {
  try {
    await run();
  } catch (error) {
    assert.ok(
      error instanceof Error && typeof (error as { code?: unknown }).code === 'string',
      `expected a coded typed error, got ${String(error)}`,
    );
    return error as Error & { code: string };
  }
  assert.fail('expected the operation to refuse typed');
}

/**
 * The frozen public error contract: name, code, safe message — and NOTHING
 * else. [R1 P1-03] the exact own-key surface: a public error owns nothing
 * beyond the contract fields (plus the natural Error `stack`, which L2 §3 /
 * O10 explicitly holds outside the contract) — no `cause`, no host-attached
 * own property rides across the entry. `detail` exists only on the
 * deployment family, always reduced to exactly `{ retryable }`.
 */
function assertSafePublicError(error: Error & { code: string }): void {
  const serialized = JSON.stringify({ name: error.name, code: error.code, message: error.message });
  for (const forbidden of ['v08-kernel:', 'v010-k02:', 'v10/k/']) {
    assert.equal(serialized.includes(forbidden), false, `the public message leaks ${forbidden}`);
  }
  assert.doesNotMatch(error.message, /(?:[A-Za-z]:[\\/]|\/(?:home|Users|root|tmp|var)\/)/u);
  const allowed = new Set(['stack', 'message', 'code', 'name']);
  if (error.name === 'V10DeploymentError') allowed.add('detail');
  for (const key of Object.getOwnPropertyNames(error)) {
    assert.ok(allowed.has(key), `public error carries the non-contract own property '${key}'`);
  }
  assert.equal('cause' in error, false, 'a public error never carries a cause');
}
