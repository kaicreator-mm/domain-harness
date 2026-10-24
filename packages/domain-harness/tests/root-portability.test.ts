import {
  stageNewWorkspaceTarballs,
  verifiedLocalWorkspaceTarballs,
  assertNewWorkspacePackagesInstalled,
} from '../../domain-harness-compiler/tests/packed-fixture-stage.js';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';


/**
 * CI robustness (mirrors the successor-host N18 probe, #953 Controller 090):
 * this journey installs the packed tarball's transitive dependencies from
 * the npm registry. Workers without registry egress must SKIP explicitly
 * rather than hang an npm install to the step timeout.
 */
function npmRegistryReachable(): boolean {
  const probe = spawnSync('npm', ['ping', '--registry', process.env.NPM_REGISTRY ?? 'https://registry.npmjs.org'], {
    encoding: 'utf8', timeout: 15_000, shell: process.platform === 'win32',
  });
  return probe.status === 0;
}

const packageRoot = fileURLToPath(new URL('..', import.meta.url));

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

test('#139 packed package root imports as portable v0.2 SDK in a clean consumer', async (t) => {
  if (!npmRegistryReachable()) {
    t.skip('PACKED CONSUMER NOT_RUN(NETWORK): npm registry unreachable from this execution environment');
    return;
  }

  const root = mkdtempSync(join(tmpdir(), 'domain-harness-root-portable-'));
  const packs = join(root, 'packs');
  const consumer = join(root, 'consumer');

  try {
    mkdirSync(packs, { recursive: true });
    mkdirSync(consumer, { recursive: true });

    runNpm(['pack', '--pack-destination', packs], packageRoot);
    const tarballs = readdirSync(packs).filter((name) => name.endsWith('.tgz'));
    assert.equal(tarballs.length, 1, 'core pack must produce exactly one tarball');
    const tarball = join(packs, tarballs[0]!);

    writeFileSync(join(consumer, 'package.json'), JSON.stringify({
      name: 'domain-harness-root-portability-consumer',
      private: true,
      type: 'module',
    }, null, 2));

    // A2 early T07 manifest owner: preserve genuinely packed legacy H from
    // this isolated consumer, install the exact local SHA-verified Contracts
    // archive in the SAME npm transaction (never registry RC fallback).
    const newPacks = await stageNewWorkspaceTarballs();
    const localContracts = verifiedLocalWorkspaceTarballs(newPacks, ['contracts']);
    assert.equal(localContracts.length, 1);
    runNpm(['install', '--ignore-scripts', '--no-audit', '--no-fund', tarball, ...localContracts], consumer);
    assertNewWorkspacePackagesInstalled(consumer, [newPacks.contracts]);
    assert.equal(
      existsSync(join(consumer, 'node_modules', 'better-sqlite3')),
      false,
      'portable core consumer must not install better-sqlite3',
    );

    // A2 T07a3 (P2-02): one actual installed ESM module, reachable from both
    // Node24 import and require(esm) — no ERR_REQUIRE_ASYNC_MODULE, no CJS
    // clone. Contracts is the T07a placeholder until T00 migrates the error
    // classes, so the honest singleton proof is one identical export surface
    // where every function/class export is the same object in both loaders.
    writeFileSync(join(consumer, 'contracts-dual-loader.mjs'), `
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const name = '@kaicreator/domain-harness-contracts';
const require = createRequire(import.meta.url);
const fromCjs = require(name);
const fromEsm = await import(name);
const requiredPath = require.resolve(name);
const importedUrl = import.meta.resolve(name);
assert.equal(importedUrl, pathToFileURL(requiredPath).href, 'import and require select one ESM dist/index.js');
assert.ok(requiredPath.replaceAll(String.fromCharCode(92), '/').endsWith('/dist/index.js'));
const esmKeys = Object.keys(fromEsm).sort();
assert.deepEqual(Object.keys(fromCjs).sort(), esmKeys, 'both loaders expose one identical export surface');
for (const key of esmKeys) {
  if (typeof fromEsm[key] === 'function') {
    assert.strictEqual(fromCjs[key], fromEsm[key], 'shared class/function object across loaders');
  }
}
`);
    run(process.execPath, ['contracts-dual-loader.mjs'], consumer);

    writeFileSync(join(consumer, 'index.mjs'), `
import * as sdk from '@kaicreator/domain-harness';

if (sdk.DOMAIN_HARNESS_VERSION !== '0.2.0') {
  throw new Error('unexpected root SDK version');
}
if (typeof sdk.createDomainRuntime !== 'function') {
  throw new Error('root does not expose createDomainRuntime');
}
if (typeof sdk.StaticPackageRegistry !== 'function') {
  throw new Error('root does not expose StaticPackageRegistry');
}
if ('createDomainHarness' in sdk) {
  throw new Error('v0.1 Node-bound createDomainHarness leaked into v0.2 portable root');
}
if (typeof sdk.createDomainRuntimeV3 !== 'function') {
  throw new Error('root does not expose the v0.3 runtime assembly');
}
if (typeof sdk.admitCentralDecision !== 'function') {
  throw new Error('root does not expose the v0.3 central admission path');
}
if (typeof sdk.RuntimeEvidenceCapture !== 'function') {
  throw new Error('root does not expose the v0.3 evidence capture seam');
}
for (const leaked of ['HarnessMachine', 'BusinessHarnessMachine', 'createActor', 'SqliteStore']) {
  if (leaked in sdk) {
    throw new Error('engine/host internals leaked into the portable root: ' + leaked);
  }
}
const v3 = await import('@kaicreator/domain-harness/v3');
if (typeof v3.createDomainRuntimeV3 !== 'function') {
  throw new Error('./v3 subpath does not expose the v0.3 runtime assembly');
}
if (typeof v3.requestExperimentalRollback !== 'function') {
  throw new Error('./v3 subpath does not expose the v0.3 fallback seam');
}
`);

    run(process.execPath, ['index.mjs'], consumer);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
