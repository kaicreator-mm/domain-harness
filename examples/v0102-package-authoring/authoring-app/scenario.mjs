/**
 * Issue #1379 authoring-template consumer scenario (#1305 minimal P/N).
 * =====================================================================
 *
 * One real Node24 process, clean-installed from public tarballs, over a
 * plain-file durable K store (no Host-node, no SQLite driver, no BUILD, no
 * Compiler). It drives the exact #1305 authoring acceptance paths:
 *
 *   selection — one K Primary, one S Primary, ONE independently selected
 *               non-Tool S Feature, one Business, TWO separate Capability
 *               modules (read-only `inventory`, external-effect `jobs`).
 *   feature   — the selected S Feature answers through its sealed export
 *               (`invokeSelectedStandardFeature`), rule path, zero Model
 *               calls, and mints no K permit (semantic, NOT a Tool).
 *   readonly  — the Business PRIVATE pure helper contributes the review
 *               score and the read-only C operation executes without any
 *               permit (effectPermitsMinted unchanged).
 *   permitted — the governed external Effect mints exactly one live K
 *               permit and the `jobs.submit` adapter physically dispatches
 *               (its externalRef answers `#1`, the adapter's own counter).
 *   permitless— the same sealed route WITHOUT an `external` declaration is
 *               typed-refused (ADMISSION_EFFECT_FAILED naming the missing
 *               V10_EFFECT_PERMIT), mints no permit, and the adapter's
 *               counter proves ZERO dispatch (the next permitted submit
 *               answers `#2`, not `#3`).
 *   stop      — the disposed facade refuses closed.
 */
import { join } from 'node:path';

import { PlainFileDocStore, activateV10App } from './runtime-authoring.mjs';

const B = 'business-authoring-review@v0102.1.0.0';
const WORKFLOW_ID = 'authoring-review';
const INSTANCE_KEY = 'authoring-instance-1';
const NOW = Date.UTC(2026, 9, 26, 0, 0, 0);
/** Package identities this template deliberately does NOT select. */
const UNSELECTED_MARKERS = ['kext-', 'business-agent', 'capability-agent', 'business-wait-resume', 'extjob', 'extnotify', 'shadow-baseline', 'workflow-control', 'context-assembly', 'decision-evidence'];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function refusalOf(promise) {
  try {
    const value = await promise;
    return { refused: false, value };
  } catch (error) {
    return { refused: true, code: error?.code ?? 'NO_CODE', message: error?.message ?? String(error) };
  }
}

function send(facade, intentType, messageId, input) {
  // The workflow rules project the FULL field set from the input (the Rich
  // `jobInput` discipline), so every intent input carries all four fields.
  const workflowInput = {
    sku: input.sku ?? null,
    amount: input.amount ?? null,
    requestId: input.requestId ?? null,
    jobSpec: input.jobSpec ?? null,
  };
  return facade.send({ intentType, instanceKey: INSTANCE_KEY, messageId, input: workflowInput });
}

function firstEffect(receipt) {
  const effects = receipt?.admitted?.effects;
  if (!Array.isArray(effects) || effects.length === 0) {
    throw new Error(`receipt carries no admitted effect: ${JSON.stringify(receipt).slice(0, 500)}`);
  }
  return effects[0];
}

export async function run({ scenario, workdir, app, manifest, log }) {
  if (scenario !== 'authoring-basic') throw new Error(`unknown authoring scenario ${String(scenario)}`);
  const steps = [];
  const step = async (name, body) => {
    const detail = await body();
    steps.push({ name, ok: true, detail: detail ?? null });
  };

  const dbPath = join(workdir, 'authoring-k.json');
  const deployment = manifest.deployment;
  const authority = {
    principal: { source: 'host-authenticated', subject: 'user:authoring', tenantId: deployment.tenantId },
    authorize: (verified, target) => verified?.tenantId === target.tenantId,
  };
  const store = new PlainFileDocStore(dbPath);
  const activation = await activateV10App(app, {
    store,
    tenantId: deployment.tenantId,
    deploymentIdentity: deployment,
    queryAuthority: authority,
    now: () => NOW,
    deploymentRoot: log.deploymentRoot,
  });
  const facade = activation.facade;

  await step('selection.authoring', () => {
    const roles = app.modules.map((module) => module.role).sort();
    const expected = ['business', 'capability', 'capability', 'kernel-primary', 'standard-feature', 'standard-primary'];
    if (JSON.stringify(roles) !== JSON.stringify(expected)) {
      throw new Error(`unexpected authoring roster roles ${JSON.stringify(roles)}`);
    }
    const features = facade.selectedFeatures;
    if (features.length !== 1 || features[0].featureKey !== 'standard:semantic-decision/1') {
      throw new Error(`expected exactly the semantic-decision feature, got ${JSON.stringify(features)}`);
    }
    const unselected = app.modules.filter((module) => UNSELECTED_MARKERS.some((marker) => module.packageId.includes(marker)));
    if (unselected.length !== 0) {
      throw new Error(`an unselected package entered the BUILD: ${JSON.stringify(unselected.map((m) => m.packageId))}`);
    }
    const effectCapabilities = app.modules.filter((module) => module.role === 'capability' && module.externalEffect === true);
    if (effectCapabilities.length !== 1 || effectCapabilities[0].capabilityId !== 'jobs') {
      throw new Error(`expected exactly one externalEffect capability 'jobs', got ${JSON.stringify(effectCapabilities.map((m) => m.capabilityId))}`);
    }
    return {
      roster: app.modules.map((module) => ({ packageId: module.packageId, role: module.role, externalEffect: module.externalEffect ?? false })),
      features: features.map((entry) => ({ featureKey: entry.featureKey, packageId: entry.packageId })),
    };
  });

  await step('feature.nonToolSemantic', async () => {
    const permitsBefore = facade.kCounters(B).effectPermitsMinted;
    const validation = await facade.invokeSelectedStandardFeature('standard:semantic-decision/1', {
      input: { amount: 12 },
      schema: { id: 'schema:authoring-review', revision: 'r1', provenanceKey: 'authoring:r1' },
      rules: [{ id: 'rule:review', when: { amount: 12 }, decision: { outcome: 'approved' } }],
      limits: { maxSteps: 4, maxModelCalls: 1, maxToolCalls: 0 },
    });
    if (validation.kind !== 'selected' || validation.source !== 'rule') {
      throw new Error(`semantic rule path unexpected: ${JSON.stringify(validation).slice(0, 300)}`);
    }
    if (validation.evidence.modelCalls !== 0) {
      throw new Error(`the non-Tool semantic path counted Model calls: ${JSON.stringify(validation.evidence)}`);
    }
    const permitsAfter = facade.kCounters(B).effectPermitsMinted;
    if (permitsAfter !== permitsBefore) {
      throw new Error('invoking the S Feature minted a K effect permit');
    }
    return { kind: validation.kind, source: validation.source, modelCalls: validation.evidence.modelCalls };
  });

  await step('b.privateHelperReadonly', async () => {
    const countersBefore = facade.kCounters(B);
    const receipt = await send(facade, 'submitAuthoringReview', 'authoring/review/1', { sku: 'sku-alpha', amount: 120 });
    if (receipt.status !== 'admitted') throw new Error(`expected admitted, got ${JSON.stringify(receipt).slice(0, 400)}`);
    const effect = firstEffect(receipt);
    if (effect.disposition !== 'executed') throw new Error(`expected the read-only effect executed, got ${JSON.stringify(effect).slice(0, 300)}`);
    const output = effect.output;
    if (output.ok !== true || output.score !== 'sku--high') {
      throw new Error(`the private helper result is missing from the effect output: ${JSON.stringify(output).slice(0, 300)}`);
    }
    if (output.inventory.found !== true || output.inventory.onHand !== 12) {
      throw new Error(`the read-only capability did not answer its contract: ${JSON.stringify(output.inventory)}`);
    }
    const countersAfter = facade.kCounters(B);
    if (countersAfter.effectPermitsMinted !== countersBefore.effectPermitsMinted) {
      throw new Error('the read-only review minted an effect permit');
    }
    return { disposition: effect.disposition, score: output.score, onHand: output.inventory.onHand, permitsMinted: countersAfter.effectPermitsMinted };
  });

  await step('effect.permittedDispatch', async () => {
    const countersBefore = facade.kCounters(B);
    const receipt = await send(facade, 'submitAuthoringJob', 'authoring/job/1', { requestId: 'R-1', jobSpec: { kind: 'authoring' } });
    if (receipt.status !== 'admitted') throw new Error(`expected admitted, got ${JSON.stringify(receipt).slice(0, 400)}`);
    const effect = firstEffect(receipt);
    if (effect.disposition !== 'executed') throw new Error(`expected the permitted effect executed, got ${JSON.stringify(effect).slice(0, 300)}`);
    const output = effect.output;
    if (output.phase !== 'accepted' || !/#1$/u.test(output.externalRef)) {
      throw new Error(`the external adapter did not answer its first authorized dispatch: ${JSON.stringify(output)}`);
    }
    const countersAfter = facade.kCounters(B);
    if (countersAfter.effectPermitsMinted !== countersBefore.effectPermitsMinted + 1) {
      throw new Error(`expected exactly one minted permit, delta ${countersAfter.effectPermitsMinted - countersBefore.effectPermitsMinted}`);
    }
    return { disposition: effect.disposition, externalRef: output.externalRef, permitsMinted: countersAfter.effectPermitsMinted };
  });

  await step('deny.permitlessEffect', async () => {
    const countersBefore = facade.kCounters(B);
    const denied = await refusalOf(send(facade, 'submitUnpermittedJobProbe', 'authoring/deny/1', { requestId: 'R-DENY', jobSpec: { kind: 'probe' } }));
    if (denied.refused !== true) throw new Error('the permitless probe was not refused');
    if (denied.code !== 'ADMISSION_EFFECT_FAILED') throw new Error(`permitless refusal code ${String(denied.code)}`);
    if (!/V10_EFFECT_PERMIT/u.test(String(denied.message))) {
      throw new Error(`permitless refusal did not name the missing K permit: ${String(denied.message).slice(0, 200)}`);
    }
    const countersAfter = facade.kCounters(B);
    if (countersAfter.effectPermitsMinted !== countersBefore.effectPermitsMinted) {
      throw new Error('the permitless probe minted an effect permit');
    }
    // Physical zero-dispatch witness: the adapter's own ordinal counter was
    // at 1 before the probe, so the probe-free NEXT permitted submit answers
    // `#2` exactly — a hidden probe dispatch would make it `#3`.
    const receipt = await send(facade, 'submitAuthoringJob', 'authoring/job/2', { requestId: 'R-2', jobSpec: { kind: 'authoring' } });
    if (receipt.status !== 'admitted') throw new Error(`expected admitted after the denial, got ${JSON.stringify(receipt).slice(0, 400)}`);
    const output = firstEffect(receipt).output;
    if (!/#2$/u.test(output.externalRef)) {
      throw new Error(`the permitless probe physically dispatched: externalRef is ${JSON.stringify(output.externalRef)}`);
    }
    return {
      code: denied.code,
      message: String(denied.message).slice(0, 160),
      permitsMinted: countersAfter.effectPermitsMinted,
      externalRefAfterProbe: output.externalRef,
    };
  });

  await step('stop.closed', async () => {
    activation.dispose();
    let sendCode = null;
    try {
      await facade.send({ intentType: 'submitAuthoringJob', instanceKey: INSTANCE_KEY, messageId: 'authoring/closed/1', input: { requestId: 'R-CLOSED', jobSpec: {} } });
    } catch (error) {
      sendCode = error?.code ?? 'NO_CODE';
    }
    if (sendCode !== 'FACADE_CLOSED') throw new Error(`send after dispose refused with ${String(sendCode)}, not FACADE_CLOSED`);
    return { sendCode };
  });

  store.close();
  const final = {
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
