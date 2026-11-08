import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { deployment, openDemo } from '../app.mjs';
import { generatePackage, loadGenerated, readFrozen } from '../build.mjs';
import { canonicalDigest, digest } from '../../../packages/dis-v011-runtime/dist/index.js';
import { readDisResult, verifyTrace } from '../../../packages/dis-v011-runtime/dist/trace.js';

const known = {url:'https://example.test/video',signals:['jwplayer.setup']};
const evidence = process.env.DIS_RUNTIME_EVIDENCE_DIR || os.tmpdir();

test('historical Host behavior reproduces under both final locks with independent traces and Journal',async()=>{
  await mkdir(evidence,{recursive:true});const dir=await mkdtemp(path.join(evidence,'dis-lifecycle-replay-'));
  const recipe=JSON.parse(await readFile(new URL('../domain/runtime-package.json',import.meta.url)));
  assert.equal(digest(await readFile(new URL('../../../packages/dis-v011-runtime/src/trace.ts',import.meta.url))),recipe.qualification.fixturePolicy.validatorBinding.sha256);
  const schemas=new Map(await Promise.all(['page-observation','recognition-result','decision-input','decision-output','resolve-input','resolution','validator-input','outcome'].map(async(name)=>{
    const ref='domain/schemas/'+name+'.schema.json';return [ref,JSON.parse(await readFile(new URL('../../dis-0.1.0-player-recognition/'+ref,import.meta.url)))];
  })));
  try {for(const variant of ['baseline','reselected']) {
    const app=await openDemo(path.join(dir,variant+'.sqlite'),variant);
    try {for(const scenario of recipe.qualification.behaviorCapture.capture.cases[variant].scenarios) {
      const receipt=await app.recognize(scenario.observation,'replay-'+scenario.id);const result=readDisResult(receipt);
      verifyTrace(result,scenario.observation,app.selected.selection,schemas);
      assert.equal(result.status,scenario.status);assert.deepEqual(result.trace.map((frame)=>frame.nodeId),scenario.control);
      assert.equal(result.outcome?.strategyId ?? null,scenario.strategyId);
      const journal=await app.readOccurrence(receipt.admitted.effects[0].effectId);
      assert.deepEqual(journal.document.value.record.output,result);assert.equal(journal.permit,null);assert.deepEqual(journal.dispatchClaims,[]);
    }} finally {await app.close();}
  }} finally {await rm(dir,{recursive:true,force:true});}
});

test('re-sealed lifecycle tampering is rejected by subject, evidence, history and authority checks',async()=>{
  async function attack(variant,mutate,expected) {
    const generated=await generatePackage(variant), descriptor=JSON.parse(generated.resources.get('package.json')),dis=descriptor.dis;
    await mutate(dis,generated);
    const byId=new Map();
    for(const record of dis.lifecycleRecords) {
      if(record.previousRecordId && byId.has(record.previousRecordId))record.previousRecordDigest=byId.get(record.previousRecordId);
      if(record.validation?.candidateRecordId && byId.has(record.validation.candidateRecordId))record.validation.candidateRecordDigest=byId.get(record.validation.candidateRecordId);
      if(record.promotion?.validationRecordId && byId.has(record.promotion.validationRecordId))record.promotion.validationRecordDigest=byId.get(record.promotion.validationRecordId);
      if(record.promotion?.priorPromotedBaseline?.recordId && byId.has(record.promotion.priorPromotedBaseline.recordId))record.promotion.priorPromotedBaseline.recordDigest=byId.get(record.promotion.priorPromotedBaseline.recordId);
      const {recordDigest,...body}=record;record.recordDigest=canonicalDigest(body);byId.set(record.recordId,record.recordDigest);
    }
    for(const asset of [...dis.selectionLock.selectedAssets,dis.selectionLock.packageQualification,...dis.selectionLock.selectedCapabilities]) {
      if(asset.validationRecordId)asset.validationRecordDigest=byId.get(asset.validationRecordId);
      if(asset.promotionRecordId)asset.promotionRecordDigest=byId.get(asset.promotionRecordId);
    }
    dis.selectionLock.lifecycle.recordsSha256=canonicalDigest(dis.lifecycleRecords);
    dis.selectionLockSha256=canonicalDigest(dis.selectionLock);
    const bytes=Buffer.from(JSON.stringify(descriptor)+'\n');generated.resources.set('package.json',bytes);
    generated.qualification.descriptor=digest(bytes);generated.qualification.lock=dis.selectionLockSha256;
    await assert.rejects(loadGenerated(generated,generated.qualification),expected);
  }
  const current=(dis,transition)=>dis.lifecycleRecords.find((r)=>r.transition===transition && r.subject.id==='xdownload.player.recognizer' && r.subject.revision==='2.0.0');
  await attack('baseline',(dis)=>{current(dis,'PROMOTED').actor.id='forged-authority';},/RUNTIME_LIFECYCLE_PROMOTION/);
  await attack('baseline',(dis,g)=>{const v=current(dis,'VALIDATED'),report=JSON.parse(g.resources.get(v.validation.reportPath));report.subject.id='forged';const bytes=Buffer.from(JSON.stringify(report)+'\n');g.resources.set(v.validation.reportPath,bytes);v.validation.reportSha256=digest(bytes);v.validation.reportCanonicalSha256=canonicalDigest(report);},/RUNTIME_LIFECYCLE_REPORT_CONTENT/);
  await attack('baseline',(dis,g)=>{const v=current(dis,'VALIDATED'),report=JSON.parse(g.resources.get(v.validation.reportPath));report.environment.runtime='forged';const bytes=Buffer.from(JSON.stringify(report)+'\n');g.resources.set(v.validation.reportPath,bytes);v.validation.reportSha256=digest(bytes);v.validation.reportCanonicalSha256=canonicalDigest(report);},/RUNTIME_LIFECYCLE_REPORT_CONTENT/);
  await attack('baseline',(dis,g)=>{const v=current(dis,'VALIDATED'),report=JSON.parse(g.resources.get(v.validation.reportPath));report.baseline.sha256='0'.repeat(64);v.validation.baseline=report.baseline;const bytes=Buffer.from(JSON.stringify(report)+'\n');g.resources.set(v.validation.reportPath,bytes);v.validation.reportSha256=digest(bytes);v.validation.reportCanonicalSha256=canonicalDigest(report);},/RUNTIME_LIFECYCLE_REPORT_CONTENT/);
  await attack('baseline',(dis)=>{current(dis,'CANDIDATE').dependencyClosureDigest='0'.repeat(64);},/RUNTIME_LIFECYCLE_RECORD_CONTEXT/);
  await attack('baseline',(dis)=>{const c=current(dis,'CANDIDATE'),ref={path:'fixtures/player-signatures.json',sha256:'3ff38c6f5bbd41915ae3a6d036298d9c41cd886c6f13e30edeed8d156e763168'};c.evidenceRefs=[ref];c.candidateProvenance.sourceRefs=[ref];},/RUNTIME_LIFECYCLE_CANDIDATE_SOURCE/);
  await attack('baseline',(dis)=>{const original=dis.lifecycleRecords.find((r)=>r.subject.id==='xdownload.player-signatures' && r.transition==='CANDIDATE');dis.lifecycleRecords.push({...structuredClone(original),recordId:'forged-duplicate-candidate'});},/RUNTIME_LIFECYCLE_TRANSITIONS/);
  await attack('baseline',(dis)=>{dis.qualification.behaviorCapture.capture.cases.baseline.scenarios.find((s)=>s.id==='unknown').status='READY';const pin=canonicalDigest(dis.qualification.behaviorCapture.capture);dis.qualification.behaviorCapture.sha256=pin;dis.selectionLock.lifecycle.captureSha256=pin;},/RUNTIME_LIFECYCLE_CAPTURE_PIN/);
  await attack('reselected',(dis)=>{const prior=JSON.parse(Buffer.from(dis.lifecycleHistory.priorDescriptor,'base64'));prior.dis.packageId='forged';const bytes=Buffer.from(JSON.stringify(prior));dis.lifecycleHistory.priorDescriptor=bytes.toString('base64');dis.selectionLock.lifecycle.priorDescriptorSha256=digest(bytes);},/RUNTIME_LIFECYCLE_PRIOR_IDENTITY/);
});

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
  await assert.rejects(generatePackage('baseline',{provider:Buffer.concat([sourceProvider,Buffer.from('\n// drift\n')])}),/BEHAVIOR_EVIDENCE_MISMATCH/);
  await assert.rejects(generatePackage('baseline',{target:'node22'}),/BEHAVIOR_EVIDENCE_MISMATCH/);
  await assert.rejects(generatePackage('baseline',{staleKnowledge:true}),/BEHAVIOR_EVIDENCE_MISMATCH/);
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
  const reportPath = 'domain/lifecycle-report-0.json';
  const report = JSON.parse(generated.resources.get(reportPath));
  report.reportId += '.tampered';
  generated.resources.set(reportPath,Buffer.from(JSON.stringify(report)));
  await assert.rejects(loadGenerated(generated,expected),/RUNTIME_LIFECYCLE_REPORT_BYTES/);
});
