import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildDemo, frozenPins } from '../build.mjs';
import { openDemo } from '../app.mjs';
import { bootKdp, buildConsumer, canonicalDigest, digest } from '../../../packages/dis-v011-runtime/dist/index.js';
import { readDisResult, verifyTrace } from '../../../packages/dis-v011-runtime/dist/trace.js';

const frozen = fileURLToPath(new URL('../../dis-0.1.0-player-recognition/',import.meta.url));
const url = 'https://example.test/video';
const known = {url, signals:['jwplayer.setup']};
const readJson = async (file) => JSON.parse(await readFile(file,'utf8'));
const writeJson = (file,value) => writeFile(file,JSON.stringify(value,null,2)+'\n');
const workspace = process.env.DIS_RUNTIME_EVIDENCE_DIR || os.tmpdir();
const schemas = new Map(await Promise.all(['page-observation','recognition-result','decision-input','decision-output','resolve-input','resolution','validator-input','outcome'].map(async (name) => {
  const ref = 'domain/schemas/' + name + '.schema.json';
  return [ref, await readJson(path.join(frozen,ref))];
})));

async function withEvidence(run) {
  await mkdir(workspace,{recursive:true});
  const directory = await mkdtemp(path.join(workspace,'dis-kdp-'));
  try { return await run(directory); }
  finally { await rm(directory,{recursive:true,force:true}); }
}

async function assertHostReceipt(app, observation, message, expected, recognitionStatus) {
  const receipt = await app.recognize(observation,message);
  const effect = receipt.admitted.effects[0];
  const result = readDisResult(receipt);
  const build = app.selected.app;
  const capability = build.modules.find((item) => item.capabilityId === 'dis-player');
  assert.equal(digest(capability.moduleSource), capability.moduleSha256);
  assert.equal(capability.moduleSha256,app.selected.adapterSha256);
  assert.deepEqual(capability.handlers,[{operationId:'dis.consume',handler:'consumeObservation'}]);
  assert.equal(capability.externalEffect,false);
  assert.equal(result.status,expected);
  if (recognitionStatus) assert.equal(result.trace[0].output.status,recognitionStatus);
  verifyTrace(result,observation,app.selected.selection,schemas);
  if (recognitionStatus === 'conflict') {
    const forged=structuredClone(result);forged.trace[0].output.conflicts[0].claims[0].playerId='forged';
    assert.throws(()=>verifyTrace(forged,observation,app.selected.selection,schemas),/recognizer reconstructed output/);
  }
  if (recognitionStatus === 'ambiguous') {
    const forged=structuredClone(result);forged.trace[0].output.ambiguities=[];
    assert.throws(()=>verifyTrace(forged,observation,app.selected.selection,schemas),/recognizer reconstructed output/);
  }
  if (recognitionStatus === 'unknown') {
    for(const mutate of [output=>{output.uncertainty.level='LOW';},output=>{output.missingFields=[];},output=>{output.sourceUrl='https://forged.test/';}]) {
      const forged=structuredClone(result);mutate(forged.trace[0].output);
      assert.throws(()=>verifyTrace(forged,observation,app.selected.selection,schemas),/recognizer reconstructed output/);
    }
    const forged=structuredClone(result),resolution={status:'READY',playerId:'jwplayer',strategyId:'forged'};
    forged.trace.find((frame)=>frame.nodeId==='bounded-fallback').output=resolution;
    const terminal=forged.trace.find((frame)=>frame.nodeId==='validate');terminal.input.resolution=resolution;
    terminal.output={...resolution,evidence:terminal.evidence.recognitionEvidence,evidenceCount:terminal.evidence.recognitionEvidence.length};
    forged.outcome=terminal.output;forged.status='READY';
    assert.throws(()=>verifyTrace(forged,observation,app.selected.selection,schemas),/fallback reconstructed output/);
  }
  if (message === 'failed') {
    const forged={...structuredClone(result),status:'NEEDS_INPUT',reason:'Supply the Page URL and observed signals'};
    assert.throws(()=>verifyTrace(forged,observation,app.selected.selection,schemas),/invalid input classification/);
  }
  assert.equal(effect.effectId,receipt.admitted.durableControlTurnId + '/effect/1');
  const journal = await app.readOccurrence(effect.effectId);
  assert.equal(journal.key,'v10/k/' + build.subjectDigest + '/tenant:dis-reference/v08-kernel:effect-journal:' + effect.effectId);
  assert.equal(journal.document.value.kernelModuleSha256,journal.kernelModuleSha256);
  assert.equal(journal.kernelModuleSha256,build.modules.find((item) => item.role === 'kernel-primary').moduleSha256);
  assert.equal(receipt.attribution.kernel.moduleSha256,journal.kernelModuleSha256);
  assert.equal(receipt.attribution.business.packageId,'business-dis-player@0.11.0-dev.0');
  const record = journal.document.value.record;
  assert.equal(record.effectId,effect.effectId);
  assert.equal(record.status,'completed');
  assert.deepEqual(record.output,result);
  assert.deepEqual(record.target,{workflowId:'dis-player',instanceKey:'page:demo'});
  assert.equal(journal.permit,null);
  assert.deepEqual(journal.dispatchClaims,[]);
  if (process.env.DIS_RUNTIME_EMIT === '1') console.log(JSON.stringify({
    case:message,status:result.status,recognition:result.trace[0]?.output.status ?? null,
    control:result.trace.map((item) => item.nodeId),outcome:result.outcome?.status ?? null,
    playerId:result.outcome?.playerId ?? null,strategyId:result.outcome?.strategyId ?? null,
    buildSubjectDigest:build.subjectDigest,selectedDigest:result.selectedDigest,adapterSha256:capability.moduleSha256,
    kernelSha256:journal.kernelModuleSha256,effectId:effect.effectId,journalKey:journal.key,
    originalReceiptSha256:canonicalDigest(receipt),journalOutputSha256:canonicalDigest(record.output),
    closureSha256:result.selection.closureSha256,lockSha256:result.selection.lockSha256,
    externalPermit:false,externalDispatchClaims:0,
  }));
  return receipt;
}

test('selected BUILD, one DomainApp, private adapter output and SQLite journal', () => withEvidence(async (dir) => {
  const sqlite = path.join(dir,'physical.sqlite');
  const app = await openDemo(sqlite);
  let receipt;
  try {
    assert.equal(app.selected.app.modules.filter((item) => item.role === 'kernel-primary').length,1);
    receipt = await assertHostReceipt(app,{...known,url:' ' + url + ' '},'known','READY','recognized');
    assert.equal(readDisResult(receipt).outcome.playerId,'jwplayer');
    assert.equal(readDisResult(receipt).outcome.strategyId,'jwplayer.extract.v1');
    const forged = structuredClone(readDisResult(receipt));forged.trace[0].output.candidates=['videojs'];
    assert.throws(()=>verifyTrace(forged,{...known,url:' ' + url + ' '},app.selected.selection,schemas),/recognizer reconstructed output/);
    const forgedFailure = {...structuredClone(readDisResult(receipt)),status:'FAILED',outcome:null,trace:[]};
    assert.throws(()=>verifyTrace(forgedFailure,known,app.selected.selection,schemas),/valid input cannot terminate before recognition/);
    const invalidBody = {...forgedFailure,reason:'Invalid structured observation'};
    verifyTrace(invalidBody,null,app.selected.selection,schemas);verifyTrace(invalidBody,[],app.selected.selection,schemas);
    const cases = [
      ['unknown',{url,signals:['unrecognized']},'NEEDS_REVIEW','unknown'],
      ['ambiguous',{url,signals:['jwplayer','videojs']},'NEEDS_INPUT','ambiguous'],
      ['conflict',{url,signals:['jwplayer'],claims:[{sourceId:'declared',playerId:'videojs'}]},'NEEDS_INPUT','conflict'],
      ['out-of-scope',{url,signals:['jwplayer'],encryptedPlayer:true},'OUT_OF_SCOPE','out_of_scope'],
      ['missing-input',{url},'NEEDS_INPUT'],
      ['failed',{url,signals:[7]},'FAILED'],
      ['malformed-with-missing',{url,tool:'download'},'FAILED'],
      ['tool-refused',{...known,tool:'download'},'FAILED'],
      ['claims-only',{url,signals:[],claims:[{sourceId:'unverified',playerId:'jwplayer'}]},'NEEDS_REVIEW','unknown'],
      ['url-signature',{url:'https://example.test/jwplayer.setup',signals:[]},'READY','recognized'],
    ];
    for (const [id,brief,status,recognition] of cases) await assertHostReceipt(app,brief,id,status,recognition);
  } finally { await app.close(); }
  // Reopen the physical database and prove the Kernel supplies its original replay receipt.
  const reopened = await openDemo(sqlite);
  try {
    const replay = await reopened.recognize({...known,url:' ' + url + ' '},'known');
    assert.equal(replay.idempotentReplay,true);
    assert.equal(replay.turnId,receipt.admitted.durableControlTurnId);
    assert.deepEqual(replay.admitted,receipt.admitted);
    const journal = await reopened.readOccurrence(receipt.admitted.effects[0].effectId);
    assert.deepEqual(journal.document.value.record.output,readDisResult(receipt));
  } finally { await reopened.close(); }
}));

test('versioned probe Knowledge mutation changes the Kernel operation result', () => withEvidence(async (dir) => {
  const root = path.join(dir,'separate-reference-package');
  await cp(frozen,root,{recursive:true});
  const strategiesPath = path.join(root,'fixtures/player-strategies.json');
  const catalog = await readJson(strategiesPath);
  catalog.revision = '2.0.0';
  catalog.strategies.jwplayer = 'jwplayer.reference-review.v2';
  delete catalog.strategies.videojs;
  await writeJson(strategiesPath,catalog);
  await assert.rejects(buildDemo(root),/RESOURCE_DIGEST_MISMATCH/);
  const descriptorPath = path.join(root,'package.json');
  const descriptor = await readJson(descriptorPath);
  const closurePath = path.join(root,descriptor.dis.resourceClosurePath);
  const closure = await readJson(closurePath);
  closure.packageRevision = '2.0.0';
  closure.resources.find((entry) => entry.path === 'fixtures/player-strategies.json').sha256 = digest(await readFile(strategiesPath));
  await writeJson(closurePath,closure);
  descriptor.dis.revision = '2.0.0';
  descriptor.dis.selectionLock.packageRevision = '2.0.0';
  descriptor.dis.resourceClosureSha256 = digest(await readFile(closurePath));
  descriptor.dis.selectionLockSha256 = canonicalDigest(descriptor.dis.selectionLock);
  await writeJson(descriptorPath,descriptor);
  const pins = {descriptor:digest(await readFile(descriptorPath)),closure:descriptor.dis.resourceClosureSha256,lock:descriptor.dis.selectionLockSha256};
  const original = await openDemo(path.join(dir,'original.sqlite'));
  const built = await buildDemo(root,pins);
  const variant = await openDemo(path.join(dir,'variant.sqlite'),built);
  try {
    const changed = await assertHostReceipt(variant,known,'changed-knowledge','READY','recognized');
    assert.equal(readDisResult(changed).outcome.strategyId,'jwplayer.reference-review.v2');
    await assertHostReceipt(variant,{url,signals:['videojs']},'partial-no-strategy','PARTIAL','recognized');
    assert.notEqual(variant.selected.app.subjectDigest,original.selected.app.subjectDigest);
    const unchanged = await assertHostReceipt(original,known,'original-after-variant','READY','recognized');
    assert.equal(readDisResult(unchanged).outcome.strategyId,'jwplayer.extract.v1');
    assert.equal(original.selected.selection.closureSha256,frozenPins.closure);
  } finally { await variant.close(); await original.close(); }
}));

test('wrong independent lock or descriptor pin rejects before activation', async () => {
  await assert.rejects(buildDemo(undefined,{...frozenPins, lock:'0'.repeat(64)}),/LOCK_PIN_MISMATCH/);
  await assert.rejects(buildDemo(undefined,{...frozenPins, descriptor:'0'.repeat(64)}),/DESCRIPTOR_PIN_MISMATCH/);
});
test('selected provider target and contract are checked even under new descriptor and lock pins',()=>withEvidence(async(dir)=>{
  const root=path.join(dir,'invalid-package');await cp(frozen,root,{recursive:true});
  const file=path.join(root,'package.json');const descriptor=await readJson(file);
  for(const [field,value] of [['target','other-target'],['contractDigest','0'.repeat(64)]]){
    const mutated=structuredClone(descriptor);mutated.dis.selectionLock.selectedCapabilities[0].provider[field]=value;
    mutated.dis.selectionLockSha256=canonicalDigest(mutated.dis.selectionLock);await writeJson(file,mutated);
    const pins={descriptor:digest(await readFile(file)),closure:mutated.dis.resourceClosureSha256,lock:mutated.dis.selectionLockSha256};
    await assert.rejects(buildDemo(root,pins),/PROVIDER_LOCK_MISMATCH/);
  }
}));
test('invalid Graphs fail closed even with recomputed external pins',()=>withEvidence(async(dir)=>{
  const mutations=[
    graph=>graph.edges.push({kind:'control',from:'validate',to:'validate'}),
    graph=>graph.nodes.push(structuredClone(graph.nodes[0])),
    graph=>graph.edges.push(structuredClone(graph.edges.find((edge)=>edge.kind==='data'))),
    graph=>{graph.edges=graph.edges.filter((edge)=>!(edge.kind==='data'&&edge.to.node==='decide'));},
    graph=>{graph.edges.find((edge)=>edge.kind==='evidence').to.slot='undeclared';},
    graph=>{graph.edges.find((edge)=>edge.kind==='evidence').from.node='bounded-fallback';},
    graph=>{graph.edges.find((edge)=>edge.kind==='control'&&edge.to==='bounded-fallback').when.value='KNOWN';},
  ];
  for(const [index,mutate] of mutations.entries()) {
    const root=path.join(dir,'graph-'+index);await cp(frozen,root,{recursive:true});
    const descriptorPath=path.join(root,'package.json'),descriptor=await readJson(descriptorPath);
    const closurePath=path.join(root,descriptor.dis.resourceClosurePath),closure=await readJson(closurePath);
    const graphPath=path.join(root,closure.graphRef.path),graph=await readJson(graphPath);mutate(graph);await writeJson(graphPath,graph);
    const graphDigest=digest(await readFile(graphPath));closure.resources.find((entry)=>entry.path===closure.graphRef.path).sha256=graphDigest;await writeJson(closurePath,closure);
    descriptor.dis.selectionLock.selectedAssets.find((asset)=>asset.kind==='graph').sha256=graphDigest;
    descriptor.dis.resourceClosureSha256=digest(await readFile(closurePath));descriptor.dis.selectionLockSha256=canonicalDigest(descriptor.dis.selectionLock);await writeJson(descriptorPath,descriptor);
    await assert.rejects(buildDemo(root,{descriptor:digest(await readFile(descriptorPath)),closure:descriptor.dis.resourceClosureSha256,lock:descriptor.dis.selectionLockSha256}),/INVALID_GRAPH/);
  }
}));
test('BUILD rejects forged or modified selection snapshots',async()=>{
  const built=await buildDemo(), selected=built.selection;
  assert.throws(()=>buildConsumer(structuredClone(selected),{}),/SELECTION_NOT_VERIFIED/);
  assert.throws(()=>buildConsumer(selected,{kernel:'forged',standard:'forged',router:'forged'}),/UNTRUSTED_HOST_MODULE/);
  selected.signatures.patterns[0].markers=['forged'];
  assert.throws(()=>buildConsumer(selected,{}),/SELECTION_NOT_VERIFIED/);
});
test('legacy boot refuses a changed selected Kernel before opening storage',()=>withEvidence(async(dir)=>{
  const app=structuredClone((await buildDemo()).app);app.modules.find((module)=>module.role==='kernel-primary').moduleSource='forged';
  await assert.rejects(bootKdp(app,path.join(dir,'untrusted.sqlite')),/UNTRUSTED_SELECTED_KERNEL/);
}));
