import test from 'node:test';
import assert from 'node:assert/strict';
import {sha256Canonical} from '@kaicreator/domain-harness-contracts';
import {qualifyDisV020Artifact,classifyDisV020KdpReceipt,compareDisV020FunctionContracts,compareDisV020ElementContracts} from '@kaicreator/domain-harness-contracts/dis-v020';
import {compileDisV020Aot} from '@kaicreator/domain-harness-build/dis-v020';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../tests/assembly/helpers-v010.ts';
import {makeNativeFixture} from './native-fixture.mjs';
import {RELEASE_READINESS_REQUIRED_GATES} from '../dis-v020-cross-project/snapshots/tally/release-readiness.mjs';
import {chatInitial,chatFollowUp,formInitial,formFollowUp,cliInitial,cliFollowUp,consumeDownloadSession} from '../dis-v020-interaction/channel-adapters.mjs';

const fixturePromise=makeNativeFixture();
const clone=value=>structuredClone(value);
const reject=code=>e=>e?.code===code;
const compile=(fixture,program=fixture.program,sources=fixture.sources,expectedSourceOrigins=fixture.expectedSourceOrigins)=>
 compileDisV020Aot({built:fixture.artifact.built,program,sources,expectedSourceOrigins});
const activate=(fixture,options={})=>loadDisV020Aot(options.artifact??fixture.artifact,{
 expectedDigest:options.digest??fixture.artifact.digest,
 registry:options.registry??fixture.registry,
 store:options.store??new PlainCasDocStore(),
 tenantId:'tenant:dis-v020-native-r9'
});

test('native Contracts + canonical BUILD select 4 heterogeneous domains and explicit global semantics',async()=>{
 const f=await fixturePromise;
 const q=qualifyDisV020Artifact(f.artifact);
 assert.equal(f.artifact.format,'dis.v0.2.aot/1');
 assert.equal(f.artifact.program.domains.length,5);
 assert.ok(f.artifact.program.elements.some(e=>e.kind==='global'&&e.functions.length===0));
 assert.ok(f.artifact.program.elements.some(e=>e.kind==='stateful'));
 assert.ok(f.artifact.program.elements.some(e=>e.kind==='effect'));
 assert.ok(f.artifact.program.relations.some(x=>x.kind==='cooperates'));
 assert.equal(q.functions.get('xdownload.confirmDownload').definition.binding.type,'kdp-intent');
 assert.equal(q.functions.get('runx.createPresenceObserver').definition.binding.type,'local');
});
test('native public SDK loads actual selected KDP, initializes one Business and executes admitted orders Intent',async()=>{
 const f=await fixturePromise,app=await activate(f);
 try{
  assert.equal(app.state,'READY');
  const result=await app.invoke('orders.approve',{
   messageId:'msg:dis-native-r9',instanceKey:'instance:dis-native-r9',
   input:{amount:30,requestId:'DIS-NATIVE-R9'}});
  assert.equal(result.kind,'KDP_RECEIPT');
  assert.equal(result.authority,'KDP');
  assert.equal(result.receipt.status,'admitted');
 }finally{app.stop()}
});
test('Tally actual Task evidence Function stays OBSERVATION, never mints Task Claim or authorization',async()=>{
 const f=await fixturePromise,app=await activate(f);
 try{
  const r=await app.invoke('tally.assessTaskEvidence',{});
  assert.equal(r.kind,'OBSERVATION');assert.equal(r.authority,'NONE');
  assert.equal(r.value.admitted,false);assert.equal(r.value.state,'UNQUALIFIED_INPUT');
 }finally{app.stop()}
});
test('Runx native stateful observer is not reclassified as a Business or execution lease',async()=>{
 const f=await fixturePromise,app=await activate(f);
 try{
  const observation=await app.invoke('runx.createPresenceObserver',()=>'2026-11-08T07:00:00Z');
  assert.equal(observation.kind,'OBSERVATION');
  assert.equal(observation.authority,'NONE');
  const agent=observation.value;
  agent.observe({agent_id:'agent-x',agent_incarnation_id:'inc-9',capability:{capability_id:'execute'}},
    {agent_id:'agent-x'});
  assert.equal(agent.latest().agent_incarnation_id,'inc-9');
  assert.equal(Object.hasOwn(agent.latest(),'execution_authorized'),false);
 }finally{app.stop()}
});
test('xDownload original policy is exposed as knowledge without providing direct acquisition authority',async()=>{
 const f=await fixturePromise,app=await activate(f);
 try{
  const p=await app.invoke('xdownload.describePolicy',{});
  assert.equal(p.kind,'OBSERVATION');assert.equal(p.authority,'NONE');
  assert.equal(p.value.domainId,'downloads');
  assert.equal(p.value.effectBindings['effect:acquire'].external.await,'terminal');
  assert.equal(f.artifact.program.elements.find(e=>e.id==='xdownload.acquire').functions[0].effect,'governed');
 }finally{app.stop()}
});
test('native DIS SDK refuses malformed external Effect input before KDP dispatch',async()=>{
 const f=await fixturePromise,app=await activate(f);
 try{
  await assert.rejects(app.invoke('xdownload.confirmDownload',{input:{requestId:'fake'}}),
   reject('DIS_INTENT_INPUT_INVALID'));
 }finally{app.stop()}
});
test('native compiler requires independent trusted repository/commit/path/blob source origins',async()=>{
 const f=await fixturePromise;
 const forged=clone(f.sources);
 forged.find(x=>x.id==='runx-presence').origin.repository='kaicreator-mm/tally';
 assert.throws(()=>compile(f,f.program,forged),reject('DIS_SOURCE_ORIGIN_UNTRUSTED'));
});
test('native compiler rejects locally changed Tally source bytes against exact pinned Git Blob',async()=>{
 const f=await fixturePromise;
 const changed=clone(f.sources);changed.find(x=>x.id==='tally-business').sourceText+='\\n// tampered';
 assert.throws(()=>compile(f,f.program,changed),reject('DIS_BUILD_SOURCE_BYTES_DRIFT'));
});
test('native compiler rejects Effect downgrade from KDP_INTENT to arbitrary LOCAL rule',async()=>{
 const f=await fixturePromise,p=clone(f.program);
 const e=p.elements.find(x=>x.id==='xdownload.acquire').functions[0];
 e.binding={type:'local',sourceId:'xdownload-business'};
 // R19 installs a typed receipt contract on this KDP Function. Strip it so the
 // only violation here is the downgrade itself, not the receipt binding rule.
 delete e.receiptContract;
 assert.throws(()=>compile(f,p),reject('DIS_LOCAL_NOT_QUALIFIED'));
});
test('native compiler refuses xDownload Function bound to a foreign Tally Business Package',async()=>{
 const f=await fixturePromise,p=clone(f.program);
 p.elements.find(x=>x.id==='xdownload.acquire').packageId='business-tally-task-readiness@v2.0.0';
 assert.throws(()=>compile(f,p),reject('DIS_INTENT_NOT_SELECTED'));
});
test('native compiler rejects inter-Element dependency cycles and duplicate Business App Init',async()=>{
 const f=await fixturePromise,p=clone(f.program);
 p.elements.find(x=>x.id==='tally.tasks').dependsOn=['tally.release'];
 assert.throws(()=>compile(f,p),reject('DIS_DEPENDENCY_CYCLE'));
 const duplicated=clone(f.program);
 duplicated.elements.find(x=>x.id==='tally.tasks').functions.push({
  id:'tally.fakeInit',kind:'init',effect:'none',binding:{type:'local',sourceId:'tally-business'}
 });
 assert.throws(()=>compile(f,duplicated),reject('DIS_INIT_NOT_UNIQUE'));
});
test('native SDK requires a separately provisioned AOT digest, not an artifact self-declaration',async()=>{
 const f=await fixturePromise;
 await assert.rejects(loadDisV020Aot(f.artifact,{registry:f.registry,store:new PlainCasDocStore()}),
  reject('DIS_TRUST_ANCHOR_REQUIRED'));
 await assert.rejects(activate(f,{digest:'0'.repeat(64)}),reject('DIS_INSTALLED_AOT_MISMATCH'));
});
test('installed independent digest catches altered but rehashed and internally valid AOT semantics',async()=>{
 const f=await fixturePromise,modified=clone(f.artifact);
 modified.program.relations.push({from:'tally.tasks',to:'xdownload.policy',kind:'cooperates'});
 modified.digest=sha256Canonical({
  format:modified.format,built:modified.built,program:modified.program,sources:modified.sources
 });
 assert.ok(qualifyDisV020Artifact(modified));
 await assert.rejects(activate(f,{artifact:modified}),reject('DIS_INSTALLED_AOT_MISMATCH'));
});
test('native SDK rejects an installed local implementation whose code/attribution pin drifts',async()=>{
 const f=await fixturePromise,registry={...f.registry};
 registry['runx.createPresenceObserver']={...registry['runx.createPresenceObserver'],gitBlob:'f'.repeat(40)};
 await assert.rejects(activate(f,{registry}),reject('DIS_LOCAL_REGISTRY_MISMATCH'));
});
test('serialized AOT is requalified natively after process-memory identity is lost',async()=>{
 const f=await fixturePromise,restored=JSON.parse(JSON.stringify(f.artifact));
 const app=await activate(f,{artifact:restored});
 try{
  assert.equal(app.state,'READY');
  const r=await app.invoke('tally.assessTaskEvidence',{});
  assert.equal(r.authority,'NONE');
 }finally{app.stop()}
});
test('native SDK stop closes all Function ingress, including stateful LOCAL functions',async()=>{
 const f=await fixturePromise,app=await activate(f);
 app.stop();assert.equal(app.state,'STOPPED');
 await assert.rejects(app.invoke('runx.createPresenceObserver',()=>''),reject('DIS_APP_NOT_READY'));
});
test('native SDK Business App Init refusal blocks every Function without exposing a facade',async()=>{
 const f=await fixturePromise,registry={...f.registry};
 registry['orders.appInit']={...registry['orders.appInit'],execute:()=>({status:'BLOCKED'})};
 await assert.rejects(activate(f,{registry}),reject('DIS_INIT_BLOCKED'));
});

test('native SDK DEGRADED explicitly disables absent optional Tally Function without weakening mandatory KDP',async()=>{
 const f=await fixturePromise,program=clone(f.program);
 program.elements.find(e=>e.id==='tally.release').functions[0].optional=true;
 const artifact=compile(f,program);
 const registry={...f.registry};
 delete registry['tally.projectReleaseReadiness'];
 registry['orders.appInit']={...registry['orders.appInit'],
  execute:()=>({status:'DEGRADED',unavailable:['tally.projectReleaseReadiness']})};
 const app=await loadDisV020Aot(artifact,{
  store:new PlainCasDocStore(),expectedDigest:artifact.digest,registry
 });
 try{
  assert.equal(app.state,'DEGRADED');
  await assert.rejects(app.invoke('tally.projectReleaseReadiness',{}),
   reject('DIS_FUNCTION_UNAVAILABLE'));
  const r=await app.invoke('tally.assessTaskEvidence',{});
  assert.equal(r.authority,'NONE');
  const receipt=await app.invoke('orders.approve',{
   messageId:'msg:dis-optional-native',instanceKey:'instance:dis-optional-native',
   input:{amount:30,requestId:'DIS-R9-OPTIONAL'}});
  assert.equal(receipt.receipt.status,'admitted');
 }finally{app.stop()}
});
test('native SDK refuses silent optional Function omission or optional Business App Init',async()=>{
 const f=await fixturePromise,program=clone(f.program);
 program.elements.find(e=>e.id==='tally.release').functions[0].optional=true;
 const artifact=compile(f,program);
 const registry={...f.registry};
 delete registry['tally.projectReleaseReadiness'];
 await assert.rejects(loadDisV020Aot(artifact,{
  store:new PlainCasDocStore(),expectedDigest:artifact.digest,registry
 }),reject('DIS_INIT_OPTIONAL_UNDECLARED'));
 const invalid=clone(f.program);
 invalid.elements.find(e=>e.id==='orders.init').functions[0].optional=true;
 assert.throws(()=>compile(f,invalid),reject('DIS_INIT_OPTIONAL_FORBIDDEN'));
});

test('actual Runx Element cannot silently import Tally source as its LOCAL stateful implementation',async()=>{
 const f=await fixturePromise,program=clone(f.program);
 program.elements.find(e=>e.id==='runx.agent.presence').functions[0].binding.sourceId='tally-business';
 assert.throws(()=>compile(f,program),reject('DIS_SOURCE_DOMAIN_MISMATCH'));
});
test('declared semantic depends-on relationship must agree with the sealed Element DAG',async()=>{
 const f=await fixturePromise,program=clone(f.program);
 program.relations.push({from:'runx.agent.presence',to:'tally.tasks',kind:'depends-on'});
 assert.throws(()=>compile(f,program),reject('DIS_RELATION_DEPENDENCY_MISMATCH'));
});

test('native AOT selects one Interaction Element with two independently bound public Functions',async()=>{
 const f=await fixturePromise,qualified=qualifyDisV020Artifact(f.artifact);
 const element=f.artifact.program.elements.find(e=>e.id==='xdownload.interaction');
 assert.equal(element.kind,'interaction');assert.equal(element.functions.length,2);
 assert.deepEqual(element.functions.map(fn=>fn.binding.sourceId),['xdownload-interaction','xdownload-interaction']);
 assert.equal(qualified.functions.get('xdownload.interaction.inspect').definition.effect,'none');
 assert.equal(qualified.functions.get('xdownload.interaction.confirm').definition.binding.type,'local');
});
test('Chat, Form and CLI share native progressive clarification without triggering xDownload Effect',async()=>{
 const f=await fixturePromise,app=await activate(f);
 try{
  for(const channel of ['chat','form','cli']){
   const first=await app.invoke('xdownload.interaction.inspect',{
    channel,requestId:'R-'+channel,url:'https://example.org/clip.mp4'
   });
   assert.equal(first.kind,'OBSERVATION');assert.equal(first.authority,'NONE');
   assert.equal(first.value.status,'CLARIFICATION_REQUIRED');
   assert.deepEqual(first.value.missing,['declaredBytes']);
   const pending=await app.invoke('xdownload.interaction.confirm',{
    draft:first.value,answers:{declaredBytes:512},confirmed:false
   });
   assert.equal(pending.value.status,'AWAITING_CONFIRMATION');
   const confirmed=await app.invoke('xdownload.interaction.confirm',{
    draft:first.value,answers:{declaredBytes:512},confirmed:true
   });
   assert.equal(confirmed.kind,'OBSERVATION');assert.equal(confirmed.authority,'NONE');
   assert.equal(confirmed.value.status,'READY_FOR_KDP');
   assert.equal(confirmed.value.permittedEffect,false);
   assert.equal(confirmed.value.effectDispatched,false);
   assert.equal(confirmed.value.prerequisite,'A_SEPARATE_SELECTED_KDP_INTENT_CALL_IS_REQUIRED');
  }
 }finally{app.stop()}
});
test('interaction refuses oversized payload and unsafe URL even when user claims confirmation',async()=>{
 const f=await fixturePromise,app=await activate(f);
 try{
  const big=await app.invoke('xdownload.interaction.inspect',{
   channel:'form',requestId:'B1',url:'https://example.org/a',declaredBytes:1048577
  });
  assert.equal(big.value.status,'REJECTED');assert.equal(big.value.reason,'INVALID_SIZE_OR_LIMIT');
  const unsafe=await app.invoke('xdownload.interaction.inspect',{
   channel:'cli',requestId:'C1',url:'http://example.org/unsafe',declaredBytes:3
  });
  assert.equal(unsafe.value.status,'REJECTED');
  const injected=await app.invoke('xdownload.interaction.inspect',{
   channel:'chat',requestId:'H1',url:'https://example.org/a',declaredBytes:3,execute:true
  });
  assert.equal(injected.value.status,'REJECTED');
  assert.equal(injected.authority,'NONE');assert.equal(injected.value.effectDispatched,false);
 }finally{app.stop()}
});
test('interaction cannot forge a READY state or smuggle additional answers into Function binding',async()=>{
 const f=await fixturePromise,app=await activate(f);
 try{
  const forged=await app.invoke('xdownload.interaction.confirm',{
   draft:{status:'READY_FOR_KDP',proposal:{channel:'form',requestId:'FORGED'}},
   answers:{sizeBytes:10},confirmed:true
  });
  assert.equal(forged.value.status,'REJECTED');
  const incomplete=await app.invoke('xdownload.interaction.confirm',{
   draft:{status:'READY_FOR_KDP',proposal:{channel:'form',requestId:'FORGED'}},
   answers:{},confirmed:true
  });
  assert.equal(incomplete.value.status,'CLARIFICATION_REQUIRED');
 }finally{app.stop()}
});
test('AOT refuses interaction with KDP_INTENT or governed Effect reclassification',async()=>{
 const f=await fixturePromise,p=clone(f.program);
 const interact=p.elements.find(e=>e.id==='xdownload.interaction').functions[0];
 interact.binding={type:'kdp-intent',intentId:'confirmDownload'};
 interact.effect='governed';
 assert.throws(()=>compile(f,p),reject('DIS_INTERACTION_EFFECT_FORBIDDEN'));
});
test('stopping real SDK closes Interaction ingress before any new clarification',async()=>{
 const f=await fixturePromise,app=await activate(f);
 app.stop();
 await assert.rejects(app.invoke('xdownload.interaction.inspect',{channel:'cli',requestId:'STOP'}),reject('DIS_APP_NOT_READY'));
});

// R11: original source-pinned Tally/xDownload native Function conformance.
test('R11 typed Function I/O and provenance preserve original Tally UNKNOWN advisory semantics',async()=>{
 const f=await fixturePromise,app=await activate(f);
 try{
  assert.equal(app.contractVersions['tally.assessTaskEvidence'],'1.0.0');
  const r=await app.invoke('tally.assessTaskEvidence',{}, {expectedContractVersion:'1.0.0'});
  assert.equal(r.kind,'OBSERVATION');assert.equal(r.authority,'NONE');
  assert.equal(r.disposition,'UNKNOWN');assert.equal(r.value.admitted,false);
  assert.equal(r.evidence.source.sourceId,'tally-business');
  assert.equal(r.evidence.source.sha256,f.artifact.sources.find(x=>x.id==='tally-business').sha256);
  assert.deepEqual(r.evidence.declaredRefs,[]);assert.equal(r.evidence.attested,false);
 }finally{app.stop()}
});
test('R11 native xDownload clarification and confirmation remain typed and never authorize Effect',async()=>{
 const f=await fixturePromise,app=await activate(f);
 try{
  const first=await app.invoke('xdownload.interaction.inspect',{channel:'chat',requestId:'R11',url:'https://example.org/a'});
  assert.equal(first.disposition,'NEEDS_INPUT');assert.equal(first.authority,'NONE');
  const ready=await app.invoke('xdownload.interaction.confirm',{
   draft:first.value,answers:{declaredBytes:256},confirmed:true
  },{expectedContractVersion:'1.0.0'});
  assert.equal(ready.disposition,'PENDING_AUTHORIZATION');assert.equal(ready.value.permittedEffect,false);
  assert.equal(ready.evidence.attested,false);assert.equal(ready.authority,'NONE');
 }finally{app.stop()}
});
test('R11 rejects malformed Function input before executing sealed local implementation',async()=>{
 const f=await fixturePromise,app=await activate(f);
 try{
  await assert.rejects(app.invoke('xdownload.interaction.inspect','invalid'),reject('DIS_FUNCTION_INPUT_INVALID'));
 }finally{app.stop()}
});
test('R11 refuses malformed Function output rather than claiming a typed successful outcome',async()=>{
 const f=await fixturePromise,registry={...f.registry};
 registry['tally.assessTaskEvidence']={...registry['tally.assessTaskEvidence'],execute:()=>({state:'OBSERVED_INPUT_ONLY',admitted:'yes',taskPass:false})};
 const app=await activate(f,{registry});
 try{
  await assert.rejects(app.invoke('tally.assessTaskEvidence',{}),reject('DIS_FUNCTION_OUTPUT_INVALID'));
 }finally{app.stop()}
});
test('R11 undeclared result status is not silently mapped to SUCCEEDED or UNKNOWN',async()=>{
 const f=await fixturePromise,registry={...f.registry};
 registry['tally.assessTaskEvidence']={...registry['tally.assessTaskEvidence'],execute:()=>({state:'FAKE_SUCCESS',admitted:false,taskPass:false})};
 const app=await activate(f,{registry});
 try{
  await assert.rejects(app.invoke('tally.assessTaskEvidence',{}),reject('DIS_OUTCOME_UNDECLARED'));
 }finally{app.stop()}
});
test('R11 declared SUCCEEDED without required evidence fails closed even for source-pinned local code',async()=>{
 const f=await fixturePromise,p=clone(f.program);
 const fn=p.elements.flatMap(e=>e.functions).find(fn=>fn.id==='tally.assessTaskEvidence');
 fn.contract.outcomes.classes.OBSERVED_INPUT_ONLY='SUCCEEDED';
 const artifact=compile(f,p),app=await activate(f,{artifact,digest:artifact.digest});
 try{
  const input={issueRef:'https://github.com/kaicreator-mm/tally/issues/37',issueNumber:37,
   sourceSha:'a'.repeat(40),claimRef:'claim:r11',dependenciesComplete:true};
  await assert.rejects(app.invoke('tally.assessTaskEvidence',input),reject('DIS_EVIDENCE_REQUIRED'));
 }finally{app.stop()}
});
test('R11 AOT rejects incompatible Function contract reader/major and weak success evidence policy',async()=>{
 const f=await fixturePromise,p=clone(f.program);
 const fn=p.elements.flatMap(e=>e.functions).find(fn=>fn.id==='tally.assessTaskEvidence');
 fn.contract.compatibility.minReader='0.3.0';
 assert.throws(()=>compile(f,p),reject('DIS_FUNCTION_COMPATIBILITY_INVALID'));
 fn.contract.compatibility.minReader='0.2.0';
 fn.contract.outcomes.classes.OBSERVED_INPUT_ONLY='SUCCEEDED';
 fn.contract.evidence.requiredFor=[];
 assert.throws(()=>compile(f,p),reject('DIS_EVIDENCE_POLICY_WEAK'));
});
test('R11 installed AOT contract version rejects stale explicit consumer expectation',async()=>{
 const f=await fixturePromise,app=await activate(f);
 try{
  await assert.rejects(app.invoke('tally.assessTaskEvidence',{}, {expectedContractVersion:'2.0.0'}),
   reject('DIS_FUNCTION_VERSION_MISMATCH'));
 }finally{app.stop()}
});


// D02: source-real parent-vs-split counterfactual, not an independent semantic oracle.
test('D02 parent-vs-split Tally rule Elements preserve two source-real advisory Function outputs',async()=>{
 const f=await fixturePromise,p=clone(f.program);
 const parent=p.elements.find(e=>e.id==='tally.tasks');
 const child=p.elements.find(e=>e.id==='tally.release');
 parent.functions.push(...child.functions);
 p.elements=p.elements.filter(e=>e.id!=='tally.release');
 p.relations=p.relations.filter(r=>r.from!=='tally.release'&&r.to!=='tally.release');
 const fused=compile(f,p);
 const splitApp=await activate(f),fusedApp=await activate(f,{artifact:fused,digest:fused.digest});
 const taskInput={issueRef:'https://github.com/kaicreator-mm/tally/issues/37',issueNumber:37,
  sourceSha:'e988321439f65b55936a691c02250b6d62a29409',claimRef:'claim:unattested',
  dependenciesComplete:true};
 const releaseInput={repository:'kaicreator-mm/tally',sourceSha:taskInput.sourceSha,
  observedAsOf:'2026-11-08T12:00:00Z',gates:{}};
 try{
  for(const [fn,input] of [['tally.assessTaskEvidence',taskInput],
                            ['tally.projectReleaseReadiness',releaseInput]]){
   const a=await splitApp.invoke(fn,input),b=await fusedApp.invoke(fn,input);
   assert.deepEqual(a,b);
   assert.equal(a.kind,'OBSERVATION');assert.equal(a.authority,'NONE');
   assert.equal(a.value.admitted??false,false);
   assert.equal(a.value.canMerge??false,false);
  }
 }finally{splitApp.stop();fusedApp.stop()}
});
test('D02 semantic cooperation may be cyclic while static Element dependency DAG remains acyclic',async()=>{
 const f=await fixturePromise,p=clone(f.program);
 p.relations.push({from:'tally.tasks',to:'runx.agent.presence',kind:'cooperates'});
 assert.doesNotThrow(()=>compile(f,p));
 const invalid=clone(p);
 invalid.elements.find(e=>e.id==='tally.tasks').dependsOn=['tally.release'];
 assert.throws(()=>compile(f,invalid),reject('DIS_DEPENDENCY_CYCLE'));
});
test('D02 cross-Element constraint relation cannot nominate an absent owner',async()=>{
 const f=await fixturePromise,p=clone(f.program);
 p.relations.push({from:'absent.owner',to:'tally.tasks',kind:'constrains'});
 assert.throws(()=>compile(f,p),reject('DIS_RELATION_INVALID'));
});

// D03: parse three genuinely distinct client representations and call the same native SDK.
test('D03 Chat message, Form URLSearchParams and CLI argv adapters consume actual native Interaction',async()=>{
 const f=await fixturePromise,app=await activate(f);
 try{
  const rows=[
   [chatInitial('download https://example.org/media.mp4','ADAPTER-CHAT'),
    chatFollowUp('bytes 512 confirm'),'chat'],
   [formInitial(new URLSearchParams({url:'https://example.org/media.mp4'}),'ADAPTER-FORM'),
    formFollowUp(new URLSearchParams({declaredBytes:'512',confirmed:'on'})),'form'],
   [cliInitial(['download','https://example.org/media.mp4'],'ADAPTER-CLI'),
    cliFollowUp(['--bytes','512','--confirm']),'cli']
  ];
  for(const [initial,followUp,channel] of rows){
   const {inspected,final}=await consumeDownloadSession(app,{initial,followUp});
   assert.equal(inspected.value.status,'CLARIFICATION_REQUIRED');
   assert.equal(inspected.disposition,'NEEDS_INPUT');
   assert.equal(final.value.status,'READY_FOR_KDP');
   assert.equal(final.disposition,'PENDING_AUTHORIZATION');
   assert.equal(final.value.proposal.channel,channel);
   assert.equal(final.authority,'NONE');
   assert.equal(final.value.effectDispatched,false);
   assert.equal(final.value.permittedEffect,false);
  }
 }finally{app.stop()}
});
test('D03 adapters refuse extra effect fields, unsupported commands and fabricated chat confirmation',()=>{
 assert.throws(()=>chatInitial('execute https://example.org/a','BAD'),reject('DIS_ADAPTER_INVALID'));
 assert.throws(()=>chatFollowUp('approve all effects'),reject('DIS_ADAPTER_INVALID'));
 assert.throws(()=>formInitial(new URLSearchParams('url=https%3A%2F%2Fexample.org%2Fa&execute=1'),'BAD'),
  reject('DIS_ADAPTER_INVALID'));
 assert.throws(()=>formFollowUp(new URLSearchParams('declaredBytes=2&confirmed=true')),
  reject('DIS_ADAPTER_INVALID'));
 assert.throws(()=>cliInitial(['download','https://example.org/a','--execute'],'BAD'),
  reject('DIS_ADAPTER_INVALID'));
 assert.throws(()=>cliFollowUp(['--bytes','3','--execute']),reject('DIS_ADAPTER_INVALID'));
});
test('D03 absence of explicit confirmation leaves parsed CLI session without KDP authority',async()=>{
 const f=await fixturePromise,app=await activate(f);
 try{
  const {final}=await consumeDownloadSession(app,{
   initial:cliInitial(['download','https://example.org/a'],'CLI-NO-CONFIRM'),
   followUp:cliFollowUp(['--bytes','256'])
  });
  assert.equal(final.value.status,'AWAITING_CONFIRMATION');
  assert.equal(final.authority,'NONE');
 }finally{app.stop()}
});


// R16: real KDP receipt typing is independent from LOCAL typed observations.
test('R16 selected native KDP Intent has typed ADMITTED without pretending Effect completion',async()=>{
 const f=await fixturePromise,app=await activate(f);
 try{
  assert.equal(app.contractVersions['orders.approve'],'1.0.0');
  const result=await app.invoke('orders.approve',{
   messageId:'msg:r16-kdp-typed',instanceKey:'instance:r16-kdp-typed',
   input:{amount:30,requestId:'DIS-R16-KDP'}
  },{expectedContractVersion:'1.0.0'});
  assert.equal(result.kind,'KDP_RECEIPT');assert.equal(result.authority,'KDP');
  assert.equal(result.receipt.status,'admitted');
  assert.equal(result.admission,'ADMITTED');assert.equal(result.execution,'NOT_PROVEN');
  assert.equal(result.contractVersion,'1.0.0');
  assert.equal(result.evidence.receiptAuthority,'KDP');
  assert.equal(result.evidence.businessAttested,false);
 }finally{app.stop()}
});
test('R16 KDP admission profile refuses a forged success / unrelated accepted status',async()=>{
 const f=await fixturePromise,p=clone(f.program);
 const fn=p.elements.flatMap(e=>e.functions).find(x=>x.id==='orders.approve');
 fn.receiptContract.statusMap.admitted='SUCCEEDED';
 assert.throws(()=>compile(f,p),reject('DIS_KDP_RECEIPT_CONTRACT_INVALID'));
 fn.receiptContract.statusMap.admitted='ADMITTED';
 fn.receiptContract.statusMap.completed='ADMITTED';
 assert.throws(()=>compile(f,p),reject('DIS_KDP_RECEIPT_ADMISSION_WEAK'));
});
test('R16 KDP receipt contract refuses stale caller before selecting native Intent',async()=>{
 const f=await fixturePromise,app=await activate(f);
 try{
  await assert.rejects(app.invoke('orders.approve',{
   messageId:'msg:r16-stale',instanceKey:'instance:r16-stale',
   input:{amount:30,requestId:'DIS-R16-STALE'}
  },{expectedContractVersion:'0.9.0'}),reject('DIS_FUNCTION_VERSION_MISMATCH'));
 }finally{app.stop()}
});
test('R16 unknown or malformed receipt cannot become admitted or self-attested evidence',async()=>{
 const f=await fixturePromise;
 const contract=f.program.elements.flatMap(e=>e.functions).find(fn=>fn.id==='orders.approve').receiptContract;
 const unknown=classifyDisV020KdpReceipt(contract,{status:'unexpected-terminal'});
 assert.deepEqual(unknown,{admission:'UNKNOWN',execution:'NOT_PROVEN',businessEvidenceAttested:false});
 assert.throws(()=>classifyDisV020KdpReceipt(contract,{status:123}),reject('DIS_KDP_RECEIPT_INVALID'));
});
test('R16 a LOCAL Function cannot take an authority-bearing KDP receipt contract',async()=>{
 const f=await fixturePromise,p=clone(f.program);
 const from=p.elements.flatMap(e=>e.functions).find(x=>x.id==='orders.approve');
 const target=p.elements.flatMap(e=>e.functions).find(x=>x.id==='tally.assessTaskEvidence');
 target.receiptContract=structuredClone(from.receiptContract);
 assert.throws(()=>compile(f,p),reject('DIS_KDP_RECEIPT_BINDING_UNSUPPORTED'));
});
test('R16 source-pinned Tally rule never attests self-declared business evidence',async()=>{
 const f=await fixturePromise,app=await activate(f);
 try{
  const r=await app.invoke('tally.assessTaskEvidence',{
   issueRef:'https://github.com/kaicreator-mm/tally/issues/37',issueNumber:37,
   sourceSha:'e988321439f65b55936a691c02250b6d62a29409',
   claimRef:'claim:self-declared-not-proven',dependenciesComplete:true
  });
  assert.equal(r.disposition,'OBSERVED');assert.equal(r.authority,'NONE');
  assert.equal(r.value.taskPass,false);
  assert.equal(r.evidence.attested,false);
  assert.deepEqual(r.evidence.declaredRefs,[]);
 }finally{app.stop()}
});


// R17: use real source-locked Tally Function; no invented business oracle.
test('R17 AOT-selected Tally bounded optional and closed record schema preserves UNKNOWN and refuses extra keys',async()=>{
 const f=await fixturePromise,p=clone(f.program);
 const fn=p.elements.flatMap(e=>e.functions).find(x=>x.id==='tally.assessTaskEvidence');
 fn.contract.version='2.0.0';fn.contract.compatibility.major=2;
 fn.contract.input={type:'record',fields:{
  issueRef:'string',issueNumber:'number',sourceSha:'string',
  claimRef:'string',dependenciesComplete:'boolean'
 },optional:['issueRef','issueNumber','sourceSha','claimRef','dependenciesComplete'],
  additionalProperties:false};
 fn.contract.output={type:'record',fields:{
  state:'string',reason:'string',admitted:'boolean',taskPass:'boolean',
  issueRef:'string',sourceSha:'string'
 },optional:['issueRef','sourceSha'],additionalProperties:false};
 const artifact=compile(f,p),app=await activate(f,{artifact,digest:artifact.digest});
 try{
  const unknown=await app.invoke('tally.assessTaskEvidence',{}, {expectedContractVersion:'2.0.0'});
  assert.equal(unknown.disposition,'UNKNOWN');assert.equal(unknown.evidence.attested,false);
  const evidence=await app.invoke('tally.assessTaskEvidence',{
   issueRef:'https://github.com/kaicreator-mm/tally/issues/37',issueNumber:37,
   sourceSha:'e988321439f65b55936a691c02250b6d62a29409',
   claimRef:'claim:r17-unattested',dependenciesComplete:true
  },{expectedContractVersion:'2.0.0'});
  assert.equal(evidence.disposition,'OBSERVED');
  assert.equal(evidence.authority,'NONE');assert.equal(evidence.value.taskPass,false);
  await assert.rejects(app.invoke('tally.assessTaskEvidence',{execute:true},
   {expectedContractVersion:'2.0.0'}),reject('DIS_FUNCTION_INPUT_INVALID'));
  await assert.rejects(app.invoke('tally.assessTaskEvidence',{issueNumber:Infinity},
   {expectedContractVersion:'2.0.0'}),reject('DIS_FUNCTION_INPUT_INVALID'));
  await assert.rejects(app.invoke('tally.assessTaskEvidence',{issueRef:22},
   {expectedContractVersion:'2.0.0'}),reject('DIS_FUNCTION_INPUT_INVALID'));
 }finally{app.stop()}
});
test('R17 same-major structural compatibility allows additive existing Tally output from real source',async()=>{
 const f=await fixturePromise;
 const prev=clone(f.program.elements.flatMap(e=>e.functions)
  .find(x=>x.id==='tally.assessTaskEvidence').contract);
 const next=clone(prev);next.version='1.1.0';next.output.fields.reason='string';
 assert.deepEqual(compareDisV020FunctionContracts(prev,next),{
  compatible:true,from:'1.0.0',to:'1.1.0'
 });
 const p=clone(f.program);
 p.elements.flatMap(e=>e.functions).find(x=>x.id==='tally.assessTaskEvidence').contract=next;
 const artifact=compile(f,p),app=await activate(f,{artifact,digest:artifact.digest});
 try{
  const r=await app.invoke('tally.assessTaskEvidence',{}, {expectedContractVersion:'1.1.0'});
  assert.equal(r.disposition,'UNKNOWN');
  assert.equal(r.value.reason,'MISSING_SOURCE_IDENTITY');
 }finally{app.stop()}
});
test('R17 ABI comparator refuses unversioned drift, required-input addition and output loss',async()=>{
 const f=await fixturePromise;
 const prev=clone(f.program.elements.flatMap(e=>e.functions)
  .find(x=>x.id==='tally.assessTaskEvidence').contract);
 const mutate=(version,fn)=>{const n=clone(prev);n.version=version;fn(n);return n};
 assert.throws(()=>compareDisV020FunctionContracts(prev,
  mutate('1.0.0',n=>{n.output.fields.reason='string'})),
  reject('DIS_FUNCTION_ABI_UNVERSIONED_DRIFT'));
 assert.throws(()=>compareDisV020FunctionContracts(prev,
  mutate('1.1.0',n=>{n.input.fields={mustBePresent:'string'}})),
  reject('DIS_FUNCTION_ABI_INCOMPATIBLE'));
 assert.throws(()=>compareDisV020FunctionContracts(prev,
  mutate('1.1.0',n=>{delete n.output.fields.taskPass})),
  reject('DIS_FUNCTION_ABI_INCOMPATIBLE'));
});
test('R17 ABI comparator refuses status remap, evidence weakening, major drift and narrowing open input',async()=>{
 const f=await fixturePromise;
 const prev=clone(f.program.elements.flatMap(e=>e.functions)
  .find(x=>x.id==='tally.assessTaskEvidence').contract);
 const mutate=fn=>{const n=clone(prev);n.version='1.1.0';fn(n);return n};
 assert.throws(()=>compareDisV020FunctionContracts(prev,
  mutate(n=>{n.outcomes.classes.UNQUALIFIED_INPUT='FAILED'})),
  reject('DIS_FUNCTION_ABI_INCOMPATIBLE'));
 assert.throws(()=>compareDisV020FunctionContracts(prev,
  mutate(n=>{n.evidence.requiredFor=[]})),
  reject('DIS_FUNCTION_ABI_INCOMPATIBLE'));
 assert.throws(()=>compareDisV020FunctionContracts(prev,
  mutate(n=>{n.input.additionalProperties=false})),
  reject('DIS_FUNCTION_ABI_INCOMPATIBLE'));
 const major=clone(prev);major.version='2.0.0';major.compatibility.major=2;
 assert.throws(()=>compareDisV020FunctionContracts(prev,major),
  reject('DIS_FUNCTION_ABI_INCOMPATIBLE'));
});


// R18: the original, pinned Tally Release Function is a LOCAL observation.
test('R18 real Tally release Function treats all 13 reported PASS gates as UNKNOWN, never Release authorization',async()=>{
 const f=await fixturePromise,app=await activate(f);
 const sha='e988321439f65b55936a691c02250b6d62a29409';
 const ref='https://github.com/kaicreator-mm/tally/issues/284';
 const gates=Object.fromEntries(RELEASE_READINESS_REQUIRED_GATES.map(name=>[name,{
  status:'PASS',subjectSha:sha,observedAsOf:'2026-11-08T12:00:00Z',evidenceRef:ref
 }]));
 try{
  const r=await app.invoke('tally.projectReleaseReadiness',{
   repository:'kaicreator-mm/tally',sourceSha:sha,
   observedAsOf:'2026-11-08T13:00:00Z',gates
  },{expectedContractVersion:'1.0.0'});
  assert.equal(r.kind,'OBSERVATION');assert.equal(r.authority,'NONE');
  assert.equal(r.contractVersion,'1.0.0');
  assert.equal(r.disposition,'UNKNOWN');
  assert.equal(r.value.observedEvidence,'REPORTED_COMPLETE_UNVERIFIED');
  assert.equal(r.value.gateCounts.reportedPass,RELEASE_READINESS_REQUIRED_GATES.length);
  assert.equal(r.value.status,'BLOCKED');
  assert.equal(r.value.reason,'INDEPENDENT_RQ_AND_AUTHORITY_NOT_ATTESTED');
  assert.equal(r.value.authorization,'NONE');
  assert.equal(r.value.independentRQRequired,true);
  assert.equal(r.value.canMerge,false);assert.equal(r.value.canTag,false);
  assert.equal(r.value.canPublish,false);assert.equal(r.value.releasePass,false);
  assert.equal(r.evidence.attested,false);assert.deepEqual(r.evidence.declaredRefs,[]);
 }finally{app.stop()}
});
test('R18 mismatched GitHub subject and impossible observation date are never independently verified',async()=>{
 const f=await fixturePromise,app=await activate(f);
 const sha='e988321439f65b55936a691c02250b6d62a29409';
 const ref='https://github.com/kaicreator-mm/tally/issues/284';
 try{
  const wrongSubject=await app.invoke('tally.projectReleaseReadiness',{
   repository:'kaicreator-mm/tally',sourceSha:sha,
   observedAsOf:'2026-11-08T13:00:00Z',
   gates:{productFreeze:{status:'PASS',subjectSha:'f'.repeat(40),
    observedAsOf:'2026-11-08T12:00:00Z',evidenceRef:ref}}
  });
  assert.equal(wrongSubject.disposition,'UNKNOWN');
  assert.equal(wrongSubject.value.gates.find(g=>g.name==='productFreeze').status,'STALE');
  assert.equal(wrongSubject.value.canMerge,false);
  const impossibleFuture=await app.invoke('tally.projectReleaseReadiness',{
   repository:'kaicreator-mm/tally',sourceSha:sha,
   observedAsOf:'2026-11-08T13:00:00Z',
   gates:{productFreeze:{status:'PASS',subjectSha:sha,
    observedAsOf:'2026-11-09T12:00:00Z',evidenceRef:ref}}
  });
  assert.equal(impossibleFuture.value.gates.find(g=>g.name==='productFreeze').reason,'OBSERVATION_TIME_INVALID');
  assert.equal(impossibleFuture.disposition,'UNKNOWN');
  assert.equal(impossibleFuture.evidence.attested,false);
 }finally{app.stop()}
});
test('R18 malformed source identity is UNKNOWN while a locally forged RELEASE_PASS cannot pass typed outcomes',async()=>{
 const f=await fixturePromise,app=await activate(f);
 try{
  const unknown=await app.invoke('tally.projectReleaseReadiness',{
   repository:'kaicreator-mm/tally',sourceSha:'bad',observedAsOf:'bad',gates:{}
  });
  assert.equal(unknown.value.reason,'RELEASE_SOURCE_UNVERIFIED');
  assert.equal(unknown.disposition,'UNKNOWN');assert.equal(unknown.authority,'NONE');
 }finally{app.stop()}
 const registry={...f.registry};
 registry['tally.projectReleaseReadiness']={
  ...registry['tally.projectReleaseReadiness'],
  execute:()=>({
   status:'RELEASE_PASS',reason:'FORGED',authorization:'KDP',
   advisoryOnly:false,independentRQRequired:false,
   taskPass:true,releasePass:true,canMerge:true,canTag:true,canPublish:true
  })
 };
 const forged=await activate(f,{registry});
 try{
  await assert.rejects(forged.invoke('tally.projectReleaseReadiness',{}),
   reject('DIS_OUTCOME_UNDECLARED'));
 }finally{forged.stop()}
});


// R19: cover the selected xDownload Knowledge query and a non-invoked real Effect.
test('R19 xDownload source-real knowledge Function is typed OBSERVED, never an Effect authority',async()=>{
 const f=await fixturePromise,app=await activate(f);
 try{
  const policy=await app.invoke('xdownload.describePolicy',{},
   {expectedContractVersion:'1.0.0'});
  assert.equal(policy.kind,'OBSERVATION');assert.equal(policy.authority,'NONE');
  assert.equal(policy.disposition,'OBSERVED');assert.equal(policy.contractVersion,'1.0.0');
  assert.equal(policy.value.packageId,'business-download@0.2.0-t03');
  assert.equal(policy.value.domainId,'downloads');
  assert.equal(policy.value.effectBindings['effect:acquire'].external.await,'terminal');
  assert.equal(policy.value.effectBindings['effect:acquire'].semantics,'non-idempotent');
  assert.equal(policy.evidence.attested,false);
  assert.deepEqual(policy.evidence.declaredRefs,[]);
 }finally{app.stop()}
});
test('R19 bounded Knowledge query rejects unrequested Effect payload and fabricated Domain or shape',async()=>{
 const f=await fixturePromise,app=await activate(f);
 try{
  await assert.rejects(app.invoke('xdownload.describePolicy',{acquire:true}),
   reject('DIS_FUNCTION_INPUT_INVALID'));
 }finally{app.stop()}
 const registry={...f.registry};
 registry['xdownload.describePolicy']={
  ...registry['xdownload.describePolicy'],
  execute:()=>({packageId:'business-download@0.2.0-t03',policyId:'forged',
   domainId:'foreign',workflowDefinition:{},intentBindings:{},effectBindings:{}})
 };
 const fake=await activate(f,{registry});
 try{
  await assert.rejects(fake.invoke('xdownload.describePolicy',{}),
   reject('DIS_OUTCOME_UNDECLARED'));
 }finally{fake.stop()}
 const malformed={...f.registry};
 malformed['xdownload.describePolicy']={
  ...malformed['xdownload.describePolicy'],
  execute:()=>({packageId:'business-download@0.2.0-t03',policyId:'bad',
   domainId:'downloads',workflowDefinition:1,intentBindings:{},effectBindings:{}})
 };
 const bad=await activate(f,{registry:malformed});
 try{
  await assert.rejects(bad.invoke('xdownload.describePolicy',{}),
   reject('DIS_FUNCTION_OUTPUT_INVALID'));
 }finally{bad.stop()}
});
test('R19 xDownload real KDP Effect is versioned, source-selected and never invoked in a preflight refusal',async()=>{
 const f=await fixturePromise,app=await activate(f);
 try{
  const selected=f.artifact.program.elements.find(e=>e.id==='xdownload.acquire').functions[0];
  assert.equal(selected.binding.type,'kdp-intent');
  assert.equal(selected.binding.intentId,'confirmDownload');
  assert.equal(selected.effect,'governed');
  assert.equal(selected.receiptContract.schema,'dis.v0.2.kdp-receipt-contract/1');
  assert.equal(app.contractVersions['xdownload.confirmDownload'],'1.0.0');
  await assert.rejects(app.invoke('xdownload.confirmDownload',{
   messageId:'msg:r19-do-not-send',instanceKey:'r19-effect-disabled',
   input:{requestId:'r19-not-authorized'}
  },{expectedContractVersion:'0.9.0'}),reject('DIS_FUNCTION_VERSION_MISMATCH'));
  await assert.rejects(app.invoke('xdownload.confirmDownload',{
   input:{requestId:'r19-not-authorized'}
  },{expectedContractVersion:'1.0.0'}),reject('DIS_INTENT_INPUT_INVALID'));
 }finally{app.stop()}
});
test('R19 AOT rejects a forged xDownload Effect receipt map without touching KDP Host',async()=>{
 const f=await fixturePromise,p=clone(f.program);
 const x=p.elements.flatMap(e=>e.functions).find(fn=>fn.id==='xdownload.confirmDownload');
 x.receiptContract.statusMap.complete='ADMITTED';
 assert.throws(()=>compile(f,p),reject('DIS_KDP_RECEIPT_ADMISSION_WEAK'));
});


// R19.1: Preserve the pre-existing zero-argument public Knowledge ABI.
test('R19.1 original source-real xDownload Knowledge Function accepts zero arguments without weakening the closed input',async()=>{
 const f=await fixturePromise,app=await activate(f);
 try{
  const empty=await app.invoke('xdownload.describePolicy',{});
  const omitted=await app.invoke('xdownload.describePolicy');
  assert.equal(omitted.kind,'OBSERVATION');assert.equal(omitted.disposition,'OBSERVED');
  assert.equal(omitted.authority,'NONE');assert.equal(omitted.contractVersion,'1.0.0');
  assert.equal(omitted.value.packageId,empty.value.packageId);
  assert.equal(omitted.value.policyId,empty.value.policyId);
  assert.equal(omitted.evidence.attested,false);
  await assert.rejects(app.invoke('xdownload.describePolicy',null),reject('DIS_FUNCTION_INPUT_INVALID'));
  await assert.rejects(app.invoke('xdownload.describePolicy',{startEffect:true}),reject('DIS_FUNCTION_INPUT_INVALID'));
 }finally{app.stop()}
});
test('R19.1 AOT rejects allowAbsent on nonempty or open inputs and on outputs',async()=>{
 const f=await fixturePromise,p=clone(f.program);
 const knowledge=p.elements.flatMap(e=>e.functions).find(x=>x.id==='xdownload.describePolicy');
 knowledge.contract.output.allowAbsent=true;
 assert.throws(()=>compile(f,p),reject('DIS_FUNCTION_SCHEMA_INVALID'));
 delete knowledge.contract.output.allowAbsent;
 knowledge.contract.input.fields={targetRef:'string'};
 assert.throws(()=>compile(f,p),reject('DIS_FUNCTION_SCHEMA_INVALID'));
 knowledge.contract.input.fields={};
 knowledge.contract.input.additionalProperties=true;
 assert.throws(()=>compile(f,p),reject('DIS_FUNCTION_SCHEMA_INVALID'));
});
test('R19.1 same-major Function comparator refuses revoking the original zero-argument consumer',async()=>{
 const f=await fixturePromise;
 const prev=clone(f.program.elements.flatMap(e=>e.functions)
   .find(x=>x.id==='xdownload.describePolicy').contract);
 const next=clone(prev);next.version='1.1.0';next.input.allowAbsent=false;
 assert.throws(()=>compareDisV020FunctionContracts(prev,next),
  reject('DIS_FUNCTION_ABI_INCOMPATIBLE'));
 next.input.allowAbsent=true;
 assert.equal(compareDisV020FunctionContracts(prev,next).compatible,true);
});


// R20: real Runx source returns a process-local class instance, not a record.
test('R20 selected Runx stateful LOCAL Handle has typed methods and no KDP lease authority',async()=>{
 const f=await fixturePromise,app=await activate(f);
 try{
  assert.equal(app.contractVersions['runx.createPresenceObserver'],'1.0.0');
  const out=await app.invoke('runx.createPresenceObserver',
   ()=>'2026-11-08T14:00:00Z',{expectedContractVersion:'1.0.0'});
  assert.equal(out.kind,'OBSERVATION');assert.equal(out.authority,'NONE');
  assert.equal(out.contractVersion,'1.0.0');
  assert.equal(out.handle.lifetime,'PROCESS_LOCAL');
  assert.deepEqual(out.handle.methods,['observe','list','latest']);
  assert.equal(out.evidence.attested,false);
  assert.equal(out.evidence.source.sourceId,'runx-presence');
  const agent=out.value;
  assert.equal(agent.latest(),null);
  agent.observe({agent_id:'runx-agent',agent_incarnation_id:'runx-inc-1',
   capability:{capability_id:'execute'}},{agent_id:'runx-agent'});
  assert.equal(agent.list().length,1);
  assert.equal(agent.latest().agent_incarnation_id,'runx-inc-1');
  assert.equal(Object.hasOwn(agent.latest(),'execution_authorized'),false);
 }finally{app.stop()}
});
test('R20 forged plain Handle with same method names is not a source-real stateful instance',async()=>{
 const f=await fixturePromise,registry={...f.registry};
 registry['runx.createPresenceObserver']={
  ...registry['runx.createPresenceObserver'],
  execute:()=>({observe(){},list(){return []},latest(){return null}})
 };
 const app=await activate(f,{registry});
 try{
  await assert.rejects(app.invoke('runx.createPresenceObserver',()=>''),reject('DIS_LOCAL_HANDLE_INVALID'));
 }finally{app.stop()}
});
test('R20 stale Runx Handle consumer is rejected before it allocates a stateful instance',async()=>{
 const f=await fixturePromise,app=await activate(f);
 try{
  await assert.rejects(app.invoke('runx.createPresenceObserver',()=>'',{
   expectedContractVersion:'0.9.0'
  }),reject('DIS_FUNCTION_VERSION_MISMATCH'));
 }finally{app.stop()}
});
test('R20 AOT rejects forged Handle method, banned prototype and KDP-to-LOCAL authority confusion',async()=>{
 const f=await fixturePromise,p=clone(f.program);
 const runx=p.elements.flatMap(e=>e.functions).find(x=>x.id==='runx.createPresenceObserver');
 runx.handleContract.methods.push('then');
 assert.throws(()=>compile(f,p),reject('DIS_LOCAL_HANDLE_CONTRACT_INVALID'));
 runx.handleContract.methods.pop();
 runx.handleContract.methods=['observe','observe'];
 assert.throws(()=>compile(f,p),reject('DIS_LOCAL_HANDLE_CONTRACT_INVALID'));
 runx.handleContract.methods=['observe','list','latest'];
 runx.binding={type:'kdp-intent',intentId:'submitQuoteDecisionDynamic'};
 assert.throws(()=>compile(f,p),reject('DIS_LOCAL_HANDLE_BINDING_UNSUPPORTED'));
});


// R30 C1: ALL selected Elements need a stable version; source-linked
// validation metadata is structurally checked but grants no SAP authority.
test('R30 native selected heterogeneous Elements all have a version; multi-Function Interaction shares source-pinned validation',async()=>{
 const f=await fixturePromise,q=qualifyDisV020Artifact(f.artifact);
 assert.equal(q.elements.size,f.program.elements.length);
 assert.equal(q.elements.size,9);
 for(const e of q.elements.values())assert.equal(e.version,'1.0.0');
 const multi=q.elements.get('xdownload.interaction');
 assert.equal(multi.functions.length,2);
 assert.deepEqual(multi.validation,{
  schema:'dis.v0.2.element-validation/1',
  sourceIds:['xdownload-interaction'],authority:'NONE'
 });
 assert.deepEqual(q.elements.get('tally.tasks').validation.sourceIds,['tally-business']);
 assert.equal(q.functions.get('xdownload.interaction.inspect').element.id,multi.id);
 assert.equal(q.functions.get('xdownload.interaction.confirm').element.id,multi.id);
 const app=await activate(f);
 try{
  assert.equal(app.state,'READY');
  const r=await app.invoke('tally.assessTaskEvidence',{});
  assert.equal(r.kind,'OBSERVATION');assert.equal(r.authority,'NONE');
 }finally{app.stop()}
});
test('R30 missing, malformed and silently unversioned Element identity is denied before native KDP boot',async()=>{
 const f=await fixturePromise;
 const invalid=version=>{
  const p=clone(f.program);
  if(version===undefined)delete p.elements[3].version;
  else p.elements[3].version=version;
  return()=>compile(f,p);
 };
 assert.throws(invalid(undefined),reject('DIS_ELEMENT_VERSION_INVALID'));
 assert.throws(invalid('0.1.0'),reject('DIS_ELEMENT_VERSION_INVALID'));
 assert.throws(invalid('1.00.0'),reject('DIS_ELEMENT_VERSION_INVALID'));
 assert.throws(invalid('1.0'),reject('DIS_ELEMENT_VERSION_INVALID'));
 assert.throws(invalid({major:1}),reject('DIS_ELEMENT_VERSION_INVALID'));
});
test('R30 selected Element validation references only sources consumed by its own Functions, never foreign claims or business attestations',async()=>{
 const f=await fixturePromise;
 const mutate=(fn,code)=>{
  const p=clone(f.program),e=p.elements.find(x=>x.id==='tally.tasks');
  fn(e);
  assert.throws(()=>compile(f,p),reject(code));
 };
 mutate(e=>{e.validation.authority='INDEPENDENT_VERIFIED'},'DIS_ELEMENT_VALIDATION_INVALID');
 mutate(e=>{e.validation.sourceIds=[]},'DIS_ELEMENT_VALIDATION_INVALID');
 mutate(e=>{e.validation.sourceIds=['tally-business','tally-business']},'DIS_ELEMENT_VALIDATION_INVALID');
 mutate(e=>{e.validation.sourceIds=['nonselected-source']},'DIS_ELEMENT_VALIDATION_SOURCE_INVALID');
 mutate(e=>{e.validation.sourceIds=['xdownload-business']},'DIS_ELEMENT_VALIDATION_SOURCE_INVALID');
 mutate(e=>{e.validation.sourceIds=['tally-release']},'DIS_ELEMENT_VALIDATION_UNBOUND');
 mutate(e=>{e.validation.semanticOracle=true},'DIS_UNKNOWN_FIELD');
});
test('R30 same-major Element ABI comparator denies unversioned description drift, removed public Function, missing dependency and changed owner',async()=>{
 const f=await fixturePromise;
 const e=clone(f.program.elements.find(x=>x.id==='xdownload.interaction'));
 assert.deepEqual(compareDisV020ElementContracts(e,clone(e)),
  {compatible:true,from:'1.0.0',to:'1.0.0'});
 const unversioned=clone(e);
 unversioned.description+=' fabricated semantic guarantee';
 assert.throws(()=>compareDisV020ElementContracts(e,unversioned),reject('DIS_ELEMENT_UNVERSIONED_DRIFT'));
 const raised=clone(e);
 raised.version='1.1.0';
 assert.deepEqual(compareDisV020ElementContracts(e,raised),
  {compatible:true,from:'1.0.0',to:'1.1.0'});
 const dropped=clone(raised);
 dropped.functions.pop();
 assert.throws(()=>compareDisV020ElementContracts(e,dropped),reject('DIS_ELEMENT_ABI_INCOMPATIBLE'));
 const displaced=clone(raised);
 displaced.domainId='tally';
 assert.throws(()=>compareDisV020ElementContracts(e,displaced),reject('DIS_ELEMENT_ABI_INCOMPATIBLE'));
 const major=clone(raised);major.version='2.0.0';
 assert.throws(()=>compareDisV020ElementContracts(e,major),reject('DIS_ELEMENT_ABI_INCOMPATIBLE'));
 const previousRelease=clone(f.program.elements.find(x=>x.id==='tally.release'));
 const withoutDependency=clone(previousRelease);
 withoutDependency.version='1.1.0';
 withoutDependency.dependsOn=[];
 assert.throws(()=>compareDisV020ElementContracts(previousRelease,withoutDependency),
  reject('DIS_ELEMENT_ABI_INCOMPATIBLE'));
});
