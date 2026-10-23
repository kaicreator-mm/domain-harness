/**
 * v0.10 T09 R1 P1-3 — the clean packed-consumer probe.
 *
 * A truly isolated consumer directory installs the packed core + compiler
 * tarballs from the immutable stage (no monorepo resolution), imports the
 * declared `@kaicreator/domain-harness-compiler/v10meta` subpath, builds and
 * activates a selected App from the packaged kernel/standard/Business/
 * feature payloads, and ACTUALLY runs one proposal-only round plus its
 * idempotent replay. It then proves the package `exports` map stays closed:
 * a deep `dist/...` import is refused with ERR_PACKAGE_PATH_NOT_EXPORTED.
 */
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { stagePackedWorkspaces } from '../../../packages/domain-harness-compiler/tests/packed-fixture-stage.js';

function npmRegistryReachable(): boolean {
  const probe = spawnSync('npm', ['ping', '--registry', process.env.NPM_REGISTRY ?? 'https://registry.npmjs.org'], {
    encoding: 'utf8', timeout: 15_000, shell: process.platform === 'win32',
  });
  return probe.status === 0;
}

const PACKED_CONSUMER_NET_SKIP: string | undefined = npmRegistryReachable()
  ? undefined
  : 'PACKED CONSUMER NOT_RUN(NETWORK): npm registry unreachable from this execution environment';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../..');
const CONSUMER_SCRIPT = readFileSync(join(HERE, 'v010-t09-meta-packed-consumer.mjs'), 'utf8');
// v0.10.2 T01: these sealed payload bytes live in Domain Packages / an example, not in the compiler package.
const DOMAIN_PACKAGE_PAYLOADS = [
  'domain-packages/kernel/basic/kernel-mechanism-v1.mjs',
  'domain-packages/standard/basic/standard-sdk-v1.mjs',
  'examples/v010-meta-feedback/business-meta-feedback-v1.mjs',
  'domain-packages/standard/features/meta-feedback/modules/sfeature-meta-feedback-v1.mjs',
];

function runNpm(args: readonly string[], cwd: string): string {
  if (process.platform !== 'win32') {
    return execFileSync('npm', [...args], {
      cwd,
      encoding: 'utf8',
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 16 * 1024 * 1024,
    });
  }
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

test('T09-R1-P3 packed compiler clean install can actually call the v10meta workflow', { skip: PACKED_CONSUMER_NET_SKIP }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'dh010-t09-packed-consumer-'));
  try {
    const staged = await stagePackedWorkspaces();
    writeFileSync(join(root, 'package.json'), JSON.stringify({
      name: 't09-packed-consumer',
      private: true,
      type: 'module',
    }, null, 2));
    runNpm([
      'install', '--ignore-scripts', '--no-audit', '--no-fund',
      staged.coreTarball.path, staged.compilerTarball.path,
    ], root);
    writeFileSync(join(root, 'index.mjs'), CONSUMER_SCRIPT, 'utf8');
    mkdirSync(join(root, 'payload'));
    for (const source of DOMAIN_PACKAGE_PAYLOADS) {
      copyFileSync(join(REPO_ROOT, source), join(root, 'payload', basename(source)));
    }
    const output = execFileSync(process.execPath, ['index.mjs'], {
      cwd: root,
      encoding: 'utf8',
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 16 * 1024 * 1024,
    });
    const result = JSON.parse(output) as Record<string, any>;
    assert.equal(result.ok, true, `packed consumer failed: ${JSON.stringify(result).slice(0, 1600)}`);
    assert.equal(result.status, 'proposed');
    assert.equal(result.replayed, true, 'the packed workflow replays its own round idempotently');
    assert.equal(result.receiptDigest, result.replayReceiptDigest);
    assert.equal(result.ledgerKey, result.expectedLedgerKey);
    assert.equal(result.claimKey, result.expectedClaimKey);
    assert.equal(result.stateRevision1, 1, 'the packed activation admitted exactly one turn');
    assert.equal(result.stateRevision2, 1, 'the packed replay admitted no second turn');
    assert.equal(result.deepImportCode, 'ERR_PACKAGE_PATH_NOT_EXPORTED', 'the exports map still closes deep dist imports');

    const resolved = resolve(fileURLToPath(result.resolved as string));
    const fromRepo = relative(REPO_ROOT, resolved);
    assert.ok(
      fromRepo.startsWith('..') || isAbsolute(fromRepo),
      `the v10meta import resolved from the clean consumer, not the monorepo: ${resolved}`,
    );
    assert.ok(resolved.includes('node_modules'), `the v10meta import comes from an installed package: ${resolved}`);
    assert.ok(
      existsSync(resolved.replace(/\.js$/, '.d.ts')),
      `the packed v10meta subpath ships its declaration file next to the runtime: ${resolved}`,
    );
    const payload = resolve(result.payloadResolved as string);
    assert.ok(
      !payload.includes('node_modules') && relative(root, payload).startsWith('payload'),
      `the Business payload is the unchanged Domain Package copy staged in the clean consumer: ${payload}`,
    );
    assert.ok((result.keys as string[]).some((key) => key.startsWith('v10-meta-feedback:')), 'the packed run wrote the ledger');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
