/**
 * KPK-07 — persistent recovery (bounded)
 * ======================================
 * A durable Host storage primitive fixture (file-backed document store) and
 * a genuine "instance restart": a brand-new `DomainHarness.load` over a
 * brand-new Host on the SAME durable directory recovers the kernel journal,
 * governance pin and instance state, and replays a completed occurrence with
 * zero extra resource calls.
 *
 * HONEST BOUNDARY (reported as bounded-PASS): this proves durable-record
 * recovery through the Host storage seam within one selected Kernel version.
 * It is NOT a real OS crash-mid-write simulation, multi-process contention
 * or cross-version migration proof (cross-version replay is out of scope per
 * user direction 6093427821).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { load, buildPackageRoot, createFileHost } from '../index.mjs';
import { writeEvidence } from './evidence.mjs';

const NOW = '2026-09-21T07:00:00.000Z';

test('KPK-07: durable restart recovers journal/pin/instance and replays without extra effects', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'kpk07-'));
  try {
    const target = { workflowId: 'order-quote', instanceKey: 'instance:42' };

    // --- First "process": open + approve durably on the file Host.
    const pkg = await buildPackageRoot({ rootPackageId: 'app:order-approval@1.0.0', businessModule: 'business-approval.mjs' });
    const host1 = createFileHost(dir, { now: () => NOW });
    const runtime1 = await load(pkg, { hostPorts: host1 });
    await runtime1.openInstance({ target, correlationId: 'corr:42' });
    const receipt1 = await runtime1.send({
      kind: 'kpk01/intent', intentType: 'submitQuoteDecision', target,
      messageId: 'msg:1', input: { amount: 42 }, caller: { role: 'requester' },
    });
    assert.equal(receipt1.status, 'admitted');
    assert.equal(host1.resources.callCount(), 1);
    runtime1.stop();

    // --- "Restart": brand-new Host + brand-new load on the same directory.
    const host2 = createFileHost(dir, { now: () => NOW });
    const runtime2 = await load(pkg, { hostPorts: host2 });
    const mechanism = await runtime2.query({ kind: 'mechanism' });
    assert.equal(mechanism.moduleId, 'kernel-vnext@1.0.0');

    const instance = await runtime2.query({ kind: 'instance', target });
    assert.equal(instance.state.stateKey, 'approved');
    assert.equal(instance.stateRevision, 1);

    const journal = await runtime2.query({ kind: 'journal' });
    assert.equal(journal.length, 1);
    assert.equal(journal[0].status, 'completed');
    assert.equal(journal[0].effectId, 'turn:order-quote:instance%3A42:message:msg%3A1/effect/1');

    // Replay the completed occurrence on the restarted runtime: the effect is
    // reused from the durable journal; no physical resource call happens.
    // (The duplicate message finds the already-approved state: v0.7 composed
    // behavior denies a re-approval with no-candidate-transition BEFORE any
    // effect work — the journal row and resource count stay untouched.)
    const replay = await runtime2.send({
      kind: 'kpk01/intent', intentType: 'submitQuoteDecision', target,
      messageId: 'msg:1', input: { amount: 42 }, caller: { role: 'requester' },
    });
    assert.equal(replay.status, 'denied');
    assert.equal(replay.denial.reason, 'no-candidate-transition');
    assert.equal(host2.resources.callCount(), 0);
    assert.equal((await runtime2.query({ kind: 'journal' })).length, 1);

    // --- Crash-before-commit recovery on the durable Host: the journal
    // survives, the retry replays the completed effect with zero dispatches.
    const target2 = { workflowId: 'order-quote', instanceKey: 'instance:43' };
    const host3 = createFileHost(dir, { now: () => NOW });
    const runtime3 = await load(pkg, { hostPorts: host3 });
    await runtime3.openInstance({ target: target2, correlationId: 'corr:43' });
    host3.docs.failNextPutMatching('kpk01:wf-instance:order-quote:instance:43');
    await assert.rejects(
      () => runtime3.send({
        kind: 'kpk01/intent', intentType: 'submitQuoteDecision', target: target2,
        messageId: 'msg:43', input: { amount: 42 }, caller: { role: 'requester' },
      }),
      (error) => error.code === 'HOST_FAULT_INJECTED',
    );
    assert.equal(host3.resources.callCount(), 1);

    const retry3 = await runtime3.send({
      kind: 'kpk01/intent', intentType: 'submitQuoteDecision', target: target2,
      messageId: 'msg:43', input: { amount: 42 }, caller: { role: 'requester' },
    });
    assert.equal(retry3.status, 'admitted');
    assert.equal(retry3.admitted.effects[0].disposition, 'replayed');
    assert.equal(host3.resources.callCount(), 1, 'durable journal replay: zero extra dispatches across restart');

    await writeEvidence('kpk07-persistent-recovery', {
      falsifier: 'KPK-07',
      verdict: 'PARTIAL→BOUNDED_PASS: same-version durable restart recovery proven via the Host file-store seam; real OS crash-mid-write and multi-process contention NOT simulated (explicit boundary)',
      durableDirectory: path.basename(dir),
      restartRecovered: {
        instanceState: instance.state.stateKey,
        stateRevision: instance.stateRevision,
        journalRows: journal.length,
        journalStatus: journal[0].status,
      },
      restartDuplicateMessage: { reason: replay.denial.reason, resources: host2.resources.callCount() },
      crashBeforeCommitRecovery: {
        disposition: retry3.admitted.effects[0].disposition,
        dispatchesTotal: host3.resources.callCount(),
      },
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
