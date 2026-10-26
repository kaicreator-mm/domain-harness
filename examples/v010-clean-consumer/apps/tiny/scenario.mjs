/**
 * v0.10.2 T09 (#1330) — the Tiny clean-installed consumer scenario.
 *
 * One real Node24 process over a PLAIN-FILE durable K store (the Tiny
 * profile installs no Host-node and no SQLite driver): activate the sealed
 * BUILD output through the PUBLIC Microkernel entry `load`, run ONE
 * Business intent, take an authorized scoped snapshot, exercise the live
 * subscription seam (delivery, unsubscribe, async fail-closed revocation),
 * restart over the SAME physical file, replay the identical turn from the
 * immutable original receipt, and prove the stopped facade refuses closed.
 *
 * No advanced package is selected, imported or installed; the resolution
 * log captured by app.mjs is part of the report.
 */
import { join } from 'node:path';

import { load, PlainFileDocStore } from './runtime-tiny.mjs';

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
const RECEIPT_ONLY_FIELDS = ['attribution', 'decisionReceipt', 'turnDisposition', 'admitted', 'idempotentReplay'];
const TARGET_KEYS = ['deployedAppId', 'tenantId', 'appId', 'businessPackageId', 'workflowId', 'instanceKey'];
const BUSINESS_PACKAGE_ID = 'business-order-approval@v08.1.0.0';

const until = async (condition, deadlineMs = 5_000) => {
  const deadline = Date.now() + deadlineMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('T09 Tiny: expected delivery did not happen within the deadline');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};
const settle = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));
/** Order-insensitive structural serialization: the event projection is a frozen copy whose key order differs from the query answer's. */
const stableJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
};

export async function run({ scenario, workdir, app, manifest, log }) {
  if (scenario !== 'tiny-basic') throw new Error(`unknown tiny scenario ${String(scenario)}`);
  const steps = [];
  const step = async (name, body) => {
    const detail = await body();
    steps.push({ name, ok: true, detail: detail ?? null });
  };
  const dbPath = join(workdir, 'tiny-k.json');
  const deployment = manifest.deployment;
  const authorityState = { mode: 'allow' };
  const authority = {
    principal: { source: 'host-authenticated', subject: 'user:tiny', tenantId: deployment.tenantId },
    authorize: (verified, target) => authorityState.mode === 'allow' && verified?.tenantId === target.tenantId,
  };
  const events = [];
  const listener = (event) => { events.push(event); };
  let liveSubscription = null;

  const loadApp = (store, now) => load(app, {
    store,
    tenantId: deployment.tenantId,
    deploymentIdentity: deployment,
    queryAuthority: authority,
    now,
    deploymentRoot: log.deploymentRoot,
  });

  let store = new PlainFileDocStore(dbPath);
  let domainApp = await loadApp(store, () => Date.UTC(2026, 9, 20, 0, 0, 0));

  await step('selection.tiny', () => {
    const roles = app.modules.map((module) => module.role).sort();
    const expected = ['business', 'capability', 'kernel-primary', 'standard-primary'];
    if (JSON.stringify(roles) !== JSON.stringify(expected)) {
      throw new Error(`unexpected Tiny roster roles ${JSON.stringify(roles)}`);
    }
    const advanced = app.modules.filter((module) => ADVANCED_PACKAGE_MARKERS.some((marker) => module.packageId.includes(marker)));
    if (advanced.length !== 0) throw new Error(`advanced package in Tiny BUILD: ${JSON.stringify(advanced.map((m) => m.packageId))}`);
    const appOwnedSources = app.modules.filter((module) => module.role === 'business' || module.role === 'capability');
    const sourcesWithAdvanced = appOwnedSources.filter((module) => ADVANCED_SOURCE_MARKERS.some((marker) => module.moduleSource.includes(marker)));
    if (sourcesWithAdvanced.length !== 0) {
      throw new Error(`advanced marker in sealed Tiny bytes: ${JSON.stringify(sourcesWithAdvanced.map((m) => m.packageId))}`);
    }
    return { roster: app.modules.map((module) => ({ packageId: module.packageId, role: module.role })) };
  });

  await step('send.basic', async () => {
    const receipt = await domainApp.send(INTENT);
    if (receipt.status !== 'admitted') throw new Error(`expected admitted, got ${JSON.stringify(receipt).slice(0, 400)}`);
    const effects = receipt.admitted?.effects ?? [];
    if (effects.length !== 1 || effects[0].disposition !== 'executed') {
      throw new Error(`expected exactly one executed effect, got ${JSON.stringify(effects)}`);
    }
    return { status: receipt.status, effects };
  });

  await step('query.scoped', async () => {
    const answer = await domainApp.query({
      workflowId: WORKFLOW_ID,
      instanceKey: INSTANCE_KEY,
      businessPackageId: BUSINESS_PACKAGE_ID,
    });
    if (answer.target.tenantId !== deployment.tenantId) throw new Error('query answered a foreign tenant');
    const snapshot = answer.snapshot;
    if (snapshot === null || typeof snapshot !== 'object') throw new Error('query returned no snapshot');
    return { target: answer.target, stateKey: snapshot.state?.stateKey ?? null, revision: snapshot.state?.stateRevision ?? null };
  });

  await step('query.deniedForeignB', async () => {
    let code = null;
    try {
      await domainApp.query({
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

  await step('subscribe.delivery', async () => {
    const subscription = await domainApp.subscribe(
      { workflowId: WORKFLOW_ID, instanceKey: INSTANCE_KEY },
      listener,
    );
    if (typeof subscription.unsubscribe !== 'function') throw new Error('subscribe did not return an unsubscribe member');
    // The immutable original receipt replays (same messageId, same input) and
    // the live seam must deliver the frozen public projection of that turn.
    const replay = await domainApp.send({ ...INTENT, input: { amount: 30 } });
    if (replay.status !== 'admitted' || replay.idempotentReplay !== true) {
      throw new Error(`delivery trigger was not an idempotent replay: ${JSON.stringify(replay).slice(0, 300)}`);
    }
    await until(() => events.length >= 1);
    const event = events[0];
    if (event.kind !== 'admitted') throw new Error(`expected an admitted event, got ${JSON.stringify(event).slice(0, 300)}`);
    if (event.occurrenceId !== MESSAGE_ID) throw new Error(`event occurrence ${String(event.occurrenceId)} is not the replayed turn`);
    if (JSON.stringify(Object.keys(event).sort()) !== JSON.stringify(['kind', 'occurrenceId', 'snapshot', 'target'])) {
      throw new Error(`event projection carries unexpected members: ${JSON.stringify(Object.keys(event).sort())}`);
    }
    if (JSON.stringify(Object.keys(event.target).sort()) !== JSON.stringify([...TARGET_KEYS].sort())) {
      throw new Error(`event target is not the scoped six-field tuple: ${JSON.stringify(Object.keys(event.target).sort())}`);
    }
    if (event.target.businessPackageId !== BUSINESS_PACKAGE_ID) throw new Error('event targeted a foreign Business');
    for (const forbidden of RECEIPT_ONLY_FIELDS) {
      if (forbidden in event) throw new Error(`the event carried the receipt-only field '${forbidden}'`);
    }
    const answer = await domainApp.query({ workflowId: WORKFLOW_ID, instanceKey: INSTANCE_KEY });
    if (stableJson(event.target) !== stableJson(answer.target)) {
      throw new Error('event target differs from the authorized scoped query target');
    }
    if (event.snapshot === undefined) throw new Error('a same-revision observed turn did not attach the snapshot');
    if (stableJson(event.snapshot) !== stableJson(answer.snapshot)) {
      throw new Error('event snapshot differs from the durable same-revision query answer');
    }
    if (Reflect.set(event, 'kind', 'forged') !== false || Reflect.set(event.target, 'instanceKey', 'forged') !== false) {
      throw new Error('the delivered event is not deep-frozen');
    }
    liveSubscription = subscription;
    return { occurrenceId: event.occurrenceId, kind: event.kind, frozen: true };
  });

  await step('unsubscribe.silence', async () => {
    if (liveSubscription === null) throw new Error('no live subscription to unsubscribe');
    liveSubscription.unsubscribe();
    const before = events.length;
    const replay = await domainApp.send({ ...INTENT, input: { amount: 30 } });
    if (replay.status !== 'admitted') throw new Error('replay after unsubscribe was not admitted');
    await settle();
    if (events.length !== before) throw new Error(`an unsubscribed listener still received ${events.length - before} event(s)`);
    return { silent: true };
  });

  await step('subscribe.revocation', async () => {
    await domainApp.subscribe({ workflowId: WORKFLOW_ID, instanceKey: INSTANCE_KEY }, listener);
    const before = events.length;
    // Async fail-closed (L2 §8 N3): the authority flips to deny while the
    // replayed turn's event awaits authorization — the listener never fires
    // and the subscription ENDS; restoring authorization must not resurrect it.
    authorityState.mode = 'deny';
    const replay = await domainApp.send({ ...INTENT, input: { amount: 30 } });
    if (replay.status !== 'admitted') throw new Error('the observed turn itself must stay admitted');
    await settle(300);
    if (events.length !== before) throw new Error(`a denied authorization still delivered ${events.length - before} event(s)`);
    authorityState.mode = 'allow';
    await domainApp.send({ ...INTENT, input: { amount: 30 } });
    await settle(300);
    if (events.length !== before) throw new Error('the revoked subscription resurrected after reauthorization');
    return { revoked: true, deliveries: 0 };
  });

  const beforeRestart = {
    journalRows: store.count('%effect-journal%'),
    docRows: store.count('%'),
  };
  domainApp.stop();
  store.close();

  await step('restart.reopen', () => {
    if (beforeRestart.docRows < 2) throw new Error(`only ${beforeRestart.docRows} durable K rows before restart`);
    store = new PlainFileDocStore(dbPath);
    return { rows: store.count('%'), journalRows: store.count('%effect-journal%') };
  });

  domainApp = await loadApp(store, () => Date.UTC(2026, 9, 20, 0, 0, 1));

  await step('replay.originalReceipt', async () => {
    const replay = await domainApp.send({ ...INTENT, input: { amount: 30 } });
    if (replay.status !== 'admitted') throw new Error(`replay status ${JSON.stringify(replay).slice(0, 300)}`);
    if (replay.idempotentReplay !== true) throw new Error('the replay did not answer from the immutable original receipt');
    if (store.count('%effect-journal%') !== beforeRestart.journalRows) {
      throw new Error(`replay added a journal row: ${beforeRestart.journalRows} -> ${store.count('%effect-journal%')}`);
    }
    return { status: replay.status, idempotentReplay: true };
  });

  await step('replay.changedInputConflict', async () => {
    let code = null;
    try {
      await domainApp.send({ ...INTENT, input: { amount: 31 } });
    } catch (error) {
      code = error?.code ?? 'NO_CODE';
    }
    if (code === null) throw new Error('changed input replay was not refused');
    return { code };
  });

  await step('stop.closed', async () => {
    domainApp.stop();
    let subscribeCode = null;
    try {
      await domainApp.subscribe({ workflowId: WORKFLOW_ID, instanceKey: INSTANCE_KEY }, () => {});
    } catch (error) {
      subscribeCode = error?.code ?? 'NO_CODE';
    }
    if (subscribeCode !== 'FACADE_CLOSED') throw new Error(`subscribe after stop refused with ${String(subscribeCode)}, not FACADE_CLOSED`);
    let sendCode = null;
    try {
      await domainApp.send({ ...INTENT, input: { amount: 30 } });
    } catch (error) {
      sendCode = error?.code ?? 'NO_CODE';
    }
    if (sendCode !== 'FACADE_CLOSED') throw new Error(`send after stop refused with ${String(sendCode)}, not FACADE_CLOSED`);
    domainApp.stop();
    return { subscribeCode, sendCode, idempotent: true };
  });

  store.close();
  const final = {
    journalRows: store.count('%effect-journal%'),
    permitRows: store.count('%effect-permit%'),
    storeCounts: store.counts,
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
  return { steps, final, dbPath };
}
