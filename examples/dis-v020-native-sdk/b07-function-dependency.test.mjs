/** B07-02/R52 — source-real xDownload two-Function static dependency. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {makeNativeFixture} from './native-fixture.mjs';
import {compileDisV020Aot} from '@kaicreator/domain-harness-build/dis-v020';
import {qualifyDisV020Artifact,compareDisV020ElementContracts} from '@kaicreator/domain-harness-contracts/dis-v020';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../tests/assembly/helpers-v010.ts';
import {chatInitial,chatFollowUp,consumeDownloadSession} from '../dis-v020-interaction/channel-adapters.mjs';

const fixture=makeNativeFixture();
const clone=structuredClone;
const rejects=code=>e=>e?.code===code;
const build=(f,program)=>compileDisV020Aot({built:f.artifact.built,program,
 sources:f.sources,expectedSourceOrigins:f.expectedSourceOrigins});
const acquire=p=>p.elements.find(x=>x.id==='xdownload.acquire');

test('B07-02 R52 original xDownload acquisition statically pins two separate Interaction Functions and one Knowledge Function',async()=>{
 const f=await fixture;
 const a=acquire(f.program);
 assert.deepEqual(a.dependsOn,['xdownload.policy','xdownload.interaction']);
 assert.equal(a.dependencies.find(d=>d.element==='xdownload.interaction').functions.length,2);
 const qualified=qualifyDisV020Artifact(f.artifact);
 for(const dep of a.dependencies)for(const fn of dep.functions){
  const target=qualified.functions.get(fn.id);
  assert.ok(target);
  assert.equal(target.element.id,dep.element);
  assert.equal(target.definition.contract.version,fn.contractVersion);
 }
 // Real selected LOCAL Interaction consumes the original source, but does
 // not gain a direct right to dispatch the KDP-governed acquisition Effect.
 const app=await loadDisV020Aot(f.artifact,{expectedDigest:f.artifact.digest,registry:f.registry,
   store:new PlainCasDocStore(),tenantId:'tenant:b07-fn-edge'});
 try{
  const {final}=await consumeDownloadSession(app,{
   initial:chatInitial('download https://example.org/file','B07-R52'),
   followUp:chatFollowUp('bytes 512 confirm')});
  assert.equal(final.kind,'OBSERVATION');
  assert.equal(final.disposition,'PENDING_AUTHORIZATION');
  assert.equal(final.authority,'NONE');
  assert.equal(final.value.effectDispatched,false);
 }finally{app.stop()}
});

test('B07-02 R52 undeclared target Function, missing version and duplicate Function selection fail closed at AOT',async()=>{
 const f=await fixture;
 for(const [mutate,code] of [
  [p=>{acquire(p).dependencies[1].functions[1].id='xdownload.nonexistent'},'DIS_FUNCTION_DEPENDENCY_UNBOUND'],
  [p=>{delete acquire(p).dependencies[1].functions[0].contractVersion},'DIS_FUNCTION_DEPENDENCY_INVALID'],
  [p=>{acquire(p).dependencies[1].functions[1].id='xdownload.interaction.inspect'},'DIS_FUNCTION_DEPENDENCY_INVALID'],
  [p=>{acquire(p).dependencies[1].functions[1].contractVersion='1.0.1'},'DIS_FUNCTION_DEPENDENCY_VERSION_MISMATCH'],
  [p=>{acquire(p).dependsOn.pop()},'DIS_FUNCTION_DEPENDENCY_INVALID']
 ]){
  const p=clone(f.program);mutate(p);
  assert.throws(()=>build(f,p),rejects(code));
 }
});

test('B07-02 R52 static dependency cycles are refused while semantic collaboration cycles are legal metadata',async()=>{
 const f=await fixture;
 const p=clone(f.program);
 p.relations.push({from:'tally.tasks',to:'runx.agent.presence',kind:'cooperates'});
 assert.ok(qualifyDisV020Artifact(build(f,p)).elements.has('runx.agent.presence'));
 const wrong=clone(p);
 wrong.elements.find(e=>e.id==='xdownload.interaction').dependsOn.push('xdownload.acquire');
 assert.throws(()=>build(f,wrong),rejects('DIS_DEPENDENCY_CYCLE'));
});

test('B07-02 R52 same-version silent dependency drift and same-major Function binding removal are incompatible',async()=>{
 const f=await fixture;
 const old=acquire(f.program),changed=clone(old);
 changed.dependencies[1].functions.pop();
 assert.throws(()=>compareDisV020ElementContracts(old,changed),rejects('DIS_ELEMENT_UNVERSIONED_DRIFT'));
 changed.version='1.0.1';
 assert.throws(()=>compareDisV020ElementContracts(old,changed),rejects('DIS_ELEMENT_ABI_INCOMPATIBLE'));
});
