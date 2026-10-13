/**
 * #1013 R1 evidence gap — the two-tenant Journal falsifier.
 *
 * Two DISTINCT valid issuer-signed tenants address the SAME appId and the
 * SAME instanceKey TEXT with the SAME messageId and the same resolved
 * idempotency-key text. Each tenant must admit its OWN occurrence: the
 * physical Kernel effect-journal documents are two distinct tenant-
 * qualified records, both effects execute independently, and replaying
 * one tenant's message neither re-executes its own (non-idempotent)
 * effect nor touches the other tenant's journal bytes. Verified against
 * the PHYSICAL store documents — not inferred from state/receipt
 * isolation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';

import { bootstrapTrustedHost, createKernelGateway } from '../../src/host-v8/index.js';
import { INTEG_ISSUER, INTEG_ISSUER_SECRET, mintCredential, sealRealApp, sqliteTempPath } from './helpers.js';

const AUDIENCE = 'dh-v08-journal-falsifier';
const JOURNAL_PREFIX = 'v08-kernel:effect-journal:';

interface JournalDoc {
  effectId: string;
  target: { workflowId: string; instanceKey: string };
  durableControlTurnId: string;
  effectType: string;
  status: string;
  idempotencyKey?: string;
}

test('Journal falsifier: same appId/instanceKey/messageId/idempotency text admits ONCE PER TENANT, physically', async () => {
  const sqlitePath = sqliteTempPath('journal-falsifier');
  const handle = await bootstrapTrustedHost({
    issuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
    audience: AUDIENCE,
    storage: { path: sqlitePath },
  });
  const ledgerDispatches: { reservation: string; amount: number; requestId: string; effectId: string }[] = [];
  handle.host.resources.provision('ledger', (_operation: string, payload: unknown) => {
    const record = payload as { reservation: string; amount: number; requestId: string; effectId: string };
    ledgerDispatches.push(record);
    return { reserved: true };
  });
  try {
    const gateway = createKernelGateway({ host: handle.host, gatewaySessionCap: handle.gatewaySessionCap });
    await gateway.registerApp({ appId: 'order-approval', packageRoot: await sealRealApp('approval'), genesisRoles: ['platform-operator'] });

    const tenant = (tenantId: string) => ({
      operator: mintCredential({ tenantId, appId: 'order-approval', subject: `${tenantId}-op`, roles: ['platform-operator'], audience: AUDIENCE, grantId: `g-${tenantId}-op` }),
      requester: mintCredential({ tenantId, appId: 'order-approval', subject: `${tenantId}-req`, roles: ['requester'], audience: AUDIENCE, grantId: `g-${tenantId}-req` }),
    });
    const t1 = tenant('t1');
    const t2 = tenant('t2');

    // Genesis for the SAME instanceKey TEXT — two physically distinct
    // tenant-qualified instances.
    await gateway.activateGenesis(t1.operator, { appId: 'order-approval', instanceKey: 'quote-j' });
    await gateway.activateGenesis(t2.operator, { appId: 'order-approval', instanceKey: 'quote-j' });

    // The colliding submissions: identical messageId + input text.
    const collide = (credentials: ReturnType<typeof tenant>, tenantId: string) => gateway.send(credentials.requester, {
      intentType: 'submitQuoteDecisionDynamic',
      messageId: 'm-collide',
      input: { amount: 30, requestId: 'COLLIDE-1' },
      target: { tenantId, appId: 'order-approval', instanceKey: 'quote-j' },
    });

    const r1 = await collide(t1, 't1') as { status: string };
    assert.equal(r1.status, 'admitted', 'tenant t1 admits its occurrence');
    const r2 = await collide(t2, 't2') as { status: string };
    assert.equal(r2.status, 'admitted', 'tenant t2 admits the SAME messageId/idempotency text — no cross-tenant dedup exists');

    // PHYSICAL journal documents: exactly two, tenant-qualified by target.
    const journalKeys = await handle.host.docs.list(JOURNAL_PREFIX);
    assert.equal(journalKeys.length, 2, 'two physically distinct effect-journal documents');
    const docs = await Promise.all(journalKeys.map((key) => handle.host.docs.get(key)));
    const journals = docs.map((entry) => (entry?.value as { record: JournalDoc }).record);
    const instanceKeys = journals.map((doc) => doc.target.instanceKey).sort();
    assert.deepEqual(
      instanceKeys,
      ['t1:order-approval:quote-j', 't2:order-approval:quote-j'],
      'each journal document targets its own tenant-qualified physical instance',
    );
    for (const doc of journals) {
      assert.equal(doc.status, 'completed', 'both effects durably completed');
      assert.equal(doc.effectType, 'effect:reserve');
      assert.equal(doc.idempotencyKey, 'reserve:quote:COLLIDE-1', 'the idempotency-key TEXT is identical across tenants');
    }
    const journalA = journals[0];
    const journalB = journals[1];
    if (journalA === undefined || journalB === undefined) {
      throw new Error('a tenant effect-journal document is missing');
    }
    assert.notEqual(journalA.effectId, journalB.effectId, 'distinct physical effect identities (tenant-qualified turns)');
    assert.notEqual(journalA.durableControlTurnId, journalB.durableControlTurnId);

    // Two INDEPENDENT effect outcomes by tenant: the ledger resource
    // physically dispatched twice, each under its own effect identity.
    assert.equal(ledgerDispatches.length, 2);
    assert.deepEqual(
      ledgerDispatches.map((payload) => payload.requestId),
      ['COLLIDE-1', 'COLLIDE-1'],
      'both tenants\' effects carried the same business text',
    );
    const effectIds = new Set(ledgerDispatches.map((payload) => payload.effectId));
    assert.equal(effectIds.size, 2, 'the physical dispatches are two independent outcomes');

    // REPLAY leg: tenant t1 replays its OWN messageId against its OWN
    // (now final) instance — no third journal document may appear, no
    // non-idempotent effect re-execution may happen, and tenant t2's
    // journal bytes must be UNTOUCHED by t1's replay.
    const t2Index = journals.findIndex((doc) => doc.target.instanceKey.startsWith('t2:'));
    assert.ok(t2Index >= 0, 'tenant t2 has its own journal document');
    const t2JournalKey = journalKeys[t2Index];
    if (t2JournalKey === undefined) {
      throw new Error('tenant t2 journal key missing');
    }
    const t2Journal = journals[t2Index];
    if (t2Journal === undefined) {
      throw new Error('tenant t2 journal document missing');
    }
    const t2JournalBefore = JSON.stringify(t2Journal);
    const t1Replay = await collide(t1, 't1') as { status: string; denial?: { reason?: string } };
    assert.notEqual(t1Replay.status, 'admitted', 'the per-tenant replay of a final-state instance does not admit a second occurrence');
    assert.equal(
      (await handle.host.docs.list(JOURNAL_PREFIX)).length,
      2,
      'the replay created no new effect-journal document',
    );
    assert.equal(ledgerDispatches.length, 2, 'the replay executed no additional physical effect');
    const t2JournalAfter = JSON.stringify(((await handle.host.docs.get(t2JournalKey))?.value as { record: JournalDoc }).record);
    assert.equal(t2JournalAfter, t2JournalBefore, 'tenant t2\'s journal bytes are untouched by t1\'s replay');

    // And each tenant's own instance state is independently admitted.
    const s1 = await gateway.queryInstance(t1.requester, { tenantId: 't1', appId: 'order-approval', instanceKey: 'quote-j' }) as { state: { stateKey: string } };
    const s2 = await gateway.queryInstance(t2.requester, { tenantId: 't2', appId: 'order-approval', instanceKey: 'quote-j' }) as { state: { stateKey: string } };
    assert.equal(s1.state.stateKey, 'approved');
    assert.equal(s2.state.stateKey, 'approved');
  } finally {
    await handle.host.close();
    await rm(sqlitePath, { force: true });
  }
});
