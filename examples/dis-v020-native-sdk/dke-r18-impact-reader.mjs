/** DIS B16/R62: native DKE R18 transitive knowledge impact as actual
 * source-locked selected SDK/KDP Knowledge Function. Original DKE native
 * runner and receipt remain compressed, byte-exact, NON-executable DATA.
 * Re-evaluate frozen source roles independently; never auto-remap or
 * qualify a physical Method from syntactically corrected steps.
 */
import {inflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {sourceGitBlob} from '@kaicreator/domain-harness-contracts/dis-v020';
export const R18_COMMIT='a9f02a31b86013435bf91a1b43755ad5fb52fd11';
const DIR='docs/standards/dke/DKE-0.0.1/demos/knowledge-solidification-rv-r0/cross-domain-r8/executions/r18-guide-impact/';
export const R18_ORIGINS=Object.freeze({
 plan:{repository:'kaicreator-mm/domain-forge',commit:R18_COMMIT,path:DIR+'FROZEN_PLAN.json',gitBlob:'faca8efa29e4525e352783511c766a546fd4db0b'},
 runner:{repository:'kaicreator-mm/domain-forge',commit:R18_COMMIT,path:DIR+'r18-impact.mjs.zlib.b64',gitBlob:'aca65f96917b5643b18b479b8aa019bb8d2dc24a'},
 receipt:{repository:'kaicreator-mm/domain-forge',commit:R18_COMMIT,path:DIR+'R18_NATIVE_RECEIPT.json.zlib.b64',gitBlob:'49405f17ce2eacce5a1ea63b90822c711550fa48'}
});
const expected={
 runner:{gitBlob:'4d197c74bf25fbad2234972341fa7aee9a034045',sha256:'37bc41e8a2adbc79e53be034af4899ae7b31148aa051fd904955447b1349cd04',bytes:9191},
 receipt:{gitBlob:'0d168fae56e2dfbfe1239d9b8df131ad132b7dde',sha256:'aa46e3d1dc57260584a3b210b11541d60401c2170e58aba164cb134457548646',bytes:5963}
};
const ids=['source.framework-readme','source.guide203','source.guide79',
 'knowledge.rtc-conditional','reference.remove-16','reference.replace-17',
 'method.d05-rtc-substitution','consumer.method-readonly','consumer.rtc-fact-readonly',
 'knowledge.unrelated'];
const invalid=['reference.remove-16','reference.replace-17','method.d05-rtc-substitution','consumer.method-readonly'];
const fail=code=>{const e=new Error(code);e.code=code;throw e};
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
const stable=x=>Array.isArray(x)?x.map(stable):
 obj(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x;
const eq=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
const digest=x=>createHash('sha256').update(x).digest('hex');
export function unpackR18(text,key){
 if(!Object.hasOwn(expected,key)||typeof text!=='string')fail('DIS_R18_PACKAGE_INVALID');
 const encoded=text.trim();
 if(!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)||Buffer.from(encoded,'base64').toString('base64')!==encoded)
  fail('DIS_R18_PACKAGE_INVALID');
 let raw;
 try{raw=inflateSync(Buffer.from(encoded,'base64'))}catch{fail('DIS_R18_DECOMPRESS_INVALID')}
 const meta=expected[key],txt=raw.toString('utf8');
 if(raw.length!==meta.bytes||sourceGitBlob(txt)!==meta.gitBlob||digest(raw)!==meta.sha256||
    !Buffer.from(txt,'utf8').equals(raw))
  fail('DIS_R18_ORIGINAL_BYTES_DRIFT');
 return txt;
}
/** Source-local DAG replay: independent of upstream DKE receipt's result. */
export function replayR18(plan,{steps,model='FRAMEWORK_11_GEN_INTEL',autoRemap=false,owner=false,sap=false,effects=false,edges}={}){
 if(!obj(plan)||plan.schema!=='dke.r18.source-dag-replay-plan/v1'||
    plan.source?.readmeBlob!=='dbdfc6ba1556689864d733401f7c8f824d965cdf'||
    plan.source?.targetGuideRawSHA!==null||
    plan.qualification?.sap!==0||plan.qualification?.effects!==0)
  fail('DIS_R18_PLAN_INVALID');
 if(model!=='FRAMEWORK_11_GEN_INTEL'||autoRemap||owner||sap||effects)
  fail('DIS_R18_FALSE_AUTHORITY_OR_MODEL');
 const originals=plan.frozenObservations;
 if(!Array.isArray(originals?.guide203)||originals.guide203.length!==2||
    !eq(originals.guide203,[{referenceStep:16,meaning:'REMOVE_MAINBOARD'},{referenceStep:17,meaning:'REASSEMBLE_MAINBOARD'}]))
  fail('DIS_R18_REFERENCE_MUTATION');
 const guide=steps===undefined?originals.guide79:steps;
 if(!Array.isArray(guide)||guide.length!==4||
    !eq(guide.map(x=>x.step),[16,17,26,28])||
    guide.some(x=>!obj(x)||typeof x.role!=='string'))
  fail('DIS_R18_TARGET_SOURCE_SHAPE');
 const requirements=[
  {id:'reference.remove-16',step:16,role:'REMOVE_MAINBOARD'},
  {id:'reference.replace-17',step:17,role:'REASSEMBLE_MAINBOARD'}
 ];
 const deps=edges===undefined?{
  'reference.remove-16':['source.guide203','source.guide79'],
  'reference.replace-17':['source.guide203','source.guide79'],
  'method.d05-rtc-substitution':['reference.remove-16','reference.replace-17'],
  'consumer.method-readonly':['method.d05-rtc-substitution'],
  'consumer.rtc-fact-readonly':['knowledge.rtc-conditional']
 }:edges;
 if(!obj(deps)||!eq(Object.keys(deps).sort(),[
  'reference.remove-16','reference.replace-17','method.d05-rtc-substitution',
  'consumer.method-readonly','consumer.rtc-fact-readonly'].sort()))
  fail('DIS_R18_GRAPH_SHAPE_INVALID');
 const visited=new Set(),active=new Set();
 function walk(id){
  if(!ids.includes(id))fail('DIS_R18_GRAPH_DANGLING');
  if(active.has(id))fail('DIS_R18_GRAPH_CYCLE');
  if(visited.has(id))return;
  active.add(id);
  const list=deps[id]??[];
  if(!Array.isArray(list)||new Set(list).size!==list.length)fail('DIS_R18_GRAPH_DUPLICATE');
  for(const next of list)walk(next);
  active.delete(id);visited.add(id);
 }
 ids.forEach(walk);
 const status={
  'source.framework-readme':'SOURCE_GIT_VERIFIED',
  'source.guide203':'SOURCE_UNPINNED',
  'source.guide79':'SOURCE_UNPINNED',
  'knowledge.rtc-conditional':'SOURCE_OBSERVED_NOT_SAP',
  'consumer.rtc-fact-readonly':'SOURCE_OBSERVED_NOT_SAP',
  'knowledge.unrelated':'SOURCE_OBSERVED_NOT_SAP'
 };
 const collisions=[];
 for(const ref of requirements){
  const observed=guide.find(x=>x.step===ref.step);
  if(observed.role!==ref.role){
   status[ref.id]='INVALIDATED';
   collisions.push({node:ref.id,step:ref.step,required:ref.role,observed:observed.role});
  }else status[ref.id]='BLOCKED_SOURCE_PIN';
 }
 for(const id of ['method.d05-rtc-substitution','consumer.method-readonly'])
  status[id]=deps[id].some(d=>status[d]==='INVALIDATED')?'INVALIDATED':'BLOCKED_SOURCE_PIN';
 const affected=ids.filter(x=>status[x]==='INVALIDATED');
 return {state:'READ_ONLY_REPLAY',status,collisions,affected,
  methodOutcome:status['consumer.method-readonly']==='INVALIDATED'?'UNKNOWN_STALE_SOURCE':'UNKNOWN_MISSING_SOURCE_OR_REVIEW',
  factOutcome:'SOURCE_OBSERVED_NO_SAP'};
}
export function verifyR18NativeEvidence(plan,receipt,runnerText){
 if(!obj(receipt)||receipt.schema!=='dke.r18.native-graph-replay/v1'||
    receipt.authority!=='kaicreator-mm/domain-forge#209'||
    receipt.status!=='PASS_BOUNDED_NATIVE_GRAPH_INVALIDATION_NOT_SAP'||
    receipt.sourceGitBlob!==plan?.source?.readmeBlob||
    receipt.scope!=='STANDALONE_NATIVE_READ_ONLY_NOT_DIS_KDP'||
    receipt.publisherGuide203RawPinned!==false||
    receipt.publisherGuide79RawPinned!==false||
    receipt.sourceIndependentSemanticCritic!==false||
    receipt.originalD05FullQualified!==0||receipt.originalR8EVQualified!==0||
    receipt.autonomousEVQualified!==0||receipt.sapQualified!==0||
    receipt.effects!==0||receipt.physicalRepair!=='NOT_RUN'||
    receipt.nativeSelectedChecks!==6||receipt.adversarialPassed!==18||
    !Array.isArray(receipt.tests)||receipt.tests.length!==18||
    receipt.tests.some(x=>x.got!==x.expected)||
    typeof runnerText!=='string'||!runnerText.includes('INVALIDATED'))
  fail('DIS_R18_FALSE_SOURCE_OR_AUTHORITY');
 const baseline=replayR18(plan);
 if(!eq(baseline,receipt.baseline)||!eq(baseline.affected,invalid))fail('DIS_R18_BASELINE_MISMATCH');
 const once=structuredClone(plan.frozenObservations.guide79);
 once[0].role='REMOVE_MAINBOARD';
 if(!eq(replayR18(plan,{steps:once}),receipt.oneRoleRepair))fail('DIS_R18_PARTIAL_REPAIR_MISMATCH');
 once[1].role='REASSEMBLE_MAINBOARD';
 if(!eq(replayR18(plan,{steps:once}),receipt.hypotheticalMatchingRoles))
  fail('DIS_R18_UNPINNED_SOURCE_BYPASS');
 return Object.freeze({nodes:ids.length,invalidated:invalid.length,
  selectedNativeChecks:6,negativeCases:18,independentSemanticCritic:false,
  publisherRawPinned:false,sapQualified:false,effects:false,baseline});
}
export function makeR18KnowledgeReader(planText,runnerPackage,receiptPackage){
 if([planText,runnerPackage,receiptPackage].some((x,i)=>typeof x!=='string'||sourceGitBlob(x)!==
  [R18_ORIGINS.plan.gitBlob,R18_ORIGINS.runner.gitBlob,R18_ORIGINS.receipt.gitBlob][i]))
  fail('DIS_R18_GIT_PACKAGE_DRIFT');
 let plan,receipt;
 const runner=unpackR18(runnerPackage,'runner'),json=unpackR18(receiptPackage,'receipt');
 try{plan=JSON.parse(planText);receipt=JSON.parse(json)}catch{fail('DIS_R18_JSON_INVALID')}
 const proof=verifyR18NativeEvidence(plan,receipt,runner);
 return Object.freeze({
  summary:Object.freeze({nodes:10,invalidated:4,upstreamNative:true,
   independentSemanticCritic:false,sapQualified:false}),
  query(req){
   if(!obj(req)||Object.keys(req).length!==1||
      typeof req.nodeId!=='string'||!ids.includes(req.nodeId))
    fail('DIS_R18_UNSELECTED_NODE');
   const state=proof.baseline.status[req.nodeId];
   return Object.freeze({
    status:'UNKNOWN',nodeId:req.nodeId,graphState:state,
    methodOutcome:proof.baseline.methodOutcome,
    factOutcome:proof.baseline.factOutcome,
    invalidated:state==='INVALIDATED',
    sourceProvenance:'ORIGINAL_DKE_R18_NATIVE_NODE_RECEIPT_PINNED',
    invalidatedCount:4,graphNodes:10,
    guide203RawPinned:false,guide79RawPinned:false,
    semanticIndependent:false,sapQualified:false,effectDispatched:false
   });
  }
 });
}
