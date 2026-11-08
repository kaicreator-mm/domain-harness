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
const ELEMENT_KINDS=new Set(['global','knowledge','rule','stateful','workflow','effect']);
const FUNCTION_KINDS=new Set(['init','knowledge','rule','stateful','workflow','effect']);
const REL_KINDS=new Set(['depends-on','constrains','cooperates','defines']);
const MAX=256;
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
  keys(d,['id','description']);
  if(!id(d.id)||typeof d.description!=='string'||!d.description.trim()||domains.has(d.id))fail('DIS_DOMAIN_INVALID');
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
   keys(f,['id','kind','effect','binding','optional']);
   if(f.optional!==undefined&&typeof f.optional!=='boolean')fail('DIS_FUNCTION_INVALID');
   if(!id(f.id)||functions.has(f.id)||!FUNCTION_KINDS.has(f.kind)||
      !['none','governed'].includes(f.effect))fail('DIS_FUNCTION_INVALID');
   keys(f.binding,['type','sourceId','intentId']);
   const b=f.binding;
   if(b.type==='local'){
    if(f.effect!=='none'||typeof b.sourceId!=='string'||!pins.has(b.sourceId)||
       Object.hasOwn(b,'intentId')||f.kind==='effect')fail('DIS_LOCAL_NOT_QUALIFIED');
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
 }
 const data={format:artifact.format,built,program,sources};
 if(sha256Canonical(data)!==artifact.digest)fail('DIS_AOT_DIGEST_DRIFT');
 return {functions,elements,selected,pins};
}
