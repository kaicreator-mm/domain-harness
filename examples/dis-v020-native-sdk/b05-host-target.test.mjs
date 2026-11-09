/** B05-01 / R44 — selected Target must match the actual Node runtime
 * platform/architecture before any real KDP boot. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {compileDisV020Aot} from '@kaicreator/domain-harness-build/dis-v020';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../tests/assembly/helpers-v010.ts';
import {makeNativeFixture} from './native-fixture.mjs';

const clone=structuredClone,fixture=makeNativeFixture(),reject=code=>e=>e?.code===code;
const platform=process.platform==='win32'?'windows':process.platform;
const actual={platform,architecture:process.arch,runtime:'node'};
const eligible=['linux','windows','android'].includes(platform)&&['x64','arm64'].includes(process.arch);
const target=(f,id=actual)=>({
 schema:'dis.v0.2.selected-target/1',...id,
 selectedModules:f.artifact.built.modules.map(m=>({packageId:m.packageId,moduleSha256:m.moduleSha256}))
});
const compile=(f,id)=>{const p=clone(f.program);p.target=target(f,id);return compileDisV020Aot({
 built:f.artifact.built,program:p,sources:f.sources,expectedSourceOrigins:f.expectedSourceOrigins
})};
const load=(f,a,identity)=>loadDisV020Aot(a,{
 expectedDigest:a.digest,expectedTarget:identity,registry:f.registry,
 store:new PlainCasDocStore(),tenantId:'tenant:b05-host-identity'
});
test('B05-01 R44 real runtime OS and CPU architecture match selected original canonical Business/KDP modules',async(t)=>{
 if(!eligible)return t.skip('This runtime platform is not an applicable selected DIS target');
 const f=await fixture,a=compile(f,actual),app=await load(f,a,actual);
 try{
  assert.deepEqual(app.selectedTarget,actual);
  assert.deepEqual(app.actualHostTarget,actual);
  const observation=await app.invoke('tally.assessTaskEvidence',{});
  assert.equal(observation.kind,'OBSERVATION');
  assert.equal(observation.authority,'NONE');
  assert.equal(observation.evidence.attested,false);
 }finally{app.stop()}
});
test('B05-01 R44 caller and AOT agreeing on a wrong OS label cannot bypass the real runtime host identity',async()=>{
 const f=await fixture;
 const wrong={...actual,platform:platform==='linux'?'windows':'linux'};
 const a=compile(f,wrong);
 await assert.rejects(load(f,a,wrong),reject('DIS_TARGET_HOST_MISMATCH'));
});
test('B05-01 R44 caller and AOT agreeing on a wrong architecture cannot boot the KDP',async()=>{
 const f=await fixture;
 const wrong={...actual,platform:['linux','windows','android'].includes(platform)?platform:'linux',
  architecture:process.arch==='x64'?'arm64':'x64'};
 const a=compile(f,wrong);
 await assert.rejects(load(f,a,wrong),reject('DIS_TARGET_HOST_MISMATCH'));
});
test('B05-01 R44 legacy untargeted artifacts remain usable but cannot inherit a claimed host qualification',async()=>{
 const f=await fixture,app=await loadDisV020Aot(f.artifact,{
  expectedDigest:f.artifact.digest,registry:f.registry,
  store:new PlainCasDocStore(),tenantId:'tenant:b05-legacy'
 });
 try{assert.equal(app.selectedTarget,null);assert.equal(app.actualHostTarget,null)}
 finally{app.stop()}
 await assert.rejects(load(f,f.artifact,actual),reject('DIS_TARGET_UNSELECTED'));
});
