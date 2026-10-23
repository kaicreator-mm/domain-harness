/**
 * #1013 R2 packed-consumer negative (@6122817203) — this file orchestrates a
 * CLEAN consumer of the packed npm tarballs and runs the flagged attack in
 * it: after a legitimate trusted bootstrap (real SQLite), an uncredentialed
 * same-process consumer deep-imports the packaged sibling module
 * (`dist/public-v8/microkernel.js`) via an absolute file: URL and tries to
 * reach the protected facade ops seam with a FORGED principal.
 *
 * Pre-R2 this exact journey forged Genesis + read the victim tenant's
 * instance state (verified on the packed 0.2.0 tarball). The R2 gateway
 * session capability boundary must refuse it ENFORCEABLY:
 *   - the file:URL sibling import still RESOLVES (package exports are no
 *     boundary — ERR_PACKAGE_PATH_NOT_EXPORTED on the bare specifier alone
 *     is NOT accepted as proof);
 *   - `getFacadeKernelOps` without the bootstrap-issued capability refuses
 *     typed (GATEWAY_SESSION_DENIED), and with a wrong capability too;
 *   - the one-shot session channel refuses a late attacker install;
 *   - the legitimate authenticated gateway journey keeps working in the
 *     SAME process, and only the verified credential reads the instance.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sealRealApp } from './helpers.js';
import {
  assertNewWorkspacePackagesInstalled,
  stageNewWorkspaceTarballs,
  verifiedLocalWorkspaceTarballs,
} from '../../../domain-harness-compiler/tests/packed-fixture-stage.js';

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

test('#1013 R2: packed consumer deep-import of the ops seam is refused enforceably (session capability)', { timeout: 300_000 }, async (t) => {
  if (!npmRegistryReachable()) {
    t.skip('PACKED CONSUMER NOT_RUN(NETWORK): npm registry unreachable from this execution environment');
    return;
  }

  const root = mkdtempSync(join(tmpdir(), 'domain-harness-gateway-session-'));
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

    // #1337 (T07a2): this fixture keeps its own isolated legacy pack, and
    // the exact local new-workspace tarballs from the shared verified stage
    // join the SAME clean npm install transaction (verified dependency
    // closure), so the @kaicreator/* closure resolves from local bytes once
    // the legacy manifests gain their new-workspace dependency edges (T07b)
    // instead of E404-ing on the unpublished rc.0 registry artifacts.
    const newPacks = await stageNewWorkspaceTarballs();
    const bridgePaths = verifiedLocalWorkspaceTarballs(newPacks, ['hostNode']);

    writeFileSync(join(consumer, 'package.json'), JSON.stringify({
      name: 'domain-harness-gateway-session-negative',
      private: true,
      type: 'module',
      // Local npm configurations that gate native install scripts still
      // build better-sqlite3 (CI npm ignores this key harmlessly).
      allowScripts: { 'better-sqlite3': true },
    }, null, 2));

    runNpm([
      'install', join(packs, coreTgz), join(packs, nodeTgz), ...bridgePaths,
      '--no-audit', '--no-fund', '--ignore-scripts=false',
      ...(process.env.NPM_REGISTRY ? ['--registry', process.env.NPM_REGISTRY] : []),
    ], consumer);
    assertNewWorkspacePackagesInstalled(consumer, [newPacks.contracts, newPacks.microkernel, newPacks.hostNode]);

    // The approved root is REAL sealed data built through the compiler path
    // repo-side; the uncredentialed consumer legitimately holds it.
    writeFileSync(join(consumer, 'sealed-root.json'), JSON.stringify(await sealRealApp('approval')), 'utf8');

    writeFileSync(join(consumer, 'attack.mjs'), `
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = JSON.parse(readFileSync('./sealed-root.json', 'utf8'));

// ---- Trusted Host context: legitimate bootstrap (REAL SQLite file) ----
const { bootstrapTrustedHost, createKernelGateway, mintPrincipalCredential } =
  await import('@kaicreator/domain-harness/v8/host');
const ISSUER = 'issuer:dh-v08-integration';
const SECRET = 'integration-issuer-secret:1013';
const AUDIENCE = 'dh-v08-packed-session-negative';
const handle = await bootstrapTrustedHost({
  issuers: new Map([[ISSUER, SECRET]]),
  audience: AUDIENCE,
  storage: { path: './victim.sqlite' },
});
handle.host.resources.provision('ledger', () => ({ reserved: true }));
const gateway = createKernelGateway({ host: handle.host, gatewaySessionCap: handle.gatewaySessionCap });
await gateway.registerApp({ appId: 'order-approval', packageRoot: root, genesisRoles: ['platform-operator'], authorityClass: 'PRODUCTION' });
const credential = (roles, subject, grantId) => mintPrincipalCredential({
  issuerId: ISSUER, grantId, tenantId: 't-real', appId: 'order-approval', subject, audience: AUDIENCE, roles,
  issuedAt: '2026-10-12T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z',
}, SECRET);
await gateway.activateGenesis(credential(['platform-operator'], 'op', 'g-op'), { appId: 'order-approval', instanceKey: 'victim-k1' });
const admitted = await gateway.send(credential(['requester'], 'req', 'g-req'), {
  intentType: 'submitQuoteDecisionDynamic',
  messageId: 'm-legit-1',
  input: { amount: 30, requestId: 'PACKED-R1' },
  target: { tenantId: 't-real', appId: 'order-approval', instanceKey: 'victim-k1' },
});
assert.equal(admitted.status, 'admitted', 'the legitimate authenticated journey works');
console.log('LEGIT_JOURNEY_OK');

// ---- Uncredentialed consumer attack (same process, after bootstrap) ----
// 1. The bare deep specifier is refused by package exports — recorded, but
//    this alone is NOT proof of a boundary.
try {
  await import('@kaicreator/domain-harness/v8/microkernel');
  assert.fail('bare deep specifier must be refused by package exports');
} catch (error) {
  assert.equal(error?.code, 'ERR_PACKAGE_PATH_NOT_EXPORTED');
  console.log('BARE_DEEP_IMPORT=REFUSED_BY_EXPORTS');
}

// 2. The absolute file:URL sibling import RESOLVES in stock Node: the
//    internal module (and its getFacadeKernelOps function) IS recoverable
//    from the shipped dist. That is exactly why the boundary must live
//    behind the session capability, not in "not re-exported".
const v8Entry = import.meta.resolve('@kaicreator/domain-harness/v8');
const deep = await import(new URL('./microkernel.js', v8Entry).href);
assert.equal(typeof deep.getFacadeKernelOps, 'function', 'the sibling module is deep-importable — exports are no boundary');
console.log('FILE_URL_DEEP_IMPORT=RESOLVED');

// 3. The attacker loads the approved root through the PUBLIC one-arg load
//    (legitimate data they hold) and reaches for the ops seam.
const { DomainHarness } = await import('@kaicreator/domain-harness/v8');
const facade = await DomainHarness.load(root);
const forged = { subject: 'attacker', tenantId: 't-real', appId: 'order-approval', roles: ['requester', 'platform-operator'] };

for (const [label, attempt] of [
  ['no capability', () => deep.getFacadeKernelOps(facade)],
  ['wrong capability', () => deep.getFacadeKernelOps(facade, 'f'.repeat(64))],
]) {
  try {
    attempt();
    assert.fail('the ops seam must refuse: ' + label);
  } catch (error) {
    assert.equal(error?.code, 'GATEWAY_SESSION_DENIED', label + ' refused typed');
  }
}
console.log('OPS_SEAM_REFUSED_TYPED=no-cap+wrong-cap');

// 4. The one-shot session channel refuses a LATE attacker install: the
//    legitimate bootstrap's capability stays the only one in this process.
try {
  deep.installGatewaySessionCap('attacker-late-capability-0123456789abcdef0123456789abcdef');
  assert.fail('a late session install must refuse');
} catch (error) {
  assert.equal(error?.code, 'GATEWAY_SESSION_ALREADY_INSTALLED');
}
console.log('LATE_SESSION_INSTALL_REFUSED');

// 5. No forged-principal route remains: a credential minted with the WRONG
//    issuer secret is refused by the H identity verifier (typed), and the
//    victim instance stays readable ONLY through the verified credential.
const forgedCredential = mintPrincipalCredential({
  issuerId: ISSUER, grantId: 'g-forged', tenantId: 't-real', appId: 'order-approval',
  subject: 'attacker', audience: AUDIENCE, roles: ['requester', 'platform-operator'],
  issuedAt: '2026-10-12T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z',
}, 'wrong-issuer-secret:attacker');
let forgedRefused = false;
try {
  await gateway.queryInstance(forgedCredential, { tenantId: 't-real', appId: 'order-approval', instanceKey: 'victim-k1' });
} catch {
  forgedRefused = true;
}
assert.ok(forgedRefused, 'a wrong-secret credential is refused at the H verifier');
const victim = await gateway.queryInstance(
  credential(['requester'], 'req', 'g-req'),
  { tenantId: 't-real', appId: 'order-approval', instanceKey: 'victim-k1' },
);
assert.ok(victim !== null && victim !== undefined, 'the verified credential still reads the victim instance');
console.log('FORGED_PRINCIPAL_DEAD_END');

await handle.host.close();
console.log('PACKED_SESSION_NEGATIVE_PASS');
`);

    const result = spawnSync(process.execPath, ['attack.mjs'], {
      cwd: consumer,
      encoding: 'utf8',
      timeout: 120_000,
    });
    assert.equal(result.status, 0, `packed consumer attack child must pass\nstdout: ${result.stdout ?? ''}\nstderr: ${result.stderr ?? ''}`);
    assert.match(result.stdout ?? '', /PACKED_SESSION_NEGATIVE_PASS/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
