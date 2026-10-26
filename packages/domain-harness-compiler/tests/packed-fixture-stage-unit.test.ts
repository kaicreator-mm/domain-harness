// #953 (Controller 093, P2-01/P2-02) — executable negatives for the packed
// fixture stage machinery. These prove, deterministically and without
// touching any live dist:
//   - the digest comparator (the staleness guard's engine) rejects stale
//     content, missing files, extra files, and unreadable/missing trees,
//     and accepts only file- and content-identical trees;
//   - the bounded scavenger removes exactly the aged `dh-packed-stage-*`
//     DIRECTORIES and never touches fresh stages, unrelated directories, or
//     non-directory namesakes.
// The full staged-vs-live equivalence evidence (real tsc + npm pack + tar)
// lives in the node package: packages/domain-harness-node/tests/successor-host/
// packed-stage-equivalence.test.ts, where the package test script guarantees
// freshly built live core+node dists next to the committed compiler dist.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareDirectoryDigests, freshDistProblems, scavengeStaleStages, verifiedLocalWorkspaceTarballs, stageNewWorkspaceTarballs, assertNewWorkspacePackagesInstalled } from './packed-fixture-stage.ts';
import type { NewWorkspacePacks, StagedWorkspaceTarball } from './packed-fixture-stage.ts';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function writeTree(root: string, files: Readonly<Record<string, string>>): void {
  for (const [relative, contents] of Object.entries(files)) {
    const target = join(root, relative);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, contents);
  }
}

test('P2-01 negative: digest comparator accepts only identical trees', () => {
  const base = mkdtempSync(join(tmpdir(), 'dh-p2-cmp-'));
  try {
    const fresh = join(base, 'fresh');
    writeTree(fresh, { 'a.js': 'contents-a', 'nested/b.js': 'contents-b' });

    const identical = join(base, 'identical');
    writeTree(identical, { 'a.js': 'contents-a', 'nested/b.js': 'contents-b' });
    assert.deepEqual(compareDirectoryDigests(identical, fresh), [], 'identical trees must compare clean');

    const stale = join(base, 'stale');
    writeTree(stale, { 'a.js': 'STALE-contents-a' });
    const staleProblems = compareDirectoryDigests(stale, fresh);
    assert.ok(staleProblems.some((problem) => /content differs/.test(problem)), `content drift must be reported: ${staleProblems.join('; ')}`);
    assert.ok(staleProblems.some((problem) => /missing file/.test(problem)), `missing files must be reported: ${staleProblems.join('; ')}`);

    const extra = join(base, 'extra');
    writeTree(extra, { 'a.js': 'contents-a', 'nested/b.js': 'contents-b', 'nested/extra.js': 'surprise' });
    const extraProblems = compareDirectoryDigests(extra, fresh);
    assert.ok(extraProblems.some((problem) => /extra file/.test(problem)), `unexpected files must be reported: ${extraProblems.join('; ')}`);

    assert.ok(compareDirectoryDigests(join(base, 'does-not-exist'), fresh).length > 0, 'a missing actual tree must be reported, never silently equal');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('P2-01 negative: the directory digest engine detects stale, missing, and extra files', () => {
  // General engine coverage (used by the equivalence evidence tests);
  // the stageOnce staleness guard itself is driven by freshDistProblems,
  // covered by the dedicated negatives below.
  const base = mkdtempSync(join(tmpdir(), 'dh-p2-guard-'));
  try {
    const sourceFresh = join(base, 'staged-fresh');
    writeTree(sourceFresh, { 'index.js': 'export {};' });

    const staleLive = join(base, 'live-stale');
    writeTree(staleLive, { 'index.js': 'export { old };' });
    assert.ok(compareDirectoryDigests(staleLive, sourceFresh).length > 0, 'a stale live dist must trip the guard');

    const missingLive = join(base, 'live-missing');
    assert.ok(compareDirectoryDigests(missingLive, sourceFresh).length > 0, 'a missing live dist must trip the guard');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('P2-01 negative: freshDistProblems fails closed on missing/diverged fresh outputs and tolerates committed orphans', () => {
  const base = mkdtempSync(join(tmpdir(), 'dh-p2-fresh-'));
  try {
    const fresh = join(base, 'fresh');
    writeTree(fresh, { 'index.js': 'export {};', 'nested/new.js': 'export {};' });

    const liveWithOrphans = join(base, 'live-orphans');
    writeTree(liveWithOrphans, { 'index.js': 'export {};', 'nested/new.js': 'export {};', 'legacy/old.js': 'export { old };' });
    assert.deepEqual(
      freshDistProblems(fresh, liveWithOrphans),
      [],
      'live-only committed orphans are deliberately tolerated (their disposition belongs to the check-committed-dist policy owner)',
    );

    const staleLive = join(base, 'live-stale');
    writeTree(staleLive, { 'index.js': 'export { old };' });
    const staleProblems = freshDistProblems(fresh, staleLive);
    assert.ok(staleProblems.some((problem) => /content differs/.test(problem)), `diverged fresh output must fail: ${staleProblems.join('; ')}`);
    assert.ok(staleProblems.some((problem) => /missing from live dist/.test(problem)), `missing fresh output must fail: ${staleProblems.join('; ')}`);

    assert.ok(freshDistProblems(fresh, join(base, 'no-such-live')).length > 0, 'a missing live tree must fail closed, never pass silently');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('P2-02: bounded scavenging removes only aged stage directories', () => {
  const base = mkdtempSync(join(tmpdir(), 'dh-p2-scv-'));
  try {
    const oldStage = join(base, 'dh-packed-stage-old');
    const freshStage = join(base, 'dh-packed-stage-fresh');
    const unrelatedOld = join(base, 'unrelated-old');
    for (const directory of [oldStage, freshStage, unrelatedOld]) {
      mkdirSync(directory);
      writeFileSync(join(directory, 'occupant.tmp'), 'x');
    }
    const staleFile = join(base, 'dh-packed-stage-not-a-directory');
    writeFileSync(staleFile, 'x');

    const day = 24 * 60 * 60 * 1000;
    const now = Date.now();
    for (const target of [oldStage, unrelatedOld, staleFile]) {
      const stamp = new Date(now - 2 * day);
      utimesSync(target, stamp, stamp);
    }

    const { removed, kept } = scavengeStaleStages({ directory: base, now: () => now });
    assert.deepEqual(removed, ['dh-packed-stage-old'], 'exactly the aged stage directory is removed');
    assert.ok(kept.includes('dh-packed-stage-fresh'), 'a stage inside the age bound is kept');
    assert.ok(existsSync(unrelatedOld), 'non-stage directories are never touched');
    assert.ok(existsSync(staleFile), 'non-directory namesakes are never touched');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('T07a2: local workspace tarballs resolve minimal dependency closure and fail closed on tampering', () => {
  const root = mkdtempSync(join(tmpdir(), 'dh-t07a2-local-tarballs-'));
  try {
    const pack = (name: string): StagedWorkspaceTarball => {
      const path = join(root, `${name}.tgz`);
      const bytes = `exact-local-tarball-${name}`;
      writeFileSync(path, bytes);
      return {
        path,
        fileName: `${name}.tgz`,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        packageName: `@kaicreator/domain-harness-${name}`,
        version: '0.10.2-rc.0',
      };
    };
    const packs: NewWorkspacePacks = {
      contracts: pack('contracts'),
      microkernel: pack('microkernel'),
      hostNode: pack('host-node'),
      build: pack('build'),
    };
    const requested = (keys: readonly (keyof NewWorkspacePacks)[]) => verifiedLocalWorkspaceTarballs(packs, keys);
    assert.deepEqual(requested(['microkernel']), [packs.contracts.path, packs.microkernel.path], 'Tiny excludes Host and BUILD');
    assert.deepEqual(requested(['hostNode']), [packs.contracts.path, packs.microkernel.path, packs.hostNode.path], 'Host needs Microkernel and contracts');
    assert.deepEqual(requested(['build']), [packs.contracts.path, packs.build.path], 'BUILD does not need runtime modules');
    assert.deepEqual(requested(['hostNode', 'build']), [
      packs.contracts.path, packs.microkernel.path, packs.hostNode.path, packs.build.path,
    ], 'joint requested closure is stable and deduplicated');
    assert.deepEqual(requested([]), [], 'no undeclared package is implicitly installed');
    writeFileSync(packs.contracts.path, 'tampered bytes');
    assert.throws(() => requested(['hostNode']), /sha256 mismatch/u, 'tampered dependency refuses before install');
    // Restore the earlier corruption so the missing-host case reaches the
    // intended ENOENT failure, rather than failing on the contracts digest.
    writeFileSync(packs.contracts.path, 'exact-local-tarball-contracts');
    rmSync(packs.hostNode.path);
    assert.throws(() => requested(['hostNode']), /ENOENT/u, 'missing exact local tarball refuses instead of registry fallback');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('T07a2: stageNewWorkspaceTarballs physically packs the exact local rc.0 tarballs with live manifest identities', { timeout: 240_000 }, async () => {
  const packs = await stageNewWorkspaceTarballs();
  const expected = [
    { key: 'contracts', root: join(REPO_ROOT, 'packages', 'contracts') },
    { key: 'microkernel', root: join(REPO_ROOT, 'packages', 'microkernel') },
    { key: 'hostNode', root: join(REPO_ROOT, 'packages', 'host-node') },
    { key: 'build', root: join(REPO_ROOT, 'tooling', 'build') },
  ] as const;
  for (const entry of expected) {
    const tarball = packs[entry.key];
    const manifest = JSON.parse(readFileSync(join(entry.root, 'package.json'), 'utf8')) as { name: string; version: string };
    assert.equal(tarball.packageName, manifest.name, `staged ${entry.key} carries the live workspace name`);
    assert.equal(tarball.version, manifest.version, `staged ${entry.key} carries the live workspace version`);
    assert.ok(tarball.fileName.endsWith(`${manifest.version}.tgz`), `staged ${entry.key} tarball name carries the exact version`);
    assert.ok(existsSync(tarball.path), `staged ${entry.key} tarball exists`);
    assert.equal(
      createHash('sha256').update(readFileSync(tarball.path)).digest('hex'),
      tarball.sha256,
      `staged ${entry.key} sha256 record matches the packed bytes`,
    );
  }
  // The staged set is dependency-complete for the bridge selectors.
  assert.deepEqual(
    verifiedLocalWorkspaceTarballs(packs, ['hostNode']),
    [packs.contracts.path, packs.microkernel.path, packs.hostNode.path],
    'the staged pack covers the full runtime-trio closure',
  );
}, 240_000);

test('T07a2: assertNewWorkspacePackagesInstalled fails closed on uninstalled and mis-identified packages', async () => {
  const packs = await stageNewWorkspaceTarballs();
  const emptyConsumer = mkdtempSync(join(tmpdir(), 'dh-t07a2-provenance-'));
  try {
    assert.throws(
      () => assertNewWorkspacePackagesInstalled(emptyConsumer, [packs.contracts]),
      /is not installed in the clean consumer/u,
      'a bridge package absent from node_modules must fail the provenance assertion',
    );
    const installedRoot = join(emptyConsumer, 'node_modules', '@kaicreator', 'domain-harness-contracts');
    mkdirSync(installedRoot, { recursive: true });
    writeFileSync(join(installedRoot, 'package.json'), JSON.stringify({ name: '@kaicreator/domain-harness-contracts', version: '0.0.0-forged' }));
    assert.throws(
      () => assertNewWorkspacePackagesInstalled(emptyConsumer, [packs.contracts]),
      /provenance mismatch.*0\.0\.0-forged/u,
      'a registry-forged or wrong-version install must fail the provenance assertion',
    );
    writeFileSync(join(installedRoot, 'package.json'), JSON.stringify({ name: packs.contracts.packageName, version: packs.contracts.version }));
    assertNewWorkspacePackagesInstalled(emptyConsumer, [packs.contracts]);
  } finally {
    rmSync(emptyConsumer, { recursive: true, force: true });
  }
});
