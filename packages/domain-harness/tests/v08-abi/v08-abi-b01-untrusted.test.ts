/**
 * V08-ABI-B01-N7 — unauthorized issuer refuses BEFORE any import (T-B, #1001).
 * =============================================================================
 *
 * Mandatory closure evidence for the #1000 P1-AUTH-01 leftover: in THIS
 * process (each node:test file is its own process) the trusted issuer
 * registry is deliberately NEVER installed — the exact process state a
 * hostile loader previously exploited. Every `DomainHarness.load(package)`
 * here must fail closed with UNTRUSTED_ISSUER (or, before even the trust
 * gate, KERNEL_HOST_NOT_INSTALLED) while a top-level side-effect sentinel
 * inside every sealed module stays at 0 — proving the physical import never
 * happened, not merely that the result was rejected.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { DomainHarness, QualifiedPackageError, load } from '../../src/public-v8/index.js';
import { isTrustChannelEstablished } from '../../src/public-v8/trust.js';
import { installKernelHostPorts, isKernelHostInstalled } from '../../src/public-v8/kernel-host.js';
import { installGatewaySessionCap } from '../../src/public-v8/microkernel.js';
import {
  b01DefaultClosure,
  b01MemoryHost,
  b01SentinelCount,
  b01Seal,
} from './v08-tb-fixture.js';

// The host-context stand-in's session capability: the loader path reads the
// kernel Host ports with the SAME capability the stand-in installs into the
// gateway channel (#1013 R2 @5494026032). The trust channel stays ABSENT —
// that is the refusal this file proves.
const B01_UNTRUSTED_SESSION_CAP = 'b01-untrusted-session-capability-0123456789abcdef0123456789abcd';

async function refuseFacade(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(
    () => promise,
    (error: unknown) => {
      assert.ok(error instanceof QualifiedPackageError, `expected QualifiedPackageError, got ${String(error)}`);
      assert.equal((error as QualifiedPackageError).code, code);
      return true;
    },
  );
}

function assertClosureNeverExecuted(tag: string): void {
  const closure = b01DefaultClosure(tag);
  for (const id of [closure.kernelId, closure.sdkId, closure.businessId]) {
    assert.equal(b01SentinelCount(id), 0, `module ${id} must never evaluate for a refused closure (import never happened)`);
  }
}

test('V08-ABI-B01-N7a without the protected Host bootstrap the loader fails closed before anything else', async () => {
  assert.equal(isKernelHostInstalled(), false, 'this process starts with no kernel Host binding');
  const root = b01Seal(b01DefaultClosure('n7a').input);
  await refuseFacade(DomainHarness.load(root), 'KERNEL_HOST_NOT_INSTALLED');
  assertClosureNeverExecuted('n7a');
});

test('V08-ABI-B01-N7b no trusted issuer registry: even a genuinely signed root is UNTRUSTED_ISSUER with zero execution (P1-AUTH-01 closure)', async () => {
  const host = b01MemoryHost();
  installKernelHostPorts(host.ports, B01_UNTRUSTED_SESSION_CAP); // Host bootstrap present; trust channel still ABSENT
  installGatewaySessionCap(B01_UNTRUSTED_SESSION_CAP);
  assert.equal(isTrustChannelEstablished(), false, 'no trusted issuer registry is installed in this process');
  const root = b01Seal(b01DefaultClosure('n7b').input); // genuinely HMAC-signed by the issuer side
  // The scoped facade loader refuses typed and executes nothing...
  await refuseFacade(DomainHarness.load(root), 'UNTRUSTED_ISSUER');
  // ...and so does the underlying qualified load() — the gate is shared.
  await refuseFacade(load(root), 'UNTRUSTED_ISSUER');
  assertClosureNeverExecuted('n7b');
  // With the import never happening, no mechanism side effect can exist either.
  assert.equal(host.docs.size, 0);
  assert.equal(host.puts.length, 0);
  assert.equal(host.digestInputs.length, 0);
});
