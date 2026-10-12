/**
 * #1013 I01 — protected Kernel Host ports are actually installed COMPLETE.
 *
 * One process, one bootstrap: the negative channel validations run FIRST
 * (the one-shot channel is still unconsumed), then `bootstrapTrustedHost`
 * over a REAL SQLite file installs the full bounded port set, and the
 * public one-argument load of a REAL approved closure succeeds without any
 * manual port installation (the pre-#1013 `KERNEL_HOST_NOT_INSTALLED`
 * composition gap).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';

import { DomainHarness } from '../../src/public-v8/index.js';
import { QualifiedPackageError } from '../../src/public-v8/contracts.js';
import {
  installKernelHostPorts,
  isKernelHostInstalled,
  currentKernelHostPorts,
} from '../../src/public-v8/kernel-host.js';
import { sha256Hex } from '../../src/public-v8/contracts.js';
import { bootstrapTrustedHost } from '../../src/host-v8/index.js';
import { getFacadeKernelOps } from '../../src/public-v8/microkernel.js';
import { INTEG_ISSUER, INTEG_ISSUER_SECRET, sealRealApp, sqliteTempPath } from './helpers.js';

test('I01-N: malformed port members are refused typed before bootstrap consumes the channel', () => {
  const good = {
    docs: { get: (key: string) => key, put: (_key: string, value: unknown) => value },
    sha256: { digestUtf8: (value: string) => value },
  };
  assert.throws(
    () => installKernelHostPorts({ ...good, resources: 42 }),
    (error: unknown) => error instanceof QualifiedPackageError && error.code === 'KERNEL_HOST_INVALID',
  );
  assert.throws(
    () => installKernelHostPorts({ ...good, docs: { ...good.docs, list: 'not-a-function' } }),
    (error: unknown) => error instanceof QualifiedPackageError && error.code === 'KERNEL_HOST_INVALID',
  );
  assert.throws(
    () => installKernelHostPorts({ ...good, clock: 'not-a-function' }),
    (error: unknown) => error instanceof QualifiedPackageError && error.code === 'KERNEL_HOST_INVALID',
  );
});

test('I01-P: bootstrapTrustedHost installs the COMPLETE protected port set over real SQLite and the one-arg load works', async () => {
  const sqlitePath = sqliteTempPath('i01');
  const handle = await bootstrapTrustedHost({
    issuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
    audience: 'dh-v08-integration-host',
    storage: { path: sqlitePath },
  });
  try {
    assert.equal(isKernelHostInstalled(), true);
    const ports = currentKernelHostPorts();
    assert.equal(typeof ports.docs.get, 'function');
    assert.equal(typeof ports.docs.put, 'function');
    assert.equal(typeof ports.docs.list, 'function');
    assert.equal(typeof (ports.resources as Record<string, unknown>).call, 'function');
    assert.equal(typeof ports.clock, 'function');

    // Trusted digest port is the compiler/verifier digest construction.
    assert.equal(ports.sha256.digestUtf8('1013'), sha256Hex('1013'));
    // Trusted clock port is an ISO timestamp.
    const clockPort = ports.clock as () => string;
    assert.ok(!Number.isNaN(Date.parse(clockPort())));

    // The physical docs port IS the probed CAS store: conditions forward
    // verbatim and an unconditional put is refused typed by the store.
    await ports.docs.put('v08-integration:i01:probe', { ok: true }, { mustBeAbsent: true });
    const read = (await ports.docs.get('v08-integration:i01:probe')) as { value: unknown; revision: number };
    assert.deepEqual(read.value, { ok: true });
    assert.equal(read.revision, 0);
    await assert.rejects(
      ports.docs.put('v08-integration:i01:probe', { ok: true }) as Promise<unknown>,
      (error: unknown) => (error as { code?: string }).code === 'HOST_PUT_CONDITION_REQUIRED',
    );
    const listPort = ports.docs.list as (prefix: string) => Promise<readonly string[]>;
    const listed = await listPort('v08-integration:i01:');
    assert.deepEqual([...listed], ['v08-integration:i01:probe']);

    // The kernel-effect resources port dispatches under the fixed Host
    // service principal (never a submitting user).
    handle.host.resources.provision('i01-probe-resource', (operation, payload, context) => ({
      operation,
      payload,
      principalSubject: context.principal.subject,
      principalRoles: [...context.principal.roles],
    }));
    const effectResult = await (ports.resources as { call: (key: string, op: string, payload: unknown) => Promise<unknown> }).call('i01-probe-resource', 'probe', { x: 1 });
    assert.deepEqual(effectResult, {
      operation: 'probe',
      payload: { x: 1 },
      principalSubject: 'v8-kernel-effect-service',
      principalRoles: ['kernel-effect'],
    });

    // THE pre-#1013 gap: with only bootstrap (no manual install anywhere),
    // the public one-argument load of a REAL approved closure succeeds and
    // produces a gateway-capable facade.
    const root = await sealRealApp('approval');
    const facade = await DomainHarness.load(root);
    const ops = getFacadeKernelOps(facade);
    assert.notEqual(ops, undefined);
    assert.equal(ops!.describePolicy().workflowKey, 'order-quote');
    assert.equal(ops!.describePolicy().policyId, 'order-approval');
    assert.ok(ops!.describePolicy().intentTypes.includes('submitQuoteDecisionDynamic'));
    assert.ok(ops!.describePolicy().intentTypes.includes('submitQuoteDecision'));
  } finally {
    await handle.host.close();
    await rm(sqlitePath, { force: true });
  }
});

test('I01-N: the protected channel is one-shot — reinstallation fails typed after bootstrap', () => {
  assert.throws(
    () => installKernelHostPorts({
      docs: { get: () => null, put: () => null },
      sha256: { digestUtf8: (value: string) => value },
    }),
    (error: unknown) => error instanceof QualifiedPackageError && error.code === 'KERNEL_HOST_ALREADY_INSTALLED',
  );
});
