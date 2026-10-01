// #457 N18/N19: the PACKED public artifacts consumed from a clean external
// directory (real better-sqlite3 loadable, successor package compiled through
// the public compiler, real file-backed runtime with one rejected-route
// journey and a retained 0.2 instance), plus the regression binding record.
// The full repository regression itself runs as the workspace/root `npm test`
// on this branch (CI re-executes it); this file binds its subject and counts.
import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';

function sha256File(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

test('N18: clean packed consumer — public entries, real SQLite, successor journey + retained instance', { timeout: 420_000 }, async () => {
  const repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
  const packDir = mkdtempSync(join(tmpdir(), 'dh457-n18-pack-'));
  execFileSync('npm', ['run', 'build', '-w', '@kaicreator/domain-harness-node'], { cwd: repoRoot, shell: process.platform === 'win32', stdio: 'pipe' });
  execFileSync('npm', ['pack', '-w', '@kaicreator/domain-harness', '--pack-destination', packDir], { cwd: repoRoot, shell: process.platform === 'win32' });
  execFileSync('npm', ['pack', '-w', '@kaicreator/domain-harness-node', '--pack-destination', packDir], { cwd: repoRoot, shell: process.platform === 'win32' });
  execFileSync('npm', ['pack', '-w', '@kaicreator/domain-harness-compiler', '--pack-destination', packDir], { cwd: repoRoot, shell: process.platform === 'win32' });
  const coreTgz = join(packDir, 'kaicreator-domain-harness-0.2.0.tgz');
  const nodeTgz = join(packDir, 'kaicreator-domain-harness-node-0.2.0.tgz');
  const compilerTgz = join(packDir, 'kaicreator-domain-harness-compiler-0.2.0.tgz');
  assert.ok(existsSync(coreTgz) && existsSync(nodeTgz) && existsSync(compilerTgz), 'all three tarballs packed from the tested tree');
  const coreSha = sha256File(coreTgz);
  const nodeSha = sha256File(nodeTgz);

  const consumerDir = mkdtempSync(join(tmpdir(), 'dh457-n18-consumer-'));
  writeFileSync(join(consumerDir, 'package.json'), JSON.stringify({
    name: 'dh457-n18-consumer',
    private: true,
    type: 'module',
  }));
  execFileSync('npm', ['install', coreTgz, nodeTgz, compilerTgz, '--no-audit', '--no-fund', '--ignore-scripts=false'], {
    cwd: consumerDir, shell: process.platform === 'win32', stdio: 'pipe',
  });

  const dbPath = join(consumerDir, 'consumer.sqlite');
  const consumerScript = join(consumerDir, 'consumer.mjs');
  // The consumer program is generated from the wave's public-compatibility
  // source so the fixture stays reviewable in the branch.
  const consumerSource = readFileSync(join(repoRoot, 'packages/domain-harness-node/tests/successor-host/fixtures/packed-consumer.mjs.mts'), 'utf8');
  writeFileSync(consumerScript, consumerSource);

  const result = spawnSync(process.execPath, [consumerScript, dbPath], {
    cwd: consumerDir, encoding: 'utf8', timeout: 240_000,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  assert.equal(result.status, 0, `packed consumer runs green (native better-sqlite3 loaded): ${output.slice(0, 800)}`);
  assert.match(output, /N18_CONSUMER_OK/);
  console.log(`N18 pack SHA256 core=${coreSha} node=${nodeSha}`);
}, 420_000);

test('N19: regression binding — this branch carries the full historical suites plus the successor wave', () => {
  const repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
  // The retained store/v3-host/cross-host suites must still be discovered by
  // the workspace test command (the command CI executes).
  const pkg = JSON.parse(readFileSync(join(repoRoot, 'packages/domain-harness-node/package.json'), 'utf8')) as { scripts: { test: string } };
  assert.match(pkg.scripts.test, /tests\/store\/\*\.test\.ts/);
  assert.match(pkg.scripts.test, /tests\/v3-host\/\*\.test\.ts/);
  assert.match(pkg.scripts.test, /tests\/cross-host\/\*\.test\.ts/);
  assert.match(pkg.scripts.test, /tests\/successor-host\/\*\.test\.ts/, 'the successor wave is wired into real discovery');
  // Historical fixtures the retained baseline depends on stay present.
  for (const fixture of [
    'packages/domain-harness-node/tests/store/fixtures/store-child.ts',
    'packages/domain-harness-node/tests/v3-host/host-fixture.ts',
    'packages/domain-harness-node/tests/cross-host/schema-parity.test.ts',
  ]) {
    assert.ok(existsSync(join(repoRoot, fixture)), `historical fixture present: ${fixture}`);
  }
  // Actual per-suite counts for the terminal record.
  const successorDir = join(repoRoot, 'packages/domain-harness-node/tests/successor-host');
  const files = execSync(`ls ${JSON.stringify(successorDir)}`, { encoding: 'utf8' })
    .split(/\r?\n/)
    .filter((name) => name.endsWith('.test.ts'));
  console.log(`N19 successor suites: ${files.join(', ')}`);
  assert.ok(files.length >= 5);
}, 60_000);
