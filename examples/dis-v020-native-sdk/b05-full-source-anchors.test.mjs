/** B05-02 / R45: opt-in complete installer Source closure, independent
 * of the AOT's own source pin values. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {compileDisV020Aot} from '@kaicreator/domain-harness-build/dis-v020';
import {qualifyDisV020Artifact,sourceSha256} from '@kaicreator/domain-harness-contracts/dis-v020';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../tests/assembly/helpers-v010.ts';
import {makeNativeFixture} from './native-fixture.mjs';

const fixture=makeNativeFixture(),clone=structuredClone,reject=code=>e=>e?.code===code;
const actual={platform:process.platform==='win32'?'windows':process.platform,
 architecture:process.arch,runtime:'node'};
const supported=['linux','windows','android'].includes(actual.platform)&&['x64','arm64'].includes(actual.architecture);
const allOriginalPins=f=>{
 const selected=qualifyDisV020Artifact(f.artifact);
 const sources=f.sources.filter(s=>selected.sourceConsumers.get(s.id)?.length>0);
 assert.ok(sources.length>=5);
 return Object.fromEntries(sources.map(s=>[s.id,{
  sha256:sourceSha256(s.sourceText),origin:clone(s.origin)
 }]));
};
const createTarget=f=>{
 const p=clone(f.program);
 p.target={schema:'dis.v0.2.selected-target/1',...actual,
  selectedModules:f.artifact.built.modules.map(m=>({packageId:m.packageId,moduleSha256:m.moduleSha256}))
 };
 return compileDisV020Aot({built:f.artifact.built,program:p,sources:f.sources,expectedSourceOrigins:f.expectedSourceOrigins});
};
const boot=(f,a,expectedSourcePins,extra={})=>loadDisV020Aot(a,{
 expectedDigest:a.digest,expectedTarget:a.program.target?actual:undefined,
 registry:f.registry,store:new PlainCasDocStore(),tenantId:'tenant:b05-complete-source',
 requireAllSourcesPinned:true,expectedSourcePins,...extra
});
test('B05-02 R45 selected Linux/x64 native BUILD + complete installer Source + Host close in one real KDP boot',async(t)=>{
 // Required CI must execute, not skip, the same positive that proves both
 // canonical BUILD module selection and independent full source closure.
 // Non-CI developer hosts remain portable; no invented OS variant code.
 const ciSha=process.env.CI_COMMIT_SHA;
 if(ciSha!==undefined){
  assert.match(ciSha,/^[a-f0-9]{40}$/,'C3 original CI commit SHA required');
  assert.deepEqual(actual,{platform:'linux',architecture:'x64',runtime:'node'});
 }
 if(!supported)return t.skip('No applicable DIS Target for this native runtime');
 const f=await fixture,a=createTarget(f),pins=allOriginalPins(f);
 const qualified=qualifyDisV020Artifact(a);
 assert.deepEqual(qualified.target.platform,actual.platform);
 assert.deepEqual(qualified.target.architecture,actual.architecture);
 assert.deepEqual(qualified.target.runtime,'node');
 const moduleRoster=f.artifact.built.modules.map(m=>({packageId:m.packageId,moduleSha256:m.moduleSha256}));
 assert.deepEqual(qualified.target.selectedModules,moduleRoster);
 assert.equal(qualified.selected.size,moduleRoster.length);
 for(const m of f.artifact.built.modules){
  assert.equal(sourceSha256(m.moduleSource),m.moduleSha256,'C3 actual BUILD module bytes pinned');
  assert.equal(qualified.selected.get(m.packageId)?.moduleSha256,m.moduleSha256);
  for(const dep of m.dependencies??[]){
   assert.ok(qualified.selected.has(dep),'C3 missing selected BUILD dependency: '+dep);
  }
 }
 const consumed=[...qualified.sourceConsumers].filter(([,consumers])=>consumers.length>0)
  .map(([id])=>id).sort();
 assert.deepEqual(Object.keys(pins).sort(),consumed,'C3 independent installer pins entire actually consumed Function source set');
 for(const [id,pin] of Object.entries(pins)){
  assert.equal(qualified.pins.get(id)?.sha256,pin.sha256);
  assert.deepEqual(qualified.pins.get(id)?.origin,pin.origin);
 }
 const app=await boot(f,a,pins);
 try{
  assert.deepEqual(app.selectedTarget,actual);
  assert.deepEqual(app.actualHostTarget,actual);
  assert.equal(app.aotDigest,a.digest);
  const observation=await app.invoke('tally.assessTaskEvidence',{});
  assert.equal(observation.kind,'OBSERVATION');
  assert.equal(observation.disposition,'UNKNOWN');
  assert.equal(observation.authority,'NONE');
  assert.equal(observation.evidence.attested,false);
  if(ciSha!==undefined)console.log('DIS_C3_SELECTED_CLOSURE='+JSON.stringify({
   schema:'dis.v0.2.c3-selected-closure/1',sourceHead:ciSha,
   selectedTarget:app.selectedTarget,actualHostTarget:app.actualHostTarget,
   modules:moduleRoster,sourceIds:consumed,aotDigest:a.digest,
   sourceAuthority:'STRUCTURAL_ONLY',sapQualified:false,effectAuthorized:false
  }));
 }finally{app.stop()}
});
test('B05-02 C3 cross-boundary forged selected module roster cannot be rescued by a correct host and full installer source pins',async(t)=>{
 // createTarget needs an applicable DIS Target platform; darwin hosts have
 // no selected Target contract at all and skip like the positive above.
 if(!supported)return t.skip('No applicable DIS Target for this native runtime');
 const f=await fixture,a=createTarget(f),pins=allOriginalPins(f);
 const drift=clone(a);
 drift.program.target.selectedModules[0].moduleSha256='0'.repeat(64);
 assert.throws(()=>qualifyDisV020Artifact(drift),reject('DIS_TARGET_MODULE_DRIFT'));
 const missing=clone(a);
 missing.program.target.selectedModules.pop();
 assert.throws(()=>qualifyDisV020Artifact(missing),reject('DIS_TARGET_CLOSURE_INCOMPLETE'));
 await assert.rejects(boot(f,a,pins,{expectedTarget:{...actual,platform:actual.platform==='linux'?'windows':'linux'}}),
  reject('DIS_TARGET_INSTALLED_MISMATCH'));
});
test('B05-02 R45 removing one consumed Domain original source pin cannot admit a target',async()=>{
 const f=await fixture,pins=allOriginalPins(f),a=f.artifact;
 const missing=Object.keys(pins).find(x=>x==='runx-presence')??Object.keys(pins)[0];
 delete pins[missing];
 await assert.rejects(boot(f,a,pins),reject('DIS_SOURCE_ANCHOR_COVERAGE_INCOMPLETE'));
});
test('B05-02 R45 malicious source Git origin and forged unrelated source fail closed independent of AOT',async()=>{
 const f=await fixture,a=f.artifact,pins=allOriginalPins(f);
 const bad=clone(pins);
 bad['tally-business'].origin.commit='0'.repeat(40);
 await assert.rejects(boot(f,a,bad),reject('DIS_SOURCE_ANCHOR_STALE'));
 const extra=clone(pins);extra['not-selected']={sha256:'1'.repeat(64),origin:clone(pins['tally-business'].origin)};
 await assert.rejects(boot(f,a,extra),reject('DIS_SOURCE_ANCHOR_NOT_CONSUMED'));
});
test('B05-02 R45 nonboolean and absent strict Source closure options fail before KDP boot',async()=>{
 const f=await fixture,a=f.artifact;
 await assert.rejects(boot(f,a,undefined),reject('DIS_SOURCE_ANCHOR_COVERAGE_INCOMPLETE'));
 await assert.rejects(boot(f,a,allOriginalPins(f),{requireAllSourcesPinned:'yes'}),
  reject('DIS_SOURCE_ANCHOR_POLICY_INVALID'));
});
