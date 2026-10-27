import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const SOURCE = join(REPO, 'examples/v0103-meta-reuse/consumer.mjs');
const NPM_CLI = resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const PAYLOADS = [
  'domain-packages/kernel/basic/kernel-mechanism-v1.mjs',
  'domain-packages/standard/basic/standard-sdk-v1.mjs',
  'domain-packages/standard/basic/workflow-router.mjs',
  'examples/v010-meta-feedback/business-meta-feedback-v1.mjs',
  'domain-packages/standard/features/meta-feedback/modules/sfeature-meta-feedback-v1.mjs',
  'domain-packages/standard/features/candidate-validation/modules/sfeature-candidate-validation-v1.mjs',
];
const PACKAGES = ['packages/contracts', 'packages/microkernel', 'packages/host-node', 'tooling/build'];

function npm(args: string[], cwd: string): string {
  assert.ok(existsSync(NPM_CLI), `npm CLI beside selected Node runtime: ${NPM_CLI}`);
  return execFileSync(process.execPath, [NPM_CLI, ...args], {
    cwd, encoding: 'utf8', timeout: 90_000, maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, npm_config_registry: process.env.NPM_REGISTRY ?? 'https://registry.npmmirror.com' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

// The child has only four installed public workspace packages, the consumer
// example, and unchanged approved source payloads. No repo source import or
// preexisting node_modules lookup can satisfy this run.
const CHILD = `
import assert from 'node:assert/strict';
import { runMetaFeedbackWorkflow, MetaFeedbackError } from '@kaicreator/domain-harness-host-node';
import { activateV10App } from '@kaicreator/domain-harness-microkernel/host-seam';
import { readPayloads, openExample, observeAndPropose, buildAfterOperatorReview,
  ExampleStore, BUSINESS_V1, BUSINESS_V2, NOW } from './consumer.mjs';
const payloads = await readPayloads('./payload');
const env = await openExample(payloads);
try {
  const report = { scope: env.scope, sourceRevision: 'a'.repeat(40), evidenceDigest: 'b'.repeat(64),
    apiKey: 'SYNTHETIC_SECRET_DO_NOT_COPY', prompt: 'SYNTHETIC_SECRET_DO_NOT_COPY',
    rawError: 'SYNTHETIC_SECRET_DO_NOT_COPY' };
  const emptyWrites = env.store.writes;
  await assert.rejects(observeAndPropose(env, {...report,scope:{...env.scope,deployedAppId:'foreign'}}),
    e => e.code === 'DEMO_REPORT_SCOPE_MISMATCH');
  await assert.rejects(observeAndPropose(env, {...report,sourceRevision:'unproven'}),
    e => e.code === 'DEMO_REPORT_PROVENANCE_REQUIRED');
  assert.equal(env.store.writes, emptyWrites, 'invalid optional reports are refused before any K turn/store mutation');
  const review = await observeAndPropose(env, report);
  assert.equal(review.result.status, 'proposed');
  assert.equal(review.replay.replayed, true);
  assert.equal(review.stateRevision, review.replayStateRevision);
  assert.equal(review.result.receiptDigest, review.replay.receiptDigest);
  assert.equal(review.candidate.evidenceAuthority, 'caller-reported-not-host-verified');
  assert.equal(review.candidate.productionWritesVerifiedZero, false);
  assert.equal(review.pin.approvalState, 'candidate');
  assert.equal(review.shadow.candidateApproval.state, 'candidate');
  assert.equal(review.shadow.production.productionWritesVerifiedZero, true);
  assert.equal(review.shadow.production.storeMutationMethodsUsed, 0);
  assert.equal(review.shadow.canSelfApprove, false);
  assert.ok(review.result.proposals.every(p => p.authority === 'proposal-only' && p.canApply === false));
  assert.ok(review.result.proposals.some(p => p.kind === 'review-candidate'));
  const before = await env.activation.facade.queryScopedSnapshot({ workflowId:'meta-feedback-loop', instanceKey:'demo:meta' });
  const oldPin = env.app.subjectDigest;
  await assert.rejects(buildAfterOperatorReview(env, review), e => e.code === 'DEMO_OPERATOR_APPROVAL_REQUIRED');
  await assert.rejects(buildAfterOperatorReview(env, review, () => ({decision:'approved'})), e => e.code === 'DEMO_OPERATOR_APPROVAL_REQUIRED');
  const future = await buildAfterOperatorReview(env, review, identity => ({...identity,
    decision:'approved',operatorId:'demo:operator',reviewRef:'demo:independent-review'}));
  assert.notEqual(future.subjectDigest, oldPin);
  assert.ok(future.modules.some(m => m.packageId === BUSINESS_V2 && m.moduleSha256 === review.pin.sha256));
  assert.equal(env.app.subjectDigest, oldPin);
  assert.ok(env.app.modules.some(m => m.packageId === BUSINESS_V1));
  const next = await activateV10App(future, {store:new ExampleStore(),tenantId:env.scope.tenantId,
    deploymentIdentity:{...env.scope,deployedAppId:'demo:future'},now:()=>NOW});
  next.dispose();
  const after = await env.activation.facade.queryScopedSnapshot({ workflowId:'meta-feedback-loop', instanceKey:'demo:meta' });
  assert.deepEqual(after.snapshot, before.snapshot, 'a future BUILD/activation never hot-swaps the active instance');
  assert.equal(env.activation.facade.kCounters(BUSINESS_V1).effectDispatches, 0);
  const keysBefore = env.store.keys();
  const writesBefore = env.store.writes;
  const badKey = env.prefix + 'evidence/authority';
  await env.store.put(badKey,{approval:{promote:true}}, {kind:'create'});
  const afterBadSeed = env.store.writes;
  const options = {facade:env.activation.facade,store:env.store,
    workflow:{intentType:'recordMetaFeedback',instanceKey:'demo:bad',scheduleKey:'demo:bad',round:1},
    sources:{evidenceKeys:[badKey]},now:()=>NOW};
  await assert.rejects(runMetaFeedbackWorkflow(options), e => e instanceof MetaFeedbackError && e.code === 'META_AUTHORITY_FORBIDDEN');
  assert.equal(env.store.writes, afterBadSeed, 'authority refusal creates no round claim/ledger or K turn');
  await assert.rejects(runMetaFeedbackWorkflow({...options,sources:{evidenceKeys:['v10/t09/foreign/evidence/1']}}),
    e => e instanceof MetaFeedbackError && e.code === 'META_EVIDENCE_FOREIGN_SCOPE');
  assert.equal(env.store.writes, afterBadSeed);
  const serialized = JSON.stringify({review,documents:await Promise.all(keysBefore.map(k=>env.store.get(k)))});
  assert.equal(serialized.includes('SYNTHETIC_SECRET_DO_NOT_COPY'), false);
  let deepImportCode;
  try { await import('@kaicreator/domain-harness-host-node/dist/meta-feedback-workflow.js'); }
  catch(error) { deepImportCode=error.code; }
  assert.equal(deepImportCode,'ERR_PACKAGE_PATH_NOT_EXPORTED');
  console.log(JSON.stringify({classification:'KEEP_EXISTING',status:review.result.status,
    proposalOnly:true,shadow:review.shadow.status,shadowZeroWrites:review.shadow.production.productionWritesVerifiedZero,
    physicalStore:'in-memory-only',replay:true,noAutoPromotion:true,explicitSyntheticOperatorReview:true,
    oldPinUnchanged:env.app.subjectDigest===oldPin,newPin:future.subjectDigest,oldPin,
    hostRoot:import.meta.resolve('@kaicreator/domain-harness-host-node'),deepImportCode,
    authorityInjectionRefused:true,foreignEvidenceRefused:true,redacted:true,writesBefore}));
} finally { env.activation.dispose(); }
`;

test('v0.10.3 M: clean public Host consumer retains proposal-only authority through future BUILD pin', { timeout: 180_000 }, () => {
  assert.equal(Number(process.versions.node.split('.')[0]), 24);
  const root = mkdtempSync(join(tmpdir(), 'dh-v0103-meta-reuse-'));
  try {
    const packDir = join(root, 'packs');
    const consumer = join(root, 'consumer');
    mkdirSync(packDir);
    mkdirSync(consumer);
    mkdirSync(join(consumer, 'payload'));
    const tarballs = PACKAGES.map(path => {
      const packed = JSON.parse(npm(['pack', '--ignore-scripts', '--json', '--pack-destination', packDir], join(REPO, path)));
      return join(packDir, packed[0].filename);
    });
    writeFileSync(join(consumer, 'package.json'), JSON.stringify({name:'v0103-meta-reuse-consumer',private:true,type:'module'}));
    npm(['install','--ignore-scripts','--omit=optional','--no-audit','--no-fund','--package-lock=false',...tarballs], consumer);
    copyFileSync(SOURCE, join(consumer, 'consumer.mjs'));
    for (const path of PAYLOADS) copyFileSync(join(REPO, path), join(consumer, 'payload', basename(path)));
    writeFileSync(join(consumer, 'run.mjs'), CHILD);
    const raw = execFileSync(process.execPath, ['run.mjs'], {
      cwd: consumer, encoding: 'utf8', timeout: 45_000, maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, NODE_PATH: '' }, stdio: ['ignore','pipe','pipe'],
    });
    const result = JSON.parse(raw.trim());
    assert.equal(result.classification, 'KEEP_EXISTING');
    assert.equal(result.oldPinUnchanged, true);
    assert.equal(result.redacted, true);
    const resolved = resolve(fileURLToPath(result.hostRoot));
    const repoRelative = relative(REPO, resolved);
    assert.ok(repoRelative.startsWith('..') || isAbsolute(repoRelative), 'Host root must resolve outside monorepo');
    assert.ok(resolved.includes('node_modules'));
    assert.equal(readFileSync(join(consumer,'consumer.mjs'),'utf8'),readFileSync(SOURCE,'utf8'));
    console.log('M_PUBLIC_CONSUMER=' + JSON.stringify(result));
  } finally { rmSync(root, {recursive:true,force:true}); }
});
