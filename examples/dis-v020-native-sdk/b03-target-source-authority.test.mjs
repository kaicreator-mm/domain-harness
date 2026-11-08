/** DIS v0.2 B03-03 R40 — Target identity cannot prove real OS
 * compatibility, semantic Oracle, source owner or KDP Effect authority. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileDisV020Aot} from '@kaicreator/domain-harness-build/dis-v020';
import {sourceGitBlob,qualifyDisV020Artifact} from '@kaicreator/domain-harness-contracts/dis-v020';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../tests/assembly/helpers-v010.ts';
import {makeNativeFixture} from './native-fixture.mjs';
const fixture=makeNativeFixture(),clone=structuredClone,reject=code=>e=>e?.code===code;
const buildFor=(f,platform)=>{
 const p=clone(f.program);
 p.target={
  schema:'dis.v0.2.selected-target/1',platform,architecture:'x64',runtime:'node',
  selectedModules:f.artifact.built.modules.map(x=>({packageId:x.packageId,moduleSha256:x.moduleSha256}))
 };
 return compileDisV020Aot({built:f.artifact.built,program:p,sources:f.sources,expectedSourceOrigins:f.expectedSourceOrigins});
};
const readPinned=(name,blob)=>{
 const bytes=readFileSync(new URL('./fixtures/'+name,import.meta.url),'utf8');
 assert.equal(sourceGitBlob(bytes),blob,'exact original DKE reviewer Git Blob');
 return JSON.parse(bytes);
};
test('B03-03 R40 same canonical modules can self-claim distinct OS labels, which is not actual native Target qualification',async()=>{
 const f=await fixture,linux=buildFor(f,'linux'),windows=buildFor(f,'windows');
 const a=qualifyDisV020Artifact(linux),b=qualifyDisV020Artifact(windows);
 assert.notEqual(linux.digest,windows.digest);
 assert.deepEqual(a.target.selectedModules,b.target.selectedModules);
 assert.equal(a.target.platform,'linux');assert.equal(b.target.platform,'windows');
 assert.equal(a.selected.size,b.selected.size);
 // Target labels are build assertions only; separate physical implementation,
 // deployment host and source-owner qualification remain unproven.
 assert.equal(Object.hasOwn(f.artifact.built,'platform'),false);
});
test('B03-03 R40 one-model DKE reviewer and synthetic locator repair remain unqualified, independent of Target label',async()=>{
 const review=readPinned('dke-r29-source-first-review.json',
  '0b7d514cc297a07952b2cd536c2dafd3e47bda45');
 const patch=readPinned('dke-r29-gh-locator-proposal.json',
  '9dc978f5138c561efabe503f254e565aa5f5700a');
 assert.equal(review.independentHumanOrSecondModel,false);
 assert.equal(review.globalSAPQualification,'UNRESOLVED');
 assert.equal(review.pendingSourceRepair[0].status,'OPEN');
 assert.equal(review.pendingSourceRepair[0].currentCoverageEnd,'2018-10-22 16:24 UTC');
 assert.equal(review.pendingSourceRepair[0].sourceNarrativeContinuesThrough,'2018-10-22 23:03 UTC');
 assert.equal(patch.canonicalSourceAmended,false);
 assert.equal(patch.sourceQualified,false);
 assert.equal(patch.independentOracle,false);
 assert.equal(patch.nativeDeploymentAuthorized,false);
 assert.equal(patch.authority,'PATCH_PROPOSAL_ONLY');
 assert.equal(patch.added.every(x=>x['se:synthetic']===true),true);
 const f=await fixture,a=buildFor(f,'linux');
 const q=qualifyDisV020Artifact(a);
 assert.equal(q.target.platform,'linux');
 assert.equal(q.pins.has('dke-r25-tally-change'),false);
 // The selected original Tally business is NOT a qualified replacement for
 // a separately accepted DKE Knowledge Graph or a fresh SAP Oracle.
});
test('B03-03 R40 targeted native Tally observation never becomes an accepted semantic claim or KDP Effect permit',async()=>{
 const f=await fixture,a=buildFor(f,'linux');
 const app=await loadDisV020Aot(a,{
  expectedDigest:a.digest,expectedTarget:{platform:'linux',architecture:'x64',runtime:'node'},
  registry:f.registry,store:new PlainCasDocStore(),
  tenantId:'tenant:b03-no-source-sap-authority'
 });
 try{
  const observation=await app.invoke('tally.assessTaskEvidence',{
   issueRef:'https://github.com/kaicreator-mm/tally/issues/37',issueNumber:37,
   sourceSha:'e988321439f65b55936a691c02250b6d62a29409',
   claimRef:'claim:b03-self-asserted',dependenciesComplete:true
  });
  assert.equal(observation.kind,'OBSERVATION');
  assert.equal(observation.authority,'NONE');
  assert.equal(observation.evidence.attested,false);
  assert.equal(observation.value.taskPass,false);
  assert.equal(app.selectedTarget.platform,'linux');
 }finally{app.stop()}
});
test('B03-03 R40 Target descriptor cannot grant Source or SAP approval via extra declared fields',async()=>{
 const f=await fixture,a=buildFor(f,'linux');
 const bad=clone(a);
 bad.program.target.independentSAP='QUALIFIED';
 assert.throws(()=>qualifyDisV020Artifact(bad),reject('DIS_UNKNOWN_FIELD'));
 const bad2=clone(a);
 bad2.program.target.selectedModules[0].semanticApproved=true;
 assert.throws(()=>qualifyDisV020Artifact(bad2),reject('DIS_UNKNOWN_FIELD'));
});
