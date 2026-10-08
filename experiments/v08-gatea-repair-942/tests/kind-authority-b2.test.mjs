// #960 Gate-A B2 bounded actual tests. Host is trusted; fixtures are isolated.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createFixture } from '../../v08-gatea-b1-955-r2/tests/fixtures.mjs';
import { establishTrustedB1Host } from '../../v08-gatea-b1-955-r2/bridge/attested-binding.mjs';
import { packageDigest, hashBytes } from '../../v08-gatea-b1-955-r2/reference956/candidate-validator.mjs';
import { establishTrustedPackageKindHost } from '../package-kind/host.mjs';
import { invokeWithExistingV07Authority } from '../authority/invoke-v07.mjs';
// ORIGINAL accepted v0.7 T002/T003/T004C fixture; not an invented Runtime.
// Its own native tests register during import.
import { fixture as nativeFixture, invocationInput, recordingDispatch } from
  '../../../packages/domain-harness/tests/effectful-invocation/effectful-invocation.test.ts';

const sha=b=>createHash('sha256').update(b).digest('hex');
const pkgs=[
  {id:'approval',kind:'demo.approval',component:'approve-flow',implementation:'impl.approval.v1',
   semantics:{threshold:70,decision:'APPROVED'},
   module: "export const kindValidators={'demo.approval@1.0.0':({semanticBody:b})=>{if(b.threshold!==70||b.decision!=='APPROVED')throw Object.assign(new Error('bad approval'),{code:'E_SEMANTICS'});}};export const implementations={'impl.approval.v1':b=>({run:({score})=>({status:score>=b.threshold?b.decision:'WAIT',profile:'approval'})})};"},
  {id:'escalation',kind:'demo.escalation',component:'escalate-flow',implementation:'impl.escalation.v1',
   semantics:{threshold:90,decision:'ESCALATED'},
   module: "export const kindValidators={'demo.escalation@1.0.0':({semanticBody:b})=>{if(b.threshold!==90||b.decision!=='ESCALATED')throw Object.assign(new Error('bad escalation'),{code:'E_SEMANTICS'});}};export const implementations={'impl.escalation.v1':b=>({run:({score})=>({status:score>=b.threshold?b.decision:'MANUAL_REVIEW',profile:'escalation'})})};"}
];
function buildManifest(p,source){
  const c={schemaVersion:'ucb/1',componentId:p.component,packageId:p.id,
    kindRef:{kindId:p.kind,version:'1.0.0'},semanticBody:p.semantics,
    requiredSemanticContracts:[],requiresCapabilities:[],
    providesCapabilities:[{capabilityId:'flow.evaluate',version:'1.0.0',operations:['run']}],
    relations:[],operations:[{operationId:'run',inputSchema:{type:'object'},
      outputSchema:{type:'object'},failures:[],effect:'none',callers:['business'],exposure:'internal'}]};
  const manifest={formatVersion:'dhpkg/0.8-candidate-1',packageId:p.id,packageVersion:'1.0.0',
    targetAbi:'dh.node22/1',hostRequirements:[],dependencies:[],imports:[],exports:[p.component],
    components:[c],implementations:[{implementationId:p.implementation,
      componentId:p.component,path:'modules/impl.mjs',sha256:'sha256:'+hashBytes(Buffer.from(source))}],integrity:''};
  manifest.integrity=packageDigest(manifest,{'modules/impl.mjs':source});
  return {bCandidate:manifest,bKinds:[{kindId:p.kind,version:'1.0.0',
    componentId:p.component,implementationId:p.implementation,operationId:'run'}],
    moduleSha256:'sha256:'+sha(source)};
}
async function prepare(){
  const base=await createFixture();
  const root=await mkdtemp(join(tmpdir(),'v08-b2-kind-'));
  const pins={};
  for(const p of pkgs){
    const dir=join(root,p.id);
    await mkdir(join(dir,'modules'),{recursive:true});
    const mf=JSON.stringify(buildManifest(p,p.module),null,2)+'\n';
    await writeFile(join(dir,'manifest.json'),mf);
    await writeFile(join(dir,'modules','impl.mjs'),p.module);
    pins[p.id]={manifestSha256:sha(mf),moduleSha256:sha(p.module),packageVersion:'1.0.0'};
  }
  const b1Host=establishTrustedB1Host({root:base.root,approvedPins:base.pins});
  const host=establishTrustedPackageKindHost({root,approvedPins:pins,b1Host});
  const select=p=>({packageId:p.id,kindRef:{kindId:p.kind,version:'1.0.0'},componentId:p.component});
  return {root,pins,host,select};
}
test('K1: distinct Kind/Workflow Package profiles via SAME neutral host + real B1 Seal',async()=>{
  const f=await prepare();
  const a=await f.host.seal(f.select(pkgs[0]));
  const b=await f.host.seal(f.select(pkgs[1]));
  assert.deepEqual(a.invoke({operationId:'run',input:{score:80}}),{status:'APPROVED',profile:'approval'});
  assert.deepEqual(b.invoke({operationId:'run',input:{score:80}}),{status:'MANUAL_REVIEW',profile:'escalation'});
  assert.deepEqual(b.invoke({operationId:'run',input:{score:95}}),{status:'ESCALATED',profile:'escalation'});
  assert.notEqual(a.assembly.digest,b.assembly.digest);
  assert.equal(a.assembly.baseAssemblyDigest,b.assembly.baseAssemblyDigest);
  assert.ok(Object.isFrozen(a.assembly) && Object.isFrozen(b.assembly));
});
test('K1: unknown version, unapproved provider and foreign Component fail closed',async()=>{
  const f=await prepare();
  await assert.rejects(()=>f.host.seal({...f.select(pkgs[0]),kindRef:{kindId:'demo.approval',version:'2.0.0'}}),
    e=>e?.code==='E_SELECTED_KIND');
  await assert.rejects(()=>f.host.seal({packageId:'foreign',kindRef:{kindId:'demo.approval',version:'1.0.0'},componentId:'approve-flow'}),
    e=>e?.code==='E_UNAPPROVED_PACKAGE');
  await assert.rejects(()=>f.host.seal({...f.select(pkgs[0]),componentId:'escalate-flow'}),
    e=>e?.code==='E_SELECTED_KIND');
});
test('K1: tampered wrong existing handler/owner rejected at trust root',async()=>{
  const f=await prepare(),p=pkgs[0],path=join(f.root,p.id,'manifest.json');
  const mf=JSON.parse(await readFile(path,'utf8'));
  mf.bKinds[0].implementationId='impl.escalation.v1'; // exists in foreign Package
  await writeFile(path,JSON.stringify(mf));
  await assert.rejects(()=>f.host.seal(f.select(p)),e=>e?.code==='E_APPROVED_BYTES');
  await assert.rejects(()=>f.host.seal({...f.select(p),approvedPins:{}}),e=>e?.code==='E_APPROVED_BYTES');
});
test('K1: post-Seal physical module mutation does not replace captured callable',async()=>{
  const f=await prepare(),p=pkgs[0],sealed=await f.host.seal(f.select(p));
  await writeFile(join(f.root,p.id,'modules/impl.mjs'),
    "export const implementations={'impl.approval.v1':()=>({run:()=>({status:'FORGED'})})};");
  assert.deepEqual(sealed.invoke({operationId:'run',input:{score:80}}),{status:'APPROVED',profile:'approval'});
  await assert.rejects(()=>f.host.seal(f.select(p)),e=>e?.code==='E_APPROVED_BYTES');
});
test('K1: undeclared operation + caller effect callback cannot grant authority',async()=>{
  const f=await prepare(),sealed=await f.host.seal(f.select(pkgs[0]));
  assert.throws(()=>sealed.invoke({operationId:'charge',input:{score:80},
    effectAuthority:{invoke(){throw Error('not reached');}}}),{code:'E_OPERATION_SCOPE'});
  assert.throws(()=>sealed.rebind(),{code:'E_SEALED'});
  assert.equal(Object.hasOwn(sealed,'effectAuthority'),false);
  assert.equal(Object.hasOwn(sealed,'dispatch'),false);
});
test('A1: real v0.7 T004C Central Admission PRODUCTION effect and durable journal',async()=>{
  const fx=await nativeFixture(),calls=[];
  const result=await invokeWithExistingV07Authority(
    invocationInput(fx,{dispatch:recordingDispatch(calls)}));
  assert.equal(result.outcome.status,'admitted');
  assert.equal(calls.length,1);
  assert.equal(calls[0].handle,fx.binding.implementationHandle);
  assert.equal(calls[0].operationId,'op.charge');
  assert.equal(result.occurrence.authorityClass,'PRODUCTION');
  assert.equal(result.occurrence.assemblyDigest,fx.binding.successorAssembly.assemblyDigest);
  assert.equal(fx.journal.getRecords().length,1);
  assert.equal(fx.journal.getRecords()[0].status,'completed');
});
test('A1: forged caller effectAuthority/effectTools denied before T004C effect',async()=>{
  const fx=await nativeFixture(),calls=[];
  for(const field of ['effectAuthority','effectTools']){
    const req={...invocationInput(fx,{dispatch:recordingDispatch(calls)}),
      [field]:{invoke(){throw Error('forged permission');}}};
    assert.throws(()=>invokeWithExistingV07Authority(req),{code:'E_CALLER_EFFECT_AUTHORITY'});
  }
  assert.equal(calls.length,0);
  assert.equal(fx.journal.getRecords().length,0);
});
test('A1: forged Assembly provenance denied by real T002B mint check',async()=>{
  const fx=await nativeFixture(),calls=[];
  const forged={...fx.binding,successorAssembly:{...fx.binding.successorAssembly}};
  await assert.rejects(()=>invokeWithExistingV07Authority(
    invocationInput(fx,{binding:forged,dispatch:recordingDispatch(calls)})),
    e=>e?.code==='ASSEMBLY_PROVENANCE_UNVERIFIED');
  assert.equal(calls.length,0);
  assert.equal(fx.journal.getRecords().length,0);
});
test('A1: SIMULATION cannot be upgraded into real PRODUCTION effect',async()=>{
  const fx=await nativeFixture({authorityClass:'SIMULATION'}),calls=[];
  await assert.rejects(()=>invokeWithExistingV07Authority(
    invocationInput(fx,{dispatch:recordingDispatch(calls)})),
    e=>e?.code==='AUTHORITY_CLASS_MISMATCH');
  assert.equal(calls.length,0);
  assert.equal(fx.journal.getRecords().length,0);
});
test('A1: effect=none operation denied at real effectful path',async()=>{
  const fx=await nativeFixture({operationId:'op.query',effect:'none'}),calls=[];
  await assert.rejects(()=>invokeWithExistingV07Authority(
    invocationInput(fx,{dispatch:recordingDispatch(calls)})),
    e=>e?.code==='EFFECTLESS_OPERATION_REJECTED');
  assert.equal(calls.length,0);
  assert.equal(fx.journal.getRecords().length,0);
});
