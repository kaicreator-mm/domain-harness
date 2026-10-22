/**
 * Tiny clean-installed consumer scenario (#1180 T11).
 *
 * One real Node24 process over a file-backed SQLite K store: activate the
 * packed BUILD output, run ONE Business intent through the selected Standard
 * Router and the real Kernel admission/effect path, take an authorized scoped
 * snapshot, restart over the SAME physical file, and replay the identical
 * turn from the immutable K02 original receipt with zero new effect.
 *
 * No advanced package is selected, imported or installed; the resolution log
 * captured by app.mjs is part of the report.
 */
import { deepStrictEqual } from 'node:assert/strict';
import { join } from 'node:path';

import {
  SqliteDocStore,
  activateV10App,
} from './runtime-core.mjs';

/** Advanced PACKAGE identities Tiny must never select, install or import. */
const ADVANCED_PACKAGE_MARKERS = [
  'sfeature-', 'kext-', 'business-agent', 'capability-agent', 'business-wait-resume',
  'extjob', 'extnotify',
];
/** Implementation markers that must not appear inside Tiny's OWN sealed bytes. */
const ADVANCED_SOURCE_MARKERS = [
  'sfeature-', 'kext-', 'business-agent', 'capability-agent', 'business-wait-resume', 'extjob', 'extnotify',
  'semantic-decision', 'workflow-control', 'context-assembly', 'shadow-baseline',
  'openai', 'anthropic', 'deepseek',
];

const WORKFLOW_ID = 'order-quote';
const INSTANCE_KEY = 'tiny-instance-1';
const MESSAGE_ID = 'tiny-msg-1';
const INTENT = {
  intentType: 'submitQuoteDecision',
  instanceKey: INSTANCE_KEY,
  messageId: MESSAGE_ID,
  input: { amount: 30 },
};

/** Bounded wait for the asynchronous subscription delivery tail. */
async function waitFor(condition, label, timeoutMs = 5000) {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

export async function run({ scenario, workdir, app, manifest, log }) {
  if (scenario !== 'tiny-basic') throw new Error(`unknown tiny scenario ${String(scenario)}`);
  const steps = [];
  const step = async (name, body) => {
    const detail = await body();
    steps.push({ name, ok: true, detail: detail ?? null });
  };
  const dbPath = join(workdir, 'tiny-k.sqlite');
  const deployment = manifest.deployment;
  const principal = { source: 'host-authenticated', subject: 'user:tiny', tenantId: deployment.tenantId };
  const authority = {
    principal,
    authorize: (verified, target) => verified?.tenantId === target.tenantId,
  };

  let store = new SqliteDocStore(dbPath);
  let activation = await activateV10App(app, {
    store,
    tenantId: deployment.tenantId,
    deploymentIdentity: deployment,
    queryAuthority: authority,
    now: () => Date.UTC(2026, 9, 20, 0, 0, 0),
    deploymentRoot: log.deploymentRoot,
  });

  await step('selection.tiny', () => {
    const extensions = activation.facade.selectedExtensions;
    const features = activation.facade.selectedFeatures;
    if (extensions.length !== 0 || features.length !== 0) {
      throw new Error(`Tiny selected advanced modules: extensions=${JSON.stringify(extensions)} features=${JSON.stringify(features)}`);
    }
    const roles = app.modules.map((module) => module.role).sort();
    const expected = ['business', 'capability', 'kernel-primary', 'standard-primary'];
    if (JSON.stringify(roles) !== JSON.stringify(expected)) {
      throw new Error(`unexpected Tiny roster roles ${JSON.stringify(roles)}`);
    }
    const advanced = app.modules.filter((module) => ADVANCED_PACKAGE_MARKERS.some((marker) => module.packageId.includes(marker)));
    if (advanced.length !== 0) throw new Error(`advanced package in Tiny BUILD: ${JSON.stringify(advanced.map((m) => m.packageId))}`);
    const installedAdvanced = log.bareSpecifiers().filter((specifier) => ADVANCED_PACKAGE_MARKERS.some((marker) => specifier.includes(marker)));
    if (installedAdvanced.length !== 0) throw new Error(`advanced package physically resolved: ${JSON.stringify(installedAdvanced)}`);
    const appOwnedSources = app.modules.filter((module) => module.role === 'business' || module.role === 'capability');
    const sourcesWithAdvanced = appOwnedSources.filter((module) => ADVANCED_SOURCE_MARKERS.some((marker) => module.moduleSource.includes(marker)));
    if (sourcesWithAdvanced.length !== 0) {
      throw new Error(`advanced marker in sealed Tiny bytes: ${JSON.stringify(sourcesWithAdvanced.map((m) => m.packageId))}`);
    }
    return { roster: app.modules.map((module) => ({ packageId: module.packageId, role: module.role })) };
  });

  await step('send.basic', async () => {
    const receipt = await activation.facade.send(INTENT);
    if (receipt.status !== 'admitted') throw new Error(`expected admitted, got ${JSON.stringify(receipt).slice(0, 400)}`);
    const effects = receipt.admitted?.effects ?? [];
    if (effects.length !== 1 || effects[0].disposition !== 'executed') {
      throw new Error(`expected exactly one executed effect, got ${JSON.stringify(effects)}`);
    }
    return { status: receipt.status, effects };
  });

  await step('query.scoped', async () => {
    const answer = await activation.facade.queryScopedSnapshot({
      workflowId: WORKFLOW_ID,
      instanceKey: INSTANCE_KEY,
      businessPackageId: 'business-order-approval@v08.1.0.0',
    });
    if (answer.target.tenantId !== deployment.tenantId) throw new Error('query answered a foreign tenant');
    const snapshot = answer.snapshot;
    if (snapshot === null || typeof snapshot !== 'object') throw new Error('query returned no snapshot');
    return { target: answer.target, stateKey: snapshot.state?.stateKey ?? null, revision: snapshot.state?.stateRevision ?? null };
  });

  await step('query.deniedForeignB', async () => {
    let code = null;
    try {
      await activation.facade.queryScopedSnapshot({
        workflowId: WORKFLOW_ID,
        instanceKey: INSTANCE_KEY,
        businessPackageId: 'business-quote-hidden@v010.1.0.0',
      });
    } catch (error) {
      code = error?.code ?? 'NO_CODE';
    }
    if (code === null) throw new Error('querying an unselected Business did not refuse');
    return { code };
  });

  const beforeRestart = {
    kCounters: activation.facade.kCounters('business-order-approval@v08.1.0.0'),
    journalRows: store.count('%effect-journal%'),
    docRows: store.count('%'),
  };
  activation.dispose();
  store.close();

  await step('restart.reopen', () => {
    if (beforeRestart.docRows < 2) throw new Error(`only ${beforeRestart.docRows} durable K rows before restart`);
    store = new SqliteDocStore(dbPath);
    return { rows: store.count('%'), journalRows: store.count('%effect-journal%') };
  });

  activation = await activateV10App(app, {
    store,
    tenantId: deployment.tenantId,
    deploymentIdentity: deployment,
    queryAuthority: authority,
    now: () => Date.UTC(2026, 9, 20, 0, 0, 1),
    deploymentRoot: log.deploymentRoot,
  });

  await step('replay.originalReceipt', async () => {
    const replay = await activation.facade.send({ ...INTENT, input: { amount: 30 } });
    if (replay.status !== 'admitted') throw new Error(`replay status ${JSON.stringify(replay).slice(0, 300)}`);
    if (replay.idempotentReplay !== true) throw new Error('the replay did not answer from the immutable original receipt');
    const countersAfter = activation.facade.kCounters('business-order-approval@v08.1.0.0');
    // Counters are per-activation; the physical proof is that the replayed
    // process dispatched nothing and the durable journal gained no row.
    if ((countersAfter.effectDispatches ?? 0) !== 0) {
      throw new Error(`replay dispatched an effect again: ${String(countersAfter.effectDispatches)}`);
    }
    if (store.count('%effect-journal%') !== beforeRestart.journalRows) {
      throw new Error(`replay added a journal row: ${beforeRestart.journalRows} -> ${store.count('%effect-journal%')}`);
    }
    if ((countersAfter.durableOriginalReceiptReplays ?? 0) + (countersAfter.turnAdmissionReplays ?? 0) < 1) {
      throw new Error('no original-receipt replay counter moved');
    }
    return { status: replay.status, idempotentReplay: true, counters: countersAfter };
  });

  await step('replay.changedInputConflict', async () => {
    let code = null;
    try {
      await activation.facade.send({ ...INTENT, input: { amount: 31 } });
    } catch (error) {
      code = error?.code ?? 'NO_CODE';
    }
    if (code === null) throw new Error('changed input replay was not refused');
    return { code };
  });

  // [v0.10 #1265] The frozen L2 Tiny contract's remaining public verbs:
  // subscribe delivers the exact immutable Kernel receipt of this
  // activation's own turns; unsubscribe silences delivery; stop is a
  // graceful typed shutdown.
  const delivered = [];
  let subscription = null;
  await step('subscribe.receipt', async () => {
    subscription = await activation.facade.subscribe((receipt) => { delivered.push(receipt); });
    const sent = await activation.facade.send({ ...INTENT, messageId: 'tiny-msg-2', instanceKey: 'tiny-instance-2' });
    if (sent.status !== 'admitted') {
      throw new Error(`subscribed send was not admitted: ${JSON.stringify(sent).slice(0, 300)}`);
    }
    await waitFor(() => delivered.length >= 1, 'the subscribed receipt delivery');
    if (delivered.length !== 1) throw new Error(`expected exactly one delivered receipt, got ${String(delivered.length)}`);
    const receipt = delivered[0];
    deepStrictEqual(receipt, sent);
    if (Object.isFrozen(receipt) !== true || Object.isFrozen(receipt.occurrence) !== true) {
      throw new Error('the delivered receipt is not immutable');
    }
    if (receipt === sent) throw new Error('the delivered receipt must be a private copy, not the send value');
    return { status: receipt.status, messageId: receipt.occurrence.messageId };
  });

  await step('unsubscribe.quiet', async () => {
    await subscription.unsubscribe();
    const after = await activation.facade.send({ ...INTENT, messageId: 'tiny-msg-3', instanceKey: 'tiny-instance-3' });
    if (after.status !== 'admitted') {
      throw new Error(`post-unsubscribe send was not admitted: ${JSON.stringify(after).slice(0, 300)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (delivered.length !== 1) throw new Error(`delivery continued after unsubscribe: ${String(delivered.length)} receipts`);
    return { deliveredReceipts: delivered.length };
  });

  const final = {
    kCounters: activation.facade.kCounters('business-order-approval@v08.1.0.0'),
    journalRows: store.count('%effect-journal%'),
    permitRows: store.count('%effect-permit%'),
    admissionCounts: activation.counters,
    manifest: {
      subjectDigest: manifest.subjectDigest,
      packageClosureDigest: manifest.packageClosureDigest,
      buildId: manifest.buildId,
      modules: manifest.modules,
    },
    resolution: {
      bareSpecifiers: log.bareSpecifiers(),
      outsideDeploymentRoot: log.fileUrlsOutsideRoot(),
    },
  };

  await step('stop.graceful', async () => {
    await activation.facade.stop();
    if (activation.facade.isClosed() !== true) throw new Error('the facade is not closed after stop');
    let sendCode = null;
    try {
      await activation.facade.send({ ...INTENT, messageId: 'tiny-msg-4' });
    } catch (error) {
      sendCode = error?.code ?? 'NO_CODE';
    }
    if (sendCode !== 'FACADE_CLOSED') throw new Error(`post-stop send refused with ${String(sendCode)}, expected FACADE_CLOSED`);
    let subscribeCode = null;
    try {
      await activation.facade.subscribe(() => {});
    } catch (error) {
      subscribeCode = error?.code ?? 'NO_CODE';
    }
    if (subscribeCode !== 'FACADE_CLOSED') throw new Error(`post-stop subscribe refused with ${String(subscribeCode)}, expected FACADE_CLOSED`);
    await new Promise((resolve) => setTimeout(resolve, 50));
    if (delivered.length !== 1) throw new Error(`delivery happened after stop: ${String(delivered.length)} receipts`);
    return { sendCode, subscribeCode, deliveredReceipts: delivered.length };
  });

  activation.dispose();
  store.close();
  return { steps, final, dbPath };
}
