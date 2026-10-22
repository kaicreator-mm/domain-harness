/**
 * Rich clean-installed consumer scenarios (#1180 T11).
 *
 * Every scenario runs in a REAL installed Node24 process over file-backed
 * SQLite. Scenarios that need a process boundary (restart, new-BUILD
 * promotion, competing writers) are separate processes sharing one workdir.
 *
 *   rich-main        composition, two-B isolation, query authority/hidden B,
 *                    truthful model-call counts, Agent/Memory/Context,
 *                    both C01 adapters, permit denial, duplicate callback,
 *                    missing disposition, 18-turn original-receipt replay
 *   rich-wait-a      park one occurrence in WAIT (exits)
 *   rich-wait-b      restart, resume once, duplicate replay, timeout branch
 *   rich-t08-a       governed v1 activation and an old occurrence (exits)
 *   rich-t08-b       v2 CURRENT promotion + old v1 PINNED_ONLY restore
 *   rich-shadow      T07 read-only shadow, zero production writes
 *   rich-race        one of two concurrent same-message writers
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  APP_DIR,
  SqliteDocStore,
  V10_TARGET_PROFILE,
  activateGovernedV10Build,
  activateV10App,
  readOnlyStore,
} from './runtime-core.mjs';
import {
  SHADOW_K_DOCS_PREFIX,
  pinCandidateSource,
  runShadowL4,
  selectedFallbackPin,
} from '@kaicreator/domain-harness-compiler/v10shadow';
import {
  v10BuildActivationDecisionDigest,
  v10BuildPackageClosureDigest,
  V10_HOST_ABI,
  V10_RUNTIME_ABI,
} from '@kaicreator/domain-harness-compiler/v10build';
import Database from 'better-sqlite3';
import * as extjob from './modules/capability-extjob-runx-v1.mjs';
import * as extnotify from './modules/capability-extnotify-provider-v1.mjs';

const B1 = 'business-external-jobs@v010.1.0.0';
const B2 = 'business-external-jobs-b@v010.1.0.0';
const B3 = 'business-agent-workflow@v010.1.0.0';
const B4 = 'business-wait-resume@v010.1.0.0';
const BASELINE = 'sfeature-shadow-baseline@v010.1.0.0';
const EXTJOB_WORKFLOW = 'external-jobs';
const AGENT_WORKFLOW = 'agent-context-loop';
const WAIT_WORKFLOW = 'wait-resume';
const NOW = Date.UTC(2026, 9, 20, 12, 0, 0);
const T08_APPROVED_AT = '2026-10-20T11:00:00.000Z';
const T08_VALID_UNTIL = '2026-10-20T15:00:00.000Z';

function sha256Text(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function firstEffect(receipt) {
  const effects = receipt?.admitted?.effects;
  if (!Array.isArray(effects) || effects.length === 0) {
    throw new Error(`receipt carries no admitted effect: ${JSON.stringify(receipt).slice(0, 500)}`);
  }
  return effects[0];
}

function expectAdmitted(receipt, label) {
  if (receipt.status !== 'admitted') throw new Error(`${label}: expected admitted, got ${JSON.stringify(receipt).slice(0, 500)}`);
  return receipt;
}

async function refusalOf(promise) {
  try {
    const value = await promise;
    return { refused: false, value };
  } catch (error) {
    return { refused: true, code: error?.code ?? 'NO_CODE', message: error?.message ?? String(error) };
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/** Resolve ANOTHER installed App package (the v2 BUILD of the same App). */
function loadInstalledApp(specifier) {
  const entryUrl = import.meta.resolve(specifier);
  const directory = dirname(fileURLToPath(new URL(entryUrl)));
  return {
    dir: directory,
    app: JSON.parse(readFileSync(join(directory, 'app.build.json'), 'utf8')),
    manifest: JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8')),
  };
}

function pins(workdir) {
  globalThis.__c01JobStorePath = join(workdir, 'extjob.sqlite');
  globalThis.__c01NotifyStorePath = join(workdir, 'extnotify.sqlite');
  globalThis.__v010T05MemoryStorePath = join(workdir, 'memory.sqlite');
  globalThis.__v010T05MemoryClock = () => NOW;
  globalThis.__v010T05ToolCalls = 0;
  delete globalThis.__c01JobFaults;
  delete globalThis.__c01NotifyMode;
}

function clearPins() {
  delete globalThis.__c01JobStorePath;
  delete globalThis.__c01NotifyStorePath;
  delete globalThis.__c01JobFaults;
  delete globalThis.__c01NotifyMode;
  delete globalThis.__v010T05MemoryStorePath;
  delete globalThis.__v010T05MemoryClock;
  delete globalThis.__v010T05ToolCalls;
}

function memoryRows() {
  const path = globalThis.__v010T05MemoryStorePath;
  const db = new Database(path, { readonly: true, fileMustExist: true });
  try {
    return db.prepare('SELECT key, revision, value FROM v8_host_docs ORDER BY key').all();
  } finally {
    db.close();
  }
}

/** The exact bounded rule projection of the external-jobs Businesses. */
function jobInput(input) {
  return {
    requestId: input.requestId ?? null,
    jobSpec: input.jobSpec ?? null,
    jobId: input.jobId ?? null,
    idempotencyKey: input.idempotencyKey ?? null,
    channel: input.channel ?? null,
    message: input.message ?? null,
  };
}

function queryAuthority(deployment, visible) {
  const probes = [];
  return {
    probes,
    authority: {
      principal: { source: 'host-authenticated', subject: 'user:rich', tenantId: deployment.tenantId },
      authorize: (verified, target) => {
        probes.push(target.businessPackageId);
        return verified?.tenantId === deployment.tenantId && visible.has(target.businessPackageId);
      },
    },
  };
}

async function activate({ store, app, manifest, log, authority, now = () => NOW }) {
  return await activateV10App(app, {
    store,
    tenantId: manifest.deployment.tenantId,
    deploymentIdentity: manifest.deployment,
    queryAuthority: authority,
    now,
    deploymentRoot: log.deploymentRoot,
  });
}

const JOB_INTENTS = new Set([
  'submitExternalJob', 'checkExternalJob', 'reconcileExternalJob', 'sendNotification',
  'submitUnpermittedJobProbe', 'submitCrossCapabilityProbe', 'submitExpiringJob',
  'submitDoubleDispatchProbe', 'submitConcurrentDispatchProbe', 'submitSecondBJob',
]);

function send(facade, intentType, instanceKey, messageId, input) {
  return facade.send({
    intentType, instanceKey, messageId,
    input: JOB_INTENTS.has(intentType) ? jobInput(input) : input,
  });
}

export async function run({ scenario, workdir, app, manifest, log, args }) {
  pins(workdir);
  const steps = [];
  const step = async (name, body) => {
    try {
      const detail = await body();
      steps.push({ name, ok: true, detail: detail ?? null });
      return detail;
    } catch (error) {
      steps.push({ name, ok: false, error: { code: error?.code ?? null, message: error?.message ?? String(error) } });
      throw error;
    }
  };
  try {
    if (scenario === 'rich-main') return await richMain({ steps, step, workdir, app, manifest, log });
    if (scenario === 'rich-wait-a') return await waitA({ steps, step, workdir, app, manifest, log });
    if (scenario === 'rich-wait-b') return await waitB({ steps, step, workdir, app, manifest, log });
    if (scenario === 'rich-t08-a') return await t08A({ steps, step, workdir, app, manifest, log });
    if (scenario === 'rich-t08-b') return await t08B({ steps, step, workdir, app, manifest, log });
    if (scenario === 'rich-shadow') return await shadow({ steps, step, workdir, app, manifest, log });
    if (scenario === 'rich-race') return await race({ steps, step, workdir, app, manifest, log, args });
    throw new Error(`unknown rich scenario ${String(scenario)}`);
  } catch (error) {
    return { steps, failure: { code: error?.code ?? null, message: error?.message ?? String(error) } };
  } finally {
    extjob.shutdown();
    extnotify.shutdown();
    clearPins();
  }
}

// ---------------------------------------------------------------------------
// rich-main
// ---------------------------------------------------------------------------
async function richMain({ steps, step, workdir, app, manifest, log }) {
  const dbPath = join(workdir, 'rich-k.sqlite');
  let store = new SqliteDocStore(dbPath);
  const visible = new Set([B1, B2, B3, B4]);
  const { authority, probes } = queryAuthority(manifest.deployment, visible);
  const now = () => NOW;
  let activation = await activate({ store, app, manifest, log, authority, now });
  let counters = activation.counters;
  let facade = activation.facade;

  await step('RICH_P1.selection', () => {
    const extensions = facade.selectedExtensions;
    const features = facade.selectedFeatures;
    assert(extensions.length === 2, `expected 2 K extensions, got ${JSON.stringify(extensions)}`);
    assert(new Set(extensions.map((entry) => entry.providerId)).size === 2, 'K extension provider ids are not distinct');
    assert(new Set(extensions.map((entry) => entry.hook)).size === 2, 'K extension hooks are not distinct');
    assert(features.length >= 3, `expected >=3 S features, got ${features.length}`);
    assert(new Set(features.map((entry) => entry.featureKey)).size === features.length, 'S feature keys are not distinct');
    assert(counters.extensionImports === 2, `extensionImports=${String(counters.extensionImports)}`);
    assert(counters.featureImports === features.length, `featureImports=${String(counters.featureImports)}`);
    for (const entry of [...extensions, ...features]) {
      const module = app.modules.find((candidate) => candidate.packageId === entry.packageId);
      assert(module?.moduleSource?.length > 0, `${entry.packageId} carries no sealed bytes`);
      assert(counters.importsByPackage[entry.packageId] === 1, `${entry.packageId} was not imported exactly once`);
      assert(counters.initCalls.includes(entry.packageId), `${entry.packageId} init did not run`);
    }
    const roles = app.modules.filter((module) => module.role === 'business').length;
    assert(roles === 4, `expected 4 selected Businesses, got ${roles}`);
    return { extensions, features: features.map((entry) => entry.featureKey), roles: counters.initCalls };
  });

  // [#1264 PC-03/PC-08] Real consultation evidence: the selected Kernel
  // Primary invokes BOTH selected advisory hooks at turn time —
  // `admission-budget-advice/v1` before admission and `turn-observation/v1`
  // after the authoritative disposition — with at least one honored clamp
  // and one rejected malformed (authority-field) advice.
  await step('RICH_P1.advisoryConsultation', async () => {
    const agentInput = (requestId) => ({
      iteration: null, note: null, decisionOutcome: null, decisionData: null, contextDigest: null,
      contextEntries: null, modelCalls: null, modelCallEvidence: null, requestId,
    });
    globalThis.__v010AlphaAdvicePlan = [{ advice: { maxSteps: 2 } }, { advice: { maxSteps: 3, permit: true } }];
    try {
      const first = expectAdmitted(await send(facade, 'agentCollectContext', 'agent-advisory-1', 'advisory/collect/0', agentInput('req-advisory-0')), 'advisory turn 1');
      assert(!('advisory' in first) && !('budget' in first), 'the receipt carries no advisory/budget fields');
      const second = expectAdmitted(await send(facade, 'agentCollectContext', 'agent-advisory-1', 'advisory/collect/1', agentInput('req-advisory-1')), 'advisory turn 2');
      assert(!('advisory' in second) && !('budget' in second), 'the rejected advice left the receipt untouched');

      const k = facade.kCounters(B3);
      assert(k.budgetAdviceConsultations === 2, `budget advice consulted ${String(k.budgetAdviceConsultations)} times, expected 2`);
      assert(k.budgetAdviceClamps >= 1, `expected at least one honored clamp, got ${String(k.budgetAdviceClamps)}`);
      assert(k.advisoryRejected >= 1, `expected the malformed authority-field advice to be rejected, got advisoryRejected=${String(k.advisoryRejected)}`);
      assert(k.turnObservationConsultations === 2, `turn observation consulted ${String(k.turnObservationConsultations)} times, expected 2`);
      const observations = counters.advisoryObservations;
      assert(Array.isArray(observations) && observations.length >= 2, `expected >=2 sink observations, got ${String(observations.length)}`);
      const last = observations[observations.length - 1];
      assert(last?.hook === 'turn-observation/v1' && last?.providerId === 'advisory-beta', `sink observation ${JSON.stringify(last).slice(0, 200)}`);
      assert(last?.turn?.status === 'admitted' && last?.turn?.intentType === 'agentCollectContext', `observation identity ${JSON.stringify(last?.turn)}`);
      const globalBeta = globalThis.__v010BetaProjections ?? [];
      assert(globalBeta.length >= 2 && globalBeta.every((entry) => entry.status === 'admitted'), 'the Kernel handed both post-disposition projections to the observation hook');
      const globalAlpha = globalThis.__v010AlphaProposals ?? [];
      assert(globalAlpha.length === 2, `the Kernel handed ${String(globalAlpha.length)} redacted proposals, expected 2`);
      assert(globalAlpha.every((entry) => entry.hardLimits?.maxSteps === 8 && entry.hardLimits?.maxWorkUnits === 64),
        `the Kernel's own effective hard limits must ride the proposal: ${JSON.stringify(globalAlpha[0])}`);
      return {
        budgetAdviceConsultations: k.budgetAdviceConsultations,
        budgetAdviceClamps: k.budgetAdviceClamps,
        advisoryRejected: k.advisoryRejected,
        turnObservationConsultations: k.turnObservationConsultations,
        sinkObservations: observations.length,
      };
    } finally {
      delete globalThis.__v010AlphaAdvicePlan;
      delete globalThis.__v010BetaPlan;
    }
  });

  const agentScope = {
    deployedAppId: 'deploy:v010-t05-rich', tenantId: 'tenant:v010-t05-rich', appId: 'app:v010-t05-rich',
    businessPackageId: B3, agentId: 'agent:context-agent', threadId: 'thread:context-main',
  };

  await step('RICH_P1.invokeFeatures', async () => {
    const validation = await facade.invokeSelectedStandardFeature('standard:semantic-decision/1', {
      input: { amount: 12 }, schema: { id: 's', revision: 'r1', provenanceKey: 'p' },
      rules: [{ id: 'r', when: { amount: 12 }, decision: { outcome: 'rule' } }],
      limits: { maxSteps: 4, maxModelCalls: 1, maxToolCalls: 0 },
    });
    assert(validation.kind === 'selected' && validation.source === 'rule', `semantic rule path ${JSON.stringify(validation).slice(0, 300)}`);
    const context = await facade.invokeSelectedStandardFeature('standard:context-assembly/1', {
      scope: agentScope,
      observations: [
        { id: 'm1', kind: 'memory', content: 'note', scope: agentScope, provenance: { source: 'memory', revision: 'r1', observedBy: 'host' } },
      ],
      budget: { maxEntries: 4, maxCharacters: 256 },
    });
    assert(context.kind === 'assembled-context', `context feature ${JSON.stringify(context).slice(0, 300)}`);
    const plan = await facade.invokeSelectedStandardFeature('standard:workflow-control/1', {
      kind: 'loop.next', target: { workflowId: 'wfc', instanceKey: 'plan-1' },
      control: { loopId: 'l', iteration: 0, maxIterations: 2, stepIntentTypes: ['noop'], deadlineEpochMs: NOW + 60_000 },
      step: { intentType: 'noop', input: {} },
    }, { now });
    assert(plan.action === 'submit', `workflow plan ${JSON.stringify(plan).slice(0, 300)}`);
    const evaluation = await facade.invokeSelectedStandardFeature('standard:shadow-baseline/1', { key: 'k', revision: 0, value: { state: 's' } });
    assert(evaluation.state === 's', 'selected shadow baseline did not evaluate');
    return { semantic: validation.source, context: context.kind, plan: plan.action, baseline: evaluation };
  });

  await step('RICH_P4.modelCallTruth', async () => {
    const request = (extra) => ({
      input: { amount: 12, name: 'quote' },
      schema: { id: 'schema:quote', revision: 'r1', provenanceKey: 'approved:2026-10' },
      limits: { maxSteps: 8, maxModelCalls: 1, maxToolCalls: 1 },
      ...extra,
    });
    let modelCalls = 0;
    let procedureCalls = 0;
    const rule = await facade.invokeSelectedStandardFeature('standard:semantic-decision/1', request({
      rules: [{ id: 'rule', when: { amount: 12 }, decision: { outcome: 'approved' } }],
      fallback: { kind: 'model', operationId: 'model:quote' },
    }), { model: async () => { modelCalls += 1; return { outcome: 'fallback' }; } });
    assert(rule.source === 'rule' && rule.evidence.modelCalls === 0 && modelCalls === 0, 'Rule path fabricated or invoked a Model call');

    const reuse = await facade.invokeSelectedStandardFeature('standard:semantic-decision/1', request({
      reuse: {
        schemaId: 'schema:quote', schemaRevision: 'r1', provenanceKey: 'approved:2026-10',
        canonicalInput: '{"amount":12,"name":"quote"}', decision: { outcome: 'cached' },
      },
      fallback: { kind: 'model', operationId: 'model:quote' },
    }), { model: async () => { modelCalls += 1; return { outcome: 'fallback' }; } });
    assert(reuse.source === 'reuse' && reuse.evidence.modelCalls === 0, 'cache reuse counted as a Model call');

    const procedure = await facade.invokeSelectedStandardFeature('standard:semantic-decision/1', request({
      procedure: { id: 'proc', revision: 'r7' },
      fallback: { kind: 'model', operationId: 'model:quote' },
    }), {
      procedures: new Map([['proc', { revision: 'r7', resolve: async () => { procedureCalls += 1; return { outcome: 'procedure' }; } }]]),
    });
    assert(procedure.source === 'procedure' && procedureCalls === 1 && procedure.evidence.modelCalls === 0, 'promoted procedure accounting is untruthful');

    const model = await facade.invokeSelectedStandardFeature('standard:semantic-decision/1', request({
      fallback: { kind: 'model', operationId: 'model:quote' },
    }), { model: async () => { modelCalls += 1; return { outcome: 'fallback' }; } });
    assert(model.source === 'model' && model.evidence.modelCalls === 1 && model.evidence.modelCallEvidence === 'measured', 'Model fallback count is untruthful');
    assert(modelCalls === 1, `expected exactly one measured Model call, got ${modelCalls}`);

    const unavailable = await facade.invokeSelectedStandardFeature('standard:semantic-decision/1', request({
      fallback: { kind: 'model', operationId: 'model:quote' },
    }));
    assert(unavailable.kind === 'unavailable' && unavailable.evidence.modelCalls === 0 && unavailable.evidence.modelCallEvidence === 'unmeasured', 'unavailable Model was not reported honestly');
    return { rule: 0, reuse: 0, procedure: procedureCalls, model: modelCalls, unavailable: 'unmeasured' };
  });

  await step('RICH_P5.agentMemoryContext', async () => {
    const scope = agentScope;
    const readTurnInput = (requestId) => ({
      iteration: null, note: null, decisionOutcome: null, decisionData: null, contextDigest: null,
      contextEntries: null, modelCalls: null, modelCallEvidence: null, requestId,
    });
    const collect = expectAdmitted(await send(facade, 'agentCollectContext', 'agent-inst-1', 'agent/collect/0', readTurnInput('req-0')), 'agentCollectContext');
    const observations = firstEffect(collect).output.observations;
    assert(Array.isArray(observations) && observations.length > 0, 'agent context read produced no observations');
    const context = await facade.invokeSelectedStandardFeature('standard:context-assembly/1', {
      scope, observations, budget: { maxEntries: 8, maxCharacters: 4096 },
    });
    assert(context.kind === 'assembled-context' && context.kernelEffectPermit === false && context.trustedHostAuthorization === false, 'context assembly minted authority');
    const decision = await facade.invokeSelectedStandardFeature('standard:semantic-decision/1', {
      input: { stage: 'greet', note: 'hello' },
      schema: { id: 'schema:agent-turn', revision: 'r1', provenanceKey: 'policy:agent-turn@r1' },
      rules: [{ id: 'rule:greet', when: { stage: 'greet' }, decision: { outcome: 'answer', data: { tone: 'concise' } } }],
      fallback: { kind: 'model', operationId: 'model.agent-answer' },
      limits: { maxSteps: 3, maxModelCalls: 1, maxToolCalls: 0, deadlineEpochMs: NOW + 600_000 },
    }, { now });
    assert(decision.source === 'rule' && decision.evidence.kernelEffectPermit === false, 'agent decision minted a K permit');
    const plan = await facade.invokeSelectedStandardFeature('standard:workflow-control/1', {
      kind: 'loop.next', target: { workflowId: AGENT_WORKFLOW, instanceKey: 'agent-inst-1' },
      control: { loopId: 'agent-turns', maxIterations: 4, iteration: 0, stepIntentTypes: ['agentCommitTurn'], deadlineEpochMs: NOW + 600_000 },
      step: { intentType: 'agentCommitTurn', input: {} },
    }, { now });
    assert(plan.action === 'submit', 'agent loop plan did not admit a step');
    const commit = expectAdmitted(await send(facade, 'agentCommitTurn', 'agent-inst-1', plan.proposal.messageId, {
      iteration: 0,
      note: 'hello',
      decisionOutcome: decision.decision?.outcome ?? '',
      decisionData: decision.decision?.data ?? null,
      contextDigest: `sha256:${sha256Text(JSON.stringify(context.entries))}`,
      contextEntries: context.entries.length,
      modelCalls: decision.evidence.modelCalls,
      modelCallEvidence: decision.evidence.modelCallEvidence,
      requestId: 'req-0',
    }), 'agentCommitTurn');
    const committed = firstEffect(commit).output;
    assert(committed.ok === true && committed.revision >= 0, 'agent commit did not write scoped Memory');
    const rows = memoryRows();
    assert(rows.length > 0, 'scoped Memory physically holds no rows');
    assert(rows.every((row) => row.key.includes('v010-k02:') === false), 'Memory rows must not live in the K namespace');

    const foreign = await refusalOf(send(facade, 'agentProbeForeignMemory', 'agent-inst-1', 'agent/foreign/1', {
      ...readTurnInput('req-foreign'), note: null,
    }));
    assert(foreign.refused === true, 'the foreign Memory probe was not refused');
    assert(String(foreign.message).includes('MEMORY_SCOPE') || String(foreign.message).includes('refused'), `unexpected foreign probe failure ${String(foreign.message).slice(0, 200)}`);
    assert(memoryRows().length === rows.length, 'the foreign probe mutated scoped Memory');
    return { observations: observations.length, contextEntries: context.entries.length, memoryRows: rows.length, foreignCode: foreign.code };
  });

  await step('EX04_P1.twoAdapters', async () => {
    const submitted = expectAdmitted(await send(facade, 'submitExternalJob', 'inst-main-1', 'main/job/1', {
      requestId: 'R-MAIN-1', jobSpec: { kind: 'export', rows: 5 },
    }), 'submitExternalJob');
    const accepted = firstEffect(submitted).output;
    assert(accepted.phase === 'accepted', `accepted phase expected, got ${JSON.stringify(accepted)}`);
    assert(accepted.phase !== 'terminal', 'an accepted job reply was reported as terminal');
    const notified = expectAdmitted(await send(facade, 'sendNotification', 'inst-main-1', 'main/notify/1', {
      requestId: 'R-NOTIFY-1', channel: 'channel:ops', message: 'shipped',
    }), 'sendNotification');
    const delivered = firstEffect(notified).output;
    assert(delivered.phase === 'terminal', `notify terminal expected, got ${JSON.stringify(delivered)}`);
    assert(extjob.dispatchCounts()['job.submit'] === 1, `extjob dispatched ${String(extjob.dispatchCounts()['job.submit'])} submissions`);
    assert(extnotify.dispatchCounts()['notify.send'] === 1, `extnotify dispatched ${String(extnotify.dispatchCounts()['notify.send'])} sends`);
    assert(extjob.jobByKey('R-MAIN-1')?.phase === 'queued', 'the job provider does not hold the accepted job');
    const kc = facade.kCounters(B1);
    assert(kc.effectPermitsMinted === 2 && kc.effectPermitsConsumed === 2, `permit accounting ${JSON.stringify(kc)}`);
    return { job: accepted, notify: delivered, dispatch: extjob.dispatchCounts(), notifyDispatch: extnotify.dispatchCounts(), permits: { minted: kc.effectPermitsMinted, consumed: kc.effectPermitsConsumed } };
  });

  await step('RICH_P2.twoBIsolation', async () => {
    const b1 = expectAdmitted(await send(facade, 'submitExternalJob', 'inst-two-b', 'shared-message-1', {
      requestId: 'R-TWO-B1', jobSpec: { kind: 'two-b' },
    }), 'B1');
    const b2 = expectAdmitted(await send(facade, 'submitSecondBJob', 'inst-two-b', 'shared-message-1', {
      requestId: 'R-TWO-B2', jobSpec: { kind: 'two-b' },
    }), 'B2');
    const e1 = String(firstEffect(b1).effectId);
    const e2 = String(firstEffect(b2).effectId);
    assert(e1 === e2, 'the logical turn identity is not shared across the two B');
    const keys = store.keys();
    const b1Prefix = `v010-k02:deploy%3Av010-t05-rich:tenant%3Av010-t05-rich:app%3Av010-t05-rich:${B1.replace(/:/g, '%3A')}:`;
    const b2Prefix = `v010-k02:deploy%3Av010-t05-rich:tenant%3Av010-t05-rich:app%3Av010-t05-rich:${B2.replace(/:/g, '%3A')}:`;
    const b1Keys = keys.filter((key) => key.includes(b1Prefix));
    const b2Keys = keys.filter((key) => key.includes(b2Prefix));
    assert(b1Keys.length > 0 && b2Keys.length > 0, 'the two B did not write disjoint scoped namespaces');
    assert(b1Keys.every((key) => !b2Keys.includes(key)), 'a physical K record is shared by the two B');
    const sharedInstance = `v08-kernel:wf-instance:${EXTJOB_WORKFLOW}:inst-two-b`;
    assert(b1Keys.filter((key) => key.endsWith(sharedInstance)).length === 1, 'B1 has no single instance row for the shared target');
    assert(b2Keys.filter((key) => key.endsWith(sharedInstance)).length === 1, 'B2 has no single instance row for the shared target');
    assert(b1Keys.filter((key) => key.endsWith(`:effect-permit:${e1}`)).length === 1, 'B1 has no permit for the shared turn');
    assert(b2Keys.filter((key) => key.endsWith(`:effect-permit:${e2}`)).length === 1, 'B2 has no permit for the shared turn');
    const b1Snapshot = await facade.queryScopedSnapshot({ workflowId: EXTJOB_WORKFLOW, instanceKey: 'inst-two-b', businessPackageId: B1 });
    const b2Snapshot = await facade.queryScopedSnapshot({ workflowId: EXTJOB_WORKFLOW, instanceKey: 'inst-two-b', businessPackageId: B2 });
    assert(b1Snapshot.snapshot.state.stateKey === 'open' && b2Snapshot.snapshot.state.stateKey === 'open', 'both B did not reach the open state');
    assert(b1Keys.every((key) => key.startsWith('v10/k/')), 'K records escaped the K namespace');
    return { effectId: e1, b1Records: b1Keys.length, b2Records: b2Keys.length, jobRows: { b1: extjob.jobByKey('R-TWO-B1')?.job_id, b2: extjob.jobByKey('R-TWO-B2')?.job_id } };
  });

  await step('RICH_P3.queryAuthority', async () => {
    const scoped = await facade.queryScopedSnapshot({ workflowId: EXTJOB_WORKFLOW, instanceKey: 'inst-two-b', businessPackageId: B1 });
    assert(scoped.target.businessPackageId === B1, 'explicit query answered a different Business');
    const ambiguous = await refusalOf(facade.queryScopedSnapshot({ workflowId: EXTJOB_WORKFLOW, instanceKey: 'inst-two-b' }));
    assert(ambiguous.refused === true && ambiguous.code === 'QUERY_AMBIGUOUS', `unscoped ambiguity expected, got ${JSON.stringify(ambiguous)}`);
    const readsBefore = store.counts.reads;
    visible.delete(B2);
    const single = await facade.queryScopedSnapshot({ workflowId: EXTJOB_WORKFLOW, instanceKey: 'inst-two-b' });
    const readsAfterSingle = store.counts.reads;
    assert(single.target.businessPackageId === B1, 'the single-visible query did not answer the visible B');
    const hiddenExplicit = await refusalOf(facade.queryScopedSnapshot({ workflowId: EXTJOB_WORKFLOW, instanceKey: 'inst-two-b', businessPackageId: B2 }));
    assert(hiddenExplicit.refused === true && hiddenExplicit.code === 'QUERY_NOT_FOUND', `hidden B explicit query must be a non-oracle denial, got ${JSON.stringify(hiddenExplicit)}`);
    const readsAfterHidden = store.counts.reads;
    assert(readsAfterSingle - readsBefore >= 1, 'the visible query performed no physical read');
    assert(readsAfterHidden === readsAfterSingle, 'the hidden-B denial performed a physical K read (oracle)');
    visible.add(B2);
    return { scoped: scoped.target.businessPackageId, ambiguous: ambiguous.code, hidden: hiddenExplicit.code, checks: probes.length };
  });

  await step('K02_P1.eighteenTurnsOriginalReceipt', async () => {
    const first = expectAdmitted(await send(facade, 'submitExternalJob', 'inst-k02', 'k02/msg/1', {
      requestId: 'R-K02-1', jobSpec: { kind: 'k02', turn: 1 },
    }), 'k02 turn 1');
    const firstCore = {
      messageId: first.occurrence?.messageId ?? first.messageId ?? 'k02/msg/1',
      effectId: firstEffect(first).effectId,
      stateRevision: first.instance?.stateRevision ?? first.admitted?.stateRevision ?? null,
    };
    for (let turn = 2; turn <= 18; turn += 1) {
      expectAdmitted(await send(facade, 'submitExternalJob', 'inst-k02', `k02/msg/${String(turn)}`, {
        requestId: `R-K02-${String(turn)}`, jobSpec: { kind: 'k02', turn },
      }), `k02 turn ${String(turn)}`);
    }
    const dispatchedBefore = extjob.dispatchCounts()['job.submit'] ?? 0;
    const deleted = store.deleteLike('%turn-disposition%');
    assert(deleted >= 18, `expected >=18 disposition rows, deleted ${deleted}`);
    const replay = expectAdmitted(await send(facade, 'submitExternalJob', 'inst-k02', 'k02/msg/1', {
      requestId: 'R-K02-1', jobSpec: { kind: 'k02', turn: 1 },
    }), 'k02 replay');
    assert(replay.idempotentReplay === true, 'the 18-turn replay did not answer from the original receipt');
    assert(String(firstEffect(replay).effectId) === String(firstCore.effectId), 'the replay returned a different effect identity');
    assert((extjob.dispatchCounts()['job.submit'] ?? 0) === dispatchedBefore, 'the 18-turn replay dispatched a new effect');
    const conflict = await refusalOf(send(facade, 'submitExternalJob', 'inst-k02', 'k02/msg/1', {
      requestId: 'R-K02-1', jobSpec: { kind: 'k02', turn: 19 },
    }));
    assert(conflict.refused === true && /K02_TURN_RECEIPT_INPUT_CONFLICT|ADMISSION_TURN_DISPOSITION_CONFLICT/.test(String(conflict.code) + String(conflict.message)), `changed input did not conflict: ${JSON.stringify(conflict)}`);
    const kc = facade.kCounters(B1);
    assert((kc.durableOriginalReceiptReplays ?? 0) + (kc.turnAdmissionReplays ?? 0) >= 1, 'no original-receipt replay counter moved');
    return { turns: 18, deletedDispositionRows: deleted, dispatchBefore: dispatchedBefore, dispatchAfter: extjob.dispatchCounts()['job.submit'], replayEffect: firstEffect(replay).effectId, conflict: conflict.code };
  });

  await step('EX04_F1.duplicateCallbackAndLostAck', async () => {
    const delivered = {
      ok: true,
      output: { deliveredByCallback: true, jobId: 'job:R-MAIN-1' },
    };
    const firstCallback = extjob.deliverCallback('job:R-MAIN-1', delivered);
    const duplicate = extjob.deliverCallback('job:R-MAIN-1', delivered);
    const conflicting = extjob.deliverCallback('job:R-MAIN-1', { ok: true, output: { forged: true } });
    assert(firstCallback.disposition === 'recorded' && duplicate.disposition === 'duplicate' && conflicting.disposition === 'conflict', `callback dispositions ${JSON.stringify([firstCallback, duplicate, conflicting])}`);
    assert(extjob.callbackCount() === 1, 'duplicate callbacks created a second callback row');
    const status = expectAdmitted(await send(facade, 'checkExternalJob', 'inst-main-1-status', 'main/status/1', {
      requestId: 'R-MAIN-1', jobId: 'job:R-MAIN-1',
    }), 'checkExternalJob');
    const envelope = firstEffect(status).output;
    assert(envelope.phase === 'terminal' && envelope.outcome?.output?.deliveredByCallback === true, `standing callback truth not reported: ${JSON.stringify(envelope)}`);

    const dispatchedBefore = extjob.dispatchCounts()['job.submit'] ?? 0;
    store.armPermitConsumeFault();
    const lostAck = await send(facade, 'submitExternalJob', 'inst-lost-ack', 'lost-ack/1', {
      requestId: 'R-LOST-ACK', jobSpec: { kind: 'export', rows: 2 },
    });
    assert(lostAck.status === 'UNKNOWN', `lost ACK must surface as UNKNOWN, got ${JSON.stringify(lostAck).slice(0, 300)}`);
    assert(extjob.jobByKey('R-LOST-ACK') !== undefined, 'the provider never landed the job');
    assert((extjob.dispatchCounts()['job.submit'] ?? 0) === dispatchedBefore + 1, 'the lost-ack turn did not dispatch exactly once');
    const retry = await refusalOf(send(facade, 'submitExternalJob', 'inst-lost-ack', 'lost-ack/1', {
      requestId: 'R-LOST-ACK', jobSpec: { kind: 'export', rows: 2 },
    }));
    assert((extjob.dispatchCounts()['job.submit'] ?? 0) === dispatchedBefore + 1, 'the blind retry dispatched a second effect');
    const retryStatus = retry.refused === false ? retry.value.status : 'refused';
    assert(retryStatus === 'UNKNOWN' || retryStatus === 'refused', `retry did not fail closed: ${JSON.stringify(retry)}`);
    const reconciled = expectAdmitted(await send(facade, 'reconcileExternalJob', 'inst-lost-ack-recon', 'lost-ack/recon/1', {
      requestId: 'R-LOST-ACK', idempotencyKey: 'job:R-LOST-ACK',
    }), 'reconcileExternalJob');
    const truth = firstEffect(reconciled).output;
    assert(truth.externalRef === 'job:R-LOST-ACK' && ['accepted', 'running', 'terminal'].includes(truth.phase), `reconcile truth ${JSON.stringify(truth)}`);
    return { callbacks: [firstCallback.disposition, duplicate.disposition, conflicting.disposition], unknown: lostAck.code ?? 'UNKNOWN', retry: retryStatus, reconciledPhase: truth.phase };
  });

  await step('DENY_N1.permitlessAdapter', async () => {
    const before = extjob.dispatchCounts()['job.submit'] ?? 0;
    const denied = await refusalOf(send(facade, 'submitUnpermittedJobProbe', 'inst-deny', 'deny/1', {
      requestId: 'R-DENY', jobSpec: { kind: 'probe' },
    }));
    assert(denied.refused === true, 'the permitless adapter probe was not refused');
    assert(denied.code === 'ADMISSION_EFFECT_FAILED', `permitless refusal code ${denied.code}`);
    assert(/V10_EFFECT_PERMIT/.test(String(denied.message)), `permitless refusal did not name the missing K permit: ${String(denied.message).slice(0, 200)}`);
    assert((extjob.dispatchCounts()['job.submit'] ?? 0) === before, 'the permitless adapter physically dispatched');
    assert(extjob.jobByKey('R-DENY') === undefined, 'the permitless probe created a provider job');
    assert(counters.externalEffectDispatches === 0 || counters.externalEffectRefusals >= 1, 'the gate did not record the typed refusal');
    return { code: denied.code, message: String(denied.message).slice(0, 160), dispatchBefore: before, dispatchAfter: extjob.dispatchCounts()['job.submit'] };
  });

  // Restart: close the physical store, reopen, re-activate and verify both B
  // survive, replay is zero-effect and the query authority still works.
  const countersBeforeRestart = facade.kCounters(B1);
  const dispatchBeforeRestart = extjob.dispatchCounts()['job.submit'] ?? 0;
  activation.dispose();
  store.close();
  store = new SqliteDocStore(dbPath);
  activation = await activate({ store, app, manifest, log, authority, now });
  counters = activation.counters;
  facade = activation.facade;

  await step('RICH_P2.restart', async () => {
    const b1 = await facade.queryScopedSnapshot({ workflowId: EXTJOB_WORKFLOW, instanceKey: 'inst-two-b', businessPackageId: B1 });
    const b2 = await facade.queryScopedSnapshot({ workflowId: EXTJOB_WORKFLOW, instanceKey: 'inst-two-b', businessPackageId: B2 });
    assert(b1.snapshot.state.stateKey === 'open' && b2.snapshot.state.stateKey === 'open', 'two-B state did not survive restart');
    const replay = expectAdmitted(await send(facade, 'submitExternalJob', 'inst-two-b', 'shared-message-1', {
      requestId: 'R-TWO-B1', jobSpec: { kind: 'two-b' },
    }), 'B1 restart replay');
    assert(replay.idempotentReplay === true, 'B1 restart replay did not answer the original receipt');
    assert((extjob.dispatchCounts()['job.submit'] ?? 0) === dispatchBeforeRestart, 'B1 restart replay dispatched a new effect');
    const kc = facade.kCounters(B1);
    return { state: [b1.snapshot.state.stateKey, b2.snapshot.state.stateKey], replay: true, permitsBeforeRestart: countersBeforeRestart.effectPermitsMinted, permitsAfterRestart: kc.effectPermitsMinted };
  });

  const final = {
    kCounters: facade.kCounters(B1),
    dispatches: { extjob: extjob.dispatchCounts(), extnotify: extnotify.dispatchCounts() },
    rows: {
      total: store.count('%'),
      instances: store.count('%:wf-instance:%'),
      permits: store.count('%:effect-permit:%'),
      journals: store.count('%:effect-journal:%'),
      dispositions: store.count('%turn-disposition%'),
    },
    memoryRows: memoryRows().length,
    counters,
    manifest: {
      subjectDigest: manifest.subjectDigest,
      packageClosureDigest: manifest.packageClosureDigest,
      buildId: manifest.buildId,
      modules: manifest.modules,
    },
  };
  activation.dispose();
  store.close();
  return { steps, final, dbPath };
}

// ---------------------------------------------------------------------------
// WAIT / RESUME across a real process restart
// ---------------------------------------------------------------------------
async function waitA({ steps, step, workdir, app, manifest, log }) {
  const store = new SqliteDocStore(join(workdir, 'rich-k.sqlite'));
  const visible = new Set([B1, B2, B3, B4]);
  const { authority } = queryAuthority(manifest.deployment, visible);
  const activation = await activate({ store, app, manifest, log, authority });
  const facade = activation.facade;
  let observed;
  await step('WAIT.open', async () => {
    const receipt = expectAdmitted(await send(facade, 'openWait', 'wait-inst-1', 'wait/open/1', {
      requestId: 'R-WAIT-1', channel: 'channel:wait', message: 'parked',
    }), 'openWait');
    const snapshot = await facade.queryScopedSnapshot({ workflowId: WAIT_WORKFLOW, instanceKey: 'wait-inst-1', businessPackageId: B4 });
    assert(snapshot.snapshot.state.stateKey === 'waiting', `WAIT state is ${String(snapshot.snapshot.state.stateKey)}`);
    observed = { receipt: receipt.status, state: snapshot.snapshot.state.stateKey };
    return observed;
  });
  activation.dispose();
  store.close();
  return { steps, observed };
}

async function waitB({ steps, step, workdir, app, manifest, log }) {
  const store = new SqliteDocStore(join(workdir, 'rich-k.sqlite'));
  const visible = new Set([B1, B2, B3, B4]);
  const { authority } = queryAuthority(manifest.deployment, visible);
  const activation = await activate({ store, app, manifest, log, authority });
  const facade = activation.facade;
  let result;
  await step('WAIT.resumeAfterRestart', async () => {
    const parked = await facade.queryScopedSnapshot({ workflowId: WAIT_WORKFLOW, instanceKey: 'wait-inst-1', businessPackageId: B4 });
    assert(parked.snapshot.state.stateKey === 'waiting', 'WAIT did not survive the process restart');
    const before = extnotify.dispatchCounts()['notify.send'] ?? 0;
    const resumed = expectAdmitted(await send(facade, 'resumeCallback', 'wait-inst-1', 'wait/callback/1', {
      requestId: 'R-WAIT-1', channel: 'channel:wait', message: 'resumed',
    }), 'resumeCallback');
    const envelope = firstEffect(resumed).output;
    assert(envelope.phase === 'terminal', `resume notify did not reach terminal: ${JSON.stringify(envelope)}`);
    const afterResume = extnotify.dispatchCounts()['notify.send'] ?? 0;
    assert(afterResume === before + 1, 'the resume turn did not dispatch exactly one notify');
    const duplicate = expectAdmitted(await send(facade, 'resumeCallback', 'wait-inst-1', 'wait/callback/1', {
      requestId: 'R-WAIT-1', channel: 'channel:wait', message: 'resumed',
    }), 'duplicate resumeCallback');
    assert(duplicate.idempotentReplay === true, 'the duplicate callback did not replay the original receipt');
    assert((extnotify.dispatchCounts()['notify.send'] ?? 0) === afterResume, 'the duplicate callback dispatched a second notify');
    const done = await facade.queryScopedSnapshot({ workflowId: WAIT_WORKFLOW, instanceKey: 'wait-inst-1', businessPackageId: B4 });
    assert(done.snapshot.state.stateKey === 'resumed', `resumed state is ${String(done.snapshot.state.stateKey)}`);

    expectAdmitted(await send(facade, 'openWait', 'wait-inst-2', 'wait/open/2', { requestId: 'R-WAIT-2', channel: 'channel:wait', message: 'parked' }), 'second openWait');
    expectAdmitted(await send(facade, 'timeoutWait', 'wait-inst-2', 'wait/timeout/1', { requestId: 'R-WAIT-2', channel: 'channel:wait', message: 'timeout' }), 'timeoutWait');
    const timedOut = await facade.queryScopedSnapshot({ workflowId: WAIT_WORKFLOW, instanceKey: 'wait-inst-2', businessPackageId: B4 });
    assert(timedOut.snapshot.state.stateKey === 'timedOut', 'the deadline branch did not reach its typed terminal state');
    assert((extnotify.dispatchCounts()['notify.send'] ?? 0) === afterResume, 'the timeout branch dispatched a notify');

    const childOpen = await facade.invokeSelectedStandardFeature('standard:workflow-control/1', {
      kind: 'child.open', target: { workflowId: WAIT_WORKFLOW, instanceKey: 'wait-inst-1' },
      control: {
        childInstanceKey: 'wait-child-1', invocationOrdinal: 1, lineageDepth: 1,
        childIntentType: 'openWait', doneIntentType: 'resumeCallback', errorIntentType: 'timeoutWait',
      },
    }, { now: () => NOW });
    assert(childOpen.action === 'open-child', `child plan ${JSON.stringify(childOpen).slice(0, 300)}`);
    const correlation = childOpen.proposal.expectedCorrelationId;
    const resume = await facade.invokeSelectedStandardFeature('standard:workflow-control/1', {
      kind: 'control.resume', target: { workflowId: WAIT_WORKFLOW, instanceKey: 'wait-inst-1' },
      control: {
        expected: {
          parentActorId: 'wait-inst-1', childActorId: 'wait-child-1', invocationOrdinal: 1,
          doneIntentType: 'resumeCallback', scope: { appId: 'app010rich', tenantId: 'tenant010rich' },
        },
      },
      settled: {
        source: {
          kind: 'child-terminal', parentActorId: 'wait-inst-1', childActorId: 'wait-child-1',
          invocationOrdinal: 1, terminalKind: 'done',
        },
        status: 'done',
        scope: { appId: 'app010rich', tenantId: 'tenant010rich' },
      },
    }, { now: () => NOW });
    assert(resume.action === 'submit', `child resume plan ${JSON.stringify(resume).slice(0, 300)}`);
    const deadline = await refusalOf(facade.invokeSelectedStandardFeature('standard:workflow-control/1', {
      kind: 'loop.next', target: { workflowId: WAIT_WORKFLOW, instanceKey: 'wait-inst-1' },
      control: { loopId: 'l', iteration: 0, maxIterations: 2, stepIntentTypes: ['openWait'], deadlineEpochMs: NOW - 1 },
      step: { intentType: 'openWait', input: {} },
    }, { now: () => NOW }));
    assert(deadline.refused === true && /WORKFLOW_DEADLINE|BUDGET/.test(String(deadline.code) + String(deadline.message)), `expired deadline was not refused: ${JSON.stringify(deadline)}`);
    result = {
      state: done.snapshot.state.stateKey,
      timedOut: timedOut.snapshot.state.stateKey,
      callback: envelope.phase,
      duplicate: duplicate.idempotentReplay,
      childCorrelation: correlation,
      childResume: resume.action,
      deadline: deadline.code,
      notifyDispatches: extnotify.dispatchCounts()['notify.send'],
    };
    return result;
  });
  activation.dispose();
  store.close();
  return { steps, result };
}

// ---------------------------------------------------------------------------
// T08 — governed new BUILD activation, old occurrence pin unchanged
// ---------------------------------------------------------------------------
function decisionFor(app, deployment, version) {
  return {
    kind: 'v10/build-activation-decision',
    decisionId: `t11-decision-${version}`,
    deployedAppId: deployment.deployedAppId,
    tenantId: deployment.tenantId,
    appId: deployment.appId,
    subjectDigest: app.subjectDigest,
    buildId: app.buildId,
    packageClosureDigest: v10BuildPackageClosureDigest(app),
    runtimeAbi: V10_RUNTIME_ABI,
    hostAbi: V10_HOST_ABI,
    targetProfile: V10_TARGET_PROFILE,
    approvalRef: `approval:t11:${version}`,
    approvedAt: T08_APPROVED_AT,
    validUntil: T08_VALID_UNTIL,
  };
}

function authorizationFor(decisions) {
  const grants = new Map();
  const grant = (decision) => {
    grants.set(decision.approvalRef, {
      decisionDigest: v10BuildActivationDecisionDigest(decision),
      subjectDigest: decision.subjectDigest,
      packageClosureDigest: decision.packageClosureDigest,
      revoked: false,
    });
  };
  const authority = {
    grants,
    verify(request) {
      const grantRecord = grants.get(request.decision.approvalRef);
      if (grantRecord === undefined) return { status: 'DENIED', reasonCode: 'DEPLOYMENT_APPROVAL_MISSING', reason: 'no approval' };
      if (grantRecord.revoked) return { status: 'DENIED', reasonCode: 'DEPLOYMENT_APPROVAL_REVOKED', reason: 'revoked' };
      if (Date.parse(request.nowIso) >= Date.parse(T08_VALID_UNTIL)) return { status: 'DENIED', reasonCode: 'DEPLOYMENT_APPROVAL_STALE', reason: 'expired' };
      if (grantRecord.decisionDigest !== request.decisionDigest
        || grantRecord.subjectDigest !== request.build.subjectDigest
        || grantRecord.packageClosureDigest !== request.build.packageClosureDigest) {
        return { status: 'DENIED', reasonCode: 'DEPLOYMENT_AUTHORIZATION_UNAUTHORIZED', reason: 'binding mismatch' };
      }
      return {
        status: 'AUTHORIZED', decisionDigest: request.decisionDigest, authorizationRef: request.decision.approvalRef,
        subjectDigest: request.build.subjectDigest, packageClosureDigest: request.build.packageClosureDigest,
        authorizedAt: T08_APPROVED_AT, expiresAt: T08_VALID_UNTIL,
      };
    },
  };
  for (const decision of decisions) grant(decision);
  return { authority, grants };
}

async function t08A({ steps, step, workdir, app, manifest, log }) {
  const store = new SqliteDocStore(join(workdir, 'rich-k.sqlite'));
  const visible = new Set([B1, B2, B3, B4]);
  const { authority: queryAuthorityValue } = queryAuthority(manifest.deployment, visible);
  const decision = decisionFor(app, manifest.deployment, 'v1');
  const { authority } = authorizationFor([decision]);
  const governed = await activateGovernedV10Build(app, {
    store, deployment: manifest.deployment, decision, authorization: authority,
    selection: 'CURRENT', now: () => NOW, queryAuthority: queryAuthorityValue,
    deploymentRoot: log.deploymentRoot,
  });
  let result;
  await step('VERSION_P1.oldOccurrence', async () => {
    const receipt = expectAdmitted(await governed.send({
      intentType: 'submitExternalJob', instanceKey: 'inst-t08-old', messageId: 't08/old/1',
      input: jobInput({ requestId: 'R-T08-OLD', jobSpec: { kind: 't08-old' } }),
    }), 'T08 old occurrence');
    const pin = await governed.readPin({ intentType: 'submitExternalJob', instanceKey: 'inst-t08-old' });
    assert(pin?.subjectDigest === app.subjectDigest, 'the old occurrence is not pinned to BUILD v1');
    result = { buildId: governed.build.buildId, subjectDigest: app.subjectDigest, effectId: firstEffect(receipt).effectId, pin };
    return result;
  });
  governed.close();
  store.close();
  return { steps, result };
}

async function t08B({ steps, step, workdir, app, manifest, log }) {
  const installedV2 = loadInstalledApp('@kaicreator-example/v010-rich-app-v2');
  const appV1 = app;
  const appV2 = installedV2.app;
  const store = new SqliteDocStore(join(workdir, 'rich-k.sqlite'));
  const visible = new Set([B1, B2, B3, B4]);
  const { authority: queryAuthorityValue } = queryAuthority(manifest.deployment, visible);
  const decisionV1 = decisionFor(appV1, manifest.deployment, 'v1');
  const decisionV2 = decisionFor(appV2, manifest.deployment, 'v2');
  const { authority } = authorizationFor([decisionV1, decisionV2]);
  let result;

  const v2 = await activateGovernedV10Build(appV2, {
    store, deployment: manifest.deployment, decision: decisionV2, authorization: authority,
    selection: 'CURRENT', now: () => NOW, queryAuthority: queryAuthorityValue,
    deploymentRoot: log.deploymentRoot,
  });
  await step('VERSION_P1.newBuildActivation', async () => {
    assert(appV1.subjectDigest !== appV2.subjectDigest, 'v1 and v2 share a BUILD subject digest');
    assert(v10BuildPackageClosureDigest(appV1) !== v10BuildPackageClosureDigest(appV2), 'v1 and v2 share a package closure digest');
    expectAdmitted(await v2.send({
      intentType: 'submitExternalJob', instanceKey: 'inst-t08-new', messageId: 't08/new/1',
      input: jobInput({ requestId: 'R-T08-NEW', jobSpec: { kind: 't08-new' } }),
    }), 'T08 new occurrence');
    const pin = await v2.readPin({ intentType: 'submitExternalJob', instanceKey: 'inst-t08-new' });
    assert(pin?.subjectDigest === appV2.subjectDigest, 'the new occurrence is not pinned to BUILD v2');
    result = { v1: appV1.subjectDigest, v2: appV2.subjectDigest, buildId: v2.build.buildId };
    return result;
  });

  await step('VERSION_P1.oldPinRestore', async () => {
    const dispatchBefore = extjob.dispatchCounts()['job.submit'] ?? 0;
    const v1 = await activateGovernedV10Build(appV1, {
      store, deployment: manifest.deployment, decision: decisionV1, authorization: authority,
      selection: 'PINNED_ONLY', now: () => NOW, queryAuthority: queryAuthorityValue,
      deploymentRoot: log.deploymentRoot,
    });
    const pin = await v1.readPin({ intentType: 'submitExternalJob', instanceKey: 'inst-t08-old' });
    assert(pin?.subjectDigest === appV1.subjectDigest, 'the restored v1 activation lost the old occurrence pin');
    const replay = expectAdmitted(await v1.send({
      intentType: 'submitExternalJob', instanceKey: 'inst-t08-old', messageId: 't08/old/1',
      input: jobInput({ requestId: 'R-T08-OLD', jobSpec: { kind: 't08-old' } }),
    }), 'T08 old replay');
    assert(replay.idempotentReplay === true, 'the old occurrence did not replay its original receipt after the v2 promotion');
    assert((extjob.dispatchCounts()['job.submit'] ?? 0) === dispatchBefore, 'the old pinned replay dispatched a new effect');
    const fresh = await refusalOf(v1.send({
      intentType: 'submitExternalJob', instanceKey: 'inst-t08-fresh', messageId: 't08/fresh/1',
      input: jobInput({ requestId: 'R-T08-FRESH', jobSpec: { kind: 'fresh' } }),
    }));
    assert(fresh.refused === true, 'a PINNED_ONLY restore served a fresh occurrence');
    v1.close();
    return { oldReplay: true, pin: pin.buildId, freshRefusal: fresh.code };
  });

  await step('VERSION_P1.revokedCandidate', async () => {
    for (const grant of authority.grants.values()) grant.revoked = true;
    const refused = await refusalOf(activateGovernedV10Build(appV2, {
      store, deployment: manifest.deployment, decision: decisionV2, authorization: authority,
      selection: 'CURRENT', now: () => NOW, deploymentRoot: log.deploymentRoot,
    }));
    assert(refused.refused === true, 'a revoked BUILD promotion was accepted');
    assert(/DEPLOYMENT_APPROVAL_REVOKED|DEPLOYMENT_APPROVAL_MISSING/.test(String(refused.code) + String(refused.message)), `revocation refusal ${JSON.stringify(refused)}`);
    return { code: refused.code };
  });

  v2.close();
  store.close();
  return { steps, result };
}

// ---------------------------------------------------------------------------
// Shadow L4 — read-only over the real installed App and physical K store
// ---------------------------------------------------------------------------
async function shadow({ steps, step, workdir, app, manifest, log }) {
  const store = new SqliteDocStore(join(workdir, 'rich-k.sqlite'));
  const visible = new Set([B1, B2, B3, B4]);
  const { authority } = queryAuthority(manifest.deployment, visible);
  const activation = await activate({ store, app, manifest, log, authority });
  const facade = activation.facade;
  const beforeRows = store.rows('%');
  const beforeCounters = facade.kCounters(B1);
  const beforeWrites = store.counts.writes;
  const beforeRemoves = store.counts.removes;
  const witness = () => ({
    main: createHash('sha256').update(readFileSync(join(workdir, 'rich-k.sqlite'))).digest('hex'),
    wal: (() => {
      try { return createHash('sha256').update(readFileSync(join(workdir, 'rich-k.sqlite-wal'))).digest('hex'); } catch { return null; }
    })(),
    totalChanges: store.db.prepare('SELECT total_changes() AS n').get().n,
  });
  const readOnly = readOnlyStore(store);
  const fallbackPin = selectedFallbackPin(app, { selectedPackageId: BASELINE, kind: 'Rule', id: 'baseline-rule' });
  const candidateOf = (file, id) => {
    const source = readFileSync(join(APP_DIR, 'candidates', file), 'utf8');
    return { source, pin: pinCandidateSource({ kind: 'Rule', id, revision: `candidate:${id}`, provenance: 'candidate:external', approvalState: 'candidate' }, source) };
  };
  let result;
  await step('SHADOW_P1.zeroProductionWrites', async () => {
    const match = candidateOf('shadow-candidate-match-v1.mjs', 'shadow-match');
    const matchReport = await runShadowL4({
      facade, app, store: readOnly, tenantId: manifest.deployment.tenantId,
      candidate: { pin: match.pin, source: match.source, exportName: 'evaluate' },
      approvedFallback: { pin: fallbackPin, selectedPackageId: BASELINE, exportName: 'evaluate' },
      budget: { maxCases: 32, maxComparisons: 32 },
      physicalWitness: witness,
      evaluationTimeoutMs: 500,
    });
    assert(matchReport.status === 'match', `match shadow status ${matchReport.status} ${JSON.stringify(matchReport.failure)}`);
    assert(matchReport.production.productionWritesVerifiedZero === true && matchReport.production.snapshotUnchanged === true, 'match shadow wrote production state');
    assert(matchReport.production.storeMutationMethodsUsed === 0 && matchReport.production.externalEffectCalls === 0, 'match shadow used a mutation/effect path');
    assert(matchReport.canPromote === false && matchReport.canSelfApprove === false, 'shadow report claimed promotion authority');

    const diff = candidateOf('shadow-candidate-diff-v1.mjs', 'shadow-diff');
    const diffReport = await runShadowL4({
      facade, app, store: readOnly, tenantId: manifest.deployment.tenantId,
      candidate: { pin: diff.pin, source: diff.source, exportName: 'evaluate' },
      approvedFallback: { pin: fallbackPin, selectedPackageId: BASELINE, exportName: 'evaluate' },
      budget: { maxCases: 32, maxComparisons: 32 },
      physicalWitness: witness,
      evaluationTimeoutMs: 500,
    });
    assert(diffReport.status === 'difference', `diff shadow status ${diffReport.status}`);
    assert(diffReport.production.productionWritesVerifiedZero === true, 'difference shadow wrote production state');
    assert(store.counts.writes === beforeWrites && store.counts.removes === beforeRemoves, `shadow used a physical mutation ${beforeWrites}/${beforeRemoves} -> ${store.counts.writes}/${store.counts.removes}`);
    assert(JSON.stringify(store.rows('%')) === JSON.stringify(beforeRows), 'shadow changed physical production rows');
    assert(JSON.stringify(facade.kCounters(B1)) === JSON.stringify(beforeCounters), 'shadow moved the selected K counters');
    result = {
      match: matchReport.status, difference: diffReport.status,
      observations: matchReport.observations.total, cases: matchReport.cases.length,
      writes: matchReport.production.productionWritesVerifiedZero, canPromote: matchReport.canPromote,
    };
    return result;
  });
  activation.dispose();
  store.close();
  return { steps, result };
}

// ---------------------------------------------------------------------------
// Two real competing writers over ONE SQLite K file
// ---------------------------------------------------------------------------
async function race({ steps, step, workdir, app, manifest, log, args }) {
  const store = new SqliteDocStore(join(workdir, 'rich-k.sqlite'));
  const visible = new Set([B1, B2, B3, B4]);
  const { authority } = queryAuthority(manifest.deployment, visible);
  const activation = await activate({ store, app, manifest, log, authority });
  const facade = activation.facade;
  let outcome;
  await step('K01_P1.competingWriter', async () => {
    try {
      const receipt = await send(facade, 'submitExternalJob', 'race-inst-1', 'race/msg/1', {
        requestId: 'R-RACE', jobSpec: { kind: 'race' },
      });
      outcome = receipt.status === 'admitted'
        ? { ok: true, status: receipt.status, idempotentReplay: receipt.idempotentReplay ?? false, effectId: firstEffect(receipt).effectId, code: null }
        // A same-turn rival attached to the live fence reaches the existing
        // journal and fails typed UNKNOWN (never a thrown error): keep the
        // kernel's honest code instead of reporting the fixture's NO_CODE.
        : { ok: false, status: receipt.status, code: receipt.code ?? 'NO_CODE', message: JSON.stringify(receipt).slice(0, 500) };
    } catch (error) {
      outcome = { ok: false, status: 'refused', code: error?.code ?? 'NO_CODE', message: error?.message ?? String(error) };
    }
    return outcome;
  });
  activation.dispose();
  store.close();
  return { steps, outcome, worker: args.worker ?? null };
}
