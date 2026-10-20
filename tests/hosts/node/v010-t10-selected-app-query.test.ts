/**
 * v0.10 T10 (#1176) — PHYSICAL selected-App authorized scoped query.
 * ==================================================================
 *
 * The merged Host core (`V10AuthorizedMultiBQuery`, PR #1194) is composed
 * into the selected `V10AppFacade` after C01 closed: two REAL Business
 * packages of ONE sealed deployment share workflowId+instanceKey on ONE
 * file-backed SQLite K store, and the Host-verified principal/authorization
 * is deployment wiring fixed at activation — never public query input.
 *
 * Positive:
 *   T10S-P1  each exact B answers its own snapshot; independent original
 *            replay under the SAME messageId; disjoint K02 key spaces.
 *   T10S-P2  unscoped query with both B VISIBLE is typed ambiguous BEFORE
 *            any physical read (no implicit first-match).
 *   T10S-P3  one visible B answers alone; the hidden B physically exists
 *            under the same workflow/instance and its bytes are never read.
 *   T10S-P5  a real second Node process queries the SAME SQLite file and
 *            answers the exact B with zero writes.
 *   T10S-P6  after a physical close/reopen the query answers from durable
 *            per-B state.
 *
 * Negative:
 *   T10S-N1  no Host authority -> QUERY_AUTHORIZATION_REQUIRED, no reads.
 *   T10S-N2  authority without a deployment identity -> typed refusal, no
 *            unscoped cross-B fallback.
 *   T10S-N3  hidden B, foreign B and a fully absent workflow collapse into
 *            one byte-identical non-oracle refusal with zero reads.
 *   T10S-N4  cross-tenant principal denied before any physical read.
 *   T10S-N5  malformed selector / caller-forged principal+grant never
 *            influence the Host authority or probe K.
 *   T10S-N6  malformed Host wiring refuses activation.
 *   T10S-N7  queries never write K state or dispatch an effect.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after, before } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  V10ActivationError,
  activateV10App,
  type V10Activation,
  type V10BuiltApp,
} from '../../../packages/domain-harness-compiler/src/qualified-package/v10build/index.js';
import { openSqliteCasStore, type SqliteCasStore } from '../../../packages/domain-harness/src/host-v8/index.js';
import {
  T10_ALPHA,
  T10_BETA,
  T10_DEPLOYMENT,
  T10_HOST_PRINCIPAL,
  T10_NOW,
  T10_SHARED_TARGET,
  buildT10TwoBApp,
  refusalCode,
  t10Authority,
  t10CountingStore,
  t10Probe,
  type T10AccessEvent,
  type T10AuthorityProbe,
  type T10PhysicalCounts,
} from './v010-t10-selected-app-fixture.js';

assert.equal(
  Number(process.versions.node.split('.')[0]),
  24,
  `the T10 selected-App physical witness targets Node24 (running ${process.versions.node})`,
);

const CHILD_SCRIPT = fileURLToPath(new URL('./v010-t10-selected-app-query-child.ts', import.meta.url));
const ROOT_DIR = fileURLToPath(new URL('../../..', import.meta.url));

const counts: T10PhysicalCounts = { gets: 0, puts: 0, removes: 0 };
const events: T10AccessEvent[] = [];
const probe: T10AuthorityProbe = t10Probe();
const visible = new Set<string>([T10_ALPHA, T10_BETA]);

let dir = '';
let kPath = '';
let store: SqliteCasStore | undefined;
let app: V10BuiltApp;
let activation: V10Activation;

function countingStore(): ReturnType<typeof t10CountingStore> {
  return t10CountingStore(store as SqliteCasStore, counts, events);
}

async function activateSelected(options: {
  queryAuthority?: boolean;
  withDeployment?: boolean;
  principal?: unknown;
  visibility?: Set<string>;
} = {}): Promise<V10Activation> {
  const visibility = options.visibility ?? visible;
  const authority = options.queryAuthority === false
    ? undefined
    : t10Authority(visibility, probe, options.principal ?? T10_HOST_PRINCIPAL, events);
  return await activateV10App(app, {
    store: countingStore(),
    tenantId: T10_DEPLOYMENT.tenantId,
    now: () => T10_NOW,
    ...(options.withDeployment === false ? {} : { deploymentIdentity: T10_DEPLOYMENT }),
    ...(authority === undefined ? {} : { queryAuthority: authority }),
  });
}

async function refusal(promise: Promise<unknown>): Promise<{ code: string; message: string }> {
  try {
    await promise;
  } catch (error) {
    return error as { code: string; message: string };
  }
  assert.fail('expected the query to be refused');
}

function snapshotOf(answer: { snapshot: unknown }): Record<string, any> {
  return answer.snapshot as Record<string, any>;
}

function getEvents(): T10AccessEvent[] {
  return events.filter((event) => event.kind === 'get');
}

function resetEvents(): void {
  events.length = 0;
}

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'dh010-t10-selected-app-'));
  kPath = join(dir, 'k.sqlite');
  store = await openSqliteCasStore({ path: kPath });
  app = await buildT10TwoBApp();
  activation = await activateSelected();
});

after(async () => {
  try {
    activation.dispose();
  } catch {
    // bounded best-effort teardown
  }
  await store?.close();
  for (const suffix of ['', '-wal', '-shm']) {
    await rm(`${kPath}${suffix}`, { force: true });
  }
  await rm(dir, { recursive: true, force: true });
});

test('T10S-P1 selected B are disjoint and each exact scoped query answers its own snapshot', async () => {
  const alpha = await activation.facade.send({
    intentType: 'submitQuoteDecision',
    instanceKey: T10_SHARED_TARGET.instanceKey,
    messageId: 'm-shared-1',
    input: { amount: 42 },
  });
  assert.equal(alpha.status, 'admitted', `alpha receipt: ${JSON.stringify(alpha).slice(0, 300)}`);
  const beta = await activation.facade.send({
    intentType: 'submitQuoteDecisionStrict',
    instanceKey: T10_SHARED_TARGET.instanceKey,
    messageId: 'm-shared-1',
    input: { amount: 42 },
  });
  assert.equal(beta.status, 'admitted', `beta receipt: ${JSON.stringify(beta).slice(0, 300)}`);

  // The SAME messageId replays independently inside each B's scoped state.
  const alphaReplay = await activation.facade.send({
    intentType: 'submitQuoteDecision',
    instanceKey: T10_SHARED_TARGET.instanceKey,
    messageId: 'm-shared-1',
    input: { amount: 42 },
  });
  const betaReplay = await activation.facade.send({
    intentType: 'submitQuoteDecisionStrict',
    instanceKey: T10_SHARED_TARGET.instanceKey,
    messageId: 'm-shared-1',
    input: { amount: 42 },
  });
  assert.equal(alphaReplay.idempotentReplay, true, "alpha replays its OWN original receipt");
  assert.equal(betaReplay.idempotentReplay, true, "beta replays its OWN original receipt under the same messageId");
  assert.equal(alphaReplay.instance.stateRevision, 1);
  assert.equal(betaReplay.instance.stateRevision, 1, 'beta never consumes alpha\'s turn');

  resetEvents();
  const alphaAnswer = await activation.facade.queryScopedSnapshot({ ...T10_SHARED_TARGET, businessPackageId: T10_ALPHA });
  assert.deepEqual(alphaAnswer.target, {
    ...T10_DEPLOYMENT,
    businessPackageId: T10_ALPHA,
    ...T10_SHARED_TARGET,
  });
  assert.equal(snapshotOf(alphaAnswer).state.stateKey, 'approved');
  assert.equal(snapshotOf(alphaAnswer).lifecycle, 'completed');
  assert.equal('principal' in alphaAnswer, false, 'the public answer carries no principal');
  assert.equal('authorize' in alphaAnswer, false, 'the public answer carries no authorization seam');

  const betaAnswer = await activation.facade.queryScopedSnapshot({ ...T10_SHARED_TARGET, businessPackageId: T10_BETA });
  assert.deepEqual(betaAnswer.target, {
    ...T10_DEPLOYMENT,
    businessPackageId: T10_BETA,
    ...T10_SHARED_TARGET,
  });
  assert.equal(snapshotOf(betaAnswer).state.stateKey, 'approved');
  assert.equal(snapshotOf(betaAnswer).stateRevision, 1, 'beta answers its own durable revision');
  assert.deepEqual(
    [...new Set(probe.checks.map((target) => target.businessPackageId))].sort(),
    [T10_ALPHA, T10_BETA].sort(),
    'authorization was evaluated for the exact selected B targets',
  );

  // Every physical get during the two exact answers addressed ONE scoped B.
  for (const event of getEvents()) {
    assert.match(event.key, /v010-k02:/, 'the answer was backed by the K02 scoped namespace');
    assert.ok(
      event.key.includes(`:${T10_ALPHA}:`) || event.key.includes(`:${T10_BETA}:`),
      `read ${event.key} stays inside a selected B namespace`,
    );
  }

  // The two B physically share ZERO keys despite identical workflow+instance.
  const keys = await (store as SqliteCasStore).list('v10/k/');
  const alphaKeys = keys.filter((key) => key.includes(`:${T10_ALPHA}:`));
  const betaKeys = keys.filter((key) => key.includes(`:${T10_BETA}:`));
  assert.ok(alphaKeys.length >= 2, 'alpha owns durable K rows');
  assert.ok(betaKeys.length >= 2, 'beta owns durable K rows');
  assert.equal(alphaKeys.filter((key) => betaKeys.includes(key)).length, 0, 'zero physical keys are shared between the two B');
});

test('T10S-P2 both-visible unscoped query is typed ambiguous with ZERO physical reads', async () => {
  visible.add(T10_ALPHA);
  visible.add(T10_BETA);
  const getsBefore = counts.gets;
  const checksBefore = probe.checks.length;
  resetEvents();
  const error = await refusal(activation.facade.queryScopedSnapshot({ ...T10_SHARED_TARGET }));
  assert.equal(refusalCode(error), 'QUERY_AMBIGUOUS');
  assert.equal(counts.gets, getsBefore, 'ambiguity was decided before any physical read');
  assert.equal(getEvents().length, 0);
  assert.ok(probe.checks.length > checksBefore, 'visibility was decided by authorization, not storage existence');
});

test('T10S-P3 one visible B answers alone; the hidden B with the same key pair is never read', async () => {
  visible.clear();
  visible.add(T10_ALPHA);
  resetEvents();
  const answer = await activation.facade.queryScopedSnapshot({ ...T10_SHARED_TARGET });
  assert.equal(answer.target.businessPackageId, T10_ALPHA);
  assert.equal(snapshotOf(answer).state.stateKey, 'approved');
  const firstGet = events.findIndex((event) => event.kind === 'get');
  assert.ok(firstGet > 0, 'a physical read happened');
  assert.equal(events[firstGet - 1]?.kind, 'authorize', 'the caller was authorized IMMEDIATELY before the only read');
  assert.equal(events[firstGet - 1]?.key, T10_ALPHA);
  assert.ok(
    getEvents().every((event) => event.key.includes(`:${T10_ALPHA}:`)),
    'the hidden B namespace was never physically addressed',
  );

  // The hidden B is physically alive under the SAME workflowId+instanceKey.
  visible.clear();
  visible.add(T10_BETA);
  resetEvents();
  const betaAnswer = await activation.facade.queryScopedSnapshot({ ...T10_SHARED_TARGET });
  assert.equal(betaAnswer.target.businessPackageId, T10_BETA);
  assert.equal(snapshotOf(betaAnswer).state.stateKey, 'approved');
  assert.ok(
    getEvents().every((event) => event.key.includes(`:${T10_BETA}:`)),
    'answering beta reads beta only, never the hidden alpha',
  );
});

test('T10S-N3 hidden B, foreign B and an absent workflow share one non-oracle denial with zero reads', async () => {
  visible.clear();
  visible.add(T10_ALPHA);
  const getsBefore = counts.gets;
  resetEvents();
  const hiddenRefusal = await refusal(activation.facade.queryScopedSnapshot({ ...T10_SHARED_TARGET, businessPackageId: T10_BETA }));
  const foreignRefusal = await refusal(activation.facade.queryScopedSnapshot({ ...T10_SHARED_TARGET, businessPackageId: 'pkg:not-selected' }));
  const absentRefusal = await refusal(activation.facade.queryScopedSnapshot({ workflowId: 'ghost-workflow', instanceKey: T10_SHARED_TARGET.instanceKey }));
  for (const result of [hiddenRefusal, foreignRefusal, absentRefusal]) {
    assert.equal(refusalCode(result), 'QUERY_NOT_FOUND');
    assert.equal(result.message, absentRefusal.message, 'denial is byte-identical whether or not a hidden B exists');
  }
  assert.equal(counts.gets, getsBefore, 'no physical read on any denial path');
  assert.equal(getEvents().length, 0);
});

test('T10S-N4 a cross-tenant principal is denied before any physical read', async () => {
  const crossTenant = await activateSelected({
    principal: { source: 'host-authenticated', subject: 'user:foreign', tenantId: 'tenant-other' },
  });
  try {
    const getsBefore = counts.gets;
    resetEvents();
    assert.equal(refusalCode(await refusal(crossTenant.facade.queryScopedSnapshot({ ...T10_SHARED_TARGET }))), 'QUERY_NOT_FOUND');
    assert.equal(refusalCode(await refusal(crossTenant.facade.queryScopedSnapshot({ ...T10_SHARED_TARGET, businessPackageId: T10_ALPHA }))), 'QUERY_NOT_FOUND');
    assert.equal(counts.gets, getsBefore, 'tenant denial happened before any physical existence read');
    assert.equal(getEvents().length, 0);
    assert.ok(
      probe.observedPrincipals.some((principal) => (principal as { tenantId?: string }).tenantId === 'tenant-other'),
      'the cross-tenant principal reached authorization and was refused there',
    );
  } finally {
    crossTenant.dispose();
  }
});

test('T10S-N5 malformed selectors and caller-forged principal/grant never influence the Host authority', async () => {
  visible.clear();
  visible.add(T10_ALPHA);
  const getsBefore = counts.gets;
  const checksBefore = probe.checks.length;
  const putsBefore = counts.puts;
  resetEvents();
  for (const bad of [
    { workflowId: '', instanceKey: 'x' },
    { workflowId: T10_SHARED_TARGET.workflowId, instanceKey: '' },
    { workflowId: T10_SHARED_TARGET.workflowId, instanceKey: T10_SHARED_TARGET.instanceKey, businessPackageId: '' },
  ]) {
    assert.equal(refusalCode(await refusal(activation.facade.queryScopedSnapshot(bad))), 'QUERY_SELECTOR_INVALID');
  }
  assert.equal(probe.checks.length, checksBefore, 'a malformed selector is never considered for authorization');
  assert.equal(getEvents().length, 0);

  let forgedAuthorizeCalls = 0;
  const forgedPrincipal = { source: 'caller-forged', tenantId: 'tenant-shared-t10', subject: 'user:forged' };
  const forgedSelector = {
    ...T10_SHARED_TARGET,
    businessPackageId: T10_ALPHA,
    principal: forgedPrincipal,
    authorize: () => {
      forgedAuthorizeCalls += 1;
      return true;
    },
  };
  const answer = await activation.facade.queryScopedSnapshot(forgedSelector);
  assert.equal(answer.target.businessPackageId, T10_ALPHA);
  assert.equal(forgedAuthorizeCalls, 0, 'a caller-supplied authorize function is never called');
  assert.ok(
    probe.observedPrincipals.slice(checksBefore).every((principal) => principal === T10_HOST_PRINCIPAL),
    'only the Host-verified principal reached authorization',
  );
  assert.equal(counts.puts, putsBefore);
  assert.ok(counts.gets > getsBefore, 'the legitimate scoped query still read physically');
});

test('T10S-N1/N2 absent Host authority and absent deployment identity fail closed typed', async () => {
  const noAuthority = await activateSelected({ queryAuthority: false });
  try {
    assert.equal(refusalCode(await refusal(noAuthority.facade.queryScopedSnapshot({ ...T10_SHARED_TARGET }))), 'QUERY_AUTHORIZATION_REQUIRED');
  } finally {
    noAuthority.dispose();
  }

  const getsBefore = counts.gets;
  const noDeployment = await activateSelected({ withDeployment: false });
  try {
    assert.equal(refusalCode(await refusal(noDeployment.facade.queryScopedSnapshot({ ...T10_SHARED_TARGET }))), 'QUERY_DEPLOYMENT_REQUIRED');
    assert.equal(counts.gets, getsBefore, 'no unscoped cross-B fallback read anything');
  } finally {
    noDeployment.dispose();
  }
});

test('T10S-N6 malformed Host query wiring refuses activation', async () => {
  const error = await activateV10App(app, {
    store: countingStore(),
    tenantId: T10_DEPLOYMENT.tenantId,
    deploymentIdentity: T10_DEPLOYMENT,
    queryAuthority: { principal: 'user:no-authorizer' } as never,
  }).then(
    () => assert.fail('expected activation refusal'),
    (thrown: unknown) => thrown,
  );
  assert.ok(error instanceof V10ActivationError);
  assert.equal(refusalCode(error), 'V10_APP_INVALID');
});

test('T10S-N7 every query path leaves K state and effect dispatch unwritten', async () => {
  visible.clear();
  visible.add(T10_ALPHA);
  visible.add(T10_BETA);
  const putsBefore = counts.puts;
  const removesBefore = counts.removes;
  const alphaEffects = activation.facade.kCounters(T10_ALPHA).effectDispatches;
  const betaEffects = activation.facade.kCounters(T10_BETA).effectDispatches;
  const externalBefore = activation.counters.externalEffectDispatches;
  await activation.facade.queryScopedSnapshot({ ...T10_SHARED_TARGET, businessPackageId: T10_ALPHA });
  await activation.facade.queryScopedSnapshot({ ...T10_SHARED_TARGET, businessPackageId: T10_BETA });
  await refusal(activation.facade.queryScopedSnapshot({ ...T10_SHARED_TARGET }));
  await refusal(activation.facade.queryScopedSnapshot({ ...T10_SHARED_TARGET, businessPackageId: 'pkg:not-selected' }));
  assert.equal(counts.puts, putsBefore, 'queries perform zero physical writes');
  assert.equal(counts.removes, removesBefore);
  assert.equal(activation.facade.kCounters(T10_ALPHA).effectDispatches, alphaEffects, 'queries dispatch no alpha effect');
  assert.equal(activation.facade.kCounters(T10_BETA).effectDispatches, betaEffects, 'queries dispatch no beta effect');
  assert.equal(activation.counters.externalEffectDispatches, externalBefore);
});

test('T10S-P5 a real second Node process answers the exact B from the SAME SQLite file with zero writes', async () => {
  visible.clear();
  visible.add(T10_ALPHA);
  visible.add(T10_BETA);
  const outPath = join(dir, 'child-query.json');
  const child = spawn(process.execPath, ['--import', 'tsx', CHILD_SCRIPT, kPath, outPath], {
    cwd: ROOT_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => { stdout += chunk; });
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => { stderr += chunk; });
  const exitCode = await new Promise<number | null>((resolve) => child.on('exit', resolve));
  assert.equal(exitCode, 0, `child query process failed (${String(exitCode)}): ${stderr.slice(0, 1200)}`);
  const result = JSON.parse(await readFile(outPath, 'utf8')) as Record<string, any>;
  assert.equal(result.ok, true, `child result: ${JSON.stringify(result).slice(0, 600)} (stdout ${stdout.slice(0, 400)})`);
  assert.deepEqual(result.target, { ...T10_DEPLOYMENT, businessPackageId: T10_ALPHA, ...T10_SHARED_TARGET });
  assert.equal(result.state, 'approved');
  assert.equal(result.lifecycle, 'completed');
  assert.equal(result.stateRevision, 1);
  assert.ok(result.gets > 0, 'the child answered from real physical bytes');
  assert.equal(result.puts, 0, 'the child query wrote nothing');
  assert.equal(result.removes, 0, 'the child query removed nothing');
  assert.ok(result.checks > 0, 'the child evaluated Host authorization');
  assert.equal(result.hostPrincipalSeen, true, 'the child used the Host-verified principal');
});

test('T10S-P6 after a physical close/reopen the query answers from durable per-B state', async () => {
  activation.dispose();
  await (store as SqliteCasStore).close();
  store = await openSqliteCasStore({ path: kPath });
  activation = await activateSelected();

  const alphaAnswer = await activation.facade.queryScopedSnapshot({ ...T10_SHARED_TARGET, businessPackageId: T10_ALPHA });
  assert.equal(snapshotOf(alphaAnswer).state.stateKey, 'approved', 'alpha durable completed state survives the restart');
  assert.equal(snapshotOf(alphaAnswer).lifecycle, 'completed');
  const betaAnswer = await activation.facade.queryScopedSnapshot({ ...T10_SHARED_TARGET, businessPackageId: T10_BETA });
  assert.equal(snapshotOf(betaAnswer).state.stateKey, 'approved', 'beta durable state survives the restart');
  assert.equal(snapshotOf(betaAnswer).stateRevision, 1);
  visible.add(T10_ALPHA);
  visible.add(T10_BETA);
  assert.equal(refusalCode(await refusal(activation.facade.queryScopedSnapshot({ ...T10_SHARED_TARGET }))), 'QUERY_AMBIGUOUS');
});
