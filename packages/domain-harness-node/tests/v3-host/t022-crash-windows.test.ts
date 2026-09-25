import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { CentralAdmissionError } from '@kaicreator/domain-harness';
import { makeRequest } from '../../../domain-harness/tests/admission/helpers.js';
import { openHostFixture, pinInstance } from './host-fixture.js';

interface ChildResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runHostChild(mode: string, databasePath: string): Promise<ChildResult> {
  const fixtureUrl = new URL('./fixtures/host-child.ts', import.meta.url);
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', fileURLToPath(fixtureUrl), mode, databasePath],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('exit', (code) => resolve({ code, stdout, stderr }));
  });
}

function tempDir(): string {
  const directory = mkdtempSync(join(tmpdir(), 'domain-harness-t022-crash-'));
  return directory;
}

/**
 * T-022 V8 + V16: the child process commits the durable effect and dies
 * before the rest of the turn. The parent re-runs the same turn over the same
 * SQLite file: the committed effect is replayed from the journal, the tool is
 * never re-executed (no duplicate mutation), and re-replaying the same turn
 * stays fully idempotent — one journal record, one evidence record.
 */
test('T-022 V8/V16: crash after committed effect replays without duplicate mutation', async (t) => {
  const directory = tempDir();
  const path = join(directory, 'host.sqlite');
  const fixture = await openHostFixture(path);
  t.after(() => {
    fixture.close();
    rmSync(directory, { recursive: true, force: true });
  });
  await pinInstance(fixture);

  const crashed = await runHostChild('admit-crash-after-effect', path);
  assert.equal(crashed.code, 137, crashed.stderr);
  assert.ok(crashed.stdout.includes('crash:after-effect-commit'));

  const afterCrash = fixture.authorities.admissionEffectJournal.getRecords();
  assert.equal(afterCrash.length, 1);
  assert.equal(afterCrash[0]!.status, 'completed', 'the child effect commit is durable');
  assert.equal(fixture.tools.calls.length, 0, 'the parent never executed the tool yet');

  const recovered = await fixture.assembly.admitTurn(makeRequest());
  if (recovered.status !== 'admitted') assert.fail('expected admitted after recovery');
  assert.equal(recovered.admitted.effects[0]!.disposition, 'replayed');
  assert.equal(
    fixture.tools.calls.length,
    0,
    'the durably committed effect is reused; the mutation is never re-executed',
  );

  // V16 aggregate: replaying the identical turn again changes nothing.
  const replayed = await fixture.assembly.admitTurn(makeRequest());
  if (replayed.status !== 'admitted') assert.fail('expected admitted on second replay');
  assert.equal(replayed.admitted.effects[0]!.disposition, 'replayed');
  assert.equal(fixture.tools.calls.length, 0);
  assert.equal(fixture.authorities.admissionEffectJournal.getRecords().length, 1);
  assert.equal(
    fixture.authorities.evidence.records().length,
    1,
    'deterministic evidence identity makes the repeated decision append idempotent',
  );

  fixture.close();
  const reopened = await openHostFixture(path);
  const durableRecords = reopened.authorities.admissionEffectJournal.getRecords();
  assert.equal(durableRecords.length, 1);
  assert.equal(durableRecords[0]!.status, 'completed');
  assert.equal(reopened.authorities.evidence.records().length, 1);
  reopened.close();
});

/**
 * T-022 V9 + V16: the child process dies inside tool execution, leaving a
 * started-but-never-committed non-idempotent effect. Recovery refuses to
 * silently re-execute: the same turn fails closed with
 * ADMISSION_EFFECT_AMBIGUOUS and the tool call count stays at zero.
 */
test('T-022 V9/V16: crash mid-execute never silently re-executes a non-idempotent effect', async (t) => {
  const directory = tempDir();
  const path = join(directory, 'host.sqlite');
  const fixture = await openHostFixture(path);
  t.after(() => {
    fixture.close();
    rmSync(directory, { recursive: true, force: true });
  });
  await pinInstance(fixture);

  const crashed = await runHostChild('admit-crash-mid-execute', path);
  assert.equal(crashed.code, 137, crashed.stderr);
  assert.ok(crashed.stdout.includes('crash:mid-execute'));

  const afterCrash = fixture.authorities.admissionEffectJournal.getRecords();
  assert.equal(afterCrash.length, 1);
  assert.equal(afterCrash[0]!.status, 'started', 'the started record is durable');

  await assert.rejects(
    () => fixture.assembly.admitTurn(makeRequest()),
    (error: unknown) =>
      error instanceof CentralAdmissionError
      && error.code === 'ADMISSION_EFFECT_AMBIGUOUS',
    're-executing a started non-idempotent effect is forbidden',
  );
  assert.equal(
    fixture.tools.calls.length,
    0,
    'recovery never silently re-executes the tool',
  );
  assert.equal(
    fixture.authorities.admissionEffectJournal.getRecords()[0]!.status,
    'started',
    'the ambiguous record is left for operator recovery, not rewritten',
  );
});
