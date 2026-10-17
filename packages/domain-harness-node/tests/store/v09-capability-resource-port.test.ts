/**
 * v0.9 N02 (#1028) — focused semantics of the capability-owned physical
 * storage/resource port: real open/write/read/close, append ordering,
 * use-after-close typing, holder-side disposal (with a real OS-handle-release
 * proof), reopen availability, and typed open failures with no false ACK.
 * Short-I/O negatives (short write, short/EOF read, failing disposal closes)
 * are deterministic: they run against injectable instrumented FileHandle
 * fakes through the port's opener seam — no sleeps, no timing dependencies.
 */

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  V09CapabilityResourceSpace,
  V09ResourceError,
  type V09PhysicalFileHandle,
  type V09PhysicalFileOpener,
} from '../../src/v09/capability-resource-port.js';

function tempDir(t: test.TestContext): string {
  const directory = mkdtempSync(join(tmpdir(), 'domain-harness-v09-res-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function resourceErrorOf(error: unknown): V09ResourceError {
  assert.ok(error instanceof V09ResourceError, `expected V09ResourceError, got ${String(error)}`);
  return error;
}

/** A FileHandle-shaped fake whose write/read/close misbehave only when overridden. */
function fakeFileHandle(overrides: Partial<V09PhysicalFileHandle> = {}): V09PhysicalFileHandle {
  return {
    write: async () => {
      throw new Error('unexpected write in this test');
    },
    read: async () => {
      throw new Error('unexpected read in this test');
    },
    stat: async () => ({ size: 0 }),
    close: async () => {},
    ...overrides,
  };
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

test('V09-RES N: a short write never ACKs success — the append is completed by rewriting the remaining suffix', async () => {
  const payload = new TextEncoder().encode('abc');
  const writeCalls: { offset: number | null | undefined; length: number | null | undefined; bytes: string }[] = [];
  let writeCall = 0;
  const shortOnce = fakeFileHandle({
    write: async (buffer, offset, length) => {
      writeCall += 1;
      const start = offset ?? 0;
      const requested = length ?? buffer.length - start;
      writeCalls.push({ offset, length, bytes: new TextDecoder().decode(buffer.subarray(start, start + requested)) });
      if (writeCall === 1) return { bytesWritten: 1 }; // SHORT: the driver confirmed only 'a'
      return { bytesWritten: requested };
    },
  });
  const space = new V09CapabilityResourceSpace(async () => shortOnce);
  const handle = await space.openResource('fake://append.bin');

  await handle.appendBytes(payload); // must NOT silently succeed on the short first write
  await handle.close();

  assert.deepEqual(
    writeCalls.map(({ offset, length }) => ({ offset, length })),
    [
      { offset: 0, length: 3 }, // the original full append
      { offset: 1, length: 2 }, // the not-yet-confirmed suffix at its remaining offset
    ],
    'the port completed the append instead of trusting the short write',
  );
  assert.equal(writeCalls.at(1)?.bytes, 'bc', 'only the remaining suffix is rewritten — no byte is duplicated or skipped');
});

test('V09-RES N: a write that never progresses is a bounded typed indeterminate failure — never success', async () => {
  let writeCalls = 0;
  const stalled = fakeFileHandle({
    write: async () => {
      writeCalls += 1;
      return { bytesWritten: 0 }; // the driver keeps confirming zero progress
    },
  });
  const space = new V09CapabilityResourceSpace(async () => stalled);
  const handle = await space.openResource('fake://stalled.bin');

  const failure = await handle.appendBytes(new TextEncoder().encode('x')).then(() => null, (error: unknown) => error);
  const error = resourceErrorOf(failure);
  assert.equal(error.code, 'resource_error');
  assert.equal(error.indeterminate, true, 'an append that could not be completed must never be claimed as success');
  assert.equal(writeCalls, 8, 'the completion loop is bounded (8 attempts) — it terminates instead of spinning');
});

test('V09-RES N: verified short reads accumulate until the snapshot is filled — content matches the physical bytes exactly', async () => {
  const content = new TextEncoder().encode('payload'); // 7 bytes
  let readCall = 0;
  const chunky = fakeFileHandle({
    stat: async () => ({ size: content.length }),
    read: async (buffer, offset, length, position) => {
      readCall += 1;
      const start = position ?? 0;
      const want = readCall === 1 ? 3 : length ?? 0; // the first read is SHORT (3 of 7)
      buffer.set(content.subarray(start, start + want), offset ?? 0);
      return { bytesRead: want };
    },
  });
  const space = new V09CapabilityResourceSpace(async () => chunky);
  const handle = await space.openResource('fake://chunky.bin');

  const seen = await handle.readBytes();
  await handle.close();

  assert.equal(readCall, 2, 'the read loop continued after the first short read instead of trusting it');
  assert.equal(seen.length, content.length, 'verified short reads accumulate — no byte is invented');
  assert.deepEqual([...seen], [...content], 'the returned bytes are exactly the physical content, byte for byte');
});

test('V09-RES N: a read shortened by EOF (concurrent truncation) returns only the verified prefix — never uninitialized bytes', async () => {
  const content = new TextEncoder().encode('payload'); // stat says 7; the file is truncated to 4 mid-read
  let readCall = 0;
  const truncating = fakeFileHandle({
    stat: async () => ({ size: content.length }),
    read: async (buffer, offset, _length, position) => {
      readCall += 1;
      if (readCall === 1) {
        const start = position ?? 0;
        buffer.set(content.subarray(start, start + 4), offset ?? 0);
        return { bytesRead: 4 };
      }
      return { bytesRead: 0 }; // EOF: the rest of the stat'ed range no longer exists
    },
  });
  const space = new V09CapabilityResourceSpace(async () => truncating);
  const handle = await space.openResource('fake://truncated.bin');

  const seen = await handle.readBytes();
  await handle.close();

  assert.equal(seen.length, 4, 'only the bytes actually read are returned — no uninitialized suffix is exposed as content');
  assert.deepEqual([...seen], [...content.subarray(0, 4)], 'the verified prefix matches the fake physical content byte for byte');
});

test('V09-RES N: disposeAll is best-effort — remaining handles are still closed after a failing close, and one aggregate typed failure reports every failure', async () => {
  const closeOrder: string[] = [];
  const rawOne = new Error('EIO: close of one failed');
  const rawTwo = new Error('EIO: close of two failed');
  const opener: V09PhysicalFileOpener = async (path: string) =>
    fakeFileHandle({
      close: async () => {
        closeOrder.push(path);
        if (path === 'fake://one.bin') throw rawOne;
        if (path === 'fake://two.bin') throw rawTwo;
      },
    });
  const space = new V09CapabilityResourceSpace(opener);
  const one = await space.openResource('fake://one.bin');
  await space.openResource('fake://two.bin');
  const three = await space.openResource('fake://three.bin');
  assert.equal(space.grantedHandleCount, 3);

  const failure = await space.disposeAll().then(() => null, (error: unknown) => error);
  const error = resourceErrorOf(failure);
  assert.equal(error.code, 'resource_error');
  assert.equal(error.indeterminate, true, 'a close that did not confirm leaves the OS handle state UNKNOWN');
  assert.deepEqual(closeOrder, ['fake://one.bin', 'fake://two.bin', 'fake://three.bin'], 'every remaining handle was still attempted after the first close failed');
  assert.match(error.message, /fake:\/\/one\.bin/, 'the aggregate failure names each failed handle');
  assert.match(error.message, /fake:\/\/two\.bin/);
  const aggregate = error.cause;
  assert.ok(aggregate instanceof AggregateError, 'the aggregate failure carries the raw close errors');
  assert.deepEqual(aggregate.errors, [rawOne, rawTwo]);
  assert.equal(space.grantedHandleCount, 0, 'no grant stays tracked after disposal');
  const useAfter = await one.appendBytes(new TextEncoder().encode('x')).then(() => null, (e: unknown) => e);
  assert.equal(resourceErrorOf(useAfter).code, 'resource_closed', 'disposed handles fail typed afterwards');
  await three.close(); // idempotent cooperative close still works after holder disposal
});
