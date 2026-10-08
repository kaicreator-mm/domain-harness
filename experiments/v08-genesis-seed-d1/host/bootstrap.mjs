// Research Host bootstrap. Host source and trusted JS realm are OUTSIDE verified Package authority.
import {readFile} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {TRUST_ROOTS} from './trust-roots.mjs';
import {
 canonicalJson,hashBytes,verifyPackage,verifyDefinitionGraph,understoodStandard,
 digest
} from '../../v08-gatea-b1-955-r2/reference956/candidate-validator.mjs';
import {admitComponent} from '../../../packages/domain-harness/dist/contracts/component-admission.js';
import {decideKindCompatibility} from '../../../packages/domain-harness/dist/contracts/kind-compatibility.js';

export class GenesisError extends Error {
 constructor(code,detail=code){super(detail);this.code=code;this.name='GenesisError'}
}
const reject=(code,detail)=>{throw new GenesisError(code,detail)};
const snap=x=>JSON.parse(canonicalJson(x));
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const sourceRoot=fileURLToPath(new URL('../packages/',import.meta.url));
const reHash=s=>'sha256:'+hashBytes(Buffer.from(s,'utf8'));
function safePath(path){
 if(typeof path!=='string'||!/^modules\/[a-zA-Z0-9._/-]+\.mjs$/.test(path)||
    path.includes('..')||path.includes('//'))reject('E_ARTIFACT_PATH');
 return path;
}
const q=(pkg,comp)=>pkg.replaceAll('/','%2F')+'/'+comp.replaceAll('/','%2F');
function schemaComponent(c){return {
 family:'semantic', componentId:c.componentId,kind:c.kindRef,
 semanticBody:c.semanticBody, requiredSemanticContracts:c.requiredSemanticContracts,
 requiredCapabilities:c.requiresCapabilities.map(({capabilityId,version})=>({capabilityId,version}))
}}
function trustedCatalog(entries){
 const sdk=entries.find(x=>x.manifest.packageId==='genesis.sdk');
 if(!sdk)reject('E_SDK_MISSING');
 const candidates=sdk.manifest.components.filter(c=>c.kindRef.kindId==='std.schema'&&Array.isArray(c.semanticBody?.kindCatalog));
 if(candidates.length!==1)reject('E_KIND_CATALOG');
 const declarations=snap(candidates[0].semanticBody.kindCatalog);
 if(!declarations.length)reject('E_KIND_CATALOG');
 const registry=Object.create(null),kindSet=[];
 for(const k of declarations){
   if(!k || typeof k.kindId!=='string'||typeof k.version!=='string'||
      !Array.isArray(k.understoodCapabilities)||!Array.isArray(k.requiredSemanticContracts))
     reject('E_KIND_CATALOG');
   const key=k.kindId+'@'+k.version;
   if(own(registry,key))reject('E_KIND_DUPLICATE');
   registry[key]=k.requiredSemanticContracts;
   kindSet.push({kind:{kindId:k.kindId,version:k.version},
      understoodSemanticContracts:k.requiredSemanticContracts.map(x=>{
        const [contractId,version]=x.split('@');return {contractId,version};
      }), understoodCapabilities:k.understoodCapabilities.map(x=>{
        const [capabilityId,version]=x.split('@');return {capabilityId,version};
      }),
      // B1 candidate proof: only generic structural semantic validation here.
      // Full package-defined validator ABI is still an explicit research gap.
      validateComponent(env){
        if(!env.semanticBody || typeof env.semanticBody!=='object')
          reject('E_KIND_SEMANTIC_BODY');
      }});
 }
 if(!own(registry,'std.schema@1.0.0'))reject('E_SCHEMA_KIND_NOT_INSTALLED');
 return {registry,kindSet};
}
// Host-authorized package list comes exclusively from this module's trusted anchor.
// The caller supplies a *physical root*, not digest, Kind or permission authority.
export async function establishGenesisHost({root=sourceRoot,...override}={}){
 if(Object.keys(override).length)reject('E_UNTRUSTED_HOST_OVERRIDE');
 if(typeof root!=='string'||!root)reject('E_HOST_ROOT');
 const packageRoot=resolve(root);
 const physical=[],manifests=new Map(),modules=new Map();
 for(const [id,pin] of Object.entries(TRUST_ROOTS)){
   const dir=resolve(packageRoot,pin.directory);
   if(!dir.startsWith(packageRoot+sep))reject('E_HOST_ROOT');
   let raw;
   try{raw=await readFile(join(dir,'manifest.json'))}catch{reject('E_MANIFEST_MISSING',id)}
   let manifest;
   try{manifest=JSON.parse(raw.toString('utf8'))}catch{reject('E_MANIFEST_PARSE',id)}
   if(raw.toString('utf8')!==canonicalJson(manifest)+'\n')reject('E_MANIFEST_NONCANONICAL',id);
   if(manifest.packageId!==id||manifest.integrity!==pin.packageDigest)
     reject('E_HOST_MANIFEST_PIN',id);
   const artifacts=Object.create(null);
   for(const spec of manifest.implementations){
     let code;
     try{code=await readFile(join(dir,safePath(spec.path)),'utf8')}
     catch{reject('E_MODULE_MISSING',id+':'+spec.path)}
     if(reHash(code)!==spec.sha256)reject('E_MODULE_BYTES',id+':'+spec.path);
     // Data-url loader accepts self-contained ESM only. JS ambient globals are NOT sandboxed.
     if(/\bimport\s*(?:\(|['"{*])|\brequire\s*\(/.test(code))
       reject('E_MODULE_EXTERNAL_IMPORT',id+':'+spec.path);
     artifacts[spec.path]=code;
   }
   verifyPackage(manifest,artifacts,understoodStandard);
   physical.push({manifest,artifacts});
   manifests.set(id,{manifest,artifacts,dir,raw});
 }
 const {registry,kindSet}=trustedCatalog(physical);
 for(const entry of physical)for(const c of entry.manifest.components){
   decideKindCompatibility(c.kindRef,kindSet.map(x=>x.kind));
   admitComponent(schemaComponent(c),kindSet);
 }
 const graph=verifyDefinitionGraph(physical,{},registry);
 const handlers=new Map();
 for(const {manifest,artifacts,dir} of manifests.values()){
   for(const comp of manifest.components){
     const ownImpl=manifest.implementations.filter(i=>i.componentId===comp.componentId);
     if(ownImpl.length>1||comp.operations.length && ownImpl.length!==1)
       reject('E_SELECTED_HANDLER_AMBIGUOUS',comp.componentId);
     if(!ownImpl.length)continue;
     const def=ownImpl[0];
     if(!comp.operations.every(op=>comp.providesCapabilities.some(cap=>cap.operations.includes(op.operationId))) &&
        comp.packageId!=='genesis.business.smoke')reject('E_OPERATION_CAPABILITY_BINDING',comp.componentId);
     const code=artifacts[def.path];
     if(typeof code!=='string'||reHash(code)!==def.sha256)reject('E_SELECTED_MODULE_BYTES');
     const mod=await import('data:text/javascript;base64,'+Buffer.from(code,'utf8').toString('base64'));
     for(const op of comp.operations){
       if(op.effect!=='none')reject('E_EFFECT_AUTHORITY_UNAVAILABLE');
       const fn=mod[op.operationId];
       if(typeof fn!=='function')reject('E_SELECTED_HANDLER_EXPORT',comp.componentId+':'+op.operationId);
       handlers.set(q(comp.packageId,comp.componentId)+'/'+op.operationId,
         Object.freeze({fn,component:comp,op,source:code,sha:def.sha256,dir,path:def.path,
           identity:Object.freeze({packageId:manifest.packageId,componentId:comp.componentId,
             kindRef:snap(comp.kindRef),implementationId:def.implementationId,
             modulePath:def.path,moduleSha256:def.sha256,operationId:op.operationId})}));
     }
   }
 }
 const lookup=(pkg,comp,op)=>{
   const h=handlers.get(q(pkg,comp)+'/'+op);
   if(!h)reject('E_OPERATION_NOT_DECLARED',q(pkg,comp)+'/'+op);
   return h;
 };
 const linkCandidates=[...handlers.values()].filter(h=>h.component.providesCapabilities.some(c=>
   c.capabilityId==='kernel.link'&&c.version==='1.0.0'&&c.operations.includes('link')));
 if(linkCandidates.length!==1||linkCandidates[0].component.packageId!=='genesis.kernel')
   reject('E_KERNEL_LINK_IDENTITY');
 const seed=linkCandidates[0].fn({
   graphDigest:graph.digest, packages:physical.map(x=>({id:x.manifest.packageId,digest:x.manifest.integrity})),
   bindings:graph.bindings
 });
 if(seed.graphDigest!==graph.digest||seed.packages.length!==physical.length)
   reject('E_KERNEL_LINK_RESULT');
 const assembly=Object.freeze({
   digest:'sha256:'+digest({domain:'dh.genesis.sealed-assembly.candidate/1',graph:graph.digest,
     packages:seed.packages,bindings:seed.bindings,
     selected:[...handlers.values()].map(x=>x.identity).sort((a,b)=>
       canonicalJson(a)<canonicalJson(b)?-1:canonicalJson(a)>canonicalJson(b)?1:0)}),
   graphDigest:graph.digest,packages:Object.freeze(seed.packages),bindings:Object.freeze(seed.bindings)
 });
 async function current(h){
   const exact=await readFile(join(h.dir,h.path),'utf8').catch(()=>reject('E_SEALED_MODULE_CHANGED'));
   if(reHash(exact)!==h.sha)reject('E_SEALED_MODULE_CHANGED');
   const p=manifests.get(h.component.packageId);
   const m=await readFile(join(p.dir,'manifest.json'),'utf8').catch(()=>reject('E_SEALED_MANIFEST_CHANGED'));
   if(m!==p.raw.toString('utf8'))reject('E_SEALED_MANIFEST_CHANGED');
 }
 let dispatchCount=0;
 async function invoke(packageId,componentId,operationId,input,capabilityParent=null){
   const handler=lookup(packageId,componentId,operationId);
   if(capabilityParent){
     const key=q(capabilityParent.component.packageId,capabilityParent.component.componentId);
     const spec=capabilityParent.component.requiresCapabilities.find(c=>
       c.capabilityId===capabilityParent.capabilityId&&c.version===capabilityParent.version&&
       c.operations.includes(operationId));
     if(!spec)reject('E_UNDECLARED_CAPABILITY_USE');
     const match=graph.bindings.find(b=>b.consumer===key&&
       b.capability===spec.capabilityId+'@'+spec.version&&b.provider===q(packageId,componentId));
     if(!match)reject('E_UNDECLARED_CAPABILITY_USE');
   }
   if(handler.op.effect!=='none')reject('E_EFFECT_AUTHORITY_UNAVAILABLE');
   // Snapshot input BEFORE first async Host I/O to close caller TOCTOU.
   const stable=snap(input);
   await current(handler);
   dispatchCount++;
   const invokeCapability=async ({capabilityId,version,operationId,input:childInput})=>{
     const cap=handler.component.requiresCapabilities.find(c=>
       c.capabilityId===capabilityId&&c.version===version&&c.operations.includes(operationId));
     if(!cap)reject('E_UNDECLARED_CAPABILITY_USE');
     const binding=graph.bindings.find(b=>b.consumer===q(packageId,componentId)&&
       b.capability===capabilityId+'@'+version);
     if(!binding)reject('E_UNDECLARED_CAPABILITY_USE');
     const target=physical.flatMap(x=>x.manifest.components).find(c=>q(c.packageId,c.componentId)===binding.provider);
     if(!target)reject('E_PROVIDER_IDENTITY');
     return invoke(target.packageId,target.componentId,operationId,childInput,
       {component:handler.component,capabilityId,version});
   };
   return handler.fn({input:stable,semanticBody:snap(handler.component.semanticBody),invokeCapability});
 }
 return Object.freeze({
   assembly, selected:Object.freeze([...handlers.values()].map(h=>h.identity)),
   invoke:async ({packageId,componentId,operationId,input,...untrusted})=>{
     if(Object.keys(untrusted).length)reject('E_UNTRUSTED_INVOKE_AUTHORITY');
     return invoke(packageId,componentId,operationId,input);
   },
   invokeSchema:()=>reject('E_OPERATION_NOT_DECLARED'),
   rebind:()=>reject('E_SEALED'),
   stats:()=>Object.freeze({dispatchCount})
 });
}
