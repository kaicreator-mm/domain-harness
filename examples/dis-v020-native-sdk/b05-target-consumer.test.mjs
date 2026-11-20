/** B05-03 / R46 — real host + complete original source + KDP authority.
 * No target label, source SHA or local observation is a semantic Oracle. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {compileDisV020Aot} from '@kaicreator/domain-harness-build/dis-v020';
import {qualifyDisV020Artifact,sourceSha256} from '@kaicreator/domain-harness-contracts/dis-v020';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../tests/assembly/helpers-v010.ts';
import {makeNativeFixture} from './native-fixture.mjs';
const fixture=makeNativeFixture(),clone=structuredClone,reject=code=>e=>e?.code===code;
const target={platform:process.platform==='win32'?'windows':process.platform,architecture:process.arch,runtime:'node'};
const supported=['linux','windows','android'].includes(target.platform)&&['x64','arm64'].includes(target.architecture);
const inputs=async()=>{
 const f=await fixture,program=clone(f.program);
 program.target={schema:'dis.v0.2.selected-target/1',...target,
  selectedModules:f.artifact.built.modules.map(x=>({packageId:x.packageId,moduleSha256:x.moduleSha256}))};
 const a=compileDisV020Aot({built:f.artifact.built,program,sources:f.sources,expectedSourceOrigins:f.expectedSourceOrigins});
 const q=qualifyDisV020Artifact(a);
 const pins=Object.fromEntries(f.sources.filter(s=>q.sourceConsumers.get(s.id)?.length>0)
  .map(s=>[s.id,{sha256:sourceSha256(s.sourceText),origin:clone(s.origin)}]));
 return {f,a,q,pins};
};
const boot=(f,a,pins,extra={})=>loadDisV020Aot(a,{
 expectedDigest:a.digest,expectedTarget:target,expectedSourcePins:pins,
 requireAllSourcesPinned:true,registry:f.registry,store:new PlainCasDocStore(),
 tenantId:'tenant:b05-full-native-preflight',...extra
});
test('B05-03 R46 real host original Tally Rule xDownload Knowledge Runx Stateful and KDP admission compose without business authority',async(t)=>{
 if(!supported)return t.skip('Current Node OS/arch is outside selected v0.2 Target labels');
 const {f,a,q,pins}=await inputs(),app=await boot(f,a,pins);
 try{
  assert.deepEqual(app.actualHostTarget,target);
  assert.equal(q.target.selectedModules.length,q.selected.size);
  for(const x of q.target.selectedModules)
   assert.equal(q.selected.get(x.packageId).moduleSha256,x.moduleSha256);
  const rule=await app.invoke('tally.assessTaskEvidence',{});
  const knowledge=await app.invoke('xdownload.describePolicy',{});
  const presence=await app.invoke('runx.createPresenceObserver',()=>'2026-11-10T20:00:00Z');
  const receipt=await app.invoke('orders.approve',{
   messageId:'msg:b05-r46',instanceKey:'instance:b05-r46',input:{amount:30,requestId:'B05-R46'}
  },{expectedContractVersion:'1.0.0'});
  for(const x of [rule,knowledge,presence]){
   assert.equal(x.kind,'OBSERVATION');
   assert.equal(x.authority,'NONE');
  }
  assert.equal(rule.evidence.attested,false);
  assert.equal(knowledge.evidence.attested,false);
  assert.equal(presence.evidence.attested,false);
  assert.equal(presence.handle.lifetime,'PROCESS_LOCAL');
  assert.equal(receipt.kind,'KDP_RECEIPT');
  assert.equal(receipt.admission,'ADMITTED');
  assert.equal(receipt.execution,'NOT_PROVEN');
  assert.equal(receipt.evidence.businessAttested,false);
 }finally{app.stop()}
});
test('B05-03 R46 original source and host matching still cannot make unreviewed semantic Tally claim succeed',async(t)=>{
 if(!supported)return t.skip('Current Node OS/arch is outside selected v0.2 Target labels');
 const {f,a,pins}=await inputs(),app=await boot(f,a,pins);
 try{
  const result=await app.invoke('tally.assessTaskEvidence',{
   issueRef:'https://github.com/kaicreator-mm/tally/issues/37',
   claimRef:'claim:fake-b05-review',dependenciesComplete:true
  });
  assert.equal(result.authority,'NONE');
  assert.equal(result.value.taskPass,false);
  assert.equal(result.evidence.attested,false);
 }finally{app.stop()}
});
test('B05-03 R46 stale independent source pin denies selected native KDP boot before side effects',async(t)=>{
 if(!supported)return t.skip('Current Node OS/arch is outside selected v0.2 Target labels');
 const {f,a,pins}=await inputs();
 const bad=clone(pins);bad['xdownload-business'].sha256='0'.repeat(64);
 await assert.rejects(boot(f,a,bad),reject('DIS_SOURCE_ANCHOR_STALE'));
 const absent=clone(pins);delete absent['tally-release'];
 await assert.rejects(boot(f,a,absent),reject('DIS_SOURCE_ANCHOR_COVERAGE_INCOMPLETE'));
});
