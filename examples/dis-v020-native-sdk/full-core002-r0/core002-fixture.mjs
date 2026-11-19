/**
 * CORE-002 lane r0 — exact-AOT fixture for the owner-locked cohesive Element.
 *
 * Program composition (single cohesive business Element + lock targets):
 * - `core002.gateReview` — the CORE-002 deliverable Element: one cohesive
 *   in-repo engineering responsibility (evidence gate review for lane
 *   closeout) carrying THREE Functions bound through different implementation
 *   strategies: Knowledge/Query, Rule, Workflow. Each Function has a stable
 *   typed semantic contract (schema/version/input/output/outcomes) and is
 *   digest-locked to its own implementation source.
 * - `core002.gateCatalog` — shared Knowledge catalog the review Element
 *   depends on through an exact R52 Function-level reference.
 * - `xdownload.policy` — REAL cross-project selected Knowledge source
 *   (kaicreator-mm/xDownload business bytes) to exercise the same owner lock
 *   over genuine external business provenance.
 * - `orders.init` — the required Business App Init (real bridge source).
 *
 * Provenance honesty:
 * - The four `core002-gate-*` sources are authored IN THIS LANE inside this
 *   repository; CORE002_SOURCES_COMMIT is the exact commit of this branch
 *   that introduced them and their Git Blobs are computed from the actual
 *   bytes at compile time (compileDisV020Aot enforces blob==bytes).
 * - `orders-init` and `xdownload-business` reuse the exact historical pins
 *   already qualified by examples/dis-v020-native-sdk/native-fixture.mjs.
 * - Negative-variant artifacts (source overrides / attacker-added elements)
 *   are in-memory synthetic attack inputs only. Their origin metadata is
 *   synthetic (zero commit) and is never persisted or presented as real
 *   provenance.
 *
 * This fixture proves ownership/lock engineering only. It is NOT an external
 * original business Element, an independent semantic Oracle, a publication
 * right, SAP/ECP qualification, or a Matrix promotion (DIE #155 stays the
 * separate formal denominator).
 */
import {readFile} from 'node:fs/promises';
import {sourceSha256,sourceGitBlob} from '@kaicreator/domain-harness-contracts/dis-v020';
import {compileDisV020Aot} from '@kaicreator/domain-harness-build/dis-v020';
import {buildRealCrossProjectSelection} from '../../dis-v020-cross-project/selected-build.mjs';
import {init as ordersBusinessInit} from '../../dis-v020-real-aot-bridge/business-app-init.mjs';
import * as xdownloadBusiness from '../../dis-v020-cross-project/snapshots/xdownload/business-download.mjs';
import {PlainCasDocStore} from '../../../tests/assembly/helpers-v010.ts';
import {currentGateCatalog} from './gate-catalog.mjs';
import {gateReviewPolicy} from './gate-policy.mjs';
import {assessEvidence} from './gate-rule.mjs';
import {reviewReadiness} from './gate-review.mjs';
import {buildOwnerDeclaration,sealOwnerManifest} from './core002-owner-lock.mjs';

/**
 * Exact commit of this lane branch that introduced the four gate sources.
 * Their Git Blob ids are recomputed from the actual bytes on every build, so
 * any later byte drift is detected at compile time.
 */
export const CORE002_SOURCES_COMMIT='64948eeab5f414a19093f5b6783e9caa57d2a4d9';
const REPO_OWNER='kaicreator-mm/domain-harness';
const SYNTHETIC_COMMIT='0'.repeat(40); // negative-variant attack input only

const OWNED_DESCRIPTORS=[
 {id:'core002-gate-catalog',path:'./gate-catalog.mjs',
  originPath:'examples/dis-v020-native-sdk/full-core002-r0/gate-catalog.mjs'},
 {id:'core002-gate-policy',path:'./gate-policy.mjs',
  originPath:'examples/dis-v020-native-sdk/full-core002-r0/gate-policy.mjs'},
 {id:'core002-gate-rule',path:'./gate-rule.mjs',
  originPath:'examples/dis-v020-native-sdk/full-core002-r0/gate-rule.mjs'},
 {id:'core002-gate-review',path:'./gate-review.mjs',
  originPath:'examples/dis-v020-native-sdk/full-core002-r0/gate-review.mjs'},
];
// Exact historical pins reused from native-fixture.mjs (unchanged bytes).
const REAL_DESCRIPTORS=[
 {id:'orders-init',path:'../../dis-v020-real-aot-bridge/business-app-init.mjs',
  origin:{repository:REPO_OWNER,commit:'ea3b6ef1c633e743d107bf47391afeb2f1f55cac',
   path:'examples/dis-v020-real-aot-bridge/business-app-init.mjs',
   gitBlob:'dbc4e44125958ada77bc95c0231560f9f3d64a60'}},
 {id:'xdownload-business',
  path:'../../dis-v020-cross-project/snapshots/xdownload/business-download.mjs',
  origin:{repository:'kaicreator-mm/xDownload',
   commit:'e904f08c478b15147b1c07fbe53c610d2d81851f',
   path:'packages/download-domain-app/src/business/business-download.mjs',
   gitBlob:'a7dba9a896de0b84fc6d54093563adca2ccbcdfc'}},
];

const typedContract=({input,output,outcomes})=>({
 schema:'dis.v0.2.function-contract/1',version:'1.0.0',input,output,outcomes,
 evidence:{refField:'evidenceRefs',requiredFor:[]},
 compatibility:{major:1,minReader:'0.2.0',maxReaderExclusive:'0.3.0'},
});
const NO_INPUT={type:'record',fields:{},additionalProperties:false,allowAbsent:true};
const RECORDS_FIELD={type:'array',
 items:{type:'record',fields:{id:'string',kind:'string'},additionalProperties:true},
 minItems:1,maxItems:64};

const CATALOG_CONTRACT=typedContract({
 input:NO_INPUT,
 output:{type:'record',fields:{schema:'string',catalogVersion:'string',
  state:'string',gates:'record'}},
 outcomes:{field:'state',classes:{DECLARED:'OBSERVED'}},
});
const QUERY_CONTRACT=typedContract({
 input:NO_INPUT,
 output:{type:'record',fields:{state:'string',catalogVersion:'string',
  enforcedGateIds:'array',mode:'string'}},
 outcomes:{field:'state',classes:{DECLARED:'OBSERVED'}},
});
const RULE_CONTRACT=typedContract({
 input:{type:'record',fields:{records:RECORDS_FIELD},additionalProperties:false},
 output:{type:'record',fields:{state:'string',gates:'record',
  satisfied:'array',violated:'array',undecidableIds:'array',
  catalogVersion:'string'}},
 outcomes:{field:'state',classes:{
  ALL_SATISFIED:'OBSERVED',GATES_VIOLATED:'FAILED',UNDECIDED:'UNKNOWN'}},
});
const REVIEW_CONTRACT=typedContract({
 input:{type:'record',fields:{reviewId:'string',records:RECORDS_FIELD},
  additionalProperties:false},
 output:{type:'record',fields:{state:'string',reviewId:'string',
  gates:'record',advisoryOnly:'boolean',catalogVersion:'string'}},
 outcomes:{field:'state',classes:{
  READY_FOR_CLOSEOUT:'OBSERVED',BLOCKED:'FAILED',UNDECIDED:'UNKNOWN'}},
});
// Real selected xDownload Knowledge contract (identical to native-fixture).
const DOWNLOAD_POLICY_CONTRACT=typedContract({
 input:NO_INPUT,
 output:{type:'record',fields:{packageId:'string',policyId:'string',
  domainId:'string',workflowDefinition:'record',intentBindings:'record',
  effectBindings:'record'}},
 outcomes:{field:'domainId',classes:{downloads:'OBSERVED'}},
});
const INIT_CONTRACT={
 schema:'dis.v0.2.app-init-contract/1',version:'1.0.0',
 input:{type:'record',fields:{appId:'string',domainIds:'array',
  buildPin:'string',aotDigest:'string',functions:'array'},
  additionalProperties:false},
 output:{type:'record',fields:{status:'string'},additionalProperties:true},
 outcomes:{READY:'READY',DEGRADED:'DEGRADED',BLOCKED:'BLOCKED',FAILED:'FAILED'},
 compatibility:{major:1,minReader:'0.2.0',maxReaderExclusive:'0.3.0'},
};

const programFor=built=>({
 format:'dis.v0.2.program/1',appId:built.appId,
 domains:[
  {id:'orders',description:'Selected orders Business App Init host domain',
   repositories:[REPO_OWNER]},
  {id:'core002-gate',
   description:'In-repo engineering evidence gate review domain owned by this repository',
   repositories:[REPO_OWNER]},
  {id:'xdownload',
   description:'xDownload guarded acquisition policy knowledge',
   repositories:['kaicreator-mm/xDownload']},
 ],
 elements:[
  {id:'orders.init',domainId:'orders',version:'1.0.0',kind:'workflow',
   description:'Trusted Business App Init for the owner-locked assembly',
   packageId:'business-order-approval@v08.1.0.0',dependsOn:[],functions:[
    {id:'orders.appInit',kind:'init',effect:'none',
     description:'Initialize the selected orders business app; no Effect permission',
     binding:{type:'local',sourceId:'orders-init'},initContract:INIT_CONTRACT}]},
  {id:'core002.gateCatalog',domainId:'core002-gate',version:'1.0.0',
   kind:'knowledge',
   description:'Shared gate catalog Knowledge consumed by the gate review Element',
   dependsOn:[],functions:[
    {id:'core002.gateCatalog.current',kind:'knowledge',effect:'none',
     description:'Read the declared evidence gate catalog as advisory Knowledge',
     binding:{type:'local',sourceId:'core002-gate-catalog'},
     contract:CATALOG_CONTRACT}]},
  {id:'core002.gateReview',domainId:'core002-gate',version:'1.0.0',
   kind:'workflow',
   description:'Cohesive evidence gate review Element with Query/Rule/Workflow Functions locked to one source owner',
   dependsOn:['core002.gateCatalog'],
   dependencies:[{element:'core002.gateCatalog',functions:[
    {id:'core002.gateCatalog.current',contractVersion:'1.0.0'}]}],
   functions:[
    {id:'core002.gateReview.policy.query',kind:'knowledge',effect:'none',
     description:'Query strategy: project which shared gates this Element enforces',
     binding:{type:'local',sourceId:'core002-gate-policy'},
     contract:QUERY_CONTRACT},
    {id:'core002.gateReview.evidence.assess',kind:'rule',effect:'none',
     description:'Rule strategy: assess evidence records against the shared gates without silent pass',
     binding:{type:'local',sourceId:'core002-gate-rule'},
     contract:RULE_CONTRACT},
    {id:'core002.gateReview.readiness.review',kind:'workflow',effect:'none',
     description:'Workflow strategy: compose catalog and rule into one advisory readiness verdict',
     binding:{type:'local',sourceId:'core002-gate-review'},
     contract:REVIEW_CONTRACT}]},
  {id:'xdownload.policy',domainId:'xdownload',version:'1.0.0',
   kind:'knowledge',
   description:'Real xDownload guard/effect policy Knowledge selected from original business bytes',
   dependsOn:[],functions:[
    {id:'xdownload.describePolicy',kind:'knowledge',effect:'none',
     description:'Read source-selected xDownload policy as Knowledge without starting an acquisition',
     binding:{type:'local',sourceId:'xdownload-business'},
     contract:DOWNLOAD_POLICY_CONTRACT}]},
 ],
 relations:[],
 appInit:'orders.appInit',
});

// Owner lock source of truth: element → owner/version/function locks.
const FUNCTION_LOCKS=[
 {elementId:'orders.init',fnId:'orders.appInit',sourceId:'orders-init',
  contractVersion:'1.0.0'},
 {elementId:'core002.gateCatalog',fnId:'core002.gateCatalog.current',
  sourceId:'core002-gate-catalog',contractVersion:'1.0.0'},
 {elementId:'core002.gateReview',fnId:'core002.gateReview.policy.query',
  sourceId:'core002-gate-policy',contractVersion:'1.0.0'},
 {elementId:'core002.gateReview',fnId:'core002.gateReview.evidence.assess',
  sourceId:'core002-gate-rule',contractVersion:'1.0.0'},
 {elementId:'core002.gateReview',fnId:'core002.gateReview.readiness.review',
  sourceId:'core002-gate-review',contractVersion:'1.0.0'},
 {elementId:'xdownload.policy',fnId:'xdownload.describePolicy',
  sourceId:'xdownload-business',contractVersion:'1.0.0'},
];
const ELEMENT_OWNERS={
 'orders.init':REPO_OWNER,
 'core002.gateCatalog':REPO_OWNER,
 'core002.gateReview':REPO_OWNER,
 'xdownload.policy':'kaicreator-mm/xDownload',
};

/**
 * Build the fixture. Options (negative-variant attack inputs only):
 * - sourceOverride: {sourceId, text} — replaces one source's bytes (drift).
 * - programOverride: (program)=>void — mutates the program pre-compile.
 * - extraSources: [{id, text}] — attacker-added synthetic sources.
 * The owner lock (entries/declarations/manifest) is ALWAYS built from the
 * canonical bytes so that variant drift is detected against the honest lock.
 */
export async function buildCore002Fixture({sourceOverride,programOverride,
 extraSources}={}){
 const {built}=await buildRealCrossProjectSelection();
 const texts=new Map();
 const canonicalDigests={};
 const origins={};
 for(const descriptor of OWNED_DESCRIPTORS){
  const text=await readFile(new URL(descriptor.path,import.meta.url),'utf8');
  canonicalDigests[descriptor.id]=sourceSha256(text);
  texts.set(descriptor.id,text);
  origins[descriptor.id]={repository:REPO_OWNER,
   commit:CORE002_SOURCES_COMMIT,path:descriptor.originPath,
   gitBlob:sourceGitBlob(text)};
 }
 for(const descriptor of REAL_DESCRIPTORS){
  const text=await readFile(new URL(descriptor.path,import.meta.url),'utf8');
  canonicalDigests[descriptor.id]=sourceSha256(text);
  texts.set(descriptor.id,text);
  origins[descriptor.id]=descriptor.origin;
 }
 let overridden=false;
 if(sourceOverride!==undefined){
  if(!REAL_DESCRIPTORS.some(descriptor=>descriptor.id===sourceOverride.sourceId)){
   if(!texts.has(sourceOverride.sourceId))
    throw new Error('unknown sourceOverride id');
   overridden=true;
   texts.set(sourceOverride.sourceId,sourceOverride.text);
  }else{
   // Historical real pins must never carry synthetic bytes: their blob is
   // content-enforced by the compiler, so a drift variant of a REAL source
   // cannot claim the historical origin. Attack variants target only the
   // lane-owned sources.
   throw new Error('real selected sources are not overridable');
  }
 }
 const extra=extraSources??[];
 const program=programFor(built);
 if(programOverride!==undefined)programOverride(program);
 const sources=[
  // Lane-owned sources: canonical bytes keep the true lane-commit origin;
  // overridden variant bytes are synthetic attack inputs and carry the
  // explicit zero commit, never a real provenance claim.
  ...OWNED_DESCRIPTORS.map(descriptor=>{
   const isVariant=overridden&&descriptor.id===sourceOverride.sourceId;
   return {id:descriptor.id,sourceText:texts.get(descriptor.id),
    origin:{repository:REPO_OWNER,
     commit:isVariant?SYNTHETIC_COMMIT:CORE002_SOURCES_COMMIT,
     path:descriptor.originPath,gitBlob:sourceGitBlob(texts.get(descriptor.id))}};
  }),
  ...REAL_DESCRIPTORS.map(descriptor=>({
   id:descriptor.id,sourceText:texts.get(descriptor.id),
   origin:origins[descriptor.id]})),
  ...extra.map(entry=>({
   id:entry.id,sourceText:entry.text,
   origin:{repository:REPO_OWNER,commit:SYNTHETIC_COMMIT,
    path:`examples/dis-v020-native-sdk/full-core002-r0/synthetic/${entry.id}`,
    gitBlob:sourceGitBlob(entry.text)}})),
 ];
 const expectedSourceOrigins=Object.fromEntries(
  sources.map(source=>[source.id,source.origin]));
 const artifact=compileDisV020Aot({built,program,sources,expectedSourceOrigins});
 const pinOf=sourceId=>sources.find(source=>source.id===sourceId);
 const registryEntry=(sourceId,execute)=>{
  const source=pinOf(sourceId);
  return {sourceId,sha256:sourceSha256(source.sourceText),
   gitBlob:source.origin.gitBlob,origin:source.origin,execute};
 };
 const registry={
  'orders.appInit':registryEntry('orders-init',ctx=>ordersBusinessInit(
   Object.freeze({...ctx,config:Object.freeze({mode:'demo'}),
    bindings:Object.freeze(['approveQuote'])}))),
  'core002.gateCatalog.current':registryEntry('core002-gate-catalog',
   ()=>currentGateCatalog()),
  'core002.gateReview.policy.query':registryEntry('core002-gate-policy',
   ()=>gateReviewPolicy()),
  'core002.gateReview.evidence.assess':registryEntry('core002-gate-rule',
   input=>assessEvidence(input)),
  'core002.gateReview.readiness.review':registryEntry('core002-gate-review',
   input=>reviewReadiness(input)),
  'xdownload.describePolicy':registryEntry('xdownload-business',
   ()=>xdownloadBusiness.getPolicy()),
 };
 // Owner lock is derived from the CANONICAL digests, never from variant bytes.
 const lock=fnLock=>({sourceId:fnLock.sourceId,
  contractVersion:fnLock.contractVersion,
  implementationSha256:canonicalDigests[fnLock.sourceId]});
 const entries={};
 const declarations={};
 for(const [elementId,owner] of Object.entries(ELEMENT_OWNERS)){
  const locks=FUNCTION_LOCKS.filter(fnLock=>fnLock.elementId===elementId);
  entries[elementId]={owner,version:'1.0.0',
   functions:Object.fromEntries(locks.map(fnLock=>[fnLock.fnId,lock(fnLock)]))};
  declarations[elementId]=buildOwnerDeclaration({elementId,ownerRepository:owner,
   ownerVersion:'1.0.0',
   functionLocks:locks.map(fnLock=>({fnId:fnLock.fnId,...lock(fnLock)}))});
 }
 const manifest=sealOwnerManifest({
  manifestId:'core002-owner-manifest-full-core002-r0',entries});
 return Object.freeze({artifact,program,sources,registry,built,entries,
  declarations,manifest,canonicalDigests});
}

/** Open the Microkernel app through the owner-locked assembly seam. */
export async function openCore002App(fixture){
 const {openOwnerLockedApp}=await import('./core002-owner-lock.mjs');
 return openOwnerLockedApp({
  artifact:fixture.artifact,declarations:fixture.declarations,
  manifest:fixture.manifest,registry:fixture.registry,
  store:new PlainCasDocStore(),tenantId:'tenant:dis-v020-full-core002',
 });
}
