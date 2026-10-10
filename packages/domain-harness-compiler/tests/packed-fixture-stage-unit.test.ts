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
import test from 'node:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compareDirectoryDigests, freshDistProblems, scavengeStaleStages } from './packed-fixture-stage.ts';

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
