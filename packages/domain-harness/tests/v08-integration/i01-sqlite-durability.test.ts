/**
 * V08-INT-I01 durability — Kernel documents survive in the real SQLite store (#1013).
 * ==================================================================================
 *
 * Clean-process physical evidence that the bootstrap-installed docs port is
 * backed by ONE durable SQLite file: occurrences submitted through the
 * loaded Kernel land in the bootstrap store, the store closes, a FRESH
 * connection to the same physical file reads them back, and the true-CAS
 * conditions still hold after reopen (create-refusal and revision-anchored
 * CAS). No in-memory substitute ever served the Kernel.
 */

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { DomainHarness } from '../../src/public-v8/index.js';
import { bootstrapTrustedHost } from '../../src/host-v8/bootstrap.js';
import { openSqliteCasStore } from '../../src/host-v8/sqlite-cas-store.js';
import { HostBoundaryError } from '../../src/host-v8/errors.js';
import { B01_ISSUER, B01_ISSUER_SECRET } from '../v08-abi/v08-tb-fixture.js';
import { i01Closure, i01Intent } from './i01-fixture.js';

const TRUSTED_NOW = new Date('2026-10-12T09:00:00.000Z');

let storageDir: string;
let dbPath: string;
let handle: Awaited<ReturnType<typeof bootstrapTrustedHost>>;
let firstKey: string;

test('V08-INT-I01-D setup: real SQLite bootstrap, one-arg load, one occurrence', async () => {
  storageDir = await mkdtemp(join(tmpdir(), 'dh-i01-durable-'));
  dbPath = join(storageDir, 'durable.sqlite');
  handle = await bootstrapTrustedHost({
    issuers: new Map([[B01_ISSUER, B01_ISSUER_SECRET]]),
    audience: 'i01-durable-audience',
    storage: { path: dbPath },
    now: () => TRUSTED_NOW,
  });
  handle.host.resources.provision('i01-ledger', (_operation, payload) => ({
    reserved: true,
    effectId: (payload as { effectId: string }).effectId,
  }));

  const closure = i01Closure('durable');
  const facade = await DomainHarness.load(closure.root);
  const receipt = (await facade.send(i01Intent(closure.intentType, 'msg:d1', 60))) as { key: string; status: string };
  assert.equal(receipt.status, 'admitted');
  firstKey = receipt.key;
  await facade.stop();
  await handle.host.close();
});

test('V08-INT-I01-D a fresh connection to the same physical file reads the Kernel document back', async () => {
  const reopened = await openSqliteCasStore({ path: dbPath });
  const doc = await reopened.get(firstKey);
  assert.ok(doc !== null, 'the Kernel occurrence survived the store close in the SQLite file');
  assert.equal(doc.revision, 0, 'the physical revision survived untouched');
  const value = doc.value as { pin: string; input: { amount: number }; at: string };
  assert.equal(value.input.amount, 60);
  assert.equal(value.at, TRUSTED_NOW.toISOString());
  const listed = await reopened.list('i01-occ:');
  assert.equal(listed.length, 1, 'the fresh connection lists the same occurrence under the prefix');

  // The true-CAS discipline still holds on the reopened physical store:
  // create-refusal for the existing key, CAS mismatch for a stale revision.
  await assert.rejects(
    () => reopened.put(firstKey, { forged: true }, { mustBeAbsent: true }),
    (error: unknown) => error instanceof HostBoundaryError && error.code === 'HOST_KEY_EXISTS',
  );
  await assert.rejects(
    () => reopened.put(firstKey, { forged: true }, { mustMatchRevision: 9999 }),
    (error: unknown) => error instanceof HostBoundaryError && error.code === 'HOST_CAS_CONFLICT',
  );
  await reopened.close();
});

test('V08-INT-I01-D cleanup', async () => {
  // Windows-robust removal: the SQLite handle release can lag process use
  // of the file by a moment (EBUSY) — same pattern as the v08-host suite.
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rm(storageDir, { recursive: true, force: true });
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if ((code === 'EBUSY' || code === 'ENOTEMPTY' || code === 'EPERM') && attempt < 20) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        continue;
      }
      throw error;
    }
  }
});
