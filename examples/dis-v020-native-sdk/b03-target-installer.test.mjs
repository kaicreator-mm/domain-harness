/** DIS v0.2 B03-02 R39 — independent installer Target identity before KDP. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {compileDisV020Aot} from '@kaicreator/domain-harness-build/dis-v020';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../tests/assembly/helpers-v010.ts';
import {makeNativeFixture} from './native-fixture.mjs';
const fixture=makeNativeFixture(),clone=structuredClone,reject=code=>e=>e?.code===code;
const identity={platform:'linux',architecture:'x64',runtime:'node'};
// Like the B05 positives: the selected linux/x64 Target may only really boot on
// that actual host. Required CI still executes this case on the Linux worker.
const selectedHost=identity.platform===(
 process.platform==='win32'?'windows':process.platform)&&
 process.arch===identity.architecture;
const mkTarget=f=>({schema:'dis.v0.2.selected-target/1',...identity,
 selectedModules:f.artifact.built.modules.map(x=>({packageId:x.packageId,moduleSha256:x.moduleSha256}))});
const compiled=f=>{
 const p=clone(f.program);p.target=mkTarget(f);
 return compileDisV020Aot({built:f.artifact.built,program:p,
  sources:f.sources,expectedSourceOrigins:f.expectedSourceOrigins});
};
const open=(f,artifact,expectedTarget,expectedDigest=artifact.digest,expectedSourcePins=undefined)=>loadDisV020Aot(artifact,{
 expectedDigest,expectedTarget,expectedSourcePins,registry:f.registry,
 store:new PlainCasDocStore(),tenantId:'tenant:b03-installer-target'
});
test('B03-02 R39 independently installed exact Target accepts original Tally xDownload canonical BUILD without Effect',async(t)=>{
 if(!selectedHost)return t.skip('Selected linux/x64 Target cannot boot on this actual host');
 const f=await fixture,a=compiled(f),app=await open(f,a,{...identity});
 try{
  assert.deepEqual(app.selectedTarget,identity);
  assert.equal(app.aotDigest,a.digest);
  const r=await app.invoke('tally.assessTaskEvidence',{});
  assert.equal(r.kind,'OBSERVATION');assert.equal(r.disposition,'UNKNOWN');
  assert.equal(r.authority,'NONE');assert.equal(r.evidence.attested,false);
 }finally{app.stop()}
});
test('B03-02 R39 targeted AOT requires independent installed Target, not a self-authorizing program label',async()=>{
 const f=await fixture,a=compiled(f);
 await assert.rejects(open(f,a,undefined),reject('DIS_TARGET_TRUST_ANCHOR_REQUIRED'));
 await assert.rejects(open(f,a,{...identity,platform:'windows'}),reject('DIS_TARGET_INSTALLED_MISMATCH'));
 await assert.rejects(open(f,a,{...identity,architecture:'arm64'}),reject('DIS_TARGET_INSTALLED_MISMATCH'));
 await assert.rejects(open(f,a,{...identity,runtime:'native'}),reject('DIS_TARGET_TRUST_ANCHOR_REQUIRED'));
 await assert.rejects(open(f,a,{...identity,grantEffect:true}),reject('DIS_TARGET_TRUST_ANCHOR_REQUIRED'));
});
test('B03-02 R39 legacy unqualified Target cannot be interpreted as independently pinned',async()=>{
 const f=await fixture;
 const app=await open(f,f.artifact,undefined);
 try{assert.equal(app.selectedTarget,null)}finally{app.stop()}
 await assert.rejects(open(f,f.artifact,identity),reject('DIS_TARGET_UNSELECTED'));
});
test('B03-02 R39 correct Target identity never overrides stale installer AOT or source pin',async(t)=>{
 if(!selectedHost)return t.skip('Stale-pin denial order is asserted past the selected linux/x64 host check');
 const f=await fixture,a=compiled(f);
 await assert.rejects(open(f,a,identity,f.artifact.digest),reject('DIS_INSTALLED_AOT_MISMATCH'));
 const pin=a.sources.find(x=>x.id==='tally-business');
 const forged={'tally-business':{sha256:'0'.repeat(64),origin:{...pin.origin}}};
 await assert.rejects(open(f,a,identity,a.digest,forged),reject('DIS_SOURCE_ANCHOR_STALE'));
});
