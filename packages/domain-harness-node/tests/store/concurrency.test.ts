import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  makeConformanceInstance,
} from '../../../domain-harness/tests/helpers/runtime-store-conformance.ts';
import type { MessageAcceptedAck } from '@kaicreator/domain-harness/v2';
import { makeTestStore } from './test-helpers.js';

interface ChildResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runChild(
  mode: string,
  databasePath: string,
  instanceKey: string,
  messageId: string,
): Promise<ChildResult> {
  const fixtureUrl = new URL('./fixtures/store-child.ts', import.meta.url);
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', fixtureUrl.pathname, mode, databasePath, instanceKey, messageId],
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

function parseAck(result: ChildResult): MessageAcceptedAck {
  assert.equal(result.code, 0, result.stderr);
  return JSON.parse(result.stdout.trim()) as MessageAcceptedAck;
}

test('G5 concurrent fresh-store initialization serializes migrations safely', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'domain-harness-t003-init-race-'));
  const databasePath = join(directory, 'runtime.sqlite');
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const results = await Promise.all(
    Array.from({ length: 8 }, (_, index) =>
      runChild('open', databasePath, `unused-${index + 1}`, 'unused'),
    ),
  );

  for (const result of results) {
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout.trim(), 'opened');
  }
});

test('G5 concurrency race deduplicates one messageId to one durable sequence', async (t) => {
  const { store, databasePath } = makeTestStore(t, 10_000);
  await store.createInstance(makeConformanceInstance('dedup-race'));

  const results = await Promise.all(
    Array.from({ length: 8 }, () =>
      runChild('accept', databasePath, 'dedup-race', 'same-message'),
    ),
  );
  const acks = results.map(parseAck);

  assert.deepEqual(new Set(acks.map((ack) => ack.targetSequence)), new Set([1]));
  assert.equal(acks.filter((ack) => ack.status === 'accepted').length, 1);
  assert.equal(acks.filter((ack) => ack.status === 'duplicate').length, 7);
  assert.deepEqual(new Set(acks.map((ack) => ack.acceptedAt)).size, 1);
  assert.equal(
    (await store.getMessageDisposition(
      { workflowId: 'conformance', instanceKey: 'dedup-race' },
      'same-message',
    ))?.targetSequence,
    1,
  );
});

test('G5 concurrent distinct accepts allocate a gap-free unique target sequence', async (t) => {
  const { store, databasePath } = makeTestStore(t, 10_000);
  await store.createInstance(makeConformanceInstance('sequence-race'));

  const results = await Promise.all(
    Array.from({ length: 8 }, (_, index) =>
      runChild('accept', databasePath, 'sequence-race', `message-${index + 1}`),
    ),
  );
  const acks = results.map(parseAck);
  const sequences = acks.map((ack) => ack.targetSequence).sort((a, b) => a - b);

  assert.deepEqual(sequences, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(new Set(sequences).size, 8);
  assert.equal(acks.every((ack) => ack.status === 'accepted'), true);
});
