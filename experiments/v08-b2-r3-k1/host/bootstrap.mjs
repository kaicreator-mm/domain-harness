// V08 B2 R3 K1 (#983) research Host bootstrap — OPTION A.
//
// The ONLY Kernel Package on the accepted path is the byte-exact D1 Genesis
// Kernel `genesis.kernel` (Draft PR #978 @ f87cfdfcf9fd252cc757c02e77d155afa5572303).
// Its physical kernel.link callable is executed over the fully verified Package
// graph and its result is sealed into ONE Assembly together with the byte-exact
// D1 `genesis.sdk` and TWO hand-authored Business Packages
// (`k1.business.claim` pure std.rule/std.operation, `k1.business.charge`
// effectful std.operation).
//
// Generic business-neutral operation dispatch here is trusted HOST-owned glue
// (see #942 Design-041 MICROKERNEL_IRREDUCIBLE vs KERNEL_DOMAIN_PACKAGE and the
// Controller Option-A JIT #983@6081509418): the Host is NOT a second Kernel
// Domain Package or Runtime — it owns no admission/State/Effect/Journal
// decision, refuses every effectful operation itself
// (E_EFFECT_ADMISSION_REQUIRED) and defers effectful routes to the ORIGINAL
// accepted v0.7 authority (host/native-join.mjs). No derived experimental
// dispatcher module and no #940 business-special-cased kernel appear on the
// accepted path.
import {readFile} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {TRUST_ROOTS,D1_GENESIS_ROOT_DIGESTS,D1_KERNEL_LINK_MODULE_SHA}
  from './trust-roots.mjs';
import {
  canonicalJson,hashBytes,verifyPackage,verifyDefinitionGraph,understoodStandard,
  digest
} from '../../v08-gatea-b1-955-r2/reference956/candidate-validator.mjs';
import {admitComponent} from '../../../packages/domain-harness/dist/contracts/component-admission.js';
import {decideKindCompatibility} from '../../../packages/domain-harness/dist/contracts/kind-compatibility.js';

export class K1Error extends Error {
  constructor(code,detail=code){super(detail);this.code=code;this.name='K1Error'}
}
const reject=(code,detail)=>{throw new K1Error(code,detail)};
const snap=x=>JSON.parse(canonicalJson(x));
function deepFreeze(value){
  if(value && typeof value==='object' && !Object.isFrozen(value)){
    for(const key of Reflect.ownKeys(value))deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const experimentRoot=fileURLToPath(new URL('../',import.meta.url));
const reHash=s=>'sha256:'+hashBytes(Buffer.from(s,'utf8'));
// Exact business-semantic tokens the #940 ancestor kernel special-cased; the
// whole accepted Kernel path (D1 kernel.link + Host glue) must stay free of them.
const FORBIDDEN_KERNEL_BUSINESS_TOKENS=Object.freeze(
  ['business.workflow','business.action','workflow.definition']);
function safePath(path){
  if(typeof path!=='string'||!/^modules\/[a-zA-Z0-9._/-]+\.mjs$/.test(path)||
     path.includes('..')||path.includes('//'))reject('E_ARTIFACT_PATH');
  return path;
}
const q=(pkg,comp)=>pkg.replaceAll('/','%2F')+'/'+comp.replaceAll('/','%2F');
function schemaComponent(c){return {
  family:'semantic',componentId:c.componentId,kind:c.kindRef,
  semanticBody:c.semanticBody,requiredSemanticContracts:c.requiredSemanticContracts,
  requiredCapabilities:c.requiresCapabilities.map(({capabilityId,version})=>({capabilityId,version}))
}}
// Producer-neutral trusted Kind registry: the complete understood Kind set and
// generic structural validation come ONLY from the byte-exact D1 genesis.sdk
// kindCatalog — never from a Kernel enum or a business package.
export function buildKindRegistry(sdkManifest){
  const candidates=sdkManifest.components.filter(c=>c.kindRef.kindId==='std.schema'
    &&Array.isArray(c.semanticBody?.kindCatalog));
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
      }),understoodCapabilities:k.understoodCapabilities.map(x=>{
        const [capabilityId,version]=x.split('@');return {capabilityId,version};
      }),
      // Generic structural body validation only (D1 research gap retained).
      validateComponent(env){
        if(!env.semanticBody || typeof env.semanticBody!=='object')
          reject('E_KIND_SEMANTIC_BODY');
      }});
  }
  if(!own(registry,'std.schema@1.0.0'))reject('E_SCHEMA_KIND_NOT_INSTALLED');
  return {registry,kindSet};
}
// Selected Kind->Component->Implementation->module-bytes->export identity check
// over Root-approved bytes. Effectful operations are NOT rejected here: their
// physical callable must exist for the native v0.7 join, while the pure Host
// dispatch path separately refuses them (E_EFFECT_ADMISSION_REQUIRED).
export async function verifySelectedK1Identity({manifest,artifacts}){
  verifyPackage(manifest,artifacts,understoodStandard);
  for(const comp of manifest.components){
    const candidates=manifest.implementations.filter(impl=>impl.componentId===comp.componentId);
    if(comp.operations.length && candidates.length===0)
      reject('E_SELECTED_COMPONENT_OWNER',comp.componentId);
    if(candidates.length>1)reject('E_SELECTED_HANDLER_AMBIGUOUS',comp.componentId);
    if(!comp.operations.length && candidates.length)
      reject('E_SCHEMA_HANDLER_FORBIDDEN',comp.componentId);
    if(!candidates.length)continue;
    const selected=candidates[0];
    const source=artifacts[selected.path];
    if(typeof source!=='string'||reHash(source)!==selected.sha256)
      reject('E_SELECTED_MODULE_BYTES',selected.path);
    const loaded=await import('data:text/javascript;base64,'+Buffer.from(source,'utf8').toString('base64'));
    for(const op of comp.operations){
      if(typeof loaded[op.operationId]!=='function')
        reject('E_SELECTED_HANDLER_EXPORT',comp.componentId+':'+op.operationId);
    }
  }
  return Object.freeze({verified:true});
}
// Read + byte-verify every trust-rooted Package from a physical root. The
// caller supplies only a root; digest/Kind/authority come from this module's
// frozen trust anchor. Independent plain test helper (entries have raw text).
export async function readTrustedEntries(root=experimentRoot){
  if(typeof root!=='string'||!root)reject('E_HOST_ROOT');
  const packageRoot=resolve(root);
  const entries=[];
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
      if(/\bimport\s*(?:\(|['"{*])|\brequire\s*\(/.test(code))
        reject('E_MODULE_EXTERNAL_IMPORT',id+':'+spec.path);
      artifacts[spec.path]=code;
    }
    if(id==='genesis.kernel'){
      // The accepted Kernel stays irreducible and business-free (Option A proof seam).
      for(const token of FORBIDDEN_KERNEL_BUSINESS_TOKENS)
        for(const code of Object.values(artifacts))
          if(code.includes(token))reject('E_KERNEL_BUSINESS_SEMANTIC',token);
      const link=manifest.implementations.find(i=>i.implementationId==='genesis.kernel.link.v1');
      if(!link||link.sha256!==D1_KERNEL_LINK_MODULE_SHA)reject('E_D1_KERNEL_LINK_IDENTITY');
    }
    if((id==='genesis.kernel'||id==='genesis.sdk') &&
       manifest.integrity!==D1_GENESIS_ROOT_DIGESTS[id==='genesis.kernel'?'kernel':'sdk'])
      reject('E_D1_GENESIS_PIN',id);
    verifyPackage(manifest,artifacts,understoodStandard);
    entries.push({id,manifest,artifacts,dir,raw});
  }
  return entries;
}
export async function establishK1Host({root=experimentRoot,...override}={}){
  if(Object.keys(override).length)reject('E_UNTRUSTED_HOST_OVERRIDE');
  const physical=await readTrustedEntries(root);
  const manifests=new Map(physical.map(x=>[x.id,x]));
  const {registry,kindSet}=buildKindRegistry(manifests.get('genesis.sdk').manifest);
  for(const entry of physical)for(const c of entry.manifest.components){
    decideKindCompatibility(c.kindRef,kindSet.map(x=>x.kind));
    admitComponent(schemaComponent(c),kindSet);
  }
  const graph=verifyDefinitionGraph(physical,{},registry);
  // Byte-exact selected-handler identity over every package BEFORE linking.
  for(const entry of physical)await verifySelectedK1Identity(entry);
  const handlers=new Map();
  for(const {manifest,artifacts} of physical){
    for(const comp of manifest.components){
      const ownImpl=manifest.implementations.filter(i=>i.componentId===comp.componentId);
      if(ownImpl.length>1||(comp.operations.length&&ownImpl.length!==1))
        reject('E_SELECTED_HANDLER_AMBIGUOUS',comp.componentId);
      if(!ownImpl.length)continue;
      const def=ownImpl[0];
      if(!comp.operations.every(op=>comp.providesCapabilities.some(cap=>
        cap.operations.includes(op.operationId))))
        reject('E_OPERATION_CAPABILITY_BINDING',comp.componentId);
      const code=artifacts[def.path];
      const mod=await import('data:text/javascript;base64,'+Buffer.from(code,'utf8').toString('base64'));
      for(const op of comp.operations){
        const fn=mod[op.operationId];
        if(typeof fn!=='function')reject('E_SELECTED_HANDLER_EXPORT',comp.componentId+':'+op.operationId);
        handlers.set(q(comp.packageId,comp.componentId)+'/'+op.operationId,
          Object.freeze({fn,component:comp,op,source:code,sha:def.sha256,path:def.path,
            identity:deepFreeze({packageId:manifest.packageId,componentId:comp.componentId,
              kindRef:snap(comp.kindRef),implementationId:def.implementationId,
              modulePath:def.path,moduleSha256:def.sha256,operationId:op.operationId,
              effect:op.effect})}));
      }
    }
  }
  // Exactly ONE Kernel Package: genesis.kernel is the only provider of the
  // kernel.link capability anywhere in the sealed Assembly.
  const kernelPackages=physical.filter(x=>x.manifest.packageId==='genesis.kernel');
  if(kernelPackages.length!==1)reject('E_SECOND_KERNEL_FORBIDDEN');
  const linkCandidates=[...handlers.values()].filter(h=>h.component.providesCapabilities.some(c=>
    c.capabilityId==='kernel.link'&&c.version==='1.0.0'&&c.operations.includes('link')));
  if(linkCandidates.length!==1||linkCandidates[0].component.packageId!=='genesis.kernel')
    reject('E_KERNEL_LINK_IDENTITY');
  for(const entry of physical){
    if(entry.manifest.packageId==='genesis.kernel')continue;
    for(const c of entry.manifest.components)
      for(const cap of c.providesCapabilities)
        if(cap.capabilityId==='kernel.link')reject('E_SECOND_KERNEL_FORBIDDEN',entry.manifest.packageId);
  }
  // The physical D1 kernel.link callable links the ENTIRE verified graph.
  const seed=linkCandidates[0].fn({
    graphDigest:graph.digest,packages:physical.map(x=>({id:x.manifest.packageId,digest:x.manifest.integrity})),
    bindings:graph.bindings
  });
  if(seed.graphDigest!==graph.digest||seed.packages.length!==physical.length)
    reject('E_KERNEL_LINK_RESULT');
  const selectedSorted=[...handlers.values()].map(x=>x.identity).sort((a,b)=>
    canonicalJson(a)<canonicalJson(b)?-1:canonicalJson(a)>canonicalJson(b)?1:0);
  const assembly=deepFreeze({
    digest:'sha256:'+digest({domain:'dh.v08-b2-r3-k1.sealed-assembly/1',
      d1Kernel:D1_GENESIS_ROOT_DIGESTS.kernel,d1Sdk:D1_GENESIS_ROOT_DIGESTS.sdk,
      graph:graph.digest,packages:seed.packages,bindings:seed.bindings,selected:selectedSorted}),
    graphDigest:graph.digest,packages:Object.freeze(seed.packages),
    bindings:Object.freeze(seed.bindings)
  });
  // Post-Seal currentness: re-read physical bytes of EVERY member package
  // (Kernel and SDK included) before ANY dispatch or native effect. Cached
  // callables never prove file currentness.
  async function currentAssembly(){
    const fresh=[];
    for(const [id,p] of manifests){
      const raw=await readFile(join(p.dir,'manifest.json'))
        .catch(()=>reject('E_SEALED_MANIFEST_CHANGED',id));
      if(!raw.equals(p.raw))reject('E_SEALED_MANIFEST_CHANGED',id);
      const artifacts=Object.create(null);
      for(const spec of p.manifest.implementations){
        const bytes=await readFile(join(p.dir,safePath(spec.path)))
          .catch(()=>reject('E_SEALED_MODULE_CHANGED',id+':'+spec.path));
        if('sha256:'+hashBytes(bytes)!==spec.sha256 ||
           !bytes.equals(Buffer.from(p.artifacts[spec.path],'utf8')))
          reject('E_SEALED_MODULE_CHANGED',id+':'+spec.path);
        artifacts[spec.path]=bytes.toString('utf8');
      }
      const manifest=JSON.parse(raw.toString('utf8'));
      if(manifest.integrity!==p.manifest.integrity ||
         manifest.integrity!==TRUST_ROOTS[id].packageDigest)
        reject('E_SEALED_PACKAGE_CHANGED',id);
      fresh.push({manifest,artifacts});
    }
    const rechecked=verifyDefinitionGraph(fresh,{},registry);
    if(rechecked.digest!==graph.digest)reject('E_SEALED_GRAPH_CHANGED');
  }
  let dispatchCount=0;
  async function dispatch(packageId,componentId,operationId,input,capabilityParent=null){
    const handler=lookup(packageId,componentId,operationId);
    if(handler.op.effect!=='none')reject('E_EFFECT_ADMISSION_REQUIRED',
      q(packageId,componentId)+'/'+operationId);
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
    await currentAssembly();
    dispatchCount++;
    const invokeCapability=async ({capabilityId,version,operationId:childOp,input:childInput})=>{
      const cap=handler.component.requiresCapabilities.find(c=>
        c.capabilityId===capabilityId&&c.version===version&&c.operations.includes(childOp));
      if(!cap)reject('E_UNDECLARED_CAPABILITY_USE');
      const binding=graph.bindings.find(b=>b.consumer===q(packageId,componentId)&&
        b.capability===capabilityId+'@'+version);
      if(!binding)reject('E_UNDECLARED_CAPABILITY_USE');
      const target=physical.flatMap(x=>x.manifest.components).find(c=>
        q(c.packageId,c.componentId)===binding.provider);
      if(!target)reject('E_PROVIDER_IDENTITY');
      return dispatch(target.packageId,target.componentId,childOp,childInput,
        {component:handler.component,capabilityId,version});
    };
    return handler.fn({input:stable(input),semanticBody:snap(handler.component.semanticBody),
      invokeCapability});
  }
  function stable(x){return snap(x)}
  function lookup(pkg,comp,op){
    const h=handlers.get(q(pkg,comp)+'/'+op);
    if(!h)reject('E_OPERATION_NOT_DECLARED',q(pkg,comp)+'/'+op);
    return h;
  }
  // Verified effectful-operation seal for the ORIGINAL v0.7 native join. Pure
  // data + exact byte-verified physical callable; never a permission decision
  // or a fake T003C mint.
  function sealOperation({packageId,componentId,operationId}={}){
    const handler=lookup(packageId,componentId,operationId);
    if(handler.op.effect==='none')reject('E_EFFECTLESS_NATIVE_SELECTION');
    return Object.freeze({
      assembly,
      nativeSelection(){return Object.freeze({
        packageId,componentId,operationId,
        kindRef:Object.freeze(snap(handler.component.kindRef)),
        component:Object.freeze(snap(handler.component)),
        operation:Object.freeze(snap(handler.op)),
        implementation:Object.freeze({implementationId:handler.identity.implementationId,
          sha256:handler.sha,path:handler.path}),
        moduleSha256:handler.sha.slice('sha256:'.length),handler:handler.fn
      });},
      async requirePhysicalCurrentness(){await currentAssembly();return true;}
    });
  }
  return Object.freeze({
    assembly,selected:deepFreeze([...handlers.values()].map(h=>h.identity)),
    sealOperation,
    invoke:async ({packageId,componentId,operationId,input,...untrusted})=>{
      if(Object.keys(untrusted).length)reject('E_UNTRUSTED_INVOKE_AUTHORITY');
      // Snapshot synchronously (descriptor-safe) before any Host I/O.
      const stableInput=stable(input);
      return dispatch(packageId,componentId,operationId,stableInput);
    },
    rebind:()=>reject('E_SEALED'),
    stats:()=>Object.freeze({dispatchCount})
  });
}
