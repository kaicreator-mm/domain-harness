/**
 * B02-01 / R35: actual selected native AOT package/source binding.
 * Target-specific Windows/Linux/Android selection is NOT represented by the
 * current native DIS v0.2 AOT shape; no simulated Target coverage is credited.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {qualifyDisV020Artifact,sourceSha256} from '@kaicreator/domain-harness-contracts/dis-v020';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../tests/assembly/helpers-v010.ts';
import {makeNativeFixture} from './native-fixture.mjs';
const fixture=makeNativeFixture(),clone=structuredClone,reject=code=>e=>e?.code===code;

test('B02-01 R35 real selected Tally and xDownload Business packages resolve original source and KDP implementation without target fiction',async()=>{
 const f=await fixture,q=qualifyDisV020Artifact(f.artifact);
 const pinned=[
  ['tally.assessTaskEvidence','business-tally-task-readiness@v2.0.0','tally-business','kaicreator-mm/tally'],
  ['xdownload.describePolicy','business-download@0.2.0-t03','xdownload-business','kaicreator-mm/xDownload']
 ];
 for(const [id,packageId,sourceId,repository] of pinned){
  const entry=q.functions.get(id),selected=q.selected.get(packageId),pin=q.pins.get(sourceId);
  assert.equal(entry.element.packageId,packageId);
  assert.equal(entry.definition.binding.type,'local');
  assert.equal(entry.definition.binding.sourceId,sourceId);
  assert.equal(selected.role,'business');
  assert.equal(sourceSha256(selected.moduleSource),selected.moduleSha256);
  assert.equal(pin.origin.repository,repository);
  assert.equal(pin.sha256,f.artifact.sources.find(s=>s.id===sourceId).sha256);
 }
 const effect=q.functions.get('xdownload.confirmDownload');
 assert.equal(effect.definition.binding.type,'kdp-intent');
 assert.equal(effect.definition.effect,'governed');
 assert.equal(effect.element.packageId,'business-download@0.2.0-t03');
 assert.ok(f.artifact.built.routes.some(r=>r.intentId==='confirmDownload'));
 assert.equal(Object.hasOwn(f.artifact.program,'target'),false);
});
test('B02-01 R35 install refuses tampered selected module bytes or unbound source before KDP boot',async()=>{
 const f=await fixture,bytes=clone(f.artifact);
 const mod=bytes.built.modules.find(x=>x.packageId==='business-download@0.2.0-t03');
 mod.moduleSource+='\n// adversarial target/source rewrite';
 assert.throws(()=>qualifyDisV020Artifact(bytes),reject('DIS_BUILD_BYTES_DRIFT'));
 const origin=clone(f.artifact);
 origin.program.domains.find(x=>x.id==='tally').repositories=['kaicreator-mm/xDownload'];
 assert.throws(()=>qualifyDisV020Artifact(origin),reject('DIS_SOURCE_DOMAIN_MISMATCH'));
});
test('B02-01 R35 undeclared runtime Target selection is rejected, not implicitly treated as Windows/Linux/Android conformance',async()=>{
 const f=await fixture,forged=clone(f.artifact);
 forged.program.target='windows-x64';
 assert.throws(()=>qualifyDisV020Artifact(forged),reject('DIS_UNKNOWN_FIELD'));
 const app=await loadDisV020Aot(f.artifact,{
  expectedDigest:f.artifact.digest,registry:f.registry,
  store:new PlainCasDocStore(),tenantId:'tenant:b02-selected-package'
 });
 try{
  const result=await app.invoke('tally.assessTaskEvidence',{});
  assert.equal(result.kind,'OBSERVATION');assert.equal(result.authority,'NONE');
  assert.equal(result.disposition,'UNKNOWN');
  assert.equal(result.evidence.attested,false);
 }finally{app.stop()}
});
