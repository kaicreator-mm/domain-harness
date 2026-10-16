/**
 * #1003 FR07-KH2 clean-process continuation — PARENT.
 *
 * Seals the FR07 continuation Business closure over the CURRENT selected
 * K/S payload bytes, then a stock-Node child (package-subpath consumer of
 * the built dist, no test imports) runs the K-owned continuation and the
 * H-authenticated cancellation over a REAL SQLite file and reports one
 * JSON verdict the parent asserts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { INTEG_ISSUER, INTEG_ISSUER_SECRET, sealRealApp } from './helpers.js';

function runChild(script: string, args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { cwd: join(fileURLToPath(new URL('../../../../', import.meta.url))) });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', reject);
    child.on('close', (code) => resolve({ stdout, stderr, code: code ?? -1 }));
  });
}

test('FR07-KH2 clean-process: dist consumer runs the K continuation and authenticated cancellation on REAL SQLite', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dh1003-fr07-clean-'));
  try {
    const rootPath = join(dir, 'root.json');
    await writeFile(rootPath, JSON.stringify(await sealRealApp('continuation')), 'utf8');
    const { stdout, stderr, code } = await runChild(
      fileURLToPath(new URL('./fr07-kh2-clean-process-child.mjs', import.meta.url)),
      [join(dir, 'fr07.sqlite'), rootPath, INTEG_ISSUER, INTEG_ISSUER_SECRET],
    );
    const line = stdout.split('\n').find((candidate) => candidate.startsWith('JSON_RESULT: '));
    if (line === undefined) {
      assert.fail(`child produced no verdict (code ${String(code)})\nstdout:\n${stdout}\nstderr:\n${stderr}`);
    }
    const verdict = JSON.parse(line.slice('JSON_RESULT: '.length)) as Record<string, unknown>;
    assert.equal(verdict.ok, true, `child journey failed: ${String(verdict.error)}`);
    assert.equal(verdict.p1Status, 'admitted');
    assert.equal(verdict.p1Turns, 2, 'two physical ModelPort turns');
    assert.deepEqual(verdict.p1Evidence, { status: 'measured', count: 2, scope: 'bound-model-port-invocations' });
    assert.equal(verdict.p1Dependencies, 1);
    assert.equal(verdict.p1Ledger, 1);
    assert.equal(verdict.p1State, 'approved');
    assert.equal(verdict.cancelRequest, 'cancel-requested');
    assert.equal(verdict.cancelStatus, 'terminated');
    assert.equal(verdict.cancelCode, 'CANCELLED');
    assert.equal(verdict.cancelObservedAbort, true);
    assert.equal(verdict.cancelState, 'review');
    assert.equal(verdict.ledgerAfterCancel, 1, 'the cancelled occurrence dispatched no effect');
    assert.equal(verdict.journalDocs, 1, 'only the admitted occurrence journaled');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
