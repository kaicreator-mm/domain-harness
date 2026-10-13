/**
 * #1013 R4 F-01: a callable Proxy may poison its .bind property while its
 * direct invoke descriptor and ordinary invocation remain callable.
 * Bootstrap must not touch that untrusted member after the one-shot commit.
 * A real, legitimate ModelPort invocation must remain possible.
 * This file is a separate clean Node test process (one-shot Host channels).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { bootstrapTrustedHost } from '../../src/host-v8/index.js';
import { isTrustChannelEstablished } from '../../src/public-v8/trust.js';
import { isKernelHostInstalled } from '../../src/public-v8/kernel-host.js';
import { isGatewaySessionCapInstalled } from '../../src/public-v8/microkernel.js';
import { currentHostModelPort } from '../../src/public-v8/model-port.js';
import { INTEG_ISSUER, INTEG_ISSUER_SECRET } from './helpers.js';

test('F-01 R4: callable Proxy .bind getter cannot crash after Host bootstrap commit', async () => {
  let calls = 0;
  let bindGetterReads = 0;
  const callable = new Proxy(
    async (request: { readonly operation: string; readonly input: unknown }) => {
      calls += 1;
      return { operation: request.operation, input: request.input };
    },
    {
      get(target, key, receiver) {
        if (key === 'bind') {
          bindGetterReads += 1;
          return 42;
        }
        return Reflect.get(target, key, receiver);
      },
    },
  );
  const modelPort = { invoke: callable };
  assert.equal(typeof Object.getOwnPropertyDescriptor(modelPort, 'invoke')?.value, 'function');
  assert.equal(modelPort.invoke, callable);
  assert.equal(isTrustChannelEstablished(), false);
  assert.equal(isKernelHostInstalled(), false);
  assert.equal(isGatewaySessionCapInstalled(), false);

  // Before R4, the post-commit `invoke.bind(port)` getter returned 42,
  // throwing a raw TypeError after the trust/kernel/session channels were
  // already consumed. The trusted intrinsic bind must safely bind instead.
  const handle = await bootstrapTrustedHost({
    issuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
    audience: 'dh-v08-f01-callable-proxy-bind',
    modelPort,
  });
  try {
    assert.equal(bindGetterReads, 0, 'no untrusted invoke.bind property access');
    assert.equal(isTrustChannelEstablished(), true);
    assert.equal(isKernelHostInstalled(), true);
    assert.equal(isGatewaySessionCapInstalled(), true);
    const bound = currentHostModelPort(handle.gatewaySessionCap);
    assert.ok(bound !== undefined, 'trusted bootstrap installed the approved model port');
    const result = await bound.invoke({ operation: 'quote.advise', input: { amount: 21 } });
    assert.deepEqual(result, { operation: 'quote.advise', input: { amount: 21 } });
    assert.equal(calls, 1, 'physical ModelPort called exactly once');
  } finally {
    await handle.host.close();
  }
});
