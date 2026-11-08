import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { deployment, openDemo } from '../app.mjs';
import { generatePackage, loadGenerated, readFrozen } from '../build.mjs';
import { canonicalDigest, digest } from '../../../packages/dis-v011-runtime/dist/index.js';
import { readDisResult } from '../../../packages/dis-v011-runtime/dist/trace.js';

const known = {url:'https://example.test/video',signals:['jwplayer.setup']};
const evidence = process.env.DIS_RUNTIME_EVIDENCE_DIR || os.tmpdir();

test('qualified separately versioned Knowledge changes the real Kernel result without changing the original', async () => {
  await mkdir(evidence,{recursive:true});
  const dir = await mkdtemp(path.join(evidence,'dis-reselection-'));
  const original = await openDemo(path.join(dir,'selections.sqlite'));
  try {
    const variant = await openDemo(path.join(dir,'selections.sqlite'),'reselected');
    try {
      const before = await original.recognize(known,'same-message');
      const changed = await variant.recognize(known,'same-message');
      const originalResult = readDisResult(before);
      const changedResult = readDisResult(changed);
      assert.equal(originalResult.outcome.strategyId,'jwplayer.extract.v1');
      assert.equal(changedResult.outcome.strategyId,'jwplayer.reference-review.v2');
      assert.equal(readDisResult(await variant.recognize({ ...known, signals:['videojs'] },'partial')).status,'PARTIAL');
      assert.equal(readDisResult(await original.recognize(known,'after-reselection')).outcome.strategyId,'jwplayer.extract.v1');
      assert.equal(original.selected.selection.revision,'2.0.0');
      assert.equal(variant.selected.selection.revision,'2.1.0');
      assert.notEqual(original.selected.selection.lockSha256,variant.selected.selection.lockSha256);
      assert.notEqual(original.selected.app.subjectDigest,variant.selected.app.subjectDigest);
      assert.equal(original.selected.adapterSha256,variant.selected.adapterSha256);
      assert.equal(before.admitted.effects[0].effectId,changed.admitted.effects[0].effectId);
      const originalJournal = await original.readOccurrence(before.admitted.effects[0].effectId);
      const variantJournal = await variant.readOccurrence(changed.admitted.effects[0].effectId);
      assert.notEqual(originalJournal.key,variantJournal.key);
      assert.deepEqual(originalJournal.document.value.record.output,originalResult);
      assert.deepEqual(variantJournal.document.value.record.output,changedResult);
      assert.equal(variantJournal.permit,null);
      assert.deepEqual(variantJournal.dispatchClaims,[]);
      if (process.env.DIS_RUNTIME_EMIT === '1') console.log(JSON.stringify({case:'reselected-knowledge',
        baseline:originalResult.outcome.strategyId, changed:changedResult.outcome.strategyId,
        oldSelection:originalResult.selection,newSelection:changedResult.selection, provider:changedResult.providerArtifact,
        originalJournal:originalJournal.key,variantJournal:variantJournal.key,
        originalReceiptSha256:canonicalDigest(before),variantReceiptSha256:canonicalDigest(changed)}));
    } finally { await variant.close(); }
  } finally { await original.close(); await rm(dir,{recursive:true,force:true}); }
});

test('separate frozen provenance and qualified provider byte identity with fail-closed mutations', async () => {
  await assert.rejects(deployment('baseline','0'.repeat(64)),/QUALIFICATION_INDEX_PIN_MISMATCH/);
  const reference = await readFrozen();
  const generated = await generatePackage('baseline');
  const { expected } = await deployment('baseline');
  const selected = await loadGenerated(generated,expected);
  const sourceProvider = await readFile(new URL('../src/provider.mjs',import.meta.url));
  assert.equal(Object.keys(reference.resources).length,25);
  assert.notEqual(reference.packageId,selected.packageId);
  assert.equal(reference.resources['src/runner.mjs'],'6f5412991ab46487eade8bca14fdb716f70ffcd3b82d6ddb567f7d306eafe179');
  assert.equal(selected.resources['src/runner.mjs'],undefined);
  assert.equal(selected.providerArtifact.sha256,digest(sourceProvider));
  assert.equal(selected.providerArtifact.sha256,expected.provider);
  assert.equal(selected.resources['fixtures/selected-player-strategies.json'],expected.knowledge);
  assert.equal(Object.keys(selected.resources).length,generated.closure.resources.length);
  assert.equal(selected.units['xdownload.player.resolve-procedure'].knowledgeRefs[0].sha256,expected.knowledge);
  assert.equal(selected.resources['fixtures/player-signatures.json'],reference.resources['fixtures/player-signatures.json']);
  await assert.rejects(loadGenerated(await generatePackage('baseline',{provider:Buffer.concat([sourceProvider,Buffer.from('\n// drift\n')])}),expected),/RUNTIME_QUALIFICATION_MISMATCH/);
  const wrongTarget = await generatePackage('baseline',{target:'node22'});
  await assert.rejects(loadGenerated(wrongTarget,wrongTarget.qualification),/PROVIDER_LOCK_MISMATCH/);
  const stale = await generatePackage('baseline',{staleKnowledge:true});
  await assert.rejects(loadGenerated(stale,stale.qualification),/KNOWLEDGE_PIN_MISMATCH/);
  const missingSignature = await generatePackage('baseline');
  const changedDescriptor = JSON.parse(missingSignature.resources.get('package.json'));
  changedDescriptor.dis.selectionLock.selectedAssets = changedDescriptor.dis.selectionLock.selectedAssets.filter((asset)=>asset.kind!=='rule');
  changedDescriptor.dis.selectionLockSha256 = canonicalDigest(changedDescriptor.dis.selectionLock);
  const changedBytes = Buffer.from(JSON.stringify(changedDescriptor)+'\n');missingSignature.resources.set('package.json',changedBytes);
  missingSignature.qualification.descriptor=digest(changedBytes);missingSignature.qualification.lock=changedDescriptor.dis.selectionLockSha256;
  await assert.rejects(loadGenerated(missingSignature,missingSignature.qualification),/SIGNATURE_RULE_LOCK_MISMATCH/);
  const wrongPolicy = await generatePackage('baseline');
  const policyDescriptor = JSON.parse(wrongPolicy.resources.get('package.json'));
  policyDescriptor.dis.selectionLock.businessPolicy.scope='GLOBAL_WRITE';
  policyDescriptor.dis.selectionLockSha256=canonicalDigest(policyDescriptor.dis.selectionLock);
  const policyBytes=Buffer.from(JSON.stringify(policyDescriptor)+'\n');wrongPolicy.resources.set('package.json',policyBytes);
  wrongPolicy.qualification.descriptor=digest(policyBytes);wrongPolicy.qualification.lock=policyDescriptor.dis.selectionLockSha256;
  await assert.rejects(loadGenerated(wrongPolicy,wrongPolicy.qualification),/RUNTIME_BUSINESS_POLICY_INVALID/);
  const reportPath = 'domain/private-aot-validation.json';
  const report = JSON.parse(generated.resources.get(reportPath));
  report.reportId += '.tampered';
  generated.resources.set(reportPath,Buffer.from(JSON.stringify(report)));
  await assert.rejects(loadGenerated(generated,expected),/RUNTIME_VALIDATION_REPORT_DIGEST_MISMATCH/);
});
