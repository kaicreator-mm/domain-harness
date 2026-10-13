/**
 * #1013 R2 fresh independent review @5494026032 / issue comment
 * @6129188323 — NEW_P1_01 + NEW_P1_02 packed-consumer falsification.
 *
 * This file orchestrates a CLEAN consumer of the packed npm tarballs and
 * runs BOTH flagged attacks in it: after a legitimate trusted bootstrap
 * (REAL SQLite file, real registered apps, authenticated admitted journeys
 * with a physical ledger effect and a physical ModelPort invocation), an
 * uncredentialed same-process consumer deep-imports the packaged sibling
 * modules `dist/public-v8/kernel-host.js` and `dist/public-v8/model-port.js`
 * via absolute file: URLs and calls the raw trusted-port getters WITHOUT
 * the bootstrap session capability:
 *
 *   P1-01  currentKernelHostPorts()  → the raw {docs:{get,put,list},
 *          sha256, resources:{call}, clock} object over the victim's
 *          physical CAS store (unauthorized docs read/write + kernel-effect
 *          resource dispatch).
 *   P1-02  currentHostModelPort()    → the raw {invoke} ModelPort outside
 *          the qualified S decision/measurement path.
 *
 * Pre-repair this exact journey returned the raw ports (both findings
 * reproduced by the Builder on the packed Node22/Node24 consumers). The
 * session-capability boundary must refuse BOTH getters ENFORCEABLY before
 * any port object escapes, and the physical SQLite docs/Journal, the ledger
 * effect accounting and the ModelPort invocation count must be bit-for-bit
 * unchanged after every attack attempt — while the SAME process's
 * legitimate issuer-authenticated UX/Kernel journeys keep working.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sealRealApp } from './helpers.js';

/**
 * CI robustness (N18 probe, #953 Controller 090 precedent): this journey
 * installs the packed tarballs' transitive dependencies (better-sqlite3
 * native build) from the npm registry. Workers without registry egress
 * SKIP explicitly rather than hang the install to the step timeout.
 */
function npmRegistryReachable(): boolean {
  const probe = spawnSync('npm', ['ping', '--registry', process.env.NPM_REGISTRY ?? 'https://registry.npmjs.org'], {
    encoding: 'utf8', timeout: 15_000, shell: process.platform === 'win32',
  });
  return probe.status === 0;
}

const packageRoot = fileURLToPath(new URL('../..', import.meta.url));
const nodePackageRoot = fileURLToPath(new URL('../../../domain-harness-node', import.meta.url));

function run(command: string, args: readonly string[], cwd: string): string {
  return execFileSync(command, [...args], {
    cwd,
    encoding: 'utf8',
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
  });
}

function runNpm(args: readonly string[], cwd: string): string {
  if (process.platform !== 'win32') return run('npm', args, cwd);
  const command = ['npm.cmd', ...args.map((arg) => `"${arg}"`)].join(' ');
  return execFileSync(command, {
    cwd,
    encoding: 'utf8',
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
    shell: true,
  });
}

test('#1013 R2 review: packed raw kernel-Host ports + raw ModelPort deep imports are refused enforceably (session capability)', { timeout: 300_000 }, async (t) => {
  if (!npmRegistryReachable()) {
    t.skip('PACKED CONSUMER NOT_RUN(NETWORK): npm registry unreachable from this execution environment');
    return;
  }

  const root = mkdtempSync(join(tmpdir(), 'domain-harness-raw-ports-'));
  const packs = join(root, 'packs');
  const consumer = join(root, 'consumer');
  try {
    mkdirSync(packs, { recursive: true });
    mkdirSync(consumer, { recursive: true });

    runNpm(['pack', '--pack-destination', packs], packageRoot);
    runNpm(['pack', '--pack-destination', packs], nodePackageRoot);
    const tarballs = readdirSync(packs).filter((name) => name.endsWith('.tgz'));
    assert.equal(tarballs.length, 2, 'core + node packs (the node pack carries the better-sqlite3 dependency)');
    const coreTgz = tarballs.find((name) => name.startsWith('kaicreator-domain-harness-0'))!;
    const nodeTgz = tarballs.find((name) => name !== coreTgz)!;

    writeFileSync(join(consumer, 'package.json'), JSON.stringify({
      name: 'domain-harness-raw-ports-negative',
      private: true,
      type: 'module',
      // Local npm configurations that gate native install scripts still
      // build better-sqlite3 (CI npm ignores this key harmlessly).
      allowScripts: { 'better-sqlite3': true },
    }, null, 2));

    runNpm([
      'install', join(packs, coreTgz), join(packs, nodeTgz),
      '--no-audit', '--no-fund', '--ignore-scripts=false',
      ...(process.env.NPM_REGISTRY ? ['--registry', process.env.NPM_REGISTRY] : []),
    ], consumer);

    // The approved roots are REAL sealed data built through the compiler path
    // repo-side; the uncredentialed consumer legitimately holds them.
    writeFileSync(join(consumer, 'approval-root.json'), JSON.stringify(await sealRealApp('approval')), 'utf8');
    writeFileSync(join(consumer, 'model-root.json'), JSON.stringify(await sealRealApp('model')), 'utf8');

    writeFileSync(join(consumer, 'attack.mjs'), `
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const approvalRoot = JSON.parse(readFileSync('./approval-root.json', 'utf8'));
const modelRoot = JSON.parse(readFileSync('./model-root.json', 'utf8'));

// ---- Trusted Host context: legitimate bootstrap (REAL SQLite file) with a
// physically counting ModelPort and a physically counting ledger resource.
const { bootstrapTrustedHost, createKernelGateway, mintPrincipalCredential } =
  await import('@kaicreator/domain-harness/v8/host');
const ISSUER = 'issuer:dh-v08-integration';
const SECRET = 'integration-issuer-secret:1013';
const AUDIENCE = 'dh-v08-packed-raw-ports-negative';

// ---- #1013 R3 (@6138090328) FIRST: nested-Proxy ModelPort descriptor/get
// drift — the pre-repair shape crashed with a raw TypeError AFTER the
// one-shot trust/kernel/session commits (half bootstrap). On the PACKED dist
// in this clean consumer process it must now refuse TYPED BEFORE any channel
// is consumed; the legitimate bootstrap below then succeeds in this SAME
// process, proving the channels were never consumed.
{
  const { isHostTrustChannelEstablished } = await import('@kaicreator/domain-harness/v8/host');
  const v8Entry0 = import.meta.resolve('@kaicreator/domain-harness/v8');
  const khProbe = await import(new URL('./kernel-host.js', v8Entry0).href);
  const mkProbe = await import(new URL('./microkernel.js', v8Entry0).href);
  const realInvoke = async () => ({ decision: { outcome: 'x' }, event: { type: 'X', payload: {} } });
  const inner = new Proxy({ invoke: realInvoke }, {
    get(target, key, receiver) { return key === 'invoke' ? 42 : Reflect.get(target, key, receiver); },
  });
  const driftedPort = new Proxy(inner, {
    getOwnPropertyDescriptor(target, key) { return Reflect.getOwnPropertyDescriptor(target, key); },
    get(target, key, receiver) { return Reflect.get(target, key, receiver); },
  });
  let refusal = 'NOT_REFUSED';
  try {
    await bootstrapTrustedHost({
      issuers: new Map([[ISSUER, SECRET]]),
      audience: AUDIENCE,
      modelPort: driftedPort,
    });
  } catch (error) {
    refusal = error?.code ?? 'UNTYPED:' + String(error);
  }
  assert.equal(refusal, 'MODEL_PORT_INVALID', 'the drifted Proxy ModelPort refuses TYPED on the packed dist');
  assert.equal(isHostTrustChannelEstablished(), false, 'R3: zero trust residue on the packed dist');
  assert.equal(khProbe.isKernelHostInstalled(), false, 'R3: zero Kernel Host residue on the packed dist');
  assert.equal(mkProbe.isGatewaySessionCapInstalled(), false, 'R3: zero gateway session residue on the packed dist');
  console.log('R3_PROXY_DRIFT_REFUSED_TYPED_ZERO_RESIDUE');
}

const invocations = [];
const ledgerCalls = [];
const handle = await bootstrapTrustedHost({
  issuers: new Map([[ISSUER, SECRET]]),
  audience: AUDIENCE,
  storage: { path: './victim.sqlite' },
  modelPort: {
    invoke: async (request) => {
      invocations.push({ operation: request.operation, input: request.input });
      return {
        decision: { outcome: 'model-proposed' },
        event: { type: 'MODEL_QUOTE_DECIDED', payload: { amount: request.input.amount, requestId: request.input.requestId } },
      };
    },
  },
});
handle.host.resources.provision('ledger', (_operation, payload) => {
  ledgerCalls.push(payload);
  return { reserved: true };
});

// The victim's physical SQLite file (the REAL durable store, not memory).
const sqliteHeader = readFileSync('./victim.sqlite').subarray(0, 16).toString('latin1');
assert.equal(sqliteHeader, 'SQLite format 3\\u0000', 'the victim store is a REAL SQLite database file');
console.log('REAL_SQLITE_CONFIRMED');

const gateway = createKernelGateway({ host: handle.host, gatewaySessionCap: handle.gatewaySessionCap });
await gateway.registerApp({ appId: 'order-approval', packageRoot: approvalRoot, genesisRoles: ['platform-operator'] });
await gateway.registerApp({ appId: 'model-quote', packageRoot: modelRoot, genesisRoles: ['platform-operator'] });
const credential = (appId, roles, subject, grantId) => mintPrincipalCredential({
  issuerId: ISSUER, grantId, tenantId: 't-real', appId, subject, audience: AUDIENCE, roles,
  issuedAt: '2026-10-12T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z',
}, SECRET);
await gateway.activateGenesis(credential('order-approval', ['platform-operator'], 'op', 'g-op'), { appId: 'order-approval', instanceKey: 'victim-k1' });
await gateway.activateGenesis(credential('model-quote', ['platform-operator'], 'op2', 'g-op2'), { appId: 'model-quote', instanceKey: 'victim-m1' });
const admittedQuote = await gateway.send(credential('order-approval', ['requester'], 'req', 'g-req'), {
  intentType: 'submitQuoteDecisionDynamic',
  messageId: 'm-legit-1',
  input: { amount: 30, requestId: 'PACKED-R2' },
  target: { tenantId: 't-real', appId: 'order-approval', instanceKey: 'victim-k1' },
});
assert.equal(admittedQuote.status, 'admitted', 'the legitimate authenticated approval journey works');
const admittedModel = await gateway.send(credential('model-quote', ['requester'], 'req2', 'g-req2'), {
  intentType: 'submitModelQuoteDecision',
  messageId: 'm-legit-2',
  input: { amount: 30, requestId: 'PACKED-MP' },
  target: { tenantId: 't-real', appId: 'model-quote', instanceKey: 'victim-m1' },
});
assert.equal(admittedModel.status, 'admitted', 'the legitimate authenticated model journey works');
assert.equal(invocations.length, 1, 'the ModelPort was PHYSICALLY invoked exactly once by the legit journey');
assert.ok(ledgerCalls.length >= 1, 'the physical ledger effect dispatched');
console.log('LEGIT_JOURNEYS_OK');

// Snapshot EVERYTHING the attacks must not touch (physical SQLite docs +
// Journal via the trusted Host store, effect accounting, ModelPort count).
const snapshotDocs = async () => {
  const keys = [...(await handle.host.docs.list(''))].sort();
  const docs = [];
  for (const key of keys) {
    const doc = await handle.host.docs.get(key);
    docs.push({ key, revision: doc?.revision, value: doc?.value });
  }
  return JSON.stringify(docs);
};
const beforeDocs = await snapshotDocs();
const beforeLedger = JSON.stringify(ledgerCalls);
const beforeInvocations = JSON.stringify(invocations);

// ---- Uncredentialed consumer attacks (same process, after bootstrap). The
// attacker code NEVER references handle.gatewaySessionCap below this line.
// 1. The bare deep specifiers are refused by package exports — recorded,
//    but this alone is NOT proof of a boundary.
for (const spec of ['@kaicreator/domain-harness/v8/kernel-host', '@kaicreator/domain-harness/v8/model-port']) {
  try {
    await import(spec);
    assert.fail('bare deep specifier must be refused by package exports: ' + spec);
  } catch (error) {
    assert.equal(error?.code, 'ERR_PACKAGE_PATH_NOT_EXPORTED', spec);
  }
}
console.log('BARE_DEEP_IMPORTS=REFUSED_BY_EXPORTS');

// 2. P1-01: the absolute file:URL sibling import of kernel-host.js RESOLVES
//    in stock Node — the raw trusted-port getter IS recoverable from the
//    shipped dist, which is exactly why the boundary must live behind the
//    session capability, not in "not re-exported".
const v8Entry = import.meta.resolve('@kaicreator/domain-harness/v8');
const kernelHostModule = await import(new URL('./kernel-host.js', v8Entry).href);
assert.equal(typeof kernelHostModule.currentKernelHostPorts, 'function', 'kernel-host.js is deep-importable — exports are no boundary');
console.log('FILE_URL_DEEP_IMPORT=kernel-host RESOLVED');

for (const [label, attempt] of [
  ['no capability', () => kernelHostModule.currentKernelHostPorts()],
  ['wrong capability', () => kernelHostModule.currentKernelHostPorts('f'.repeat(64))],
]) {
  try {
    attempt();
    assert.fail('the raw kernel Host ports seam must refuse: ' + label);
  } catch (error) {
    assert.equal(error?.code, 'KERNEL_HOST_SESSION_DENIED', label + ' refused typed before any port escapes');
  }
}
console.log('P1_01_RAW_KERNEL_HOST_PORTS_REFUSED_TYPED=no-cap+wrong-cap');

// 3. P1-02: the same file:URL deep import of model-port.js and its raw
//    ModelPort getter — refused identically.
const modelPortModule = await import(new URL('./model-port.js', v8Entry).href);
assert.equal(typeof modelPortModule.currentHostModelPort, 'function', 'model-port.js is deep-importable — exports are no boundary');
for (const [label, attempt] of [
  ['no capability', () => modelPortModule.currentHostModelPort()],
  ['wrong capability', () => modelPortModule.currentHostModelPort('f'.repeat(64))],
]) {
  try {
    attempt();
    assert.fail('the raw ModelPort seam must refuse: ' + label);
  } catch (error) {
    assert.equal(error?.code, 'MODEL_PORT_SESSION_DENIED', label + ' refused typed before any port escapes');
  }
}
console.log('P1_02_RAW_MODEL_PORT_REFUSED_TYPED=no-cap+wrong-cap');

// 4. Late attacker (re)installs are refused by the one-shot channels — the
//    legitimate bootstrap's ports/capability stay the only ones in process.
try {
  kernelHostModule.installKernelHostPorts({
    docs: { get: async () => null, put: async () => ({ revision: 0 }), list: async () => [] },
    sha256: { digestUtf8: (value) => value },
    resources: { call: async () => null },
    clock: () => '2026-10-12T00:00:00.000Z',
  }, 'attacker-late-capability-0123456789abcdef0123456789abcdef');
  assert.fail('a late kernel Host ports install must refuse');
} catch (error) {
  assert.equal(error?.code, 'KERNEL_HOST_ALREADY_INSTALLED');
}
try {
  modelPortModule.installHostModelPort({ invoke: async () => ({ decision: { outcome: 'x' }, event: { type: 'X', payload: {} } }) }, 'attacker-late-capability-0123456789abcdef0123456789abcdef');
  assert.fail('a late ModelPort install must refuse');
} catch (error) {
  assert.equal(error?.code, 'MODEL_PORT_ALREADY_INSTALLED');
}
console.log('LATE_INSTALLS_REFUSED=kernel-host+model-port');

// 5. Capability semantics, not blanket denial: the TRUSTED Host context
//    (which legitimately holds the bootstrap capability — this line is the
//    trusted context, mirroring how bootstrapTrustedHost hands the cap only
//    to the trusted gateway) still reads its own installed ports.
const trustedPorts = kernelHostModule.currentKernelHostPorts(handle.gatewaySessionCap);
assert.equal(typeof trustedPorts.docs.get, 'function');
const trustedModelPort = modelPortModule.currentHostModelPort(handle.gatewaySessionCap);
assert.notEqual(trustedModelPort, undefined);
console.log('TRUSTED_CAP_HOLDS_AUTHORITY');

// 6. NOTHING moved: the physical SQLite docs/Journal, the effect accounting
//    and the ModelPort invocation count are bit-for-bit unchanged.
assert.equal(await snapshotDocs(), beforeDocs, 'physical SQLite docs + Journal unchanged by every attack attempt');
assert.equal(JSON.stringify(ledgerCalls), beforeLedger, 'effect accounting unchanged');
assert.equal(JSON.stringify(invocations), beforeInvocations, 'ModelPort invocation count unchanged');
console.log('SIDE_EFFECTS_UNCHANGED=docs+journal+ledger+modelport');

// 7. The legitimate issuer-authenticated journeys STILL work in the SAME
//    process after every attack (the boundary never wedged the real path):
//    a fresh genesis + authenticated send admits, and the verified
//    credential still reads the victim instance.
await gateway.activateGenesis(credential('order-approval', ['platform-operator'], 'op', 'g-op'), { appId: 'order-approval', instanceKey: 'victim-k2' });
const again = await gateway.send(credential('order-approval', ['requester'], 'req', 'g-req'), {
  intentType: 'submitQuoteDecisionDynamic',
  messageId: 'm-legit-3',
  input: { amount: 30, requestId: 'PACKED-R2-2' },
  target: { tenantId: 't-real', appId: 'order-approval', instanceKey: 'victim-k2' },
});
assert.equal(again.status, 'admitted', 'the authenticated Kernel path still admits after the attacks');
const victim = await gateway.queryInstance(
  credential('order-approval', ['requester'], 'req', 'g-req'),
  { tenantId: 't-real', appId: 'order-approval', instanceKey: 'victim-k1' },
);
assert.ok(victim !== null && victim !== undefined, 'the verified credential still reads the victim instance');
console.log('LEGIT_PATH_STILL_WORKS');

await handle.host.close();
console.log('PACKED_RAW_PORTS_NEGATIVE_PASS');
`);

    const result = spawnSync(process.execPath, ['attack.mjs'], {
      cwd: consumer,
      encoding: 'utf8',
      timeout: 120_000,
    });
    assert.equal(result.status, 0, `packed consumer attack child must pass\nstdout: ${result.stdout ?? ''}\nstderr: ${result.stderr ?? ''}`);
    assert.match(result.stdout ?? '', /PACKED_RAW_PORTS_NEGATIVE_PASS/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
