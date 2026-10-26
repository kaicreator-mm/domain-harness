/**
 * v0.10.2 T03b (#1325) — cross-process CAS over the physical SQLite adapter.
 *
 * The in-process race/crash/restart/fault probes live in
 * `sqlite-adapter.test.ts` (Node24 10/10 prior evidence); what only a REAL
 * second process can prove is that the CAS guarantee holds when another
 * OS process holds the same database file: the child's blind create on the
 * parent's existing revision CONFLICTS, the child's exact-revision CAS put
 * WINS and advances the durable revision, and a brand-new store object in
 * the parent (restart shape) observes exactly the child's final state.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openSqliteCasStore } from '../src/sqlite-adapter.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CHILD = join(HERE, 'fixtures', 'sqlite-cas-child.mjs');

interface ChildLine {
  readonly step: string;
  readonly outcome: string;
}

function runChild(dbPath: string, key: string): Promise<{ code: number; lines: ChildLine[]; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CHILD, dbPath, key], { stdio: ['ignore', 'pipe', 'pipe'] });
    const lines: ChildLine[] = [];
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString('utf8').split(/\r?\n/u)) {
        const trimmed = line.trim();
        if (trimmed.startsWith('{')) lines.push(JSON.parse(trimmed) as ChildLine);
      }
    });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? -1, lines, stderr }));
  });
}

test('T03b-XPROC-1: a second process cannot blind-overwrite the parent revision; exact CAS wins and survives reopen', { timeout: 120_000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dh-t03b-xproc-'));
  const dbPath = join(dir, 'cas.sqlite');
  const key = 'dh:t03b:cross-process:key';
  try {
    // (1) The parent creates the key at revision 0 and KEEPS the store open.
    const parent = await openSqliteCasStore({ path: dbPath });
    await parent.put(key, { writer: 'parent' }, { mustBeAbsent: true });

    // (2) A real second process contests the SAME file.
    const child = await runChild(dbPath, key);
    assert.equal(
      child.code, 0,
      `child exit 0 (stderr: ${child.stderr.slice(0, 400)})`,
    );
    const byStep = new Map(child.lines.map((line) => [line.step, line]));
    assert.equal(byStep.get('child-create-on-existing')?.outcome, 'CONFLICT', 'the child blind create must conflict with the parent revision');
    assert.equal(byStep.get('child-cas-put')?.outcome, 'OK', 'the child exact-revision CAS put must win');

    // (3) The parent's STILL-OPEN store observes the child's write (WAL
    // multi-process visibility), and a brand-new store object over the same
    // file observes the same durable final state.
    const live = await parent.get(key);
    assert.ok(live !== null && live.revision === 1, `live parent view sees revision 1 (got ${JSON.stringify(live)})`);
    assert.deepEqual(live.value, { writer: 'child', revisionOf: 0 });
    await parent.close();

    const reopened = await openSqliteCasStore({ path: dbPath });
    const durable = await reopened.get(key);
    assert.ok(durable !== null && durable.revision === 1, 'reopen observes the child revision');
    assert.deepEqual(durable.value, { writer: 'child', revisionOf: 0 });
    await reopened.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
