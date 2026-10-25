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
 *           business turn and writes one durable claim + ledger row.
 *   T09-P2  the same round is idempotent: same proposal/receipt, no second
 *           business turn.
 *   T09-P3  after a real SQLite close/reopen the same round still replays and
 *           round 2 creates exactly one new durable turn.
 *   T09-N1  no evidence => honest no-observation with zero turn/ledger write.
 *   T09-N2  malformed/oversized evidence fails typed before any turn/write.
 *   T09-N3  authority/effect material in any consumed record is typed refused
 *           and leaves K State/Journal/Effect unchanged.
 *   T09-N4  invalid rounds, foreign-scope evidence and conflicting ledger
 *           reuse fail typed.
 */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after, before } from 'node:test';

import { sha256Canonical, type V10BuiltApp } from '@kaicreator/domain-harness-contracts';
import {
  META_FEEDBACK_ABI,
  META_FEEDBACK_CLAIM_STATE,
  META_FEEDBACK_LEDGER_KIND,
  META_FEEDBACK_LEDGER_STATE,
  runMetaFeedbackWorkflow,
  type MetaFeedbackResult,
} from '@kaicreator/domain-harness-host-node';
import {
  BUSINESS_ID,
  CANDIDATE_KEY,
  EVIDENCE_KEY,
  HEX64,
  MAIN_INSTANCE,
  NOW,
  SCHEDULE,
  SCOPE,
  SHADOW_KEY,
  buildT09App,
  candidatePins,
  claimKeyFor,
  evidenceKeyFor,
  ledgerKeyFor,
  openHarness,
  metaFeedbackFeatureUrl,
  refusal,
  roundIntent,
  seedEvidence,
  sources,
  stateOf,
  type Harness,
} from './v010-t09-meta-fixture.js';

assert.equal(
  Number(process.versions.node.split('.')[0]),
  24,
  `the T09 meta feedback physical witness targets Node24 (running ${process.versions.node})`,
);

let dir = '';
let kPath = '';
let app: V10BuiltApp;
let harness: Harness;
let first: MetaFeedbackResult;

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'dh010-t09-meta-'));
  kPath = join(dir, 'k.sqlite');
  app = await buildT09App();
  harness = await openHarness(kPath, { app });
  await seedEvidence(harness.activation, harness.store, { app });
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
  assert.equal(first.recovered, false);
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
  assert.equal(first.claimKey, claimKeyFor(1));
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

  const claim = await harness.store.get(claimKeyFor(1));
  assert.ok(claim !== null && claim !== undefined, 'the durable pre-admission reservation exists');
  assert.equal((claim.value as Record<string, unknown>).kind, 'v10/meta-feedback-round-claim');
  assert.equal((claim.value as Record<string, unknown>).state, META_FEEDBACK_CLAIM_STATE);

  const ledger = await harness.store.get(first.ledgerKey as string);
  assert.ok(ledger !== null && ledger !== undefined, 'the durable ledger row exists');
  assert.equal((ledger.value as Record<string, unknown>).kind, 'v10/meta-feedback-round');
  assert.equal((ledger.value as Record<string, unknown>).abi, META_FEEDBACK_ABI);
  assert.equal((ledger.value as Record<string, unknown>).state, META_FEEDBACK_LEDGER_STATE);
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
  assert.equal(replay.recovered, false);
  assert.equal(replay.proposalDigest, first.proposalDigest);
  assert.equal(replay.receiptDigest, first.receiptDigest);
  assert.deepEqual(replay.proposals, first.proposals);
  assert.equal(replay.claimKey, claimKeyFor(1));
  const after = await stateOf(harness.activation);
  assert.equal(after.stateRevision, before.stateRevision, 'the replay created no business turn');
});

test('T09-P3 restart replays round 1 and round 2 is a distinct durable turn', async () => {
  harness.activation.dispose();
  await harness.sqlite.close();
  harness = await openHarness(kPath, { app });
  const replay = await runMetaFeedbackWorkflow({
    facade: harness.activation.facade,
    store: harness.store,
    workflow: roundIntent(1),
    sources,
    now: () => NOW,
  });
  assert.equal(replay.replayed, true);
  assert.equal(replay.recovered, false);
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
  assert.equal(second.recovered, false);
  assert.equal(second.ledgerKey, ledgerKeyFor(2));
  assert.equal(second.claimKey, claimKeyFor(2));
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
  assert.equal(empty.claimKey, null);
  assert.equal(empty.receipt, null);
  assert.equal(empty.counters.evidenceRecords, 0);
  assert.equal(harness.counts.puts, putsBefore, 'no ledger row is written');
  assert.equal((await stateOf(harness.activation)).stateRevision, stateBefore.stateRevision);

  const missing = await runMetaFeedbackWorkflow({
    facade: harness.activation.facade,
    store: harness.store,
    workflow: roundIntent(3),
    sources: { evidenceKeys: [evidenceKeyFor('evidence/does-not-exist')] },
    now: () => NOW,
  });
  assert.equal(missing.status, 'no-observation');
  assert.equal(missing.counters.missingEvidence, 1);
  assert.equal(harness.counts.puts, putsBefore);
});

test('T09-N2 malformed and oversized durable evidence refuse before any turn or ledger write', async () => {
  const stateBefore = await stateOf(harness.activation);
  const malformedKey = evidenceKeyFor('evidence/malformed');
  await harness.store.put(malformedKey, 'not-a-record', { kind: 'create' });
  const malformed = await refusal(runMetaFeedbackWorkflow({
    facade: harness.activation.facade,
    store: harness.store,
    workflow: roundIntent(4),
    sources: { evidenceKeys: [malformedKey] },
    now: () => NOW,
  }));
  assert.equal(malformed.code, 'META_EVIDENCE_INVALID');

  const oversizedKey = evidenceKeyFor('evidence/oversized');
  const oversized = { padding: 'x'.repeat(70_000) };
  await harness.store.put(oversizedKey, oversized, { kind: 'create' });
  const putsAfterSeed = harness.counts.puts;
  const tooLarge = await refusal(runMetaFeedbackWorkflow({
    facade: harness.activation.facade,
    store: harness.store,
    workflow: roundIntent(4),
    sources: { evidenceKeys: [oversizedKey] },
    now: () => NOW,
  }));
  assert.equal(tooLarge.code, 'META_EVIDENCE_OVERSIZED');
  assert.equal(harness.counts.puts, putsAfterSeed, 'the refused round wrote no ledger row');
  assert.equal((await stateOf(harness.activation)).stateRevision, stateBefore.stateRevision);
});

test('T09-N3 authority/effect material in consumed records is refused with unchanged K state', async () => {
  const stateBefore = await stateOf(harness.activation);
  const putsBefore = harness.counts.puts;
  const selfApproveKey = evidenceKeyFor('evidence/self-approve');
  await harness.store.put(selfApproveKey, {
    kernelOutcome: 'denied', selfApprove: true,
  }, { kind: 'create' });
  const selfApprove = await refusal(runMetaFeedbackWorkflow({
    facade: harness.activation.facade,
    store: harness.store,
    workflow: roundIntent(5),
    sources: { evidenceKeys: [selfApproveKey] },
    now: () => NOW,
  }));
  assert.equal(selfApprove.code, 'META_AUTHORITY_FORBIDDEN');

  const effectCandidateKey = evidenceKeyFor('candidate/effect');
  await harness.store.put(effectCandidateKey, {
    ...candidatePins,
    effectIntents: [],
    status: 'reported-match',
  }, { kind: 'create' });
  const effect = await refusal(runMetaFeedbackWorkflow({
    facade: harness.activation.facade,
    store: harness.store,
    workflow: roundIntent(5),
    sources: { evidenceKeys: [EVIDENCE_KEY], candidateKey: effectCandidateKey },
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

  const outsidePrefix = await refusal(runMetaFeedbackWorkflow({
    facade: harness.activation.facade,
    store: harness.store,
    workflow: roundIntent(7),
    sources: { evidenceKeys: ['v10/k/not-meta-evidence'] },
    now: () => NOW,
  }));
  assert.equal(outsidePrefix.code, 'META_OPTIONS_INVALID');

  const foreignScope = await refusal(runMetaFeedbackWorkflow({
    facade: harness.activation.facade,
    store: harness.store,
    workflow: roundIntent(7),
    sources: { evidenceKeys: ['v10/t09/evidence/legacy-global'] },
    now: () => NOW,
  }));
  assert.equal(foreignScope.code, 'META_EVIDENCE_FOREIGN_SCOPE');

  const otherIntent = await refusal(runMetaFeedbackWorkflow({
    facade: harness.activation.facade,
    store: harness.store,
    workflow: { ...roundIntent(7), intentType: 'closeMetaFeedback' },
    sources,
    now: () => NOW,
  }));
  assert.equal(otherIntent.code, 'META_OPTIONS_INVALID');

  const stateBefore = await stateOf(harness.activation);
  const conflictingKey = ledgerKeyFor(6);
  const seededProposals = [{
    proposalId: 'p-seeded', kind: 'no-action', summary: 'seeded',
    evidenceRefs: [] as string[], authority: 'proposal-only', canApply: false,
  }];
  await harness.store.put(conflictingKey, {
    kind: META_FEEDBACK_LEDGER_KIND,
    abi: META_FEEDBACK_ABI,
    state: META_FEEDBACK_LEDGER_STATE,
    scope: SCOPE,
    instanceKey: MAIN_INSTANCE,
    scheduleKey: SCHEDULE,
    round: 6,
    inputDigest: 'f'.repeat(64),
    proposalDigest: sha256Canonical(seededProposals),
    proposals: seededProposals,
    receipt: { status: 'admitted' },
    receiptDigest: sha256Canonical({ status: 'admitted' }),
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
  const source = await readFile(metaFeedbackFeatureUrl, 'utf8');
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
  const maliciousHarness = await openHarness(maliciousPath, { app: await buildT09App(MALICIOUS_META_SOURCE) });
  const { activation, store, counts, sqlite } = maliciousHarness;
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
    await sqlite.close();
    for (const suffix of ['', '-wal', '-shm']) {
      await rm(`${maliciousPath}${suffix}`, { force: true });
    }
  }
});
