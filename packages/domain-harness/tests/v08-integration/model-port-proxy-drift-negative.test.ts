/**
 * #1013 R3 focused pre-review falsifier (@6138090328) — nested ModelPort
 * Proxy descriptor/get drift. This file is its OWN clean process.
 *
 * Counterexample shape: `bootstrapTrustedHost` refuses accessor-valued
 * top-level input, but a `modelPort` Proxy is an own-data-value whose
 * DESCRIPTOR trap can report a truthful direct-callable `invoke` while its
 * GET trap returns a non-function. Pre-repair, `installHostModelPort`
 * validated the descriptor and then performed a second dynamic read
 * `(port).invoke.bind(port)` through the get trap — the drifted value made
 * `.bind` throw a raw JS TypeError AFTER trust, kernel Host ports and the
 * gateway session capability were irreversibly installed: a half-bootstrapped
 * process, defeating the R1 F-01 zero-residue transactional property.
 *
 * Required outcome: the drifted proxy refuses TYPED (MODEL_PORT_INVALID)
 * with ZERO residue on every one-shot channel, and a fully legitimate
 * bootstrap + physical model journey succeeds in this SAME process.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';

import { bootstrapTrustedHost, createKernelGateway } from '../../src/host-v8/index.js';
import { QualifiedPackageError } from '../../src/public-v8/contracts.js';
import { isTrustChannelEstablished } from '../../src/public-v8/trust.js';
import { isKernelHostInstalled } from '../../src/public-v8/kernel-host.js';
import { isGatewaySessionCapInstalled } from '../../src/public-v8/microkernel.js';
import { INTEG_ISSUER, INTEG_ISSUER_SECRET, mintCredential, sealRealApp, sqliteTempPath } from './helpers.js';

const AUDIENCE = 'dh-v08-f01-proxy-drift';

test('F-01 R3: truthfully-descriptored nested Proxy ModelPort with drifting get trap refuses TYPED with zero residue; legitimate bootstrap+journey follows', async () => {
  assert.equal(isTrustChannelEstablished(), false, 'fresh process: no trust channel');
  assert.equal(isKernelHostInstalled(), false, 'fresh process: no kernel Host ports');
  assert.equal(isGatewaySessionCapInstalled(), false, 'fresh process: no gateway session capability');

  // The counterexample: outer proxy forwards the descriptor truthfully to the
  // real data property; the INNER get trap drifts `invoke` to a non-function.
  // Nested two levels so both proxies' traps are genuinely on the path.
  const realInvoke = async () => ({ decision: { outcome: 'x' }, event: { type: 'X', payload: {} } });
  const inner = new Proxy({ invoke: realInvoke }, {
    get(target, key, receiver) {
      return key === 'invoke' ? 42 : Reflect.get(target, key, receiver);
    },
  });
  const modelPort = new Proxy(inner, {
    getOwnPropertyDescriptor(target, key) {
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
    get(target, key, receiver) {
      return Reflect.get(target, key, receiver);
    },
  });

  let refusal: unknown;
  try {
    await bootstrapTrustedHost({
      issuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
      audience: AUDIENCE,
      modelPort,
    });
    assert.fail('the drifted Proxy ModelPort must refuse the bootstrap');
  } catch (error) {
    refusal = error;
  }
  assert.ok(
    refusal instanceof QualifiedPackageError,
    `typed MODEL_PORT_INVALID refusal required — pre-repair this was a raw TypeError from the post-commit .bind (got: ${String(refusal)})`,
  );
  assert.equal((refusal as QualifiedPackageError).code, 'MODEL_PORT_INVALID');

  // ZERO residue — the R1 F-01 transactional property survives the drift:
  // the refusal must land BEFORE any one-shot channel is consumed.
  assert.equal(isTrustChannelEstablished(), false, 'zero trust residue after the typed refusal');
  assert.equal(isKernelHostInstalled(), false, 'zero Kernel Host residue after the typed refusal');
  assert.equal(isGatewaySessionCapInstalled(), false, 'zero gateway session residue after the typed refusal');

  // The refused attempt consumed NOTHING: a fully legitimate bootstrap with a
  // REAL SQLite file and a counting ModelPort succeeds in this same process,
  // and the physical model journey runs end-to-end.
  const invoked: unknown[] = [];
  const sqlitePath = sqliteTempPath('proxy-drift');
  const handle = await bootstrapTrustedHost({
    issuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
    audience: AUDIENCE,
    storage: { path: sqlitePath },
    modelPort: {
      invoke: async (request: { input: { amount: number; requestId: string } }) => {
        invoked.push(request.input);
        return {
          decision: { outcome: 'model-proposed' },
          event: { type: 'MODEL_QUOTE_DECIDED', payload: { amount: request.input.amount, requestId: request.input.requestId } },
        };
      },
    },
  });
  try {
    handle.host.resources.provision('ledger', () => ({ reserved: true }));
    const gateway = createKernelGateway({ host: handle.host, gatewaySessionCap: handle.gatewaySessionCap });
    await gateway.registerApp({ appId: 'model-quote', packageRoot: await sealRealApp('model'), genesisRoles: ['platform-operator'], authorityClass: 'PRODUCTION' });
    const operatorC = mintCredential({ tenantId: 't1', appId: 'model-quote', subject: 'op', roles: ['platform-operator'], audience: AUDIENCE, grantId: 'g-op' });
    const requesterC = mintCredential({ tenantId: 't1', appId: 'model-quote', subject: 'req', roles: ['requester'], audience: AUDIENCE, grantId: 'g-req' });
    await gateway.activateGenesis(operatorC, { appId: 'model-quote', instanceKey: 'quote-proxy' });
    const admitted = await gateway.send(requesterC, {
      intentType: 'submitModelQuoteDecision',
      messageId: 'm-proxy',
      input: { amount: 30, requestId: 'PX-1' },
      target: { tenantId: 't1', appId: 'model-quote', instanceKey: 'quote-proxy' },
    }) as { status: string };
    assert.equal(admitted.status, 'admitted', 'the legitimate model journey admits after the refused proxy attempt');
    assert.equal(invoked.length, 1, 'the legitimate ModelPort was PHYSICALLY invoked exactly once');
  } finally {
    await handle.host.close();
    await rm(sqlitePath, { force: true });
  }
});
