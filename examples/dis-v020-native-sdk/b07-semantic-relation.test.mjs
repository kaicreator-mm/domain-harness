/** B07-03/R53 — actual source-anchored, non-authoritative semantic relation. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {makeNativeFixture} from './native-fixture.mjs';
import {compileDisV020Aot} from '@kaicreator/domain-harness-build/dis-v020';
import {qualifyDisV020Artifact} from '@kaicreator/domain-harness-contracts/dis-v020';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../tests/assembly/helpers-v010.ts';

const fixture=makeNativeFixture();
const clone=structuredClone;
const rejects=code=>e=>e?.code===code;
const compile=(f,p)=>compileDisV020Aot({
 built:f.artifact.built,program:p,sources:f.sources,expectedSourceOrigins:f.expectedSourceOrigins});
const sourceRelation=p=>p.relations.find(r=>r.contract?.id==='xdownload.policy.constrains.acquire');

test('B07-03 R53 real xDownload source-owned policy constraint has versioned pinned non-authoritative relation and Knowledge verifier',async()=>{
 const f=await fixture;
 const q=qualifyDisV020Artifact(f.artifact);
 const row=q.semanticRelations.find(x=>x.id==='xdownload.policy.constrains.acquire');
 assert.equal(row.from,'xdownload.policy');
 assert.equal(row.to,'xdownload.acquire');
 assert.equal(row.kind,'constrains');
 assert.equal(row.verifierFunctionId,'xdownload.describePolicy');
 assert.equal(row.sourceSha256,q.pins.get('xdownload-business').sha256);
 assert.equal(row.authority,'NONE');
 assert.equal(row.verifiedBusinessSemantics,false);
 const app=await loadDisV020Aot(f.artifact,{expectedDigest:f.artifact.digest,
  registry:f.registry,store:new PlainCasDocStore(),tenantId:'tenant:b07-semantic-relation'});
 try{
  const r=app.semanticRelations.find(x=>x.id===row.id);
  assert.deepEqual(r,row);
  const policy=await app.invoke(r.verifierFunctionId,{}, {expectedContractVersion:r.verifierContractVersion});
  assert.equal(policy.kind,'OBSERVATION');
  assert.equal(policy.authority,'NONE');
  assert.equal(policy.disposition,'OBSERVED');
  assert.equal(policy.evidence.attested,false);
  assert.equal(Object.hasOwn(policy,'executionPermit'),false);
 }finally{app.stop()}
});

test('B07-03 R53 forged domain authority, missing source and invalid relation identity fail closed before selected SDK boot',async()=>{
 const f=await fixture;
 for(const [mutate,code] of [
  [p=>{sourceRelation(p).contract.authority='INDEPENDENT_ACCEPTED'},'DIS_RELATION_CONTRACT_INVALID'],
  [p=>{sourceRelation(p).contract.sourceId='tally-business'},'DIS_RELATION_VERIFIER_UNBOUND'],
  [p=>{sourceRelation(p).contract.verifierFunctionId='tally.assessTaskEvidence'},'DIS_RELATION_VERIFIER_UNBOUND'],
  [p=>{sourceRelation(p).contract.verifierContractVersion='1.0.1'},'DIS_RELATION_VERIFIER_VERSION_MISMATCH'],
  [p=>{sourceRelation(p).contract.applicability='GLOBAL'},'DIS_RELATION_CONTRACT_INVALID'],
  [p=>{p.relations.push(clone(sourceRelation(p)))},'DIS_RELATION_CONTRACT_INVALID'],
  [p=>{sourceRelation(p).contract.id='not a valid id'},'DIS_RELATION_CONTRACT_INVALID']
 ]){
  const p=clone(f.program);mutate(p);
  assert.throws(()=>compile(f,p),rejects(code));
 }
});

test('B07-03 R53 a nonselected source or a semantic backlink cannot imply an unselected KDP permission',async()=>{
 const f=await fixture,p=clone(f.program);
 // A collaboration cycle is valid semantic metadata; it does not add
 // reverse edges to the static Element dependency DAG.
 p.relations.push({from:'xdownload.acquire',to:'xdownload.policy',kind:'cooperates'});
 const q=qualifyDisV020Artifact(compile(f,p));
 assert.equal(q.semanticRelations.length,1);
 assert.deepEqual(q.elements.get('xdownload.policy').dependsOn,[]);
 assert.equal(q.functions.get('xdownload.confirmDownload').definition.binding.type,'kdp-intent');
 assert.equal(q.semanticRelations[0].authority,'NONE');
 const tampered=clone(p);
 const rel=sourceRelation(tampered);
 rel.contract.sourceId='unselected-source';
 assert.throws(()=>compile(f,tampered),rejects('DIS_RELATION_VERIFIER_UNBOUND'));
});
