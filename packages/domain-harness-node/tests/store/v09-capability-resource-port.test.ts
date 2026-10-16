/**
 * v0.9 N02 (#1028) — focused semantics of the capability-owned physical
 * storage/resource port: real open/write/read/close, append ordering,
 * use-after-close typing, holder-side disposal (with a real OS-handle-release
 * proof), reopen availability, and typed open failures with no false ACK.
 */

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { V09CapabilityResourceSpace, V09ResourceError } from '../../src/v09/capability-resource-port.js';

function tempDir(t: test.TestContext): string {
  const directory = mkdtempSync(join(tmpdir(), 'domain-harness-v09-res-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function resourceErrorOf(error: unknown): V09ResourceError {
  assert.ok(error instanceof V09ResourceError, `expected V09ResourceError, got ${String(error)}`);
  return error;
}

test('V09-RES P: real open/append/read/close roundtrip — bytes land on the physical file', async (t) => {
  const base = tempDir(t);
  const path = join(base, 'artifact.bin');
  const space = new V09CapabilityResourceSpace();
  assert.equal(space.grantedHandleCount, 0);

  const handle = await space.openResource(path);
  assert.equal(space.grantedHandleCount, 1, 'the holder tracks the granted live handle');
  await handle.appendBytes(new TextEncoder().encode('hello '));
  await handle.appendBytes(new TextEncoder().encode('v0.9'));
  const seen = await handle.readBytes();
  assert.equal(new TextDecoder().decode(seen), 'hello v0.9');
  await handle.close();
  assert.equal(space.grantedHandleCount, 0, 'cooperative close releases the grant');

  // The physical truth on disk equals what the port reported.
  assert.equal(readFileSync(path, 'utf8'), 'hello v0.9');
});

test('V09-RES P: sequential appends accumulate in physical order', async (t) => {
  const base = tempDir(t);
  const path = join(base, 'journal.bin');
  const space = new V09CapabilityResourceSpace();
  const handle = await space.openResource(path);
  t.after(() => space.disposeAll());
  for (const chunk of ['a', 'b', 'c', 'd']) {
    await handle.appendBytes(new TextEncoder().encode(chunk));
    const snapshot = await handle.readBytes();
    assert.equal(new TextDecoder().decode(snapshot), ['a', 'b', 'c', 'd'].slice(0, ['a', 'b', 'c', 'd'].indexOf(chunk) + 1).join(''));
  }
  assert.equal(readFileSync(path, 'utf8'), 'abcd');
});

test('V09-RES N: use after close is typed resource_closed; close is idempotent; reopen sees prior bytes', async (t) => {
  const base = tempDir(t);
  const path = join(base, 'reopen.bin');
  const space = new V09CapabilityResourceSpace();
  const handle = await space.openResource(path);
  await handle.appendBytes(new TextEncoder().encode('persisted'));
  await handle.close();

  const writeAfter = await handle.appendBytes(new TextEncoder().encode('x')).then(() => null, (error: unknown) => error);
  assert.equal(resourceErrorOf(writeAfter).code, 'resource_closed');
  assert.equal(resourceErrorOf(writeAfter).indeterminate, false);
  const readAfter = await handle.readBytes().then(() => null, (error: unknown) => error);
  assert.equal(resourceErrorOf(readAfter).code, 'resource_closed');
  await handle.close(); // idempotent

  const reopened = await space.openResource(path);
  assert.equal(new TextDecoder().decode(await reopened.readBytes()), 'persisted', 'the reopened resource is available with prior content');
  await reopened.close();
});

test('V09-RES P/N: holder-side disposeAll closes every granted handle; the OS file is genuinely unlocked afterwards', async (t) => {
  const base = tempDir(t);
  const pathOne = join(base, 'one.bin');
  const pathTwo = join(base, 'two.bin');
  const space = new V09CapabilityResourceSpace();
  const one = await space.openResource(pathOne);
  const two = await space.openResource(pathTwo);
  await one.appendBytes(new TextEncoder().encode('1'));
  await two.appendBytes(new TextEncoder().encode('2'));
  assert.equal(space.grantedHandleCount, 2);

  await space.disposeAll();
  assert.equal(space.grantedHandleCount, 0, 'holder-side disposal released every grant');
  await space.disposeAll(); // idempotent

  const useAfter = await one.appendBytes(new TextEncoder().encode('x')).then(() => null, (error: unknown) => error);
  assert.equal(resourceErrorOf(useAfter).code, 'resource_closed', 'disposed handles fail typed, never silently');
  const useTwoAfter = await two.readBytes().then(() => null, (error: unknown) => error);
  assert.equal(resourceErrorOf(useTwoAfter).code, 'resource_closed');

  // Handle-release proof: on Windows a leaked descriptor keeps the path locked
  // and rm fails; successful removal proves the OS handles are truly closed.
  rmSync(pathOne);
  rmSync(pathTwo);
  assert.equal(existsSync(pathOne), false);
  assert.equal(existsSync(pathTwo), false);

  // The space still grants fresh resources after disposal (reopen availability).
  const again = await space.openResource(pathOne);
  await again.appendBytes(new TextEncoder().encode('after-disposal'));
  assert.equal(new TextDecoder().decode(await again.readBytes()), 'after-disposal');
  await again.close();
});

test('V09-RES N: unavailable paths fail typed resource_unavailable with no false ACK (no artifact created)', async (t) => {
  const base = tempDir(t);

  const missingDirTarget = join(base, 'no-such-dir', 'artifact.bin');
  const missing = await new V09CapabilityResourceSpace().openResource(missingDirTarget).then(() => null, (error: unknown) => error);
  assert.equal(resourceErrorOf(missing).code, 'resource_unavailable');
  assert.equal(resourceErrorOf(missing).indeterminate, false);
  assert.equal(existsSync(missingDirTarget), false, 'nothing was created — the port did not pretend to open');

  const fileThatIsNotDir = join(base, 'plain-file');
  writeFileSync(fileThatIsNotDir, 'not a directory');
  const notDir = await new V09CapabilityResourceSpace()
    .openResource(join(fileThatIsNotDir, 'artifact.bin'))
    .then(() => null, (error: unknown) => error);
  assert.equal(resourceErrorOf(notDir).code, 'resource_unavailable');
});

test('V09-RES N: malformed paths are typed path_malformed; disposal of an empty space succeeds', async () => {
  const space = new V09CapabilityResourceSpace();
  const malformed = await space.openResource('').then(() => null, (error: unknown) => error);
  assert.equal(resourceErrorOf(malformed).code, 'path_malformed');
  assert.equal(space.grantedHandleCount, 0);
  await space.disposeAll();
});
