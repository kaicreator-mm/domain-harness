/** DIS 0.2.0 bridge over existing real BUILD+Microkernel, not a native SDK ABI. */
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
const reject=code=>{throw Object.assign(new Error(code),{code})};
const digest=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const key=(e,f)=>e+'.'+f;
const initModuleURL=new URL('./business-app-init.mjs',import.meta.url);
export async function initSourceHash(){return digest(await readFile(initModuleURL,'utf8'))}
export async function makeManifest(built,{sourceHash,target=built.targetProfile}={}){
 return {schema:'dis.v0.2.demo-aot-projection/1',appId:built.appId,subjectDigest:built.subjectDigest,
 target,init:{element:'orders.app-init',function:'init',sourceSha256:sourceHash??await initSourceHash(),packageId:'business-order-approval@v08.1.0.0'},
 elements:[
 {id:'orders.app-init',packageId:'business-order-approval@v08.1.0.0',functions:[{id:'init',kind:'init'}],dependencies:[]},
 {id:'orders.approval',packageId:'business-order-approval@v08.1.0.0',functions:[{id:'requestDecision',kind:'public',intentId:'submitQuoteDecisionDynamic',effect:'governed'}],dependencies:[]}],
 ingress:[{id:'approveQuote',element:'orders.approval',function:'requestDecision',optional:false}]};
}
function topological(elements){
 const byId=new Map();
 for(const e of elements){if(byId.has(e.id))reject('ELEMENT_DUPLICATE');byId.set(e.id,e)}
 const state=new Set(),done=new Set();
 function visit(id){if(!byId.has(id))reject('ELEMENT_DEP_MISSING');if(state.has(id))reject('ELEMENT_DEP_CYCLE');if(done.has(id))return;
 state.add(id);for(const d of byId.get(id).dependencies??[])visit(d);state.delete(id);done.add(id)}
 for(const e of elements)visit(e.id);return byId;
}
export async function compileProjection(manifest,built){
 if(manifest?.schema!=='dis.v0.2.demo-aot-projection/1')reject('PROJECTION_SCHEMA');
 if(manifest.appId!==built.appId||manifest.subjectDigest!==built.subjectDigest)reject('AOT_BUILD_IDENTITY_DRIFT');
 if(manifest.target!==built.targetProfile)reject('AOT_TARGET_DRIFT');
 if(!Array.isArray(manifest.elements)||!manifest.elements.length||!Array.isArray(manifest.ingress))reject('ELEMENT_INVALID');
 const byId=topological(manifest.elements),funcs=new Map();
 for(const e of manifest.elements){
  const pkg=built.modules.find(m=>m.packageId===e.packageId);
  if(!pkg||pkg.role!=='business')reject('ELEMENT_PACKAGE_NOT_SELECTED');
  for(const f of e.functions??[]){const k=key(e.id,f.id);if(funcs.has(k))reject('FUNCTION_DUPLICATE');funcs.set(k,{...f,packageId:e.packageId})}
 }
 const init=manifest.init,initFn=funcs.get(key(init?.element,init?.function));
 if(!initFn||initFn.kind!=='init')reject('BUSINESS_INIT_MISSING');
 if(initFn.packageId!==init.packageId||byId.get(init.element)?.packageId!==init.packageId)reject('BUSINESS_INIT_PACKAGE_MISMATCH');
 if([...funcs.values()].filter(f=>f.kind==='init').length!==1)reject('BUSINESS_INIT_NOT_UNIQUE');
 if(init.sourceSha256!==await initSourceHash())reject('BUSINESS_INIT_BYTES_DRIFT');
 if(!manifest.ingress.length)reject('INGRESS_MISSING');
 const routes=new Map();
 for(const ing of manifest.ingress){
  const f=funcs.get(key(ing.element,ing.function));if(!f||f.kind!=='public')reject('FUNCTION_UNBOUND');
  const pkg=built.modules.find(m=>m.packageId===f.packageId);
  if(!pkg.provides.includes('intent:'+f.intentId))reject('FUNCTION_NOT_EXPORTED');
  const route=built.routes.find(r=>r.intentId===f.intentId);if(!route)reject('AOT_ROUTE_MISSING');
  if(!built.modules.some(m=>m.role==='capability'&&m.capabilityId===route.capabilityId&&m.handlers?.some(h=>h.operationId===route.operationId&&h.handler===route.handlerId)))reject('AOT_CAPABILITY_UNBOUND');
  if(routes.has(ing.id))reject('INGRESS_DUPLICATE');
  routes.set(ing.id,Object.freeze({intentType:f.intentId,optional:ing.optional===true,element:ing.element,function:f.id}));
 }
 for(const pkg of built.modules){if(digest(pkg.moduleSource)!==pkg.moduleSha256)reject('AOT_MODULE_BYTES_DRIFT')}
 return Object.freeze({manifest:structuredClone(manifest),buildSubject:built.subjectDigest,projectionDigest:digest({manifest,build:built.subjectDigest}),routes});
}
export function createActivation({projection,built,load,store,appInit}){
 let state='NEW',sdkApp=null,attempt=0,available=new Set();
 return Object.freeze({
 get state(){return state},
 async start(){
  if(state!=='NEW')reject('APP_INIT_REPEATED');state='STARTING';attempt++;
  try{
   sdkApp=await load(built,{store,tenantId:'tenant:dis-v020-bridge'});
   const context=Object.freeze({appIdentity:built.appId,activationIdentity:'demo:'+built.subjectDigest+':'+attempt,
     buildPin:built.subjectDigest,config:Object.freeze({mode:'demo'}),bindings:Object.freeze([...projection.routes.keys()])});
   const result=await appInit(context);
   if(!result||!['READY','DEGRADED'].includes(result.status))reject('APP_INIT_BLOCKED');
   const missing=result.unavailableOptionalServices??[];
   if(result.status==='READY'&&missing.length)reject('APP_INIT_INVALID_READY');
   if(!Array.isArray(missing))reject('APP_INIT_RESULT_INVALID');
   if(!missing.every(id=>projection.routes.get(id)?.optional===true))reject('APP_INIT_MANDATORY_DEGRADED');
   available=new Set([...projection.routes.keys()].filter(id=>!missing.includes(id)));
   state=result.status;return result;
  }catch(e){state='FAILED';sdkApp?.stop();throw e}
 },
 async invoke(id,{messageId,instanceKey,input}){
  if(!['READY','DEGRADED'].includes(state))reject('APP_NOT_READY');
  if(!available.has(id))reject('INGRESS_UNAVAILABLE');
  if(typeof messageId!=='string'||typeof instanceKey!=='string'||!input||typeof input!=='object')reject('INGRESS_INPUT_INVALID');
  const route=projection.routes.get(id);
  return await sdkApp.send({intentType:route.intentType,messageId,instanceKey,input});
 },
 stop(){if(state==='STOPPED')return;sdkApp?.stop();state='STOPPED'}
 });
}