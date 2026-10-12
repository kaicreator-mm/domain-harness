/**
 * V08-INT-I01 — bootstrap installs the protected Kernel Host ports (#1013).
 * ===========================================================================
 *
 * Clean-process positive proof at the exact merged v0.8 composition: a real
 * SQLite `bootstrapTrustedHost` installs the FULL bounded Kernel Host port
 * set (true-CAS docs get/put/list, node:crypto sha256, trusted bootstrap
 * clock, generic resource dispatch) through the private one-shot seam, and
 * the strictly ONE-ARGUMENT `DomainHarness.load(package)` then activates a
 * Kernel mechanism whose every port observation is PHYSICALLY backed by the
 * bootstrapped Host — no second load argument, no caller-supplied ports,
 * no invented second runtime.
 *
 * (Each node:test file is its own process, so this file starts from the
 * genuinely un-bootstrapped process state.)
 */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { DomainHarness, QualifiedPackageError } from '../../src/public-v8/index.js';
import { isKernelHostInstalled } from '../../src/public-v8/kernel-host.js';
import { bootstrapTrustedHost, isHostTrustChannelEstablished } from '../../src/host-v8/bootstrap.js';
import { B01_ISSUER, B01_ISSUER_SECRET } from '../v08-abi/v08-tb-fixture.js';
import { i01Closure, i01Intent } from './i01-fixture.js';

// The trusted clock is INJECTED at bootstrap: every Kernel observation of
// `clock()` must carry exactly this instant (never wall time).
const TRUSTED_NOW = new Date('2026-10-12T08:30:00.000Z');
const TRUSTED_NOW_ISO = TRUSTED_NOW.toISOString();

let storageDir: string;
let handle: Awaited<ReturnType<typeof bootstrapTrustedHost>>;
const resourceDispatches: { resourceKey: string; operation: string; payload: unknown; principalSubject: string; principalRoles: readonly string[] }[] = [];

test('V08-INT-I01 setup: real SQLite bootstrap installs the kernel Host channel before any load', async () => {
  assert.equal(isKernelHostInstalled(), false, 'this process starts with no kernel Host binding');
  storageDir = await mkdtemp(join(tmpdir(), 'dh-i01-bootstrap-'));
  handle = await bootstrapTrustedHost({
    issuers: new Map([[B01_ISSUER, B01_ISSUER_SECRET]]),
    audience: 'i01-host-audience',
    storage: { path: join(storageDir, 'host.sqlite') },
    now: () => TRUSTED_NOW,
  });
  assert.equal(isHostTrustChannelEstablished(), true, 'bootstrap established the load trust channel');
  assert.equal(isKernelHostInstalled(), true, 'bootstrap installed the protected kernel Host channel (I01 closure)');
  // The ledger resource is provisioned in the HOST context (deployment
  // configuration, not a caller capability); the Kernel dispatches onto it
  // as the Host's kernel dispatch principal.
  handle.host.resources.provision('i01-ledger', (operation, payload, context) => {
    resourceDispatches.push({
      resourceKey: 'i01-ledger',
      operation,
      payload,
      principalSubject: context.principal.subject,
      principalRoles: [...context.principal.roles],
    });
    return { reserved: true, effectId: (payload as { effectId: string }).effectId };
  });
});

test('V08-INT-I01 bootstrap-installed ports bind the ONE-ARG load to real physical Host facilities', async () => {
  const closure = i01Closure('main');
  const facade = await DomainHarness.load(closure.root); // strictly one argument
  const intent = i01Intent(closure.intentType, 'msg:1', 40);

  const receipt = (await facade.send(intent)) as {
    status: string;
    pin: string;
    key: string;
    revision: number;
    readBackRevision: number | null;
    at: string;
    resource: { reserved: boolean; effectId: string } | null;
    listedKeys: number;
    kernel: { packageId: string };
  };

  // --- docs port: the occurrence physically lives in the bootstrap SQLite store.
  assert.equal(receipt.status, 'admitted');
  assert.equal(receipt.revision, 0, 'mustBeAbsent create started a fresh physical revision');
  assert.equal(receipt.readBackRevision, 0, 'docs.get returned the true-CAS {value, revision} shape');
  const stored = await handle.store.get(receipt.key);
  assert.ok(stored !== null, 'the Kernel occurrence document is physically in the bootstrap store');
  assert.equal((stored.value as { pin: string; at: string }).pin, receipt.pin);
  assert.equal((stored.value as { at: string }).at, TRUSTED_NOW_ISO, 'the stored timestamp is the trusted bootstrap clock');
  assert.equal(receipt.listedKeys, 1, 'docs.list enumerated the occurrence prefix physically');

  // --- sha256 port: the receipt pin is exactly node:crypto SHA-256 over the input.
  const expectedPin = createHash('sha256').update(JSON.stringify(intent.input), 'utf8').digest('hex');
  assert.equal(receipt.pin, expectedPin, 'sha256.digestUtf8 is the trusted node:crypto digest');

  // --- clock port: the Kernel observed the injected trusted instant.
  assert.equal(receipt.at, TRUSTED_NOW_ISO, 'clock() carries the bootstrap trusted clock, never wall time');

  // --- resources port: the physical dispatch reached the provisioned Host resource.
  assert.deepEqual(receipt.resource, { reserved: true, effectId: 'fx:msg:1' });
  assert.equal(resourceDispatches.length, 1, 'exactly one physical resource dispatch');
  const dispatch = resourceDispatches[0];
  assert.ok(dispatch !== undefined);
  assert.equal(dispatch.principalSubject, 'host-kernel:i01-host-audience', 'the dispatch runs as the Host kernel principal, never as a caller');
  assert.deepEqual(dispatch.principalRoles, ['host-kernel']);

  // --- a second occurrence under the same key is refused by the true-CAS
  //     condition (HOST_KEY_EXISTS): the docs port is genuinely conditional.
  await assert.rejects(
    () => facade.send(i01Intent(closure.intentType, 'msg:1', 1)),
    (error: unknown) => error instanceof Error && /exists/i.test(String((error as Error).message)),
  );
  await facade.stop();
});

test('V08-INT-I01 the load stays strictly one-argument — no Host ports parameter exists', async () => {
  const closure = i01Closure('arity');
  await assert.rejects(
    () => (DomainHarness.load as (root: unknown, extra?: unknown) => Promise<unknown>)(closure.root, { docs: { get: () => null, put: () => undefined, list: async () => [] } }),
    (error: unknown) => {
      assert.ok(error instanceof QualifiedPackageError);
      assert.equal((error as QualifiedPackageError).code, 'LOAD_ARITY_INVALID', 'no second load argument can ever carry Host ports (P1-L2-ABI-02 stays closed)');
      return true;
    },
  );
});

test('V08-INT-I01 cleanup', async () => {
  await handle.host.close();
  await rm(storageDir, { recursive: true, force: true });
});
