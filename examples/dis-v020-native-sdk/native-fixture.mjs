/**
 * DIS v0.2.0 native API conformance fixture using original Tally, Runx and
 * xDownload source bytes, never an invented "mock domain". The selected BUILD
 * is produced by the existing canonical v0.10 BUILD and qualified by the new
 * public DIS v0.2 BUILD subpath before native Microkernel SDK consumption.
 */
import {readFile} from 'node:fs/promises';
import {sourceSha256} from '@kaicreator/domain-harness-contracts/dis-v020';
import {compileDisV020Aot} from '@kaicreator/domain-harness-build/dis-v020';
import {buildRealCrossProjectSelection} from '../dis-v020-cross-project/selected-build.mjs';
import {init as ordersBusinessInit} from '../dis-v020-real-aot-bridge/business-app-init.mjs';
import * as tallyBusiness from '../dis-v020-cross-project/snapshots/tally/business.mjs';
import * as tallyRelease from '../dis-v020-cross-project/snapshots/tally/release-readiness.mjs';
import * as xdownloadBusiness from '../dis-v020-cross-project/snapshots/xdownload/business-download.mjs';
import {inspectDownloadGoal,confirmDownloadGoal} from '../dis-v020-interaction/download-goal.mjs';
import {EnvironmentAgentPresence} from '../dis-v020-cross-project/snapshots/runx/environment-agent-presence.ts';

const sourceDescriptors=[
 {id:'orders-init',path:'../dis-v020-real-aot-bridge/business-app-init.mjs',repository:'kaicreator-mm/domain-harness',commit:'ea3b6ef1c633e743d107bf47391afeb2f1f55cac',originalPath:'examples/dis-v020-real-aot-bridge/business-app-init.mjs',gitBlob:'dbc4e44125958ada77bc95c0231560f9f3d64a60'},
 {id:'tally-business',path:'../dis-v020-cross-project/snapshots/tally/business.mjs',repository:'kaicreator-mm/tally',commit:'e988321439f65b55936a691c02250b6d62a29409',originalPath:'packages/tally-engineering-business/src/index.mjs',gitBlob:'54015fb63ffb13b4f4e562f660d2172098b5f7f4'},
 {id:'tally-release',path:'../dis-v020-cross-project/snapshots/tally/release-readiness.mjs',repository:'kaicreator-mm/tally',commit:'e988321439f65b55936a691c02250b6d62a29409',originalPath:'packages/tally-engineering-business/src/release-readiness.mjs',gitBlob:'2d4d6e7462156e4466192a0ed3207ac76fd288e1'},
 {id:'runx-presence',path:'../dis-v020-cross-project/snapshots/runx/environment-agent-presence.ts',repository:'kaicreator-mm/runx',commit:'b9e0c953d9bfd5834315012426fd8e10c21bdd7c',originalPath:'packages/control-plane/src/environment-agent-presence.ts',gitBlob:'b2c669537a56638aeead4f55914533b00fe3935e'},
 {id:'xdownload-business',path:'../dis-v020-cross-project/snapshots/xdownload/business-download.mjs',repository:'kaicreator-mm/xDownload',commit:'e904f08c478b15147b1c07fbe53c610d2d81851f',originalPath:'packages/download-domain-app/src/business/business-download.mjs',gitBlob:'a7dba9a896de0b84fc6d54093563adca2ccbcdfc'},
 {id:'xdownload-interaction',path:'../dis-v020-interaction/download-goal.mjs',repository:'kaicreator-mm/domain-harness',commit:'7011b3fe3faa177ba9bc8679cc5884479ca52159',originalPath:'examples/dis-v020-interaction/download-goal.mjs',gitBlob:'f57747aa7996c88833e72288a0acd594a7ce5468'},
];
export async function makeNativeFixture(){
 const {built}=await buildRealCrossProjectSelection();
 const sources=await Promise.all(sourceDescriptors.map(async x=>({
   id:x.id,sourceText:await readFile(new URL(x.path,import.meta.url),'utf8'),
   origin:{repository:x.repository,commit:x.commit,path:x.originalPath,gitBlob:x.gitBlob},
 })));
 const program={
  format:'dis.v0.2.program/1',appId:built.appId,
  domains:[
   {id:'orders',description:'Existing selected approved orders Business',repositories:['kaicreator-mm/domain-harness']},
   {id:'tally',description:'Tally engineering Claim observation and release evidence',repositories:['kaicreator-mm/tally']},
   {id:'runx',description:'Runx non-authoritative Agent incarnation presence',repositories:['kaicreator-mm/runx']},
   {id:'xdownload',description:'xDownload guarded acquisition Workflow with a trusted demo-only interaction adapter',repositories:['kaicreator-mm/xDownload','kaicreator-mm/domain-harness']},
   {id:'shared',description:'Cross-domain relationship/constraint semantics',repositories:['kaicreator-mm/domain-harness']},
  ],
  elements:[
   {id:'shared.semantics',domainId:'shared',version:'1.0.0',kind:'global',description:'Global observation/authorization boundary',dependsOn:[],functions:[]},
   {id:'orders.init',domainId:'orders',version:'1.0.0',kind:'workflow',description:'Unique trusted Business App Init',packageId:'business-order-approval@v08.1.0.0',dependsOn:[],functions:[
    {id:'orders.appInit',kind:'init',effect:'none',binding:{type:'local',sourceId:'orders-init'}}]},
   {id:'orders.approval',domainId:'orders',version:'1.0.0',kind:'workflow',description:'Selected orders KDP route',packageId:'business-order-approval@v08.1.0.0',dependsOn:[],functions:[
    {id:'orders.approve',kind:'workflow',effect:'none',binding:{type:'kdp-intent',intentId:'submitQuoteDecisionDynamic'}}]},
   {id:'tally.tasks',domainId:'tally',version:'1.0.0',kind:'rule',description:'Task evidence is observation, not Claim authority',
    validation:{schema:'dis.v0.2.element-validation/1',sourceIds:['tally-business'],authority:'NONE'},
    packageId:'business-tally-task-readiness@v2.0.0',dependsOn:[],functions:[
    {id:'tally.assessTaskEvidence',kind:'rule',effect:'none',binding:{type:'local',sourceId:'tally-business'}}]},
   {id:'tally.release',domainId:'tally',version:'1.0.0',kind:'rule',description:'Release readiness without RQ authorization',packageId:'business-tally-task-readiness@v2.0.0',dependsOn:['tally.tasks'],functions:[
    {id:'tally.projectReleaseReadiness',kind:'rule',effect:'none',binding:{type:'local',sourceId:'tally-release'}}]},
   {id:'runx.agent.presence',domainId:'runx',version:'1.0.0',kind:'stateful',description:'Stateful Agent presence, not execution lease',dependsOn:[],functions:[
    {id:'runx.createPresenceObserver',kind:'stateful',effect:'none',binding:{type:'local',sourceId:'runx-presence'}}]},
   {id:'xdownload.policy',domainId:'xdownload',version:'1.0.0',kind:'knowledge',description:'Download guard/effect policy knowledge',packageId:'business-download@0.2.0-t03',dependsOn:[],functions:[
    {id:'xdownload.describePolicy',kind:'knowledge',effect:'none',binding:{type:'local',sourceId:'xdownload-business'}}]},
   {id:'xdownload.interaction',domainId:'xdownload',version:'1.0.0',kind:'interaction',description:'Two public local Functions normalize Chat/Form/CLI download intent and confirmation without issuing an Effect',
    validation:{schema:'dis.v0.2.element-validation/1',sourceIds:['xdownload-interaction'],authority:'NONE'},
    dependsOn:['xdownload.policy'],functions:[
    {id:'xdownload.interaction.inspect',kind:'interaction',effect:'none',binding:{type:'local',sourceId:'xdownload-interaction'}},
    {id:'xdownload.interaction.confirm',kind:'interaction',effect:'none',binding:{type:'local',sourceId:'xdownload-interaction'}}]},
   {id:'xdownload.acquire',domainId:'xdownload',version:'1.0.0',kind:'effect',description:'Non-idempotent acquisition requires KDP permit',packageId:'business-download@0.2.0-t03',dependsOn:['xdownload.policy'],functions:[
    {id:'xdownload.confirmDownload',kind:'effect',effect:'governed',binding:{type:'kdp-intent',intentId:'confirmDownload'}}]},
  ],
  relations:[
   {from:'shared.semantics',to:'tally.tasks',kind:'defines'},
   {from:'shared.semantics',to:'runx.agent.presence',kind:'constrains'},
   {from:'xdownload.policy',to:'xdownload.acquire',kind:'depends-on'},
   {from:'xdownload.policy',to:'xdownload.interaction',kind:'depends-on'},
   {from:'xdownload.interaction',to:'xdownload.acquire',kind:'cooperates'},
   {from:'tally.tasks',to:'tally.release',kind:'depends-on'},
   {from:'runx.agent.presence',to:'tally.tasks',kind:'cooperates'},
  ],
  appInit:'orders.appInit',
 };

 // R11: AOT-locked per-Function profiles on original Tally/xDownload sources.
 const r11=(classes,fields)=>({
  schema:'dis.v0.2.function-contract/1',version:'1.0.0',
  input:{type:'record'},
  output:{type:'record',fields},
  outcomes:{field:Object.hasOwn(fields,'state')?'state':'status',classes},
  evidence:{refField:'evidenceRefs',requiredFor:['SUCCEEDED']},
  compatibility:{major:1,minReader:'0.2.0',maxReaderExclusive:'0.3.0'}
 });
 const find=id=>program.elements.flatMap(e=>e.functions).find(fn=>fn.id===id);
 // R16: typed KDP admission contract is separate from a LOCAL observation.
 // A real KDP admitted receipt is NOT evidence that an Effect completed.
 find('orders.approve').receiptContract={
  schema:'dis.v0.2.kdp-receipt-contract/1',version:'1.0.0',
  statusMap:{admitted:'ADMITTED',denied:'DENIED',rejected:'DENIED'},
  compatibility:{major:1,minReader:'0.2.0',maxReaderExclusive:'0.3.0'}
 };
 // R20: Runx returns a genuine source-pinned stateful class instance, not JSON.
 // Only method names and process-local lifetime are declared here.
 find('runx.createPresenceObserver').handleContract={
  schema:'dis.v0.2.local-handle-contract/1',version:'1.0.0',
  methods:['observe','list','latest'],lifetime:'PROCESS_LOCAL'
 };
 find('tally.assessTaskEvidence').contract=r11({
  UNQUALIFIED_INPUT:'UNKNOWN',OBSERVED_INPUT_ONLY:'OBSERVED'
 },{state:'string',admitted:'boolean',taskPass:'boolean'});
 // R19: a selected knowledge Function's native output is a bounded
 // observation. The nested policy/Effect binding remains KDP governed.
 const policy=r11({downloads:'OBSERVED'},{
  packageId:'string',policyId:'string',domainId:'string',
  workflowDefinition:'record',intentBindings:'record',effectBindings:'record'
 });
 policy.input={type:'record',fields:{},additionalProperties:false,allowAbsent:true};
 policy.outcomes={field:'domainId',classes:{downloads:'OBSERVED'}};
 find('xdownload.describePolicy').contract=policy;
 // R19: install a typed receipt *for* the selected xDownload KDP route,
 // without invoking its non-idempotent acquire Effect in this test.
 find('xdownload.confirmDownload').receiptContract=
  structuredClone(find('orders.approve').receiptContract);
 // R18: the real source-pinned Tally release projection remains advisory.
 // Its reported gate PASS is NOT independent GitHub/RQ evidence.
 find('tally.projectReleaseReadiness').contract=r11({
  UNKNOWN:'UNKNOWN',BLOCKED:'UNKNOWN'
 },{
  status:'string',reason:'string',authorization:'string',
  advisoryOnly:'boolean',independentRQRequired:'boolean',
  taskPass:'boolean',releasePass:'boolean',
  canMerge:'boolean',canTag:'boolean',canPublish:'boolean'
 });
 for(const id of ['xdownload.interaction.inspect','xdownload.interaction.confirm']){
  find(id).contract=r11({
   REJECTED:'FAILED',CLARIFICATION_REQUIRED:'NEEDS_INPUT',
   AWAITING_CONFIRMATION:'NEEDS_CONFIRMATION',
   READY_FOR_KDP:'PENDING_AUTHORIZATION'
  },{status:'string',authority:'string',effectDispatched:'boolean'});
 }
 const expectedSourceOrigins=Object.fromEntries(sourceDescriptors.map(s=>[s.id,{
  repository:s.repository,commit:s.commit,path:s.originalPath,gitBlob:s.gitBlob
 }]));
 const artifact=compileDisV020Aot({built,program,sources,expectedSourceOrigins});
 const get=(sourceId,execute)=>{
  const source=sources.find(s=>s.id===sourceId);
  if(!source)throw new Error('fixture source not selected');
  return {sourceId,sha256:sourceSha256(source.sourceText),
   gitBlob:source.origin.gitBlob,origin:source.origin,execute};
 };
 const registry={
  'orders.appInit':get('orders-init',ctx=>ordersBusinessInit(Object.freeze({
   ...ctx,config:Object.freeze({mode:'demo'}),bindings:Object.freeze(['approveQuote'])
  }))),
  'tally.assessTaskEvidence':get('tally-business',input=>tallyBusiness.assessTaskEvidence(input)),
  'tally.projectReleaseReadiness':get('tally-release',input=>tallyRelease.projectReleaseReadiness(input)),
  'runx.createPresenceObserver':get('runx-presence',clock=>new EnvironmentAgentPresence(clock)),
  'xdownload.describePolicy':get('xdownload-business',()=>xdownloadBusiness.getPolicy()),
  'xdownload.interaction.inspect':get('xdownload-interaction',input=>inspectDownloadGoal(input)),
  'xdownload.interaction.confirm':get('xdownload-interaction',input=>confirmDownloadGoal(input)),
 };
 return {artifact,program,sources,registry,expectedSourceOrigins};
}
