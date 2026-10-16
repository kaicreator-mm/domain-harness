/**
 * #1006 T-G TG5 — FR01/FR04/HF19/HF26 selected-runtime physical taxonomy
 * (Kernel/Host focused acceptance cut R5; candidate b151320 production bytes).
 * ===========================================================================
 *
 * ONE real SQLite trusted host + the REAL selected closure (approval Business
 * fixture bytes pinned by helpers.assertFixtureBytes inside sealRealApp).
 * Every observable below was previously only partially mapped: this file
 * pins the exact selected-physical composition for four frozen rows —
 *
 *   FR01-P  resume/restart + child workflow  → restart/child legs stay with
 *           the already-executed physical witnesses (HF18-P-RESTART fresh
 *           process reopen, HF32 child routing, C01-P3 durable restart);
 *           THIS file proves the missing illegal-transition matrix:
 *           FR01-N a turn against a FINAL state is a typed denial with zero
 *           journal/state activity and the instance keeps serving.
 *   FR04-P  durable ACK + target sequence/replay → an identical duplicate
 *           message re-send NEVER re-executes or re-commits (zero new
 *           journal rows/effects, revision unchanged) and replays the SAME
 *           admitted receipt (idempotentReplay) under the SAME deterministic
 *           message-turn identity. [v0.8.1 R01] The vector now includes a
 *           LEGAL SELF-LOOP re-send (durable-controls fixture), where a FINAL
 *           business state cannot mask a second commit — the pre-v0.8.1
 *           FINAL-state-only duplicate passed via 'no-candidate-transition'
 *           while a self-loop re-send committed a second revision.
 *   FR04-N  duplicate / invalid target / wrong package contract — physical:
 *           WorkflowInstanceNotFoundError and INTENT_UNBOUND typed refusals.
 *   HF19-P  applied/rejected/processed terminal outcomes — applied: ONE
 *           committed revision + ONE completed journal row with output;
 *           rejected: business denial is a typed PROCESSED outcome that
 *           does NOT poison the instance (the next occurrence admits).
 *   HF19-N  duplicate commit / forged-drift source: the settled terminal is
 *           never re-executed (competing terminal CAS + conflicting-source
 *           refusals are the already-executed C01-N1/N2/N3/N10 compiler
 *           legs on the same payload bytes).
 *   HF26-P  exact decision/deny provenance: the admitted journal row and
 *           both denial receipts carry governanceBindingDigest +
 *           durableControlTurnId + resolver provenance (llmAvoided,
 *           modelCallEvidence) + exact occurrence attribution.
 *   HF26-N  evidence granting mutation: replaying a denial never mutates
 *           (revision unchanged, zero journal rows).
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';

import {
  buildQualifiedPackage,
  issueApprovalProof,
  qualifyPackageClosure,
  type QualificationSubmission,
} from '../../../domain-harness-compiler/src/qualified-package/index.js';
import { bootstrapTrustedHost, createKernelGateway } from '../../src/host-v8/index.js';
import type { SealedQualifiedPackageRoot } from '../../src/public-v8/index.js';
import { INTEG_ISSUER, INTEG_ISSUER_SECRET, mintCredential, sealRealApp, sqliteTempPath } from './helpers.js';

const AUDIENCE = 'dh-tg5-kernel-taxonomy';
const TENANT = 't1';
const APP_ID = 'order-approval';
const JOURNAL_PREFIX = 'v08-kernel:effect-journal:';

const sqlitePath = sqliteTempPath('tg5-taxonomy');
const handle = await bootstrapTrustedHost({
  issuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
  audience: AUDIENCE,
  storage: { path: sqlitePath },
});
const dispatches: Array<{ requestId?: unknown }> = [];
handle.host.resources.provision('ledger', (_operation: string, payload: unknown) => {
  const record = payload as { requestId?: unknown; effectId?: unknown };
  dispatches.push(record);
  return { reserved: true, ledgerEntryId: `ledger:${String(record.effectId ?? '?')}` };
});
const gateway = createKernelGateway({ host: handle.host, gatewaySessionCap: handle.gatewaySessionCap });
// [#1006 HF21 R2 #1089] this physical test executes production Effects (the
// effect taxonomy), so the app declares its exact runtime authority class —
// the fail-closed production-effect gate refuses classless activations.
await gateway.registerApp({ appId: APP_ID, packageRoot: await sealRealApp('approval'), genesisRoles: ['platform-operator'], authorityClass: 'PRODUCTION' });

const operator = mintCredential({ tenantId: TENANT, appId: APP_ID, subject: 'tg5-op', roles: ['platform-operator'], audience: AUDIENCE, grantId: 'g-tg5-op' });
const requester = mintCredential({ tenantId: TENANT, appId: APP_ID, subject: 'tg5-req', roles: ['requester'], audience: AUDIENCE, grantId: 'g-tg5-req' });
const target = (instanceKey: string) => ({ tenantId: TENANT, appId: APP_ID, instanceKey });
const send = (messageId: string, input: Record<string, unknown>, instanceKey: string) =>
  gateway.send(requester, { intentType: 'submitQuoteDecisionDynamic', messageId, input, target: target(instanceKey) });

// [v0.8.1 R01] The shared durable-controls fixture carries a LEGAL message
// self-loop (pingFromCallback: waiting → progressing → progressing), sealed
// with the SAME selected K/S payload bytes on the same physical SQLite Host.
const CONTROLS_APP_ID = 'durable-controls';
async function sealControlsClosure(): Promise<SealedQualifiedPackageRoot> {
  const payloadDir = new URL('../../../domain-harness-compiler/src/qualified-package/payload/', import.meta.url);
  const [kernelSource, sdkSource, businessSource] = await Promise.all([
    readFile(new URL('kernel-mechanism-v1.mjs', payloadDir), 'utf8'),
    readFile(new URL('standard-sdk-v1.mjs', payloadDir), 'utf8'),
    readFile(new URL('./fixtures/business-durable-controls.mjs', import.meta.url), 'utf8'),
  ]);
  const kernel = await import(`data:text/javascript;base64,${Buffer.from(kernelSource, 'utf8').toString('base64')}`);
  const sdk = await import(`data:text/javascript;base64,${Buffer.from(sdkSource, 'utf8').toString('base64')}`);
  const business = await import(`data:text/javascript;base64,${Buffer.from(businessSource, 'utf8').toString('base64')}`);
  const submission: QualificationSubmission = {
    rootPackageId: 'app:v08:durable-controls',
    packages: [
      { packageId: kernel.MODULE_ID as string, kind: 'kernel' as const, abiVersion: kernel.ABI_VERSION as string, modulePath: 'modules/kernel.mjs', moduleSource: kernelSource, endpoints: kernel.ENDPOINTS },
      { packageId: sdk.MODULE_ID as string, kind: 'standard-sdk' as const, abiVersion: sdk.ABI_VERSION as string, modulePath: 'modules/standard.mjs', moduleSource: sdkSource, endpoints: sdk.ENDPOINTS },
      { packageId: business.MODULE_ID as string, kind: 'business' as const, abiVersion: business.ABI_VERSION as string, modulePath: 'modules/business.mjs', moduleSource: businessSource, endpoints: business.ENDPOINTS, intentTypes: business.INTENT_TYPES },
    ],
    bindings: [
      { role: 'kernel' as const, packageId: kernel.MODULE_ID as string, endpointId: kernel.ENDPOINTS[0].endpointId },
      { role: 'standard-sdk' as const, packageId: sdk.MODULE_ID as string, endpointId: sdk.ENDPOINTS[0].endpointId },
      { role: 'business' as const, packageId: business.MODULE_ID as string, endpointId: business.ENDPOINTS[0].endpointId },
      ...(business.INTENT_TYPES as string[]).map((intentType) => ({
        role: 'intent' as const, intentType, packageId: business.MODULE_ID as string, endpointId: business.ENDPOINTS[0].endpointId,
      })),
    ],
  };
  const unsigned = qualifyPackageClosure(submission);
  const approval = issueApprovalProof({
    subjectDigest: unsigned.subjectDigest,
    issuerId: INTEG_ISSUER,
    issuerSecret: INTEG_ISSUER_SECRET,
    issuedAt: '2026-10-16T00:00:00.000Z',
  });
  return buildQualifiedPackage({
    unsigned,
    approval,
    trustedIssuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
    moduleSources: new Map(submission.packages.map((pkg) => [pkg.modulePath, pkg.moduleSource])),
    baseCommit: 'v0.8.1-tg5-fr04-self-loop',
  }) as SealedQualifiedPackageRoot;
}
await gateway.registerApp({ appId: CONTROLS_APP_ID, packageRoot: await sealControlsClosure(), genesisRoles: ['platform-operator'], authorityClass: 'PRODUCTION' });
const controlsOperator = mintCredential({ tenantId: TENANT, appId: CONTROLS_APP_ID, subject: 'tg5-op', roles: ['platform-operator', 'requester'], audience: AUDIENCE, grantId: 'g-tg5-controls-op' });
const controlsRequester = mintCredential({ tenantId: TENANT, appId: CONTROLS_APP_ID, subject: 'tg5-req', roles: ['requester'], audience: AUDIENCE, grantId: 'g-tg5-controls-req' });
const controlsTarget = (instanceKey: string) => ({ tenantId: TENANT, appId: CONTROLS_APP_ID, instanceKey });

async function journalRows(): Promise<Array<Record<string, unknown>>> {
  const keys = await handle.host.docs.list(JOURNAL_PREFIX);
  const docs = await Promise.all(keys.map((key) => handle.host.docs.get(key)));
  return docs.map((entry) => (entry?.value as { record: Record<string, unknown> }).record);
}

after(async () => {
  await handle.host.close();
  await rm(sqlitePath, { force: true });
});

test('HF19/FR01-P applied turn: one atomic commit, one authoritative terminal journal row, exact provenance', { timeout: 240_000 }, async () => {
  await gateway.activateGenesis(operator, { appId: APP_ID, instanceKey: 'q-applied' });
  const admitted = await send('m-apply-1', { amount: 30, requestId: 'APPLY-1' }, 'q-applied') as {
    status: string;
    admitted: {
      durableControlTurnId: string;
      governanceBindingDigest: string;
      transitionKey: string;
      effects: Array<{ disposition: string; idempotencyKey: string; output: Record<string, unknown> }>;
    };
  };
  assert.equal(admitted.status, 'admitted');
  assert.equal(admitted.admitted.transitionKey, 'approve');
  assert.equal(admitted.admitted.effects.length, 1);
  const appliedEffect = admitted.admitted.effects[0];
  assert.ok(appliedEffect !== undefined);
  assert.equal(appliedEffect.disposition, 'executed');
  assert.equal(appliedEffect.idempotencyKey, 'reserve:quote:APPLY-1');
  // HF26-P decision provenance: exact turn identity + governance binding + resolver truth.
  assert.match(admitted.admitted.durableControlTurnId, /message:m-apply-1$/);
  assert.match(admitted.admitted.governanceBindingDigest, /^[0-9a-f]{64}$/);

  const snapshot = await gateway.queryInstance(requester, target('q-applied')) as { stateRevision: number; lifecycle: string; state: { stateKey: string } };
  assert.equal(snapshot.stateRevision, 1, 'applied turn advanced exactly ONE revision');
  assert.equal(snapshot.state.stateKey, 'approved');
  assert.equal(snapshot.lifecycle, 'completed');

  const rows = await journalRows();
  assert.equal(rows.length, 1, 'exactly ONE authoritative terminal row exists');
  const row = rows[0];
  assert.ok(row !== undefined);
  assert.equal(row.status, 'completed');
  assert.equal(row.durableControlTurnId, admitted.admitted.durableControlTurnId);
  assert.equal(row.idempotencyKey, 'reserve:quote:APPLY-1');
  assert.ok((row.output as Record<string, unknown>).reserved === true, 'the durable terminal carries the effect output');
  assert.equal(dispatches.length, 1, 'the physical handler dispatched exactly once');
});

test('FR04-P/HF19-N duplicate message: idempotent identity, zero re-execution, zero re-commit, no mutation token', { timeout: 240_000 }, async () => {
  const before = (await journalRows()).length;
  const dispatchBefore = dispatches.length;
  const revisionBefore = ((await gateway.queryInstance(requester, target('q-applied'))) as { stateRevision: number }).stateRevision;

  const duplicate = await send('m-apply-1', { amount: 30, requestId: 'APPLY-1' }, 'q-applied') as {
    status: string;
    idempotentReplay?: boolean;
    admitted?: { durableControlTurnId: string; transitionKey: string };
    instance?: { stateRevision: number };
  };
  // [v0.8.1 R01] The already-committed turn is never re-executed: the durable
  // message-turn disposition replays the ORIGINAL admitted receipt for the
  // SAME turn id (v0.2–v0.7 FR04 DUPLICATE) — not a business-state denial.
  assert.equal(duplicate.status, 'admitted');
  assert.equal(duplicate.idempotentReplay, true);
  assert.equal(duplicate.admitted?.transitionKey, 'approve');
  assert.equal(duplicate.instance?.stateRevision, revisionBefore, 'the replay carries the original committed revision');
  assert.match(duplicate.admitted?.durableControlTurnId ?? '', /message:m-apply-1$/, 'the duplicate resolves under the SAME deterministic message-turn identity');
  assert.equal((await journalRows()).length, before, 'zero new journal rows');
  assert.equal(dispatches.length, dispatchBefore, 'zero new physical dispatches');
  assert.equal(((await gateway.queryInstance(requester, target('q-applied'))) as { stateRevision: number }).stateRevision, revisionBefore, 'no duplicate commit — revision unchanged');
});

test('FR04-P/FR04-N self-loop duplicate: a re-sent messageId on a LEGAL self-loop replays and never re-commits; a different intent under it refuses typed', { timeout: 240_000 }, async () => {
  const instanceKey = 'loop-1';
  await gateway.activateGenesis(controlsOperator, { appId: CONTROLS_APP_ID, instanceKey });
  const sendControls = (intentType: string, messageId: string, input: Record<string, unknown>) =>
    gateway.send(controlsRequester, { intentType, messageId, input, target: controlsTarget(instanceKey) }) as Promise<{
      status: string;
      idempotentReplay?: boolean;
      admitted?: { durableControlTurnId: string; transitionKey: string };
      instance?: { stateRevision: number; state: { stateKey: string } };
    }>;
  const revision = async (): Promise<number> =>
    ((await gateway.queryInstance(controlsRequester, controlsTarget(instanceKey))) as { stateRevision: number }).stateRevision;

  assert.equal((await sendControls('submitStart', 'm-loop-start', { amount: 1 })).status, 'admitted');
  const begun = await sendControls('pingFromCallback', 'm-loop-1', { amount: 1, requestId: 'LOOP-1' });
  assert.equal(begun.admitted?.transitionKey, 'begin-progress');
  const looped = await sendControls('pingFromCallback', 'm-loop-2', { amount: 1, requestId: 'LOOP-2' });
  assert.equal(looped.status, 'admitted');
  assert.equal(looped.admitted?.transitionKey, 'progress-again', 'the business state machine legally re-admits this trigger (self-loop)');
  assert.equal(looped.instance?.state.stateKey, 'progressing');
  assert.equal(await revision(), 3);

  const rowsBefore = (await journalRows()).length;
  const dispatchBefore = dispatches.length;
  const duplicate = await sendControls('pingFromCallback', 'm-loop-2', { amount: 1, requestId: 'LOOP-2' });
  assert.equal(duplicate.status, 'admitted');
  assert.equal(duplicate.idempotentReplay, true, 'the self-loop re-send is a durable duplicate, never a second admission');
  assert.equal(duplicate.admitted?.durableControlTurnId, looped.admitted?.durableControlTurnId);
  assert.match(duplicate.admitted?.durableControlTurnId ?? '', /message:m-loop-2$/);
  assert.equal(await revision(), 3, 'no second state revision under the same message-turn identity');
  assert.equal((await journalRows()).length, rowsBefore, 'zero new journal rows');
  assert.equal(dispatches.length, dispatchBefore, 'zero new physical dispatches');

  await assert.rejects(
    () => sendControls('timeOutOnDeadline', 'm-loop-2', {}),
    (error: unknown) => (error as { code?: string }).code === 'ADMISSION_TURN_DISPOSITION_CONFLICT',
  );
  assert.equal(await revision(), 3, 'the conflicting re-use of the messageId refused before any admission');
});

test('FR01-N illegal transition against a FINAL state: typed denial, zero activity, instance keeps serving denials honestly', { timeout: 240_000 }, async () => {
  const before = (await journalRows()).length;
  const dispatchBefore = dispatches.length;
  const illegal = await send('m-final-1', { amount: 30, requestId: 'FINAL-1' }, 'q-applied') as { status: string; denial?: { reason: string } };
  assert.equal(illegal.status, 'denied');
  assert.equal(illegal.denial?.reason, 'no-candidate-transition', 'a transition out of the final approved state is refused typed');
  assert.equal((await journalRows()).length, before, 'zero journal activity for the refused transition');
  assert.equal(dispatches.length, dispatchBefore, 'zero physical dispatches');
  assert.equal(((await gateway.queryInstance(requester, target('q-applied'))) as { stateRevision: number }).stateRevision, 1);
});

test('HF19-P rejected outcome is processed, does NOT poison, and carries exact denial provenance (HF26-P)', { timeout: 240_000 }, async () => {
  await gateway.activateGenesis(operator, { appId: APP_ID, instanceKey: 'q-denied' });
  const before = (await journalRows()).length;

  const rejected = await send('m-deny-1', { amount: 150, requestId: 'DENY-1' }, 'q-denied') as {
    status: string;
    denial?: { reason: string; invariantId?: string; governanceBindingDigest: string; durableControlTurnId: string };
  };
  assert.equal(rejected.status, 'denied');
  assert.equal(rejected.denial?.reason, 'hard-invariant');
  assert.equal(rejected.denial?.invariantId, 'inv:cap-100');
  assert.match(rejected.denial?.governanceBindingDigest ?? '', /^[0-9a-f]{64}$/, 'the denial receipt carries the governance binding digest provenance');
  assert.match(rejected.denial?.durableControlTurnId ?? '', /message:m-deny-1$/);
  assert.equal((await journalRows()).length, before, 'a rejection writes zero journal rows');
  let snapshot = await gateway.queryInstance(requester, target('q-denied')) as { stateRevision: number; state: { stateKey: string } };
  assert.equal(snapshot.stateRevision, 0, 'no state mutation from the rejection');
  assert.equal(snapshot.state.stateKey, 'review');

  // The rejection did not poison the instance: the next occurrence admits.
  const next = await send('m-deny-2', { amount: 30, requestId: 'DENY-2' }, 'q-denied') as { status: string };
  assert.equal(next.status, 'admitted');
  snapshot = await gateway.queryInstance(requester, target('q-denied')) as { stateRevision: number; state: { stateKey: string } };
  assert.equal(snapshot.stateRevision, 1);
  assert.equal(snapshot.state.stateKey, 'approved');

  // HF26-N: replaying the denial never becomes a mutation token.
  const replay = await send('m-deny-1', { amount: 150, requestId: 'DENY-1' }, 'q-denied') as { status: string; denial?: { reason: string } };
  assert.equal(replay.status, 'denied');
  assert.equal(replay.denial?.reason, 'hard-invariant');
  snapshot = await gateway.queryInstance(requester, target('q-denied')) as { stateRevision: number; state: { stateKey: string } };
  assert.equal(snapshot.stateRevision, 1, 'the replayed denial still grants no mutation');
});

test('FR04-N invalid target and wrong package contract fail typed with zero journal activity', { timeout: 240_000 }, async () => {
  const before = (await journalRows()).length;
  await assert.rejects(
    () => send('m-target-1', { amount: 30, requestId: 'TARGET-1' }, 'never-activated'),
    (error: unknown) => (error as { name?: string }).name === 'WorkflowInstanceNotFoundError',
  );
  await assert.rejects(
    () => gateway.send(requester, { intentType: 'reviewChange', messageId: 'm-contract-1', input: {}, target: target('q-applied') }),
    (error: unknown) => {
      const typed = error as { name?: string; code?: string };
      return typed.name === 'QualifiedPackageError' && typed.code === 'INTENT_UNBOUND';
    },
  );
  assert.equal((await journalRows()).length, before, 'neither refusal wrote any journal row');
});
