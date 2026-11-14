import test from 'node:test';
import assert from 'node:assert/strict';
import {buildV10App} from '../../tooling/build/dist/index.js';
import {load} from '../../packages/microkernel/dist/index.js';
import {basicComposition,PlainCasDocStore} from '../../tests/assembly/helpers-v010.ts';
import {makeManifest,compileProjection,createActivation,exportProjectionRecord,restoreProjectionRecord} from './bridge.mjs';
import {spawnSync} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
let built;
async function setup(){
 built??=buildV10App(await basicComposition());
 const m=await makeManifest(built),projection=await compileProjection(m,built);
 return {m,projection,activation:createActivation({projection,built,load,store:new PlainCasDocStore(),})};
}
const code=c=>e=>e?.code===c;
test('real canonical BUILD emits selected KDP, SDK and Business Package closure',async()=>{
 const {projection}=await setup();
 assert.ok(typeof built.subjectDigest==='string'&&built.subjectDigest.length>=64);
 assert.ok(built.modules.some(x=>x.role==='kernel-primary'));
 assert.ok(built.modules.some(x=>x.role==='standard-primary'));
 assert.ok(built.modules.some(x=>x.role==='business'));
 assert.equal(projection.buildSubject,built.subjectDigest);
});
test('DIS Element.Function projects to actual BUILD-selected intent route',async()=>{
 const {projection}=await setup();
 assert.equal(projection.routes.get('approveQuote').intentType,'submitQuoteDecisionDynamic');
});
test('business ingress is closed before App Init',async()=>{
 const {activation}=await setup();
 await assert.rejects(activation.invoke('approveQuote',{messageId:'msg:early',instanceKey:'instance:early',input:{amount:30,requestId:'R-early'}}),code('APP_NOT_READY'));
 activation.stop();
});
test('real Microkernel load followed by one Business Init opens governed ingress',async()=>{
 const {activation}=await setup();
 try{
  assert.equal((await activation.start()).status,'READY');
  await assert.rejects(activation.start(),code('APP_INIT_REPEATED'));
  const receipt=await activation.invoke('approveQuote',{messageId:'msg:dis-r1',instanceKey:'instance:dis-r1',input:{amount:30,requestId:'DIS-R1'}});
  assert.equal(receipt.status,'admitted',JSON.stringify(receipt).slice(0,1200));
 }finally{activation.stop()}
});
test('real selected KDP denies an incompatible business decision',async()=>{
 const {activation}=await setup();
 try{
  await activation.start();
  let outcome;try{outcome=await activation.invoke('approveQuote',{messageId:'msg:dis-guard',instanceKey:'instance:dis-guard',input:{amount:75,requestId:'DIS-75'}})}catch(e){outcome=e}
  assert.notEqual(outcome?.status,'admitted','guard violation must not yield admitted');
 }finally{activation.stop()}
});
test('failed Business App Init closes real SDK activation and leaves ingress unavailable',async()=>{
 const {projection}=await setup();
 const a=createActivation({projection,built,load,store:new PlainCasDocStore(),testMode:'test-blocked'});
 await assert.rejects(a.start(),code('APP_INIT_BLOCKED'));
 assert.equal(a.state,'FAILED');
 await assert.rejects(a.invoke('approveQuote',{messageId:'msg:bad',instanceKey:'instance:bad',input:{}}),code('APP_NOT_READY'));
 a.stop();
});
test('DEGRADED cannot conceal mandatory ingress',async()=>{
 const {projection}=await setup();
 const a=createActivation({projection,built,load,store:new PlainCasDocStore(),testMode:'test-degraded-mandatory'});
 await assert.rejects(a.start(),code('APP_INIT_MANDATORY_DEGRADED'));
 a.stop();
});
test('AOT target drift fails closed',async()=>{
 const {m}=await setup();m.target='android';
 await assert.rejects(compileProjection(m,built),code('AOT_TARGET_DRIFT'));
});
test('AOT BUILD identity drift fails closed',async()=>{
 const {m}=await setup();m.subjectDigest='tampered';
 await assert.rejects(compileProjection(m,built),code('AOT_BUILD_IDENTITY_DRIFT'));
});
test('App Init implementation bytes are pinned',async()=>{
 const {m}=await setup();m.init.sourceSha256='tampered';
 await assert.rejects(compileProjection(m,built),code('BUSINESS_INIT_BYTES_DRIFT'));
});
test('undocumented Function cannot become an ingress',async()=>{
 const {m}=await setup();m.ingress=[{id:'unknown',element:'orders.approval',function:'missing'}];
 await assert.rejects(compileProjection(m,built),code('FUNCTION_UNBOUND'));
});
test('unselected Business intent cannot be published as Function',async()=>{
 const {m}=await setup();m.elements[1].functions[0].intentId='notSelected';
 await assert.rejects(compileProjection(m,built),code('FUNCTION_NOT_EXPORTED'));
});
test('Element static dependency cycle fails before load',async()=>{
 const {m}=await setup();m.elements[0].dependencies=['orders.approval'];m.elements[1].dependencies=['orders.app-init'];
 await assert.rejects(compileProjection(m,built),code('ELEMENT_DEP_CYCLE'));
});
test('exactly one Business App Init is required',async()=>{
 const {m}=await setup();m.elements[1].functions.push({id:'otherInit',kind:'init'});
 await assert.rejects(compileProjection(m,built),code('BUSINESS_INIT_NOT_UNIQUE'));
});
test('Element must bind to a selected Business Package',async()=>{
 const {m}=await setup();m.elements[1].packageId='unselected-package';
 await assert.rejects(compileProjection(m,built),code('ELEMENT_PACKAGE_NOT_SELECTED'));
});
test('actual BUILD module bytes are checked, not only declared digest',async()=>{
 const {m}=await setup();const tampered={...built,modules:built.modules.map((p,i)=>i===0?{...p,moduleSource:p.moduleSource+'\n// tampered'}:p)};
 await assert.rejects(compileProjection(m,tampered),code('AOT_MODULE_BYTES_DRIFT'));
});

test('AOT ingress routes are immutable after compilation',async()=>{
 const {projection}=await setup();
 assert.equal(projection.routes.set,undefined);
 assert.throws(()=>{projection.manifest.ingress[0].id='forged'},TypeError);
 assert.equal(projection.routes.get('approveQuote').intentType,'submitQuoteDecisionDynamic');
});
test('unselected business-init callback is ignored: selected bytes own initialization',async()=>{
 const {projection}=await setup();let unselectedCalls=0;
 const a=createActivation({projection,built,load,store:new PlainCasDocStore(),appInit:async()=>{unselectedCalls++;return {status:'BLOCKED'}}});
 try{assert.equal((await a.start()).status,'READY');assert.equal(unselectedCalls,0)}finally{a.stop()}
});

test('caller-cloned or forged projection cannot activate a trusted BUILD',async()=>{
 const {projection}=await setup();
 assert.throws(()=>createActivation({projection:{...projection},built,load,store:new PlainCasDocStore()}),code('PROJECTION_NOT_QUALIFIED'));
});
test('same-identities cloned BUILD cannot replace selected compiled instance',async()=>{
 const {projection}=await setup();
 assert.throws(()=>createActivation({projection,built:{...built},load,store:new PlainCasDocStore()}),code('PROJECTION_BUILD_INSTANCE_MISMATCH'));
});
test('business ingress missing input has a typed denial',async()=>{
 const {activation}=await setup();
 try{await activation.start();await assert.rejects(activation.invoke('approveQuote'),code('INGRESS_INPUT_INVALID'))}finally{activation.stop()}
});
test('stopped real SDK facade cannot re-open business ingress',async()=>{
 const {activation}=await setup();
 await activation.start();activation.stop();
 await assert.rejects(activation.invoke('approveQuote',{messageId:'msg:stopped',instanceKey:'instance:stopped',input:{}}),code('APP_NOT_READY'));
});
test('stop racing an in-flight real Microkernel load cancels App Init and closes facade',async()=>{
 const {projection}=await setup();let release;const pending=new Promise(resolve=>{release=resolve});let closes=0;
 const delayedLoad=async(...args)=>{const app=await load(...args);await pending;return {...app,stop(){closes++;app.stop()}}};
 const a=createActivation({projection,built,load:delayedLoad,store:new PlainCasDocStore()});
 const starting=a.start();assert.equal(a.state,'STARTING');a.stop();release();
 await assert.rejects(starting,code('APP_START_CANCELLED'));
 assert.equal(a.state,'STOPPED');assert.equal(closes,1);
 await assert.rejects(a.invoke('approveQuote',{messageId:'msg:cancelled',instanceKey:'instance:cancelled',input:{}}),code('APP_NOT_READY'));
});
test('two concurrent App Init attempts cannot double-start the selected Package',async()=>{
 const {projection}=await setup();let release;const pending=new Promise(resolve=>{release=resolve});
 const deferred=async(...args)=>{const app=await load(...args);await pending;return app};
 const a=createActivation({projection,built,load:deferred,store:new PlainCasDocStore()});
 const first=a.start();await assert.rejects(a.start(),code('APP_INIT_REPEATED'));
 a.stop();release();await assert.rejects(first,code('APP_START_CANCELLED'));
});

test('AOT budget changes after qualification refuse the real SDK load',async()=>{
 const candidate=structuredClone(built??buildV10App(await basicComposition()));
 const projection=await compileProjection(await makeManifest(candidate),candidate);
 const a=createActivation({projection,built:candidate,load,store:new PlainCasDocStore()});
 candidate.hardBudget.maxStepsPerTurn+=1;
 await assert.rejects(a.start(),code('AOT_ACTIVATION_DRIFT'));assert.equal(a.state,'FAILED');
});
test('AOT selected module load order changes after qualification refuse startup',async()=>{
 const candidate=structuredClone(built??buildV10App(await basicComposition()));
 const projection=await compileProjection(await makeManifest(candidate),candidate);
 const a=createActivation({projection,built:candidate,load,store:new PlainCasDocStore()});
 candidate.loadOrder.reverse();
 await assert.rejects(a.start(),code('AOT_ACTIVATION_DRIFT'));assert.equal(a.state,'FAILED');
});
test('AOT import allowance changes after qualification cannot silently expand Function behavior',async()=>{
 const candidate=structuredClone(built??buildV10App(await basicComposition()));
 const projection=await compileProjection(await makeManifest(candidate),candidate);
 const a=createActivation({projection,built:candidate,load,store:new PlainCasDocStore()});
 candidate.modules[0].externalImports={node:['node:fs'],npm:[],native:[]};
 await assert.rejects(a.start(),code('AOT_ACTIVATION_DRIFT'));assert.equal(a.state,'FAILED');
});

test('portable projection record must be requalified against fresh real BUILD',async()=>{
 const {projection}=await setup();
 const record=JSON.parse(JSON.stringify(exportProjectionRecord(projection)));
 const rebuilt=buildV10App(await basicComposition());
 assert.equal(rebuilt.subjectDigest,built.subjectDigest);
 const restored=await restoreProjectionRecord(record,rebuilt,{expectedProjectionDigest:projection.projectionDigest});
 assert.equal(restored.routes.get('approveQuote').intentType,'submitQuoteDecisionDynamic');
 const a=createActivation({projection:restored,built:rebuilt,load,store:new PlainCasDocStore()});
 try{assert.equal((await a.start()).status,'READY')}finally{a.stop()}
});
test('serialized projection cannot grant itself an AOT trust anchor',async()=>{
 const {projection}=await setup();
 const record=JSON.parse(JSON.stringify(exportProjectionRecord(projection)));
 await assert.rejects(restoreProjectionRecord(record,buildV10App(await basicComposition())),code('AOT_TRUST_ANCHOR_REQUIRED'));
});
test('tampering serialized Element.Function fails despite unchanged claimed digest',async()=>{
 const {projection}=await setup();
 const record=JSON.parse(JSON.stringify(exportProjectionRecord(projection)));
 record.manifest.elements[1].functions[0].id='forged';
 const rebuilt=buildV10App(await basicComposition());
 await assert.rejects(restoreProjectionRecord(record,rebuilt,{expectedProjectionDigest:projection.projectionDigest}),
   code('FUNCTION_UNBOUND'));
});
test('wrong installed trusted projection digest cannot restore even a valid record',async()=>{
 const {projection}=await setup(),record=JSON.parse(JSON.stringify(exportProjectionRecord(projection)));
 await assert.rejects(restoreProjectionRecord(record,buildV10App(await basicComposition()),
   {expectedProjectionDigest:'untrusted-digest'}),code('AOT_PROJECTION_RECORD_DRIFT'));
});
test('reconstructed BUILD budget drift refuses persisted projection',async()=>{
 const {projection}=await setup(),record=JSON.parse(JSON.stringify(exportProjectionRecord(projection)));
 const rebuilt=structuredClone(buildV10App(await basicComposition()));
 rebuilt.hardBudget.maxStepsPerTurn+=1;
 await assert.rejects(restoreProjectionRecord(record,rebuilt,{expectedProjectionDigest:projection.projectionDigest}),
   code('AOT_BUILD_SNAPSHOT_DRIFT'));
});
test('real KDP CAS state and idempotent replay survive closed App and new qualified activation',async()=>{
 const {projection}=await setup();
 const record=JSON.parse(JSON.stringify(exportProjectionRecord(projection)));
 const store=new PlainCasDocStore();
 const first=createActivation({projection,built,load,store});
 const input={messageId:'msg:dis-restart',instanceKey:'instance:dis-restart',input:{amount:30,requestId:'DIS-RESTORE'}};
 try{
   await first.start();
   const admitted=await first.invoke('approveQuote',input);
   assert.equal(admitted.status,'admitted');
 }finally{first.stop()}
 const rebuilt=buildV10App(await basicComposition());
 const requalified=await restoreProjectionRecord(record,rebuilt,{expectedProjectionDigest:projection.projectionDigest});
 const restored=createActivation({projection:requalified,built:rebuilt,load,store});
 try{
   await restored.start();
   const receipt=await restored.invoke('approveQuote',input);
   assert.equal(receipt.idempotentReplay,true,'existing KDP Journal must replay the old receipt');
 }finally{restored.stop()}
});
test('a separate Node process requalifies a persisted projection with real BUILD',async()=>{
 const {projection}=await setup();
 const record=JSON.parse(JSON.stringify(exportProjectionRecord(projection)));
 const dir=await mkdtemp(join(tmpdir(),'dis-v020-restore-'));
 const path=join(dir,'projection.json');
 try{
   await writeFile(path,JSON.stringify(record),'utf8');
   const child=fileURLToPath(new URL('./projection-restart-child.mjs',import.meta.url));
   const result=spawnSync(process.execPath,['--import','tsx',child,path,projection.projectionDigest],
     {encoding:'utf8'});
   assert.equal(result.status,0,result.stderr);
   const verified=JSON.parse(result.stdout.trim());
   assert.equal(verified.status,'RESTORED_REAL_BUILD');
   assert.equal(verified.subjectDigest,built.subjectDigest);
 }finally{await rm(dir,{recursive:true,force:true})}
});
