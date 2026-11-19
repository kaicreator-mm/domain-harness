/** CORE-005 (DIS 0.2.0) R211 lane C5 — semantic relations, executable
 * constraints, collaboration semantics and SAP fail-closed negatives on the
 * REAL AOT selected element set (original Tally/xDownload/Runx/orders
 * sources via native-fixture.mjs).
 *
 * Core distinction under test: the static Element dependency subgraph (AOT
 * resolution input) must be acyclic — a cycle is refused at compile with
 * DIS_DEPENDENCY_CYCLE — while semantic relations (depends-on mirrors,
 * constrains, cooperates) may legally form cycles as non-authoritative
 * metadata. Neither graph is a runtime data-flow authorization.
 *
 * SAP semantics: an obligation that names a Semantic Assurance Proof duty
 * is evaluated by a deliberately fail-closed gate. No qualified independent
 * semantic Oracle exists (formal original qualification blocked upstream in
 * kaicreator-mm/domain-intelligence-engineering#155), so every obligation is
 * BLOCKED/UNKNOWN with the exact reason: never a silent pass, never a
 * downgrade. Forged SAP claims are rejected; missing/unknown owners are
 * UNKNOWN refusals.
 *
 * All evidence here is engineering/structural. Nothing in this file
 * qualifies CORE-005, mints an Oracle, an Effect, a Release or a matrix
 * promotion.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {makeNativeFixture} from '../native-fixture.mjs';
import {compileDisV020Aot} from '@kaicreator/domain-harness-build/dis-v020';
import {qualifyDisV020Artifact} from '@kaicreator/domain-harness-contracts/dis-v020';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../../tests/assembly/helpers-v010.ts';
import {
 analyzeCore005SemanticRelations,declareCore005SapObligation,
 evaluateCore005Constraints,evaluateCore005SapClaim,evaluateCore005SapGate,
 extractCore005StaticSubgraph,runCore005Collaboration
} from './core005-semantics.mjs';

const fixture=makeNativeFixture();
const clone=structuredClone;
const rejects=code=>error=>error?.code===code;

// Second source-linked executable constraint on real selected Elements:
// tally.tasks (Rule, original Tally source) constrains tally.release, with
// the real selected rule Function tally.assessTaskEvidence as verifier.
const CORE005_CONSTRAINT_RELATION=Object.freeze({
 from:'tally.tasks',to:'tally.release',kind:'constrains',
 contract:Object.freeze({
  schema:'dis.v0.2.semantic-relation/1',id:'core005.tally.tasks.constrains.release',
  version:'1.0.0',sourceId:'tally-business',
  verifierFunctionId:'tally.assessTaskEvidence',verifierContractVersion:'1.0.0',
  applicability:'AOT_SELECTED',authority:'NONE'})
});
// Legal semantic cycles: metadata-only cooperates backlinks over pairs whose
// static direction is already sealed (policy -> acquire, tasks -> release).
const CORE005_LEGAL_CYCLES=Object.freeze([
 Object.freeze({from:'xdownload.acquire',to:'xdownload.policy',kind:'cooperates'}),
 Object.freeze({from:'tally.release',to:'tally.tasks',kind:'cooperates'})
]);
const core005Program=f=>{
 const program=clone(f.program);
 program.relations=[...program.relations,clone(CORE005_CONSTRAINT_RELATION),
  ...clone(CORE005_LEGAL_CYCLES)];
 return program;
};
const build=(f,program)=>compileDisV020Aot({built:f.artifact.built,program,
 sources:f.sources,expectedSourceOrigins:f.expectedSourceOrigins});
const prepared=(async()=>{
 const f=await fixture;
 const program=core005Program(f);
 const artifact=build(f,program);
 const qualified=qualifyDisV020Artifact(artifact);
 return Object.freeze({f,program,artifact,qualified});
})();
const activate=(x,{registry,tenantId}={})=>loadDisV020Aot(x.artifact,{
 expectedDigest:x.artifact.digest,registry:registry??x.f.registry,
 store:new PlainCasDocStore(),
 tenantId:tenantId??'tenant:dis-v020-full-core005-r0'});
const TALLY_TASK_INPUT=Object.freeze({
 issueRef:'https://github.com/kaicreator-mm/tally/issues/37',issueNumber:37,
 sourceSha:'e988321439f65b55936a691c02250b6d62a29409',
 claimRef:'claim:unattested',dependenciesComplete:true});
const SAP_OBLIGATION=()=>declareCore005SapObligation({
 obligationId:'core005.sap.xdownload.acquire',
 subjectElementId:'xdownload.acquire',
 verifierFunctionId:'xdownload.describePolicy',
 sourceId:'xdownload-business',owner:'kaicreator-mm/xDownload',
 requiredCapability:'oracle:independent-semantic'});

// ---------------------------------------------------------------------------
// Positives: assembly, static DAG, semantic relations with legal cycles
// ---------------------------------------------------------------------------
test('CORE005 positive: real AOT assembly keeps the static subgraph acyclic while semantic relations legally form two cycles',async()=>{
 const x=await prepared;
 const sub=extractCore005StaticSubgraph(x.qualified);
 assert.equal(sub.acyclic,true);
 assert.equal(sub.nodes.length,9);
 assert.equal(sub.staticEdges,4);
 // topological order places every dependency before its consumer
 for(const edge of sub.edges)
  assert.ok(sub.order.indexOf(edge.to)<sub.order.indexOf(edge.from),
   `static edge ${edge.from} -> ${edge.to} violated the topological order`);
 const semantic=analyzeCore005SemanticRelations(x.program.relations);
 assert.equal(semantic.cyclic,true);
 assert.deepEqual([...semantic.cycles.map(cycle=>cycle.join('->'))].sort(),[
  'tally.tasks->tally.release->tally.tasks',
  'xdownload.acquire->xdownload.policy->xdownload.acquire',
  'xdownload.acquire->xdownload.policy->xdownload.interaction->xdownload.acquire'
 ]);
 // both source-linked constraint relations registered, non-authoritative
 assert.deepEqual([...x.qualified.semanticRelations.map(row=>row.id)].sort(),
  ['core005.tally.tasks.constrains.release','xdownload.policy.constrains.acquire']);
 for(const row of x.qualified.semanticRelations){
  assert.equal(row.authority,'NONE');
  assert.equal(row.verifiedBusinessSemantics,false);
  assert.equal(row.applicability,'AOT_SELECTED');
 }
 const app=await activate(x);
 try{
  assert.equal(app.state,'READY');
  assert.deepEqual(app.semanticRelations,x.qualified.semanticRelations);
 }finally{app.stop()}
});

test('CORE005 positive: one collaboration call composes three selected Functions of two Elements with no Effect authority',async()=>{
 const x=await prepared,app=await activate(x,{tenantId:'tenant:core005-collab-r0'});
 try{
  const receipt=await runCore005Collaboration(app,{
   requestId:'core005-r211-collab-01',
   url:'https://example.org/file',declaredBytes:512});
  assert.deepEqual(receipt.steps.map(step=>step.functionId),
   ['xdownload.describePolicy','xdownload.interaction.inspect','xdownload.interaction.confirm']);
  assert.equal(receipt.steps[0].disposition,'OBSERVED');
  assert.equal(receipt.steps[1].status,'AWAITING_CONFIRMATION');
  assert.equal(receipt.steps[1].disposition,'NEEDS_CONFIRMATION');
  assert.equal(receipt.steps[2].status,'READY_FOR_KDP');
  // typed disposition stays PENDING_AUTHORIZATION: KDP admission is a
  // separate governed call, never granted by the collaboration itself
  assert.equal(receipt.steps[2].disposition,'PENDING_AUTHORIZATION');
  for(const step of receipt.steps){
   assert.equal(step.kind,'OBSERVATION');
   assert.equal(step.authority,'NONE');
   assert.equal(step.effectDispatched,false);
  }
  assert.deepEqual(receipt.collaboratingElements,['xdownload.policy','xdownload.interaction']);
  assert.equal(receipt.authority,'NONE');
  assert.equal(receipt.effectDispatched,false);
  assert.equal(receipt.kdpIntentDispatched,false);
  assert.equal(receipt.qualification.independentSap,false);
  assert.equal(receipt.qualification.semanticOracle,false);
  assert.ok(Object.isFrozen(receipt));
 }finally{app.stop()}
});

test('CORE005 positive: executable invariants hold and both constraint verifiers answer through the real SDK',async()=>{
 const x=await prepared,app=await activate(x,{tenantId:'tenant:core005-verifier-r0'});
 try{
  const policy=await app.invoke('xdownload.describePolicy',{},
   {expectedContractVersion:'1.0.0'});
  assert.equal(policy.disposition,'OBSERVED');
  assert.equal(policy.authority,'NONE');
  assert.equal(policy.value.domainId,'downloads');
  assert.equal(Object.hasOwn(policy,'executionPermit'),false);
  const task=await app.invoke('tally.assessTaskEvidence',TALLY_TASK_INPUT,
   {expectedContractVersion:'1.0.0'});
  assert.equal(task.disposition,'OBSERVED');
  assert.equal(task.authority,'NONE');
  assert.equal(task.value.admitted,false);
  const verdict=evaluateCore005Constraints({program:x.program,qualified:x.qualified});
  assert.equal(verdict.satisfied,true);
  assert.deepEqual([...verdict.results.map(row=>row.invariantId)].sort(),
   ['CORE005-INV-RELATION-MIRROR','CORE005-INV-STATIC-ACYCLIC','CORE005-INV-VERIFIER-BINDING']);
 }finally{app.stop()}
});

// ---------------------------------------------------------------------------
// Negatives: static cycle refused at AOT; unmirrored depends-on refused
// ---------------------------------------------------------------------------
test('CORE005 negative: a static dependency cycle in the collaboration subgraph is refused at AOT while the semantic-only cycle variant compiles',async()=>{
 const x=await prepared;
 // Contrast control: the same program with only the semantic cycles is valid.
 assert.equal(extractCore005StaticSubgraph(x.qualified).acyclic,true);
 const cyclic=clone(x.program);
 cyclic.elements.find(element=>element.id==='xdownload.interaction')
  .dependsOn.push('xdownload.acquire');
 assert.throws(()=>build(x.f,cyclic),rejects('DIS_DEPENDENCY_CYCLE'));
 // Reverse direction of the same pair is the same refusal.
 const cyclicReverse=clone(x.program);
 cyclicReverse.elements.find(element=>element.id==='xdownload.policy')
  .dependsOn.push('xdownload.acquire');
 assert.throws(()=>build(x.f,cyclicReverse),rejects('DIS_DEPENDENCY_CYCLE'));
});

test('CORE005 negative: a depends-on relation that does not mirror the sealed static edge is refused at AOT',async()=>{
 const x=await prepared;
 const unmirrored=clone(x.program);
 unmirrored.relations.push({from:'tally.tasks',to:'runx.agent.presence',kind:'depends-on'});
 assert.throws(()=>build(x.f,unmirrored),rejects('DIS_RELATION_DEPENDENCY_MISMATCH'));
});

// ---------------------------------------------------------------------------
// Negatives: runtime constraint violations name the violated invariant
// ---------------------------------------------------------------------------
test('CORE005 negative: a collaboration plan that skips the observed policy precondition is rejected naming the invariant',async()=>{
 const x=await prepared,app=await activate(x,{tenantId:'tenant:core005-hostile-r0'});
 try{
  await assert.rejects(
   runCore005Collaboration(app,{requestId:'core005-r211-hostile-01',
    url:'https://example.org/file',declaredBytes:512,
    plan:['xdownload.interaction.inspect','xdownload.interaction.confirm']}),
   error=>error?.code==='CORE005_INVARIANT_VIOLATION'&&
    error.detail?.invariantId==='CORE005-INV-COLLAB-PRECONDITION');
  // a non-subsequence plan is a plan-shape refusal, not an invariant pass
  await assert.rejects(
   runCore005Collaboration(app,{requestId:'core005-r211-hostile-02',
    url:'https://example.org/file',declaredBytes:512,
    plan:['xdownload.interaction.confirm','xdownload.describePolicy']}),
   rejects('CORE005_COLLAB_PLAN_INVALID'));
  await assert.rejects(
   runCore005Collaboration(app,{requestId:'core005-r211-hostile-03',
    url:'https://example.org/file',declaredBytes:512,
    plan:['orders.approve']}),
   rejects('CORE005_COLLAB_PLAN_INVALID'));
 }finally{app.stop()}
});

test('CORE005 negative: a forged confirm output claiming effectDispatched is rejected at runtime naming the no-effect invariant',async()=>{
 const x=await prepared;
 const forgedRegistry={...x.f.registry,
  'xdownload.interaction.confirm':{...x.f.registry['xdownload.interaction.confirm'],
   execute:()=>({status:'READY_FOR_KDP',authority:'NONE',effectDispatched:true})}};
 const app=await activate(x,{registry:forgedRegistry,
  tenantId:'tenant:core005-forged-noeffect-r0'});
 try{
  await assert.rejects(
   runCore005Collaboration(app,{requestId:'core005-r211-forged-effect-01',
    url:'https://example.org/file',declaredBytes:512}),
   error=>error?.code==='CORE005_INVARIANT_VIOLATION'&&
    error.detail?.invariantId==='CORE005-INV-COLLAB-NO-EFFECT');
 }finally{app.stop()}
});

// ---------------------------------------------------------------------------
// Negatives: SAP gate is fail-closed without a qualified Oracle
// ---------------------------------------------------------------------------
test('CORE005 negative: a declared SAP obligation with no qualified Oracle is explicitly BLOCKED, never silently passed',async()=>{
 const x=await prepared;
 const obligation=SAP_OBLIGATION();
 assert.equal(obligation.satisfied,false);
 const gate=evaluateCore005SapGate(obligation,x.qualified);
 assert.equal(gate.disposition,'BLOCKED');
 assert.equal(gate.code,'CORE005_MISSING_QUALIFIED_ORACLE');
 assert.equal(gate.qualified,false);
 assert.equal(gate.satisfied,false);
 assert.equal(gate.authority,'NONE');
 assert.notEqual(gate.disposition,'OBSERVED');
 assert.match(gate.blockedBy,/domain-intelligence-engineering#155/);
 // evaluation never mutates the obligation record
 assert.equal(obligation.satisfied,false);
});

test('CORE005 negative: forged SAP claims are rejected; only an honest not-proven claim yields a typed UNKNOWN',async()=>{
 const x=await prepared;
 const obligation=SAP_OBLIGATION();
 // self-declared "proven" with no credential at all
 assert.throws(()=>evaluateCore005SapClaim({
  proven:true,oracleId:'oracle:independent-semantic',
  obligationId:obligation.obligationId,credential:null},obligation),
  rejects('CORE005_SAP_CLAIM_REJECTED'));
 // malformed versioned credentials
 const goodOrigin={repository:'kaicreator-mm/xDownload',
  commit:'e904f08c478b15147b1c07fbe53c610d2d81851f',
  path:'packages/download-domain-app/src/business/business-download.mjs',
  gitBlob:'a7dba9a896de0b84fc6d54093563adca2ccbcdfc'};
 for(const [label,credential] of [
  ['unversioned',{credentialVersion:'not-a-semver',
   oracleId:'oracle:independent-semantic',origin:goodOrigin,sha256:'c'.repeat(64)}],
  ['undigested',{credentialVersion:'1.0.0',
   oracleId:'oracle:independent-semantic',origin:goodOrigin,sha256:'not-hex'}],
  ['unpinned-origin',{credentialVersion:'1.0.0',
   oracleId:'oracle:independent-semantic',
   origin:{...goodOrigin,commit:'short'},sha256:'c'.repeat(64)}]
 ]){
  assert.throws(()=>evaluateCore005SapClaim({
   proven:true,oracleId:'oracle:independent-semantic',
   obligationId:obligation.obligationId,credential},obligation),
   rejects('CORE005_SAP_CLAIM_REJECTED'),label);
 }
 // well-shaped credential naming an Oracle that is not registered qualified
 assert.throws(()=>evaluateCore005SapClaim({
  proven:true,oracleId:'oracle:independent-semantic',
  obligationId:obligation.obligationId,
  credential:{credentialVersion:'1.0.0',oracleId:'oracle:independent-semantic',
   origin:goodOrigin,sha256:'c'.repeat(64)}},obligation),
  rejects('CORE005_SAP_CLAIM_REJECTED'));
 // claim bound to a different obligation
 assert.throws(()=>evaluateCore005SapClaim({
  proven:false,oracleId:'oracle:independent-semantic',
  obligationId:'core005.sap.someone-else',credential:null},obligation),
  rejects('CORE005_SAP_CLAIM_REJECTED'));
 // honest "not proven" is a typed UNKNOWN refusal, not an error and not a pass
 const honest=evaluateCore005SapClaim({
  proven:false,oracleId:'oracle:independent-semantic',
  obligationId:obligation.obligationId,credential:null},obligation);
 assert.equal(honest.accepted,false);
 assert.equal(honest.disposition,'UNKNOWN');
 assert.equal(honest.satisfied,false);
 assert.equal(honest.authority,'NONE');
 // AOT seam: forged element validation authority is refused at compile
 for(const authority of ['SAP_QUALIFIED','OWNER_ATTESTED','DOMAIN_ORACLE']){
  const forged=clone(x.program);
  forged.elements.find(element=>element.id==='tally.release').validation={
   schema:'dis.v0.2.element-validation/1',sourceIds:['tally-release'],authority};
  assert.throws(()=>build(x.f,forged),rejects('DIS_ELEMENT_VALIDATION_INVALID'));
 }
 // AOT seam: a relation contract cannot declare independent authority
 const forgedRelation=clone(x.program);
 forgedRelation.relations.find(
  relation=>relation.contract?.id==='xdownload.policy.constrains.acquire'
 ).contract.authority='INDEPENDENT_ACCEPTED';
 assert.throws(()=>build(x.f,forgedRelation),rejects('DIS_RELATION_CONTRACT_INVALID'));
 // SDK seam: a forged verifier output claiming a qualified SAP state is not
 // a declared outcome and is refused by the typed outcome classifier
 const forgedRegistry={...x.f.registry,
  'tally.assessTaskEvidence':{...x.f.registry['tally.assessTaskEvidence'],
   execute:()=>({state:'SAP_QUALIFIED',admitted:true,taskPass:true,
    evidenceRefs:['core005:forged-sap']})}};
 const app=await activate(x,{registry:forgedRegistry,
  tenantId:'tenant:core005-forged-verifier-r0'});
 try{
  await assert.rejects(
   app.invoke('tally.assessTaskEvidence',TALLY_TASK_INPUT,
    {expectedContractVersion:'1.0.0'}),
   rejects('DIS_OUTCOME_UNDECLARED'));
 }finally{app.stop()}
});

test('CORE005 negative: a missing or unrecognized SAP owner yields a typed UNKNOWN refusal and the AOT refuses absent relation owners',async()=>{
 const x=await prepared;
 const missingRecord=declareCore005SapObligation({
  obligationId:'core005.sap.owner-missing',
  subjectElementId:'xdownload.acquire',
  verifierFunctionId:'xdownload.describePolicy',
  sourceId:'xdownload-business',owner:null,
  requiredCapability:'oracle:independent-semantic'});
 const gateMissing=evaluateCore005SapGate(missingRecord,x.qualified);
 assert.equal(gateMissing.disposition,'UNKNOWN');
 assert.equal(gateMissing.code,'CORE005_SAP_GATE_UNKNOWN');
 assert.equal(gateMissing.reason,'CORE005_SAP_OWNER_UNRESOLVED');
 assert.equal(gateMissing.satisfied,false);
 assert.equal(gateMissing.authority,'NONE');
 assert.equal(missingRecord.satisfied,false);
 const unrecognizedRecord=declareCore005SapObligation({
  obligationId:'core005.sap.owner-unrecognized',
  subjectElementId:'xdownload.acquire',
  verifierFunctionId:'xdownload.describePolicy',
  sourceId:'xdownload-business',owner:'kaicreator-mm/not-the-source-owner',
  requiredCapability:'oracle:independent-semantic'});
 const gateUnrecognized=evaluateCore005SapGate(unrecognizedRecord,x.qualified);
 assert.equal(gateUnrecognized.disposition,'UNKNOWN');
 assert.equal(gateUnrecognized.reason,'CORE005_SAP_OWNER_UNRESOLVED');
 assert.equal(gateUnrecognized.resolvedOwner,'kaicreator-mm/xDownload');
 assert.equal(gateUnrecognized.satisfied,false);
 // unselected subject is likewise a typed UNKNOWN refusal
 const unselectedRecord=declareCore005SapObligation({
  obligationId:'core005.sap.subject-unselected',
  subjectElementId:'not.a.selected.element',
  verifierFunctionId:'xdownload.describePolicy',
  sourceId:'xdownload-business',owner:'kaicreator-mm/xDownload',
  requiredCapability:'oracle:independent-semantic'});
 const gateUnselected=evaluateCore005SapGate(unselectedRecord,x.qualified);
 assert.equal(gateUnselected.disposition,'UNKNOWN');
 assert.equal(gateUnselected.reason,'CORE005_SAP_SUBJECT_UNSELECTED');
 assert.equal(gateUnselected.satisfied,false);
 // AOT seam: an absent, unrecognized or empty relation owner is refused
 for(const owner of ['absent.owner','unrecognized.owner','']){
  const forged=clone(x.program);
  forged.relations.push({from:owner,to:'tally.tasks',kind:'constrains'});
  assert.throws(()=>build(x.f,forged),rejects('DIS_RELATION_INVALID'));
 }
});
