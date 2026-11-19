/**
 * DIS 0.2.0 Full Conformance R211 — Lane C2 / CORE-002 (Issue #1545).
 *
 * Executable, falsifiable source-scoped engineering evidence for Element
 * cohesion, multi-Function identity and Source owner semantics on the real
 * AOT/SDK assembly seam:
 *
 * Positive: one cohesive in-repo engineering Element (evidence gate review)
 * with three Functions bound through different implementation strategies
 * (Knowledge/Query, Rule, Workflow), each with a stable typed semantic
 * contract, digest-locked to its own implementation source; a real
 * cross-project Knowledge Element (original xDownload business bytes) under
 * the same owner lock; all invoked natively through loadDisV020Aot.
 *
 * Negatives (fail-closed): wrong owner vs the sealed manifest, owner outside
 * the selected domain, unauthorized element carrying a dependency edge,
 * depended-upon Function not locked, missing/blank/unrecognized owner or
 * version (explicit UNKNOWN rejection, never silent pass), implementation
 * drift under a same declared version, declared contract/element version
 * drift vs the lock, and dependency reference version drift at the AOT gate.
 *
 * Honesty: this is byte/identity engineering evidence only — no independent
 * semantic Oracle, no publication rights, no SAP/ECP qualification, no
 * Matrix promotion (formal original-source qualification stays with
 * DIE #155). Engineering delivery here does NOT itself make CORE-002
 * VERIFIED; that assessment belongs to the Integrator/review/Product chain.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {sha256Canonical} from '@kaicreator/domain-harness-contracts';
import {qualifyDisV020Artifact,sourceSha256} from '@kaicreator/domain-harness-contracts/dis-v020';
import {verifyOwnerLockedAssembly,sealOwnerManifest,buildOwnerDeclaration}
 from './core002-owner-lock.mjs';
import {buildCore002Fixture,openCore002App} from './core002-fixture.mjs';

const reject=code=>error=>error?.code===code;
// verifyOwnerLockedAssembly is synchronous: assert throws, never rejects.
const verifyThrows=(input,code)=>
 assert.throws(()=>verifyOwnerLockedAssembly(input),reject(code));
const REPO_OWNER='kaicreator-mm/domain-harness';
const GATES_SORTED=['gate.ci-pipeline-green',
 'gate.independent-review-present','gate.native-tests-green'];
// Realistic lane closeout evidence records for the gate review domain.
const GOOD_RECORDS=[
 {id:'nt:full-core002-r0:1',kind:'native-test',exitCode:0},
 {id:'ci:woodpecker:2636',kind:'ci-pipeline',status:'SUCCESS'},
 {id:'rv:conversation:integrator',kind:'review',
  writer:'lane-writer',reviewer:'integrator'},
];
const BAD_RECORDS=[
 {id:'nt:full-core002-r0:2',kind:'native-test',exitCode:1},
 {id:'ci:woodpecker:0000',kind:'ci-pipeline',status:'FAILURE'},
 {id:'rv:conversation:self',kind:'review',
  writer:'lane-writer',reviewer:'lane-writer'},
];
const UNKNOWN_RECORDS=[{id:'ev:unrecognized:1',kind:'social-metric'}];

const gateReviewLocks=fixture=>[
 {fnId:'core002.gateReview.policy.query',sourceId:'core002-gate-policy',
  contractVersion:'1.0.0',
  implementationSha256:fixture.canonicalDigests['core002-gate-policy']},
 {fnId:'core002.gateReview.evidence.assess',sourceId:'core002-gate-rule',
  contractVersion:'1.0.0',
  implementationSha256:fixture.canonicalDigests['core002-gate-rule']},
 {fnId:'core002.gateReview.readiness.review',sourceId:'core002-gate-review',
  contractVersion:'1.0.0',
  implementationSha256:fixture.canonicalDigests['core002-gate-review']},
];

test('CORE-002 positive: owner-locked cohesive Element assembles and its three strategy Functions invoke natively',async()=>{
 const fixture=await buildCore002Fixture();
 const {app,receipt}=await openCore002App(fixture);
 let invoked=0;
 try{
  assert.equal(app.state,'READY');
  // Assembly receipt binds every Element to its locked owner/version.
  const byElement=new Map(receipt.elements.map(entry=>[entry.elementId,entry]));
  assert.equal(receipt.schema,'core002.owner-locked-assembly/1');
  assert.equal(receipt.verification,'ENGINEERING_SOURCE_SCOPED');
  assert.equal(receipt.independentSemanticAuthority,false);
  assert.equal(receipt.publicationRights,false);
  assert.equal(receipt.independentProfessionalOracle,false);
  assert.equal(byElement.get('core002.gateReview').owner,REPO_OWNER);
  assert.equal(byElement.get('core002.gateReview').version,'1.0.0');
  assert.deepEqual(
   Object.keys(byElement.get('core002.gateReview').functions).sort(),
   ['core002.gateReview.evidence.assess','core002.gateReview.policy.query',
    'core002.gateReview.readiness.review']);
  assert.equal(byElement.get('xdownload.policy').owner,
   'kaicreator-mm/xDownload');
  // Query strategy Function.
  const query=await app.invoke('core002.gateReview.policy.query',{});
  invoked+=1;
  assert.equal(query.kind,'OBSERVATION');
  assert.equal(query.disposition,'OBSERVED');
  assert.equal(query.authority,'NONE');
  assert.equal(query.contractVersion,'1.0.0');
  assert.equal(query.value.mode,'advisory');
  assert.deepEqual([...query.value.enforcedGateIds].sort(),GATES_SORTED);
  assert.equal(query.evidence.attested,false);
  // Shared catalog Knowledge Function (dependency target of the Element).
  const catalog=await app.invoke('core002.gateCatalog.current',{});
  invoked+=1;
  assert.equal(catalog.disposition,'OBSERVED');
  assert.equal(catalog.value.catalogVersion,'1.0.0');
  assert.deepEqual(Object.keys(catalog.value.gates).sort(),GATES_SORTED);
  // Rule strategy Function: satisfied, violated and undecidable bundles.
  const satisfied=await app.invoke('core002.gateReview.evidence.assess',
   {records:GOOD_RECORDS});
  invoked+=1;
  assert.equal(satisfied.disposition,'OBSERVED');
  assert.equal(satisfied.value.state,'ALL_SATISFIED');
  assert.equal(satisfied.authority,'NONE');
  const violated=await app.invoke('core002.gateReview.evidence.assess',
   {records:BAD_RECORDS});
  invoked+=1;
  assert.equal(violated.disposition,'FAILED');
  assert.equal(violated.value.state,'GATES_VIOLATED');
  assert.equal(
   violated.value.gates['gate.independent-review-present'].state,'VIOLATED');
  const undecided=await app.invoke('core002.gateReview.evidence.assess',
   {records:UNKNOWN_RECORDS});
  invoked+=1;
  // Unrecognized evidence kinds are a real domain-level UNKNOWN: they never
  // silently pass the gate.
  assert.equal(undecided.disposition,'UNKNOWN');
  assert.equal(undecided.value.state,'UNDECIDED');
  assert.deepEqual(undecided.value.undecidableIds,['ev:unrecognized:1']);
  // Workflow strategy Function: composes catalog + rule, advisory only.
  const ready=await app.invoke('core002.gateReview.readiness.review',
   {reviewId:'rev:core002:r0:ready',records:GOOD_RECORDS});
  invoked+=1;
  assert.equal(ready.disposition,'OBSERVED');
  assert.equal(ready.value.state,'READY_FOR_CLOSEOUT');
  assert.equal(ready.value.advisoryOnly,true);
  assert.equal(ready.value.reviewId,'rev:core002:r0:ready');
  const blocked=await app.invoke('core002.gateReview.readiness.review',
   {reviewId:'rev:core002:r0:blocked',records:BAD_RECORDS});
  invoked+=1;
  assert.equal(blocked.disposition,'FAILED');
  assert.equal(blocked.value.state,'BLOCKED');
  assert.equal(blocked.value.advisoryOnly,true);
  // The same owner lock covers a REAL cross-project selected Knowledge source.
  const download=await app.invoke('xdownload.describePolicy',{});
  invoked+=1;
  assert.equal(download.kind,'OBSERVATION');
  assert.equal(download.disposition,'OBSERVED');
  assert.equal(download.authority,'NONE');
  assert.equal(download.value.domainId,'downloads');
  assert.equal(download.evidence.attested,false);
  // Every selected Function keeps its declared stable contract version.
  for(const fn of ['core002.gateCatalog.current',
   'core002.gateReview.policy.query','core002.gateReview.evidence.assess',
   'core002.gateReview.readiness.review','xdownload.describePolicy'])
   assert.equal(app.contractVersions[fn],'1.0.0',fn);
  assert.equal(invoked,8);
 }finally{app.stop()}
});

test('CORE-002 positive: manifest seal is deterministic and digest-binds the exact implementation bytes',async()=>{
 const first=await buildCore002Fixture();
 const second=await buildCore002Fixture();
 assert.equal(first.artifact.digest,second.artifact.digest);
 assert.equal(first.manifest.seal,second.manifest.seal);
 assert.equal(first.manifest.seal,sha256Canonical({
  schema:first.manifest.schema,manifestId:first.manifest.manifestId,
  entries:first.manifest.entries}));
 const pins=qualifyDisV020Artifact(first.artifact).pins;
 for(const element of Object.values(first.manifest.entries))
  for(const lock of Object.values(element.functions)){
   const pin=pins.get(lock.sourceId);
   assert.ok(pin,lock.sourceId);
   assert.equal(lock.implementationSha256,pin.sha256,lock.sourceId);
  }
 // Any entries tampering is detected before any owner decision.
 const tampered=structuredClone(first.entries);
 tampered['core002.gateReview'].functions['core002.gateReview.evidence.assess']
  .implementationSha256='a'.repeat(64);
 verifyThrows({artifact:first.artifact,declarations:first.declarations,
  manifest:{...first.manifest,entries:tampered}},
  'CORE002_MANIFEST_SEAL_MISMATCH');
});

test('CORE-002 negative: wrong owner declaration cannot assemble against the sealed manifest',async()=>{
 // (a) An attacker-widened domain cannot move the lock: the sealed manifest
 // still owns the Element, so an in-domain but wrong owner mismatches.
 const widened=await buildCore002Fixture({programOverride:program=>{
  program.domains.find(domain=>domain.id==='core002-gate')
   .repositories.push('kaicreator-mm/tally');
 }});
 const tallyOwned={...widened.declarations,
  'core002.gateReview':buildOwnerDeclaration({elementId:'core002.gateReview',
   ownerRepository:'kaicreator-mm/tally',ownerVersion:'1.0.0',
   functionLocks:gateReviewLocks(widened)})};
 verifyThrows({artifact:widened.artifact,declarations:tallyOwned,
  manifest:widened.manifest},'CORE002_OWNER_MISMATCH');
 // (b) Same attack against the REAL cross-project Element: claiming the
 // xDownload business Knowledge for the wrong repository is rejected by the
 // lock, even with the domain repo list widened by the attacker.
 const realWidened=await buildCore002Fixture({programOverride:program=>{
  program.domains.find(domain=>domain.id==='xdownload')
   .repositories.push(REPO_OWNER);
 }});
 const misowned={...realWidened.declarations,
  'xdownload.policy':buildOwnerDeclaration({elementId:'xdownload.policy',
   ownerRepository:REPO_OWNER,ownerVersion:'1.0.0',functionLocks:[
    {fnId:'xdownload.describePolicy',sourceId:'xdownload-business',
     contractVersion:'1.0.0',
     implementationSha256:realWidened.canonicalDigests['xdownload-business']}]})};
 verifyThrows({artifact:realWidened.artifact,declarations:misowned,
  manifest:realWidened.manifest},'CORE002_OWNER_MISMATCH');
 // (c) Without the widening, an owner outside the selected domain is
 // rejected earlier and equally fail-closed.
 const plain=await buildCore002Fixture();
 const outside={...plain.declarations,
  'core002.gateReview':buildOwnerDeclaration({elementId:'core002.gateReview',
   ownerRepository:'kaicreator-mm/tally',ownerVersion:'1.0.0',
   functionLocks:gateReviewLocks(plain)})};
 verifyThrows({artifact:plain.artifact,declarations:outside,
  manifest:plain.manifest},'CORE002_OWNER_NOT_IN_DOMAIN');
});

test('CORE-002 negative: an unauthorized element carrying a dependency edge cannot assemble',async()=>{
 const EXT_TEXT='export function extAssess(){return {state:\'DECLARED\'}}\n';
 const fixture=await buildCore002Fixture({
  extraSources:[{id:'core002-gate-ext',text:EXT_TEXT}],
  programOverride:program=>{
   program.elements.push({
    id:'core002.gateExt',domainId:'core002-gate',version:'1.0.0',
    kind:'rule',
    description:'Unauthorized extension claiming gate review authority',
    dependsOn:['core002.gateCatalog'],
    dependencies:[{element:'core002.gateCatalog',functions:[
     {id:'core002.gateCatalog.current',contractVersion:'1.0.0'}]}],
    functions:[{id:'core002.gateExt.assess',kind:'rule',effect:'none',
     description:'Unlocked extension Function',
     binding:{type:'local',sourceId:'core002-gate-ext'}}]});
  }});
 // The attacker can self-declare their element, but the owner-sealed
 // manifest does not recognize it: the dependency carrier is rejected
 // before any dependency could be granted.
 const attackerDeclarations={...fixture.declarations,
  'core002.gateExt':buildOwnerDeclaration({elementId:'core002.gateExt',
   ownerRepository:REPO_OWNER,ownerVersion:'1.0.0',functionLocks:[
    {fnId:'core002.gateExt.assess',sourceId:'core002-gate-ext',
     contractVersion:'1.0.0',implementationSha256:sourceSha256(EXT_TEXT)}]})};
 verifyThrows({artifact:fixture.artifact,declarations:attackerDeclarations,
  manifest:fixture.manifest},'CORE002_OWNER_UNRECOGNIZED');
 // Without any declaration it is rejected as missing coverage as well.
 verifyThrows({artifact:fixture.artifact,declarations:fixture.declarations,
  manifest:fixture.manifest},'CORE002_OWNER_DECLARATION_MISSING');
});

test('CORE-002 negative: a dependency on a Function the manifest does not lock fails closed',async()=>{
 const fixture=await buildCore002Fixture();
 // Owner publishes an incomplete lock (the depended-upon Function entry is
 // absent): the assembly must refuse, not downgrade to an unlocked edge.
 const incomplete=structuredClone(fixture.entries);
 delete incomplete['core002.gateCatalog']
  .functions['core002.gateCatalog.current'];
 const flawedManifest=sealOwnerManifest({
  manifestId:'core002-owner-manifest-incomplete-lock-r0',entries:incomplete});
 verifyThrows({artifact:fixture.artifact,declarations:fixture.declarations,
  manifest:flawedManifest},'CORE002_FUNCTION_UNLOCKED');
 // An element entirely absent from the manifest is equally unrecognized.
 const missingElement=structuredClone(fixture.entries);
 delete missingElement['core002.gateCatalog'];
 verifyThrows({artifact:fixture.artifact,declarations:fixture.declarations,
  manifest:sealOwnerManifest({
   manifestId:'core002-owner-manifest-missing-entry-r0',
   entries:missingElement})},'CORE002_OWNER_UNRECOGNIZED');
});

test('CORE-002 negative: missing or unrecognized owner/version is an explicit UNKNOWN rejection, never a silent pass',async()=>{
 const fixture=await buildCore002Fixture();
 const verify=declarations=>({artifact:fixture.artifact,declarations,
  manifest:fixture.manifest});
 // Manifest absent at all.
 verifyThrows({artifact:fixture.artifact,
  declarations:fixture.declarations},'CORE002_MANIFEST_REQUIRED');
 // One Element declaration missing.
 const missing={...fixture.declarations};
 delete missing['core002.gateReview'];
 verifyThrows(verify(missing),'CORE002_OWNER_DECLARATION_MISSING');
 const mutate=patch=>({...fixture.declarations,
  'core002.gateReview':{...structuredClone(
   fixture.declarations['core002.gateReview']),...patch}});
 verifyThrows(verify(mutate({ownerRepository:undefined})),
  'CORE002_OWNER_UNKNOWN');
 verifyThrows(verify(mutate({ownerRepository:''})),'CORE002_OWNER_UNKNOWN');
 verifyThrows(verify(mutate({ownerRepository:'not-a-repo'})),
  'CORE002_OWNER_UNKNOWN');
 verifyThrows(verify(mutate({ownerVersion:undefined})),
  'CORE002_ELEMENT_VERSION_UNKNOWN');
 verifyThrows(verify(mutate({ownerVersion:'beta'})),
  'CORE002_ELEMENT_VERSION_UNKNOWN');
 verifyThrows(verify(mutate({ownerVersion:'1.0'})),
  'CORE002_ELEMENT_VERSION_UNKNOWN');
 // A declaration for an element outside the exact program cannot hide.
 verifyThrows(verify({...fixture.declarations,
  'core002.ghost':{schema:'core002.element-owner-declaration/1',
   elementId:'core002.ghost',ownerRepository:REPO_OWNER,
   ownerVersion:'1.0.0',functions:{}}}),
  'CORE002_OWNER_DECLARATION_ORPHAN');
});

test('CORE-002 negative: implementation drift under the same declared version fails closed',async()=>{
 const canonical=await readFile(
  new URL('./gate-rule.mjs',import.meta.url),'utf8');
 const driftText=canonical+
  '\n// drift: implementation bytes moved without a version bump\n';
 const fixture=await buildCore002Fixture({sourceOverride:{
  sourceId:'core002-gate-rule',text:driftText}});
 // The artifact itself stays internally consistent; the sealed lock is what
 // exposes that the implementation no longer matches the declared version.
 verifyThrows({artifact:fixture.artifact,declarations:fixture.declarations,
  manifest:fixture.manifest},'CORE002_IMPLEMENTATION_DRIFT');
 assert.notEqual(qualifyDisV020Artifact(fixture.artifact).pins
  .get('core002-gate-rule').sha256,
  fixture.canonicalDigests['core002-gate-rule']);
});

test('CORE-002 negative: declared contract version drift away from the manifest lock fails closed',async()=>{
 const fixture=await buildCore002Fixture({programOverride:program=>{
  program.elements.find(element=>element.id==='core002.gateReview')
   .functions.find(fn=>fn.id==='core002.gateReview.evidence.assess')
   .contract.version='1.1.0';
 }});
 // The attacker declares what the artifact really carries (1.1.0); the
 // owner's sealed lock still requires 1.0.0.
 const declarations={...fixture.declarations,
  'core002.gateReview':buildOwnerDeclaration({elementId:'core002.gateReview',
   ownerRepository:REPO_OWNER,ownerVersion:'1.0.0',functionLocks:[
    {fnId:'core002.gateReview.policy.query',sourceId:'core002-gate-policy',
     contractVersion:'1.0.0',
     implementationSha256:fixture.canonicalDigests['core002-gate-policy']},
    {fnId:'core002.gateReview.evidence.assess',sourceId:'core002-gate-rule',
     contractVersion:'1.1.0',
     implementationSha256:fixture.canonicalDigests['core002-gate-rule']},
    {fnId:'core002.gateReview.readiness.review',
     sourceId:'core002-gate-review',contractVersion:'1.0.0',
     implementationSha256:fixture.canonicalDigests['core002-gate-review']}]})};
 verifyThrows({artifact:fixture.artifact,declarations,
  manifest:fixture.manifest},'CORE002_FUNCTION_CONTRACT_VERSION_MISMATCH');
});

test('CORE-002 negative: element version drift away from the manifest lock fails closed',async()=>{
 const fixture=await buildCore002Fixture({programOverride:program=>{
  program.elements.find(element=>element.id==='core002.gateReview')
   .version='1.1.0';
 }});
 const declarations={...fixture.declarations,
  'core002.gateReview':buildOwnerDeclaration({elementId:'core002.gateReview',
   ownerRepository:REPO_OWNER,ownerVersion:'1.1.0',
   functionLocks:gateReviewLocks(fixture)})};
 verifyThrows({artifact:fixture.artifact,declarations,
  manifest:fixture.manifest},'CORE002_ELEMENT_VERSION_LOCK_MISMATCH');
});

test('CORE-002 negative: dependency reference version drift is denied at the AOT gate',async()=>{
 await assert.rejects(buildCore002Fixture({programOverride:program=>{
  program.elements.find(element=>element.id==='core002.gateReview')
   .dependencies[0].functions[0].contractVersion='1.1.0';
 }}),reject('DIS_FUNCTION_DEPENDENCY_VERSION_MISMATCH'));
});
