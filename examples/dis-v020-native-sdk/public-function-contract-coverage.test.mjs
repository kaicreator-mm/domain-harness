/** R72 / CORE-003: Public Function purposes and incomplete typed I/O on
 * genuinely selected Tally/Runx/xDownload/Orders source bytes.
 * This is a real compiler + SDK consumer test, not a synthetic SAP oracle.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectDisV020PublicFunctionCoverage,qualifyDisV020Artifact}
 from '@kaicreator/domain-harness-contracts/dis-v020';
import {compileDisV020Aot} from '@kaicreator/domain-harness-build/dis-v020';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../tests/assembly/helpers-v010.ts';
import {makeNativeFixture} from './native-fixture.mjs';
const selected=makeNativeFixture(),fail=code=>e=>e?.code===code;
const clone=structuredClone;
const build=(f,p)=>compileDisV020Aot({built:f.artifact.built,program:p,
 sources:f.sources,expectedSourceOrigins:f.expectedSourceOrigins});

test('R72 selected Tally Runx xDownload and Orders nine public Functions have explicit distinct nonempty purposes in native AOT',async()=>{
 const f=await selected,q=qualifyDisV020Artifact(f.artifact);
 const a=inspectDisV020PublicFunctionCoverage(f.artifact);
 assert.equal(a.functions,9);
 assert.equal(a.descriptionsPresent,9);
 assert.equal(new Set(a.rows.map(x=>x.id)).size,9);
 assert.ok(a.rows.every(x=>x.description.length>15));
 for(const r of a.rows){
  assert.equal(q.functions.get(r.id).definition.description,r.description);
 }
 const app=await loadDisV020Aot(f.artifact,{expectedDigest:f.artifact.digest,
  registry:f.registry,store:new PlainCasDocStore(),
  tenantId:'tenant:dis-r72-function-metadata'});
 try{
  const observation=await app.invoke('tally.assessTaskEvidence',{});
  assert.equal(observation.kind,'OBSERVATION');
  assert.equal(observation.authority,'NONE');
  assert.equal(observation.evidence.attested,false);
 }finally{app.stop()}
});
test('R72 explicit typed Function I/O completeness report keeps four real native gaps visible, no invented CORE-003 acceptance',async()=>{
 const f=await selected,a=inspectDisV020PublicFunctionCoverage(f.artifact);
 assert.equal(a.typedIOFunctions,5);
 assert.deepEqual([...a.missingTypedIO].sort(),[
  'orders.appInit','orders.approve','runx.createPresenceObserver',
  'xdownload.confirmDownload'
 ]);
 assert.equal(a.rows.filter(x=>x.profile==='KDP_ADMISSION_RECEIPT_ONLY').length,2);
 assert.equal(a.rows.filter(x=>x.profile==='LOCAL_HANDLE_METHODS_ONLY').length,1);
 assert.equal(a.rows.filter(x=>x.profile==='APP_INIT_LIFECYCLE_ONLY').length,1);
 assert.equal(a.fullCore003Ready,false);
 assert.equal(a.independentSAP,false);
 assert.equal(a.effectExecutionProven,false);
});
test('R72 invalid selected Function purpose fails AOT compilation and legacy missing purpose cannot pass explicit strict inspector',async()=>{
 const f=await selected;
 for(const bad of ['','  ',0,{},'x'.repeat(2049)]){
  const p=clone(f.program);
  p.elements.find(e=>e.id==='tally.tasks').functions[0].description=bad;
  assert.throws(()=>build(f,p),fail('DIS_FUNCTION_DESCRIPTION_INVALID'));
 }
 const p=clone(f.program);
 delete p.elements.find(e=>e.id==='tally.tasks').functions[0].description;
 const legacy=build(f,p); // old AOTs continue to install in compatibility mode
 assert.throws(()=>inspectDisV020PublicFunctionCoverage(legacy),
  fail('DIS_PUBLIC_FUNCTION_DESCRIPTION_REQUIRED'));
 assert.notEqual(legacy.digest,f.artifact.digest);
});
test('R72 descriptions do not authorize business truth or change an installed AOT source lock',async()=>{
 const f=await selected,p=clone(f.program);
 p.elements.find(e=>e.id==='tally.tasks').functions[0].description+=' (editorial revision)';
 const modified=build(f,p);
 assert.notEqual(modified.digest,f.artifact.digest);
 assert.equal(inspectDisV020PublicFunctionCoverage(modified).independentSAP,false);
 await assert.rejects(loadDisV020Aot(modified,{
  expectedDigest:f.artifact.digest,registry:f.registry,
  store:new PlainCasDocStore(),tenantId:'tenant:dis-r72-old-aot'
 }),fail('DIS_INSTALLED_AOT_MISMATCH'));
});
