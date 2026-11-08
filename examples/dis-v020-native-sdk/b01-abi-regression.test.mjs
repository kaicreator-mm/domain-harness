/** B01-03 / R34: real selected ABI, revision and KDP preflight regression.
 * Structural compatibility is not semantic truth or an authorization.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {compareDisV020FunctionContracts,compareDisV020ElementContracts,qualifyDisV020Artifact} from '@kaicreator/domain-harness-contracts/dis-v020';
import {compileDisV020Aot} from '@kaicreator/domain-harness-build/dis-v020';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../tests/assembly/helpers-v010.ts';
import {makeNativeFixture} from './native-fixture.mjs';
const fixture=makeNativeFixture(),copy=structuredClone,reject=code=>e=>e?.code===code;
const compile=(f,p)=>compileDisV020Aot({built:f.artifact.built,program:p,
 sources:f.sources,expectedSourceOrigins:f.expectedSourceOrigins});
const open=(f,artifact=f.artifact,expectedDigest=artifact.digest,expectedSourcePins=undefined)=>loadDisV020Aot(artifact,{
 expectedDigest,expectedSourcePins,registry:f.registry,store:new PlainCasDocStore(),
 tenantId:'tenant:dis-b01-compat-regression'
});

test('B01-03 R34 same-major Function ABI preserves selected Tally rule required output and optional reader contract',async()=>{
 const f=await fixture,q=qualifyDisV020Artifact(f.artifact);
 const prev=q.functions.get('tally.assessTaskEvidence').definition.contract;
 assert.deepEqual(compareDisV020FunctionContracts(prev,copy(prev)),
  {compatible:true,from:'1.0.0',to:'1.0.0'});
 const added=copy(prev);added.version='1.1.0';
 added.output.fields={...added.output.fields,comment:'string'};
 added.output.optional=['comment'];
 assert.equal(compareDisV020FunctionContracts(prev,added).compatible,true);
 const breaking=copy(added);delete breaking.output.fields.taskPass;
 assert.throws(()=>compareDisV020FunctionContracts(prev,breaking),
  reject('DIS_FUNCTION_ABI_INCOMPATIBLE'));
 const versionDrift=copy(prev);versionDrift.output.fields.taskPass='number';
 assert.throws(()=>compareDisV020FunctionContracts(prev,versionDrift),
  reject('DIS_FUNCTION_ABI_UNVERSIONED_DRIFT'));
 const forced=copy(added);forced.input={type:'record',fields:{newRequired:'string'}};
 assert.throws(()=>compareDisV020FunctionContracts(prev,forced),
  reject('DIS_FUNCTION_ABI_INCOMPATIBLE'));
});
test('B01-03 R34 Element public Function membership and ownership cannot silently drift at unchanged source version',async()=>{
 const f=await fixture,q=qualifyDisV020Artifact(f.artifact);
 const old=q.elements.get('xdownload.interaction');
 assert.equal(old.functions.length,2);
 assert.equal(compareDisV020ElementContracts(old,copy(old)).compatible,true);
 const wrong=copy(old);wrong.functions.pop();
 assert.throws(()=>compareDisV020ElementContracts(old,wrong),reject('DIS_ELEMENT_UNVERSIONED_DRIFT'));
 const changed=copy(old);changed.version='1.1.0';changed.functions.pop();
 assert.throws(()=>compareDisV020ElementContracts(old,changed),reject('DIS_ELEMENT_ABI_INCOMPATIBLE'));
 const relocated=copy(old);relocated.version='1.1.0';relocated.domainId='tally';
 assert.throws(()=>compareDisV020ElementContracts(old,relocated),reject('DIS_ELEMENT_ABI_INCOMPATIBLE'));
});
test('B01-03 R34 an internally valid rebuilt AOT is denied by stale installed digest before KDP boot',async()=>{
 const f=await fixture,p=copy(f.program);
 p.elements.find(x=>x.id==='tally.tasks').description+=' ABI candidate only';
 const future=compile(f,p);
 assert.notEqual(future.digest,f.artifact.digest);
 await assert.rejects(open(f,future,f.artifact.digest),reject('DIS_INSTALLED_AOT_MISMATCH'));
 const app=await open(f,future,future.digest);
 try{
  assert.equal(app.state,'READY');
  const r=await app.invoke('tally.assessTaskEvidence',{}, {expectedContractVersion:'1.0.0'});
  assert.equal(r.kind,'OBSERVATION');assert.equal(r.disposition,'UNKNOWN');
  assert.equal(r.authority,'NONE');
 }finally{app.stop()}
});
test('B01-03 R34 authoritative caller source change denies old AOT; false semantic claims cannot appear in Element source validation',async()=>{
 const f=await fixture,q=qualifyDisV020Artifact(f.artifact);
 const pin=q.pins.get('tally-business');
 assert.ok(pin);
 const external={sha256:'0'.repeat(64),origin:{...pin.origin}};
 await assert.rejects(open(f,f.artifact,f.artifact.digest,{'tally-business':external}),
  reject('DIS_SOURCE_ANCHOR_STALE'));
 const altered=copy(f.program);
 altered.elements.find(x=>x.id==='tally.tasks').validation.authority='ACCEPTED';
 assert.throws(()=>compile(f,altered),reject('DIS_ELEMENT_VALIDATION_INVALID'));
 const permitted=await open(f,f.artifact,f.artifact.digest,{
  'tally-business':{sha256:pin.sha256,origin:{...pin.origin}}
 });
 try{
  const r=await permitted.invoke('tally.assessTaskEvidence',{});
  assert.equal(r.disposition,'UNKNOWN');assert.equal(r.evidence.attested,false);
 }finally{permitted.stop()}
});
