// #960 V08-B2-R2: executable K1 + physical B→native T003C→T004C
// Host and script tests are research-only, with original v0.7 authority.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,readFile,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createFixture } from '../../v08-gatea-b1-955-r2/tests/fixtures.mjs';
import { establishTrustedB1Host } from '../../v08-gatea-b1-955-r2/bridge/attested-binding.mjs';
import { packageDigest,hashBytes } from '../../v08-gatea-b1-955-r2/reference956/candidate-validator.mjs';
import { establishTrustedPackageKindHost } from '../package-kind/host.mjs';
import { joinPhysicalBToNativeV07 } from '../authority/native-join.mjs';
// Only an unactivated occurrence/actual original durable journal is reused.
// The nativeFixture() Tool handle, Assembly and request are NOT used.
import { fixture as nativeFixture } from
  '../../../packages/domain-harness/tests/effectful-invocation/effectful-invocation.test.ts';

const sha=x=>createHash('sha256').update(x).digest('hex');
const profiles=[
 {id:'workflow-old',kind:'demo.approval',component:'flow.old',
  impl:'impl.flow.old',op:'run',effect:'none',threshold:70,
  result:'APPROVED',fallback:'WAIT',cap:'flow.evaluate',
  body:"export const kindValidators={'demo.approval@1.0.0':({semanticBody:b})=>{if(b.threshold!==70)throw Error('bad');}};export const implementations={'impl.flow.old':b=>({run:({score})=>({status:score>=b.threshold?'APPROVED':'WAIT',source:'old'})})};"},
 {id:'workflow-unfamiliar',kind:'demo.escalation',component:'flow.other',
  impl:'impl.flow.other',op:'run',effect:'none',threshold:90,
  result:'ESCALATED',fallback:'MANUAL_REVIEW',cap:'flow.evaluate',
  body:"export const kindValidators={'demo.escalation@1.0.0':({semanticBody:b})=>{if(b.threshold!==90)throw Error('bad');}};export const implementations={'impl.flow.other':b=>({run:({score})=>({status:score>=b.threshold?'ESCALATED':'MANUAL_REVIEW',source:'other'})})};"},
 {id:'physical-charge',kind:'demo.native-charge',component:'tool.physical',
  impl:'impl.charge.physical',op:'op.charge',effect:'non-idempotent',
  threshold:42,cap:'cap.charge',
  body:"export const kindValidators={'demo.native-charge@1.0.0':({semanticBody:b})=>{if(b.threshold!==42)throw Error('bad');}};export const implementations={'impl.charge.physical':b=>({'op.charge':({amount})=>({charged:amount===b.threshold,fromPhysicalB:true})})};"}
];
function candidate(p){
 const component={schemaVersion:'ucb/1',componentId:p.component,packageId:p.id,
  kindRef:{kindId:p.kind,version:'1.0.0'},semanticBody:{threshold:p.threshold},
  requiredSemanticContracts:[],requiresCapabilities:[],
  providesCapabilities:[{capabilityId:p.cap,version:'1.0.0',operations:[p.op]}],
  relations:[],operations:[{operationId:p.op,inputSchema:{type:'object'},outputSchema:{type:'object'},
   failures:[],effect:p.effect,callers:['business'],exposure:'internal'}]};
 const m={formatVersion:'dhpkg/0.8-candidate-1',packageId:p.id,packageVersion:'1.0.0',
  targetAbi:'dh.node22/1',hostRequirements:[],dependencies:[],imports:[],exports:[p.component],
  components:[component],implementations:[{implementationId:p.impl,
   componentId:p.component,path:'modules/impl.mjs',
   sha256:'sha256:'+hashBytes(Buffer.from(p.body))}],integrity:''};
 m.integrity=packageDigest(m,{'modules/impl.mjs':p.body});
 return {bCandidate:m,bKinds:[{kindId:p.kind,version:'1.0.0',componentId:p.component,
   implementationId:p.impl,operationId:p.op}],moduleSha256:'sha256:'+sha(p.body)};
}
async function prepare(){
 const base=await createFixture();
 const root=await mkdtemp(join(tmpdir(),'v08-b2-r2-'));
 const pins={};
 for(const p of profiles){
  await mkdir(join(root,p.id,'modules'),{recursive:true});
  const data=JSON.stringify(candidate(p),null,2)+'\n';
  await writeFile(join(root,p.id,'manifest.json'),data);
  await writeFile(join(root,p.id,'modules','impl.mjs'),p.body);
  pins[p.id]={manifestSha256:sha(data),moduleSha256:sha(p.body),packageVersion:'1.0.0'};
 }
 const b1Host=establishTrustedB1Host({root:base.root,approvedPins:base.pins});
 const host=establishTrustedPackageKindHost({root,approvedPins:pins,b1Host});
 const select=p=>({packageId:p.id,componentId:p.component,
   kindRef:{kindId:p.kind,version:'1.0.0'}});
 return {root,pins,host,select,base,b1Host};
}
function rejectsCode(code){
 return e=>{assert.equal(e?.code,code,'expected '+code+', got '+String(e));return true;};
}
test('K1: both truly different physical Kind profiles execute via SAME Kernel bound dispatch',async()=>{
 const fx=await prepare();
 const a=await fx.host.seal(fx.select(profiles[0]));
 const b=await fx.host.seal(fx.select(profiles[1]));
 assert.deepEqual(a.invoke({operationId:'run',input:{score:80}}),{status:'APPROVED',source:'old'});
 assert.deepEqual(b.invoke({operationId:'run',input:{score:80}}),{status:'MANUAL_REVIEW',source:'other'});
 assert.deepEqual(b.invoke({operationId:'run',input:{score:95}}),{status:'ESCALATED',source:'other'});
 assert.equal(a.assembly.baseAssemblyDigest,b.assembly.baseAssemblyDigest);
 assert.notEqual(a.assembly.digest,b.assembly.digest);
 assert.throws(()=>a.invoke({operationId:'op.charge',input:{score:80}}),rejectsCode('E_OPERATION_SCOPE'));
 assert.throws(()=>b.rebind(),rejectsCode('E_SEALED'));
});
test('K1: exact B1 reviewed valid four-Package closure and undeclared/ambiguous providers',async()=>{
 const positive=await createFixture({four:true});
 const linked=await establishTrustedB1Host({root:positive.root,approvedPins:positive.pins}).seal({four:true});
 assert.ok(linked.assembly.graphDigest);
 for(const [options,code] of [
   [{four:true,invalidImport:true},'E_UNDECLARED_IMPORT'],
   [{duplicateProvider:true},'E_AMBIGUOUS_PROVIDER']
 ]){
  const bad=await createFixture(options);
  await assert.rejects(
   ()=>establishTrustedB1Host({root:bad.root,approvedPins:bad.pins}).seal({four:!!options.four}),
   rejectsCode(code)
  );
 }
});
test('K1: effectful physical Package cannot bypass Kernel pure operation gate',async()=>{
 const fx=await prepare(),selected=await fx.host.seal(fx.select(profiles[2]));
 assert.throws(()=>selected.invoke({operationId:'op.charge',input:{amount:42}}),
   rejectsCode('E_EFFECT_ADMISSION_REQUIRED'));
 assert.throws(()=>selected.rebind(),rejectsCode('E_SEALED'));
});
test('A1: real physical B Handler SHA is minted into native T003C handle and original T004C Journal',async()=>{
 const fx=await prepare(),occurrence=await nativeFixture({skipActivation:true});
 const joined=await joinPhysicalBToNativeV07({
  trustedBHost:fx.host,selector:fx.select(profiles[2]),occurrenceFixture:occurrence
 });
 assert.equal(joined.binding.evidence.implementation.implementationDigest,
  'sha256:'+fx.pins['physical-charge'].moduleSha256);
 assert.equal(joined.binding.evidence.implementation.implementationId,profiles[2].impl);
 assert.equal(joined.operationId,'op.charge');
 assert.equal(joined.actualPin.authorityClass,'PRODUCTION');
 assert.equal(joined.actualPin.assemblyDigest,joined.nativeAssembly.assemblyDigest);
 const result=await joined.invoke();
 assert.equal(result.outcome.status,'admitted');
 assert.equal(result.invocation.implementation.implementationDigest,
  'sha256:'+fx.pins['physical-charge'].moduleSha256);
 assert.equal(joined.getDispatchCount(),1);
 assert.equal(joined.journal.getRecords().length,1);
 assert.equal(joined.journal.getRecords()[0].status,'completed');
 // Repeat the exact source and occurrence: original Journal must not dispatch twice.
 const replay=await joined.invoke();
 assert.equal(replay.outcome.status,'admitted');
 assert.equal(joined.getDispatchCount(),1);
 assert.equal(joined.journal.getRecords().length,1);
});
test('A1: fake caller effect authority and fake bound handle never dispatch',async()=>{
 const fx=await prepare(),occurrence=await nativeFixture({skipActivation:true});
 const joined=await joinPhysicalBToNativeV07({
  trustedBHost:fx.host,selector:fx.select(profiles[2]),occurrenceFixture:occurrence
 });
 for(const field of ['effectAuthority','effectTools']){
  await assert.rejects(()=>joined.invoke({[field]:{invoke(){throw Error('forged')}}}),
    rejectsCode('E_CALLER_EFFECT_AUTHORITY'));
 }
 const lookalike={evidence:{...joined.binding.evidence},
  successorAssembly:joined.binding.successorAssembly,
  implementationHandle:joined.binding.implementationHandle};
 await assert.rejects(()=>joined.invoke({binding:lookalike}),
  rejectsCode('UNMINTED_TOOL_IMPLEMENTATION_BINDING'));
 assert.equal(joined.getDispatchCount(),0);
 assert.equal(joined.journal.getRecords().length,0);
});
test('A1: physical B post-Seal module replacement refuses before T004C and Journal',async()=>{
 const fx=await prepare(),occurrence=await nativeFixture({skipActivation:true});
 const joined=await joinPhysicalBToNativeV07({
  trustedBHost:fx.host,selector:fx.select(profiles[2]),occurrenceFixture:occurrence
 });
 await writeFile(join(fx.root,'physical-charge','modules','impl.mjs'),
  "export const implementations={'impl.charge.physical':()=>({'op.charge':()=>({forged:true})})};");
 await assert.rejects(()=>joined.invoke(),rejectsCode('E_APPROVED_BYTES_STALE'));
 assert.equal(joined.getDispatchCount(),0);
 assert.equal(joined.journal.getRecords().length,0);
});
test('A1: native T002B Assembly spoof and foreign occurrence refuse before effects',async()=>{
 const fx=await prepare(),occurrence=await nativeFixture({skipActivation:true});
 const joined=await joinPhysicalBToNativeV07({
  trustedBHost:fx.host,selector:fx.select(profiles[2]),occurrenceFixture:occurrence
 });
 const fake={...joined.binding,successorAssembly:{...joined.binding.successorAssembly}};
 await assert.rejects(()=>joined.invoke({binding:fake}),
   rejectsCode('ASSEMBLY_PROVENANCE_UNVERIFIED'));
 const foreign={...occurrence.admissionRequest,workflowInstanceId:'foreign-occurrence'};
 await assert.rejects(()=>joined.invoke({admissionRequest:foreign}),
   e=>{assert.ok(typeof e?.code==='string');return true;});
 assert.equal(joined.getDispatchCount(),0);
 assert.equal(joined.journal.getRecords().length,0);
});
test('A1: requested native physical operation cannot be silently re-bound',async()=>{
 const fx=await prepare(),occurrence=await nativeFixture({skipActivation:true});
 const joined=await joinPhysicalBToNativeV07({
  trustedBHost:fx.host,selector:fx.select(profiles[2]),occurrenceFixture:occurrence
 });
 assert.throws(()=>joined.rebind(),rejectsCode('E_NATIVE_REBIND_FORBIDDEN'));
 const moved={...joined.admitted,operationId:'op.foreign'};
 await assert.rejects(()=>joined.invoke({request:moved}),
  e=>{assert.ok(typeof e?.code==='string');return true;});
 assert.equal(joined.getDispatchCount(),0);
 assert.equal(joined.journal.getRecords().length,0);
});
