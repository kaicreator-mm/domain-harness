/**
 * DIS 0.2 native contract shared by BUILD and the public Microkernel SDK.
 * The V10 BUILD and KDP remain the only owners of module selection and Effects.
 * This additive ABI has no authority to admit, execute, or mint KDP permits.
 */
import {createHash} from 'node:crypto';
import {sha256Canonical} from './dist/digest.js';

export const DIS_V020_PROGRAM='dis.v0.2.program/1';
export const DIS_V020_AOT='dis.v0.2.aot/1';
const ID=/^[A-Za-z][A-Za-z0-9._:@/-]{0,127}$/;
const HEX=/^[a-f0-9]{64}$/;
const GIT=/^[a-f0-9]{40}$/;
const ELEMENT_KINDS=new Set(['global','knowledge','rule','stateful','workflow','effect','interaction']);
const FUNCTION_KINDS=new Set(['init','knowledge','rule','stateful','workflow','effect','interaction']);
const REL_KINDS=new Set(['depends-on','constrains','cooperates','defines']);
const MAX=256;

/** R11 bounded Function Contract — source evidence is NOT business attestation. */
const OUTCOMES=new Set(['OBSERVED','UNKNOWN','FAILED','NEEDS_INPUT','NEEDS_CONFIRMATION','PENDING_AUTHORIZATION','SUCCEEDED']);
const VALUE_TYPES=new Set(['string','boolean','number','record','array']);
const KDP_ADMISSIONS=new Set(['ADMITTED','DENIED','UNKNOWN']);
const SEMVER=/^[1-9][0-9]*\\.(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)$/;

const FIELD=/^[A-Za-z][A-Za-z0-9_]{0,63}$/;
function validateKdpReceiptContract(contract){
 keys(contract,['schema','version','statusMap','compatibility']);
 if(contract.schema!=='dis.v0.2.kdp-receipt-contract/1'||!SEMVER.test(contract.version))
  fail('DIS_KDP_RECEIPT_CONTRACT_INVALID');
 if(!record(contract.statusMap)||Object.keys(contract.statusMap).length===0||
    Object.keys(contract.statusMap).length>MAX||contract.statusMap.admitted!=='ADMITTED')
  fail('DIS_KDP_RECEIPT_CONTRACT_INVALID');
 for(const [status,admission] of Object.entries(contract.statusMap)){
  if(!FIELD.test(status)||!KDP_ADMISSIONS.has(admission)||
     (status!=='admitted'&&admission==='ADMITTED'))
   fail('DIS_KDP_RECEIPT_ADMISSION_WEAK');
 }
 keys(contract.compatibility,['major','minReader','maxReaderExclusive']);
 if(!Number.isSafeInteger(contract.compatibility.major)||contract.compatibility.major<1||
    Number(contract.version.split('.')[0])!==contract.compatibility.major||
    contract.compatibility.minReader!=='0.2.0'||
    contract.compatibility.maxReaderExclusive!=='0.3.0')
   fail('DIS_KDP_RECEIPT_COMPATIBILITY_INVALID');
}
/** Only a genuine KDP send() result carries KDP authority; this helper alone grants none. */
export function classifyDisV020KdpReceipt(contract,receipt){
 validateKdpReceiptContract(contract);
 if(!record(receipt)||typeof receipt.status!=='string'||!receipt.status)
  fail('DIS_KDP_RECEIPT_INVALID');
 // Unrecognized statuses fail closed to UNKNOWN, never SUCCEEDED or ADMITTED.
 return Object.freeze({
  admission:contract.statusMap[receipt.status]??'UNKNOWN',
  execution:'NOT_PROVEN',businessEvidenceAttested:false
 });
}

function validateShape(shape){
 keys(shape,['type','fields']);
 if(shape.type!=='record'||(shape.fields!==undefined&&!record(shape.fields)))fail('DIS_FUNCTION_SCHEMA_INVALID');
 const fields=shape.fields??{};
 if(Object.keys(fields).length>MAX)fail('DIS_FUNCTION_SCHEMA_INVALID');
 for(const [name,type] of Object.entries(fields)){
  if(!FIELD.test(name)||!VALUE_TYPES.has(type))fail('DIS_FUNCTION_SCHEMA_INVALID');
 }
}
function validateFunctionContract(c){
 keys(c,['schema','version','input','output','outcomes','evidence','compatibility']);
 if(c.schema!=='dis.v0.2.function-contract/1'||!/^[1-9][0-9]*\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/.test(c.version))fail('DIS_FUNCTION_CONTRACT_INVALID');
 validateShape(c.input);validateShape(c.output);
 keys(c.outcomes,['field','classes']);
 if(!FIELD.test(c.outcomes.field)||!record(c.outcomes.classes)||
  !Object.keys(c.outcomes.classes).length||Object.keys(c.outcomes.classes).length>MAX)fail('DIS_FUNCTION_OUTCOMES_INVALID');
 for(const [tag,disposition] of Object.entries(c.outcomes.classes)){
  if(!FIELD.test(tag)||!OUTCOMES.has(disposition))fail('DIS_FUNCTION_OUTCOMES_INVALID');
 }
 keys(c.evidence,['refField','requiredFor']);
 if(!FIELD.test(c.evidence.refField)||!arr(c.evidence.requiredFor,true)||
  new Set(c.evidence.requiredFor).size!==c.evidence.requiredFor.length||
  c.evidence.requiredFor.some(x=>!OUTCOMES.has(x)))fail('DIS_FUNCTION_EVIDENCE_INVALID');
 if(Object.values(c.outcomes.classes).includes('SUCCEEDED')&&!c.evidence.requiredFor.includes('SUCCEEDED'))
  fail('DIS_EVIDENCE_POLICY_WEAK');
 keys(c.compatibility,['major','minReader','maxReaderExclusive']);
 if(!Number.isSafeInteger(c.compatibility.major)||c.compatibility.major<1||
  Number(c.version.split('.')[0])!==c.compatibility.major||
  c.compatibility.minReader!=='0.2.0'||c.compatibility.maxReaderExclusive!=='0.3.0')
  fail('DIS_FUNCTION_COMPATIBILITY_INVALID');
}
export function validateDisV020FunctionValue(contract,phase,value){
 if(phase!=='input'&&phase!=='output')fail('DIS_FUNCTION_PHASE_INVALID');
 const shape=contract?.[phase];
 if(!shape||!record(value))fail(phase==='input'?'DIS_FUNCTION_INPUT_INVALID':'DIS_FUNCTION_OUTPUT_INVALID');
 for(const [name,type] of Object.entries(shape.fields??{})){
  const v=value[name];
  if(type==='record'?!record(v):type==='array'?!Array.isArray(v):typeof v!==type)
   fail(phase==='input'?'DIS_FUNCTION_INPUT_INVALID':'DIS_FUNCTION_OUTPUT_INVALID');
 }
 return true;
}
export function classifyDisV020FunctionOutcome(contract,value){
 const tag=value[contract.outcomes.field];
 const disposition=typeof tag==='string'?contract.outcomes.classes[tag]:undefined;
 if(!disposition)fail('DIS_OUTCOME_UNDECLARED');
 const refs=value[contract.evidence.refField];
 const valid=Array.isArray(refs)&&refs.length>0&&refs.length<=MAX&&
  refs.every(x=>typeof x==='string'&&x.length>0&&x.length<=2048);
 if(refs!==undefined&&!valid)fail('DIS_EVIDENCE_INVALID');
 if(contract.evidence.requiredFor.includes(disposition)&&!valid)fail('DIS_EVIDENCE_REQUIRED');
 return Object.freeze({disposition,evidenceRefs:Object.freeze(valid?[...refs]:[])});
}

export class DisV020Error extends Error{
 constructor(code){super(code);this.name='DisV020Error';this.code=code}
}
const fail=code=>{throw new DisV020Error(code)};
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
const id=x=>typeof x==='string'&&ID.test(x);
const arr=(x,allowEmpty=false)=>Array.isArray(x)&&x.length<=MAX&&(allowEmpty||x.length>0);
const keys=(x,allow)=>{
 if(!record(x))fail('DIS_INVALID_RECORD');
 if(Object.keys(x).some(k=>!allow.includes(k)))fail('DIS_UNKNOWN_FIELD');
};
const unique=(items,code)=>{if(new Set(items).size!==items.length)fail(code)};
export const sourceSha256=value=>createHash('sha256').update(value,'utf8').digest('hex');
export const sourceGitBlob=value=>{
 const bytes=Buffer.from(value,'utf8');
 return createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');
};
function validateBuilt(built){
 if(!record(built)||built.formatVersion!=='dh.v10.build/1'||!id(built.appId)||
   !HEX.test(built.subjectDigest)||!arr(built.modules)||!arr(built.routes)||!arr(built.loadOrder))fail('DIS_BUILD_INVALID');
 const selected=new Map();
 for(const m of built.modules){
  if(!record(m)||!id(m.packageId)||typeof m.moduleSource!=='string'||!HEX.test(m.moduleSha256))fail('DIS_BUILD_INVALID');
  if(selected.has(m.packageId))fail('DIS_BUILD_DUPLICATE');
  selected.set(m.packageId,m);
  if(sourceSha256(m.moduleSource)!==m.moduleSha256)fail('DIS_BUILD_BYTES_DRIFT');
 }
 return selected;
}
function validatePins(pins){
 if(!arr(pins,true))fail('DIS_SOURCES_INVALID');
 const map=new Map();
 for(const p of pins){
  keys(p,['id','sha256','origin']);
  if(!id(p.id)||!HEX.test(p.sha256)||map.has(p.id))fail('DIS_SOURCE_PIN_INVALID');
  keys(p.origin,['repository','commit','path','gitBlob']);
  if(!/^[-\w]+\/[-\w.]+$/.test(p.origin.repository)||!GIT.test(p.origin.commit)||
     typeof p.origin.path!=='string'||p.origin.path.includes('..')||!(p.origin.path.startsWith('packages/')||p.origin.path.startsWith('examples/'))||
     !GIT.test(p.origin.gitBlob))fail('DIS_SOURCE_ORIGIN_INVALID');
  map.set(p.id,p);
 }
 return map;
}
export function qualifyDisV020Artifact(artifact){
 keys(artifact,['format','built','program','sources','digest']);
 if(artifact.format!==DIS_V020_AOT||!HEX.test(artifact.digest))fail('DIS_AOT_FORMAT_INVALID');
 const {built,program,sources}=artifact;
 const selected=validateBuilt(built),pins=validatePins(sources);
 keys(program,['format','appId','domains','elements','relations','appInit']);
 if(program.format!==DIS_V020_PROGRAM||program.appId!==built.appId||
   !arr(program.domains)||!arr(program.elements)||!arr(program.relations,true)||!id(program.appInit))fail('DIS_PROGRAM_INVALID');
 const domains=new Map();
 for(const d of program.domains){
  keys(d,['id','description','repositories']);
  if(!id(d.id)||typeof d.description!=='string'||!d.description.trim()||domains.has(d.id)||
     !arr(d.repositories)||new Set(d.repositories).size!==d.repositories.length||
     d.repositories.some(repo=>typeof repo!=='string'||!/^[-\w]+\/[-\w.]+$/.test(repo)))fail('DIS_DOMAIN_INVALID');
  domains.set(d.id,d);
 }
 const elements=new Map(),functions=new Map(),inits=[];
 for(const e of program.elements){
  keys(e,['id','domainId','kind','description','packageId','dependsOn','functions']);
  if(!id(e.id)||!domains.has(e.domainId)||!ELEMENT_KINDS.has(e.kind)||
     typeof e.description!=='string'||!e.description.trim()||
     !arr(e.dependsOn,true)||!arr(e.functions,e.kind==='global')||
     elements.has(e.id))fail('DIS_ELEMENT_INVALID');
  if(e.packageId!==null&&e.packageId!==undefined&&(!id(e.packageId)||!selected.has(e.packageId)))fail('DIS_ELEMENT_PACKAGE_UNSELECTED');
  if(e.kind!=='global'&&e.functions.length===0)fail('DIS_ELEMENT_NO_FUNCTION');
  unique(e.dependsOn,'DIS_DEPENDENCY_DUPLICATE');
  elements.set(e.id,e);
  for(const f of e.functions){
   keys(f,['id','kind','effect','binding','optional','contract','receiptContract']);
   if(f.optional!==undefined&&typeof f.optional!=='boolean')fail('DIS_FUNCTION_INVALID');
   if(!id(f.id)||functions.has(f.id)||!FUNCTION_KINDS.has(f.kind)||
      !['none','governed'].includes(f.effect))fail('DIS_FUNCTION_INVALID');
   if(f.contract!==undefined)validateFunctionContract(f.contract);
   if(f.receiptContract!==undefined)validateKdpReceiptContract(f.receiptContract);
   keys(f.binding,['type','sourceId','intentId']);
   const b=f.binding;
   // Interaction is an ordinary Element service, never a new Effect authority.
   if(f.kind==='interaction'&&(f.effect!=='none'||b.type!=='local'))fail('DIS_INTERACTION_EFFECT_FORBIDDEN');
   if(f.contract!==undefined&&b.type!=='local')fail('DIS_FUNCTION_CONTRACT_BINDING_UNSUPPORTED');
   if(f.receiptContract!==undefined&&(b.type!=='kdp-intent'||f.contract!==undefined))
    fail('DIS_KDP_RECEIPT_BINDING_UNSUPPORTED');
   if(b.type==='local'){
    if(f.effect!=='none'||typeof b.sourceId!=='string'||!pins.has(b.sourceId)||
       Object.hasOwn(b,'intentId')||f.kind==='effect')fail('DIS_LOCAL_NOT_QUALIFIED');
    if(!domains.get(e.domainId).repositories.includes(pins.get(b.sourceId).origin.repository))fail('DIS_SOURCE_DOMAIN_MISMATCH');
   }else if(b.type==='kdp-intent'){
    if(f.kind==='init'||!id(b.intentId)||Object.hasOwn(b,'sourceId')||!e.packageId)fail('DIS_INTENT_INVALID');
    const business=selected.get(e.packageId);
    if(business?.role!=='business'||!business.provides?.includes('intent:'+b.intentId))fail('DIS_INTENT_NOT_SELECTED');
    const route=built.routes.find(r=>r.intentId===b.intentId);
    if(!route)fail('DIS_ROUTE_NOT_SELECTED');
    const cap=built.modules.find(m=>m.role==='capability'&&m.capabilityId===route.capabilityId&&
      m.handlers?.some(h=>h.operationId===route.operationId&&h.handler===route.handlerId));
    if(!cap)fail('DIS_CAPABILITY_NOT_SELECTED');
    if(f.effect==='governed'&&!cap.externalEffect)fail('DIS_EFFECT_NOT_SELECTED');
    if(f.effect==='none'&&cap.externalEffect)fail('DIS_EFFECT_CLASS_MISMATCH');
    if(f.kind==='effect'&&f.effect!=='governed')fail('DIS_EFFECT_CLASS_MISMATCH');
   }else fail('DIS_BINDING_UNKNOWN');
   if(f.kind==='init'){
    if(f.optional===true)fail('DIS_INIT_OPTIONAL_FORBIDDEN');
    if(e.packageId===undefined||e.packageId===null||selected.get(e.packageId)?.role!=='business')fail('DIS_INIT_BUSINESS_REQUIRED');
    inits.push(f.id);
   }
   functions.set(f.id,Object.freeze({definition:f,element:e}));
  }
 }
 if(inits.length!==1||inits[0]!==program.appInit)fail('DIS_INIT_NOT_UNIQUE');
 const visitStatus=new Map();
 const visit=key=>{
  if(!elements.has(key))fail('DIS_DEPENDENCY_MISSING');
  if(visitStatus.get(key)===1)fail('DIS_DEPENDENCY_CYCLE');
  if(visitStatus.get(key)===2)return;
  visitStatus.set(key,1);
  for(const d of elements.get(key).dependsOn)visit(d);
  visitStatus.set(key,2);
 };
 for(const k of elements.keys())visit(k);
 for(const r of program.relations){
  keys(r,['from','to','kind']);
  if(!elements.has(r.from)||!elements.has(r.to)||!REL_KINDS.has(r.kind))fail('DIS_RELATION_INVALID');
  if(r.kind==='depends-on'&&!elements.get(r.to).dependsOn.includes(r.from))fail('DIS_RELATION_DEPENDENCY_MISMATCH');
 }
 const data={format:artifact.format,built,program,sources};
 if(sha256Canonical(data)!==artifact.digest)fail('DIS_AOT_DIGEST_DRIFT');
 return {functions,elements,selected,pins};
}
