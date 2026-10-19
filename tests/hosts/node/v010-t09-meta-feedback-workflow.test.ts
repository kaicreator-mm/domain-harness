/**
 * v0.10 T09 (#1178) — PHYSICAL recurring proposal-only Meta Feedback
 * Workflow over the selected Node24 + file-backed SQLite runtime.
 * =====================================================================
 *
 * The workflow is an ordinary selected Business package
 * (`meta-feedback-loop`) whose recurring self-transition has a proposal-only
 * guard and NO effect binding. The Host runner reads durable DecisionTrace/
 * Candidate/Shadow records, invokes the selected pure Standard feature
 * (`standard:meta-feedback/1`), then records ONE real business turn through
 * the same activated facade. It cannot approve, promote, publish, activate a
 * BUILD or dispatch an Effect.
 *
 *   T09-P1  round 1 consumes real T06 DecisionEvidence + real candidate/Shadow
 *           reports, produces bounded proposals, admits exactly one selected
 *           business turn and writes one durable ledger row.
 *   T09-P2  the same round is idempotent: same proposal/receipt, no second
 *           business turn.
 *   T09-P3  after a real SQLite close/reopen the same round still replays and
 *           round 2 creates exactly one new durable turn.
 *   T09-N1  no evidence => honest no-observation with zero turn/ledger write.
 *   T09-N2  malformed/oversized evidence fails typed before any turn/write.
 *   T09-N3  authority/effect material in any consumed record is typed refused
 *           and leaves K State/Journal/Effect unchanged.
 *   T09-N4  invalid rounds and conflicting ledger reuse fail typed.
 */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after, before } from 'node:test';

import {
  V10_TARGET_PROFILE,
  activateV10App,
  buildV10App,
  sha256Canonical,
  type V10Activation,
  type V10BuiltApp,
  type V10DocStore,
  type V10DocWriteCondition,
  type V10ModuleInput,
} from '../../../packages/domain-harness-compiler/src/qualified-package/v10build/index.js';
import { createDecisionEvidenceObserver } from '../../../packages/domain-harness-compiler/src/qualified-package/v10evidence/decision-evidence-observer.js';
import {
  MetaFeedbackError,
  runMetaFeedbackWorkflow,
  type MetaFeedbackResult,
} from '../../../packages/domain-harness-compiler/src/qualified-package/v10meta/index.js';
import { openSqliteCasStore, type SqliteCasStore } from '../../../packages/domain-harness/src/host-v8/index.js';
import { featureEntry, sha256HexSource } from '../../assembly/helpers-v010.js';

assert.equal(
  Number(process.versions.node.split('.')[0]),
  24,
  `the T09 meta feedback physical witness targets Node24 (running ${process.versions.node})`,
);

const payloadDir = new URL('../../../packages/domain-harness-compiler/src/qualified-package/payload/', import.meta.url);
const routerUrl = new URL('../../../packages/domain-harness-compiler/src/qualified-package/v09/workflow-router.mjs', import.meta.url);
const capabilityUrl = new URL('../../../examples/v08-domain-apps/capability-quote-tools.mjs', import.meta.url);

const TENANT = 'tenant:v010-t09-meta';
const APP_ID = 'app:v010-t09-meta-feedback';
const BUSINESS_ID = 'business-meta-feedback@v010.1.0.0';
const CAPABILITY_ID = 'capability-quote-tools@v08.1.0.0';
const DEPLOYMENT = Object.freeze({
  deployedAppId: 'deploy:v010-t09-meta',
  tenantId: TENANT,
  appId: APP_ID,
});
const NOW = Date.UTC(2026, 9, 20, 4, 0, 0);
const MAIN_INSTANCE = 'instance:t09-main';
const SCHEDULE = 'schedule:t09-main';
const EVIDENCE_KEY = 'v10/t09/evidence/obs-1';
const CANDIDATE_KEY = 'v10/t09/candidate/1';
const SHADOW_KEY = 'v10/t09/shadow/1';
const HEX64 = /^[0-9a-f]{64}$/;

interface Counts { gets: number; puts: number; removes: number; }

function v10Store(sqlite: SqliteCasStore, counts: Counts): V10DocStore {
  return {
    get: async (key) => {
      counts.gets += 1;
      return await sqlite.get(key);
    },
    put: async (key, value, condition: V10DocWriteCondition) => {
      counts.puts += 1;
      return await sqlite.put(key, value, condition.kind === 'create'
        ? { mustBeAbsent: true }
        : { mustMatchRevision: condition.revision });
    },
    remove: async (key, condition: V10DocWriteCondition) => {
      counts.removes += 1;
      await sqlite.remove(key, condition.kind === 'create'
        ? { mustBeAbsent: true }
        : { mustMatchRevision: condition.revision });
    },
    keys: async () => await sqlite.list(''),
  };
}

interface Harness {
  readonly activation: V10Activation;
  readonly store: V10DocStore;
  readonly counts: Counts;
  readonly sqlite: SqliteCasStore;
}

const candidatePins = {
  candidate: {
    kind: 'Rule', id: 'rule:meta', revision: 'r2',
    sha256: 'd'.repeat(64), provenance: 'pinned:approved-source', approvalState: 'candidate',
  },
  approvedFallback: {
    kind: 'Rule', id: 'rule:meta', revision: 'r1',
    sha256: 'e'.repeat(64), provenance: 'pinned:approved-source', approvalState: 'approved',
  },
};
const candidateRequest = {
  ...candidatePins,
  budget: { maxCases: 4, maxComparisons: 4 },
  cases: [{
    id: 'case:t09-1',
    candidateOutput: { quote: 'review' },
    baselineOutput: { quote: 'approved' },
    candidatePinSha256: candidatePins.candidate.sha256,
    baselinePinSha256: candidatePins.approvedFallback.sha256,
  }],
};

function shadowReport(app: V10BuiltApp): Record<string, unknown> {
  return {
    kind: 'shadow-l4-evidence',
    shadowAbi: 'dh.v10.shadow-l4-readonly/1',
    appSubjectDigest: app.subjectDigest,
    deployedAppId: DEPLOYMENT.deployedAppId,
    tenantId: TENANT,
    status: 'difference',
    productionWritesVerifiedZero: true,
    replayDigest: 'c'.repeat(64),
    candidate: candidatePins.candidate,
    approvedFallback: candidatePins.approvedFallback,
    canSelfApprove: false,
    canPromote: false,
    kernelEffectPermit: false,
  };
}

async function buildT09App(metaSourceOverride?: string): Promise<V10BuiltApp> {
  const [kernel, sdk, router, business, capability, evidenceSource, semanticSource, candidateSource, defaultMetaSource] = await Promise.all([
    readFile(new URL('kernel-mechanism-v1.mjs', payloadDir), 'utf8'),
    readFile(new URL('standard-sdk-v1.mjs', payloadDir), 'utf8'),
    readFile(routerUrl, 'utf8'),
    readFile(new URL('business-meta-feedback-v1.mjs', payloadDir), 'utf8'),
    readFile(capabilityUrl, 'utf8'),
    readFile(new URL('sfeature-decision-evidence-v1.mjs', payloadDir), 'utf8'),
    readFile(new URL('sfeature-semantic-decision-v1.mjs', payloadDir), 'utf8'),
    readFile(new URL('sfeature-candidate-validation-v1.mjs', payloadDir), 'utf8'),
    readFile(new URL('sfeature-meta-feedback-v1.mjs', payloadDir), 'utf8'),
  ]);
  const metaSource = metaSourceOverride ?? defaultMetaSource;
  const routerBody = router.replace(/^export /gm, '');
  const standardBundle = `${sdk}
const __dhv10RouterBundle = (() => {
${routerBody}
return { routeWorkflowIntent };
})();
export const routeWorkflowIntent = __dhv10RouterBundle.routeWorkflowIntent;
`;
  const modules: V10ModuleInput[] = [
    {
      packageId: 'v08-kernel-mechanism@1.0.0', role: 'kernel-primary', abiVersion: 'v08-kernel-abi/1',
      moduleSource: kernel, moduleSha256: sha256HexSource(kernel),
      endpoint: 'occurrence-runtime', dependencies: [], provides: ['kernel:occurrence-runtime/1'], requires: [],
    },
    {
      packageId: 'standard-sdk@v08.1.0.0', role: 'standard-primary', abiVersion: 'v08-standard-sdk-abi/1',
      moduleSource: standardBundle, moduleSha256: sha256HexSource(standardBundle),
      endpoint: 'rule-interpreter', dependencies: [], provides: ['standard:interpret/1', 'standard:route/1'], requires: [],
    },
    {
      packageId: BUSINESS_ID, role: 'business', abiVersion: 'v08-business-abi/1',
      moduleSource: business, moduleSha256: sha256HexSource(business),
      endpoint: 'business-policy', dependencies: [],
      provides: ['business:policy/1', 'intent:recordMetaFeedback', 'intent:closeMetaFeedback'], requires: [],
    },
    {
      packageId: CAPABILITY_ID, role: 'capability', abiVersion: 'v08-capability-abi/1',
      moduleSource: capability, moduleSha256: sha256HexSource(capability),
      endpoint: 'capability-endpoint', dependencies: [], provides: ['capability:ledger/1'], requires: [],
      capabilityId: 'ledger',
      handlers: [{ operationId: 'reserve', handler: 'reserveLedger' }, { operationId: 'preview', handler: 'previewTotal' }],
    },
    await featureEntry({
      fixture: 'sfeature-validation-v1.mjs', moduleSourceOverride: semanticSource,
      featureExport: 'resolveSemanticDecision',
    }),
    await featureEntry({
      fixture: 'sfeature-validation-v1.mjs', moduleSourceOverride: evidenceSource,
      featureExport: 'recordDecisionEvidence',
    }),
    await featureEntry({
      fixture: 'sfeature-validation-v1.mjs', moduleSourceOverride: candidateSource,
      featureExport: 'validateCandidateReport',
    }),
    await featureEntry({
      fixture: 'sfeature-validation-v1.mjs', moduleSourceOverride: metaSource,
      featureExport: 'proposeMetaFeedback',
    }),
  ];
  return buildV10App({
    appId: APP_ID,
    audience: 'aud:v010-t09',
    targetProfile: V10_TARGET_PROFILE,
    modules,
    routes: [
      { intentId: 'recordMetaFeedback', operationId: 'preview', capabilityId: 'ledger', handlerId: 'previewTotal' },
      { intentId: 'closeMetaFeedback', operationId: 'preview', capabilityId: 'ledger', handlerId: 'previewTotal' },
    ],
    hardBudget: { maxStepsPerTurn: 8, maxWorkUnitsPerTurn: 64 },
    buildId: 't09-meta-feedback',
  });
}

const queryAuthority = {
  principal: Object.freeze({ source: 'host-authenticated', subject: 'host:t09', tenantId: TENANT }),
  authorize: () => true,
};

async function activateApp(appToActivate: V10BuiltApp, store: V10DocStore): Promise<V10Activation> {
  return await activateV10App(appToActivate, {
    store,
    tenantId: TENANT,
    now: () => NOW,
    deploymentIdentity: DEPLOYMENT,
    queryAuthority,
  });
}

async function activate(store: V10DocStore): Promise<V10Activation> {
  return await activateApp(app, store);
}

async function seedEvidence(activation: V10Activation, store: V10DocStore): Promise<void> {
  const observer = createDecisionEvidenceObserver({
    facade: activation.facade,
    evidenceFeatureKey: 'standard:decision-evidence/1',
    semanticFeatureKey: 'standard:semantic-decision/1',
  });
  const schema = { id: 'schema:meta', revision: 'r1', provenanceKey: 'approved:t09' };
  const observation = await observer.observeAndRecord({
    intent: {
      intentType: 'recordMetaFeedback',
      instanceKey: 'instance:t09-evidence',
      messageId: 'msg:t09-evidence',
      input: {
        disposition: 'proposal-only',
        effectCount: 0,
        proposalId: 'seed-proposal',
        proposalDigest: 'a'.repeat(64),
        evidenceDigest: 'b'.repeat(64),
      },
    },
    evidence: {
      observationId: 'obs:t09-1',
      schema,
      observedDependencies: [],
    },
    semanticRequest: {
      input: { amount: 30 },
      schema,
      limits: { maxSteps: 8, maxModelCalls: 1, maxToolCalls: 1 },
      rules: [{ id: 'meta-rule', when: { amount: 30 }, decision: { disposition: 'approved' } }],
    },
  });
  assert.equal(observation.kernelReceipt.status, 'admitted', 'the seeded T06 evidence came from a real admitted K receipt');
  await store.put(EVIDENCE_KEY, observation.decisionTrace, { kind: 'create' });

  const candidate = await activation.facade.invokeSelectedStandardFeature(
    'standard:candidate-validation/1',
    candidateRequest,
  ) as Record<string, unknown>;
  assert.equal(candidate.status, 'reported-difference');
  await store.put(CANDIDATE_KEY, candidate, { kind: 'create' });
  await store.put(SHADOW_KEY, shadowReport(app), { kind: 'create' });
}

function roundIntent(round: number): {
  intentType: string;
  instanceKey: string;
  scheduleKey: string;
  round: number;
} {
  return { intentType: 'recordMetaFeedback', instanceKey: MAIN_INSTANCE, scheduleKey: SCHEDULE, round };
}

const sources = { evidenceKeys: [EVIDENCE_KEY], candidateKey: CANDIDATE_KEY, shadowKey: SHADOW_KEY } as const;
const ledgerKeyFor = (round: number): string => `v10-meta-feedback:schedule%3At09-main:${String(round)}`;

async function stateOf(activation: V10Activation): Promise<Record<string, any>> {
  const answer = await activation.facade.queryScopedSnapshot({
    workflowId: 'meta-feedback-loop',
    instanceKey: MAIN_INSTANCE,
  });
  return answer.snapshot as Record<string, any>;
}

async function refusal(promise: Promise<unknown>): Promise<MetaFeedbackError> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof MetaFeedbackError, `expected a MetaFeedbackError, got ${String(error)}`);
    return error;
  }
  assert.fail('expected the meta feedback round to be refused');
}

let dir = '';
let kPath = '';
let app: V10BuiltApp;
let harness: Harness;
let first: MetaFeedbackResult;

async function openHarness(): Promise<Harness> {
  const sqlite = await openSqliteCasStore({ path: kPath });
  const counts: Counts = { gets: 0, puts: 0, removes: 0 };
  const store = v10Store(sqlite, counts);
  const activation = await activate(store);
  return { sqlite, counts, store, activation };
}

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'dh010-t09-meta-'));
  kPath = join(dir, 'k.sqlite');
  app = await buildT09App();
  harness = await openHarness();
  await seedEvidence(harness.activation, harness.store);
});

after(async () => {
  try {
    harness?.activation.dispose();
  } catch {
    // bounded best-effort teardown
  }
  await harness?.sqlite.close();
  for (const suffix of ['', '-wal', '-shm']) {
    if (kPath !== '') await rm(`${kPath}${suffix}`, { force: true });
  }
  if (dir !== '') await rm(dir, { recursive: true, force: true });
});

test('T09-P1 round 1 consumes real evidence and admits exactly one proposal-only business turn', async () => {
  first = await runMetaFeedbackWorkflow({
    facade: harness.activation.facade,
    store: harness.store,
    workflow: roundIntent(1),
    sources,
    now: () => NOW,
  });

  assert.equal(first.status, 'proposed');
  assert.equal(first.replayed, false);
  assert.ok(first.proposals.length >= 1 && first.proposals.length <= 4, 'proposal count is bounded');
  assert.ok(first.proposals.some((proposal) => proposal.kind === 'review-candidate'), 'the candidate difference produced a proposal');
  assert.ok(first.proposals.some((proposal) => proposal.kind === 'shadow-integrity'), 'the shadow difference produced a proposal');
  for (const proposal of first.proposals) {
    assert.equal(proposal.authority, 'proposal-only');
    assert.equal(proposal.canApply, false);
  }
  assert.match(first.proposalDigest as string, HEX64);
  assert.match(first.receiptDigest as string, HEX64);
  assert.equal(first.ledgerKey, ledgerKeyFor(1));
  assert.equal(first.receipt?.status, 'admitted');
  assert.deepEqual(first.authority, {
    proposalOnly: true,
    canApprove: false,
    canPromote: false,
    canActivate: false,
    canPublish: false,
    kernelEffectPermit: false,
  });

  const after = await stateOf(harness.activation);
  assert.equal((after.state as Record<string, unknown>).stateKey, 'collecting', 'the recurring workflow stays in its collecting state');
  assert.equal(after.stateRevision, 1, 'exactly one selected business turn was admitted');
  assert.equal(harness.activation.facade.kCounters(BUSINESS_ID).effectDispatches, 0, 'the meta workflow dispatches no K effect');
  assert.equal(harness.activation.counters.externalEffectDispatches, 0);

  const ledger = await harness.store.get(first.ledgerKey as string);
  assert.ok(ledger !== null && ledger !== undefined, 'the durable ledger row exists');
  assert.equal((ledger.value as Record<string, unknown>).kind, 'v10/meta-feedback-round');
  assert.equal(sha256Canonical(first.receipt), first.receiptDigest);
});

test('T09-P2 replaying the same round is idempotent and starts no second business turn', async () => {
  const before = await stateOf(harness.activation);
  const replay = await runMetaFeedbackWorkflow({
    facade: harness.activation.facade,
    store: harness.store,
    workflow: roundIntent(1),
    sources,
    now: () => NOW,
  });
  assert.equal(replay.status, 'proposed');
  assert.equal(replay.replayed, true);
  assert.equal(replay.proposalDigest, first.proposalDigest);
  assert.equal(replay.receiptDigest, first.receiptDigest);
  assert.deepEqual(replay.proposals, first.proposals);
  const after = await stateOf(harness.activation);
  assert.equal(after.stateRevision, before.stateRevision, 'the replay created no business turn');
});

test('T09-P3 restart replays round 1 and round 2 is a distinct durable turn', async () => {
  harness.activation.dispose();
  await harness.sqlite.close();
  harness = await openHarness();

  const replay = await runMetaFeedbackWorkflow({
    facade: harness.activation.facade,
    store: harness.store,
    workflow: roundIntent(1),
    sources,
    now: () => NOW,
  });
  assert.equal(replay.replayed, true);
  assert.equal(replay.proposalDigest, first.proposalDigest);
  assert.equal(replay.receiptDigest, first.receiptDigest);
  assert.equal((await stateOf(harness.activation)).stateRevision, 1);

  const second = await runMetaFeedbackWorkflow({
    facade: harness.activation.facade,
    store: harness.store,
    workflow: roundIntent(2),
    sources,
    now: () => NOW,
  });
  assert.equal(second.status, 'proposed');
  assert.equal(second.replayed, false);
  assert.equal(second.ledgerKey, ledgerKeyFor(2));
  assert.notEqual(second.receiptDigest, first.receiptDigest, 'round 2 has its own immutable K receipt');
  assert.match(String(second.receipt?.occurrence && (second.receipt.occurrence as Record<string, unknown>).messageId), /:2:/);
  assert.equal((await stateOf(harness.activation)).stateRevision, 2, 'round 2 admitted exactly one new turn');
});

test('T09-N1 no durable observation yields an honest no-observation with zero turn/ledger write', async () => {
  const stateBefore = await stateOf(harness.activation);
  const putsBefore = harness.counts.puts;
  const empty = await runMetaFeedbackWorkflow({
    facade: harness.activation.facade,
    store: harness.store,
    workflow: roundIntent(3),
    sources: { evidenceKeys: [] },
    now: () => NOW,
  });
  assert.equal(empty.status, 'no-observation');
  assert.equal(empty.proposals.length, 0);
  assert.equal(empty.ledgerKey, null);
  assert.equal(empty.receipt, null);
  assert.equal(empty.counters.evidenceRecords, 0);
  assert.equal(harness.counts.puts, putsBefore, 'no ledger row is written');
  assert.equal((await stateOf(harness.activation)).stateRevision, stateBefore.stateRevision);

  const missing = await runMetaFeedbackWorkflow({
    facade: harness.activation.facade,
    store: harness.store,
    workflow: roundIntent(3),
    sources: { evidenceKeys: ['v10/t09/evidence/does-not-exist'] },
    now: () => NOW,
  });
  assert.equal(missing.status, 'no-observation');
  assert.equal(missing.counters.missingEvidence, 1);
  assert.equal(harness.counts.puts, putsBefore);
});

test('T09-N2 malformed and oversized durable evidence refuse before any turn or ledger write', async () => {
  const stateBefore = await stateOf(harness.activation);
  await harness.store.put('v10/t09/evidence/malformed', 'not-a-record', { kind: 'create' });
  const malformed = await refusal(runMetaFeedbackWorkflow({
    facade: harness.activation.facade,
    store: harness.store,
    workflow: roundIntent(4),
    sources: { evidenceKeys: ['v10/t09/evidence/malformed'] },
    now: () => NOW,
  }));
  assert.equal(malformed.code, 'META_EVIDENCE_INVALID');

  const oversized = { padding: 'x'.repeat(70_000) };
  await harness.store.put('v10/t09/evidence/oversized', oversized, { kind: 'create' });
  const putsAfterSeed = harness.counts.puts;
  const tooLarge = await refusal(runMetaFeedbackWorkflow({
    facade: harness.activation.facade,
    store: harness.store,
    workflow: roundIntent(4),
    sources: { evidenceKeys: ['v10/t09/evidence/oversized'] },
    now: () => NOW,
  }));
  assert.equal(tooLarge.code, 'META_EVIDENCE_OVERSIZED');
  assert.equal(harness.counts.puts, putsAfterSeed, 'the refused round wrote no ledger row');
  assert.equal((await stateOf(harness.activation)).stateRevision, stateBefore.stateRevision);
});

test('T09-N3 authority/effect material in consumed records is refused with unchanged K state', async () => {
  const stateBefore = await stateOf(harness.activation);
  const putsBefore = harness.counts.puts;
  await harness.store.put('v10/t09/evidence/self-approve', {
    kernelOutcome: 'denied', selfApprove: true,
  }, { kind: 'create' });
  const selfApprove = await refusal(runMetaFeedbackWorkflow({
    facade: harness.activation.facade,
    store: harness.store,
    workflow: roundIntent(5),
    sources: { evidenceKeys: ['v10/t09/evidence/self-approve'] },
    now: () => NOW,
  }));
  assert.equal(selfApprove.code, 'META_AUTHORITY_FORBIDDEN');

  await harness.store.put('v10/t09/candidate/effect', {
    ...candidatePins,
    effectIntents: [],
    status: 'reported-match',
  }, { kind: 'create' });
  const effect = await refusal(runMetaFeedbackWorkflow({
    facade: harness.activation.facade,
    store: harness.store,
    workflow: roundIntent(5),
    sources: { evidenceKeys: [EVIDENCE_KEY], candidateKey: 'v10/t09/candidate/effect' },
    now: () => NOW,
  }));
  assert.equal(effect.code, 'META_AUTHORITY_FORBIDDEN');
  assert.equal(harness.counts.puts, putsBefore + 2, 'only the two seeded malicious records were written');
  assert.equal((await stateOf(harness.activation)).stateRevision, stateBefore.stateRevision, 'no business turn ran');
  assert.equal(harness.activation.facade.kCounters(BUSINESS_ID).effectDispatches, 0);
  assert.equal(harness.activation.counters.externalEffectDispatches, 0);
});

test('T09-N4 invalid rounds and conflicting ledger reuse fail typed before a turn', async () => {
  for (const round of [0, 33, 1.5]) {
    const error = await refusal(runMetaFeedbackWorkflow({
      facade: harness.activation.facade,
      store: harness.store,
      workflow: roundIntent(round),
      sources,
      now: () => NOW,
    }));
    assert.equal(error.code, 'META_ROUND_INVALID');
  }

  const stateBefore = await stateOf(harness.activation);
  const conflictingKey = ledgerKeyFor(6);
  await harness.store.put(conflictingKey, {
    kind: 'v10/meta-feedback-round',
    scheduleKey: SCHEDULE,
    round: 6,
    inputDigest: 'f'.repeat(64),
    proposalDigest: 'f'.repeat(64),
    proposals: [],
    receipt: { status: 'admitted' },
    receiptDigest: 'f'.repeat(64),
    createdAt: new Date(NOW).toISOString(),
  }, { kind: 'create' });
  const conflict = await refusal(runMetaFeedbackWorkflow({
    facade: harness.activation.facade,
    store: harness.store,
    workflow: roundIntent(6),
    sources,
    now: () => NOW,
  }));
  assert.equal(conflict.code, 'META_ROUND_CONFLICT');
  assert.equal((await stateOf(harness.activation)).stateRevision, stateBefore.stateRevision);
});

test('T09-N5 the pure selected feature itself refuses authority-shaped material', async () => {
  const source = await readFile(new URL('sfeature-meta-feedback-v1.mjs', payloadDir), 'utf8');
  const feature = await import(`data:text/javascript;base64,${Buffer.from(source, 'utf8').toString('base64')}`) as {
    proposeMetaFeedback: (request: unknown) => unknown;
  };
  const hasCode = (code: string) => (error: unknown): boolean =>
    error !== null && typeof error === 'object' && (error as { code?: string }).code === code;
  for (const request of [
    { observations: [{ selfApprove: true }] },
    { observations: [{ kernelEffectPermit: true }] },
    { candidate: { effectIntents: [] } },
  ]) {
    assert.throws(() => feature.proposeMetaFeedback(request), hasCode('META_FEEDBACK_AUTHORITY_FORBIDDEN'));
  }
  assert.throws(
    () => feature.proposeMetaFeedback({ observations: new Array(9).fill({ kernelOutcome: 'admitted' }) }),
    hasCode('META_FEEDBACK_OVERSIZED'),
  );
});

const MALICIOUS_META_SOURCE = `
export const MODULE_ID = 'sfeature-meta-feedback-malicious@v010.1.0.0';
export const PACKAGE_KIND = 'standard-feature';
export const FEATURE_ABI = 'dh.v10.standard-feature/1';
export const FEATURE_KEY = 'standard:meta-feedback/1';
export function init(context) {
  return { ok: true, featureKey: FEATURE_KEY, observedContext: { appId: context.appId } };
}
export function proposeMetaFeedback() {
  return {
    kind: 'proposal-only',
    proposalOnly: true,
    canApprove: true,
    canPromote: false,
    canActivate: false,
    canPublish: false,
    kernelEffectPermit: false,
    proposals: [{
      proposalId: 'p-malicious', kind: 'promote', summary: 'self approve',
      evidenceRefs: [], authority: 'proposal-only', canApply: false,
    }],
    counters: { observations: 1, proposals: 1 },
    budget: { maxProposals: 4 },
  };
}
`;

test('T09-N6 a malicious selected proposal feature is refused before any K or ledger mutation', async () => {
  const maliciousPath = join(dir, 'k-malicious.sqlite');
  const maliciousSqlite = await openSqliteCasStore({ path: maliciousPath });
  const counts: Counts = { gets: 0, puts: 0, removes: 0 };
  const store = v10Store(maliciousSqlite, counts);
  const maliciousApp = await buildT09App(MALICIOUS_META_SOURCE);
  const activation = await activateApp(maliciousApp, store);
  try {
    for (const key of [EVIDENCE_KEY, CANDIDATE_KEY, SHADOW_KEY]) {
      const doc = await harness.store.get(key);
      assert.ok(doc !== null && doc !== undefined, `the source record ${key} exists`);
      await store.put(key, doc.value, { kind: 'create' });
    }
    const putsAfterSeed = counts.puts;
    const error = await refusal(runMetaFeedbackWorkflow({
      facade: activation.facade,
      store,
      workflow: roundIntent(1),
      sources,
      now: () => NOW,
    }));
    assert.equal(error.code, 'META_PROPOSAL_INVALID');
    assert.equal(counts.puts, putsAfterSeed, 'the malicious proposal wrote no ledger row');
    assert.equal(activation.facade.kCounters(BUSINESS_ID).effectDispatches, 0);
    assert.equal(activation.counters.externalEffectDispatches, 0);
    const keys = await store.keys();
    assert.equal(
      keys.some((key) => key.includes('t09-main')),
      false,
      'the malicious proposal admitted no business turn',
    );
  } finally {
    activation.dispose();
    await maliciousSqlite.close();
    for (const suffix of ['', '-wal', '-shm']) {
      await rm(`${maliciousPath}${suffix}`, { force: true });
    }
  }
});
