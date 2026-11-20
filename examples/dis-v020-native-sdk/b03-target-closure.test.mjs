/** DIS v0.2 B03-01 R38 — exact selected Target declaration tied to the
 * real canonical BUILD module roster. A target label is NOT OS execution proof. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {compileDisV020Aot} from '@kaicreator/domain-harness-build/dis-v020';
import {qualifyDisV020Artifact} from '@kaicreator/domain-harness-contracts/dis-v020';
import {makeNativeFixture} from './native-fixture.mjs';
const fixture=makeNativeFixture(),clone=structuredClone,reject=code=>error=>error?.code===code;
const claimedTarget=f=>({
 schema:'dis.v0.2.selected-target/1',platform:'linux',architecture:'x64',runtime:'node',
 selectedModules:f.artifact.built.modules.map(m=>({packageId:m.packageId,moduleSha256:m.moduleSha256}))
});
const compile=(f,program)=>compileDisV020Aot({
 built:f.artifact.built,program,sources:f.sources,expectedSourceOrigins:f.expectedSourceOrigins
});
test('B03-01 R38 selected canonical Tally/xDownload and KDP modules have exact source-locked Target digest roster',async()=>{
 const f=await fixture,p=clone(f.program);p.target=claimedTarget(f);
 const artifact=compile(f,p),q=qualifyDisV020Artifact(artifact);
 assert.equal(q.target.schema,'dis.v0.2.selected-target/1');
 assert.equal(q.target.platform,'linux');assert.equal(q.target.architecture,'x64');
 assert.equal(q.target.selectedModules.length,q.selected.size);
 assert.ok(q.target.selectedModules.some(x=>x.packageId==='business-tally-task-readiness@v2.0.0'));
 assert.ok(q.target.selectedModules.some(x=>x.packageId==='business-download@0.2.0-t03'));
 assert.ok(q.target.selectedModules.some(x=>x.packageId==='capability-acquisition-stub@0.2.0-t03'));
 for(const pin of q.target.selectedModules)
  assert.equal(q.selected.get(pin.packageId).moduleSha256,pin.moduleSha256);
 assert.notEqual(artifact.digest,f.artifact.digest);
 assert.equal(qualifyDisV020Artifact(f.artifact).target,null);
});
test('B03-01 R38 Target claim cannot omit selected original KDP/C or Business modules',async()=>{
 const f=await fixture,p=clone(f.program);p.target=claimedTarget(f);p.target.selectedModules.pop();
 assert.throws(()=>compile(f,p),reject('DIS_TARGET_CLOSURE_INCOMPLETE'));
});
test('B03-01 R38 forged Target source SHA, unknown package, duplicate and unsupported architecture fail closed',async()=>{
 const f=await fixture,p=clone(f.program);p.target=claimedTarget(f);
 const mutate=(cb,expected)=>{
  const next=clone(p);cb(next.target);
  assert.throws(()=>compile(f,next),reject(expected));
 };
 mutate(t=>{t.selectedModules[0].moduleSha256='0'.repeat(64)},'DIS_TARGET_MODULE_DRIFT');
 mutate(t=>{t.selectedModules[0].packageId='nonexistent-business'},'DIS_TARGET_MODULE_UNSELECTED');
 mutate(t=>{t.selectedModules[1].packageId=t.selectedModules[0].packageId},'DIS_TARGET_MODULE_DUPLICATE');
 mutate(t=>{t.architecture='mips64'},'DIS_TARGET_INVALID');
 mutate(t=>{t.platform='made-up-os'},'DIS_TARGET_INVALID');
 mutate(t=>{t.runtime='untrusted-dynamic'},'DIS_TARGET_INVALID');
 mutate(t=>{t.canIssuePermit=true},'DIS_UNKNOWN_FIELD');
});
