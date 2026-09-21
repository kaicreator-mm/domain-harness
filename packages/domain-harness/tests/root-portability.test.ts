import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

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

test('#139 packed package root imports as portable v0.2 SDK in a clean consumer', () => {
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

    runNpm(['install', '--ignore-scripts', '--no-audit', '--no-fund', tarball], consumer);
    assert.equal(
      existsSync(join(consumer, 'node_modules', 'better-sqlite3')),
      false,
      'portable core consumer must not install better-sqlite3',
    );

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
