// Candidate-format conformance validator ONLY. No loader, dispatcher, runtime, or authority.
import { createHash } from 'node:crypto';

export class SpecError extends Error {
  constructor(code, detail=code) { super(detail); this.name='SpecError'; this.code=code; }
}
const deny=(code,detail)=>{throw new SpecError(code,detail);};
const obj=v=>v!==null && typeof v==='object' && !Array.isArray(v);
export const hashBytes=b=>createHash('sha256').update(b).digest('hex');
const cmp=(a,b)=>a<b?-1:a>b?1:0;
function data(v,path='$',ancestors=new Set()) {
  if(v===null || typeof v==='string' || typeof v==='boolean') return v;
  if(typeof v==='number') {if(!Number.isFinite(v)||Object.is(v,-0))deny('E_NONCANONICAL_JSON',path);return v;}
  if(!obj(v)&&!Array.isArray(v))deny('E_NONCANONICAL_JSON',path);
  if(ancestors.has(v))deny('E_NONCANONICAL_JSON',path);
  if(Object.getOwnPropertySymbols(v).length || (obj(v)&&Object.getPrototypeOf(v)!==Object.prototype&&Object.getPrototypeOf(v)!==null)) deny('E_RECORD_SAFETY',path);
  ancestors.add(v);
  const descriptors=Object.getOwnPropertyDescriptors(v);
  if(Array.isArray(v)) {
    // Describe every own key before visiting values: never call array.map or an index getter.
    // The intrinsic length descriptor is the only permitted non-enumerable own key.
    if(Object.getPrototypeOf(v)!==Array.prototype)deny('E_RECORD_SAFETY',path);
    const ld=descriptors.length;
    if(!ld || !Object.hasOwn(ld,'value') || !Number.isSafeInteger(ld.value) ||
       ld.value<0 || ld.enumerable || ld.configurable)deny('E_RECORD_SAFETY',path+'.length');
    const length=ld.value;
    if(Reflect.ownKeys(descriptors).length!==length+1)deny('E_RECORD_SAFETY',path);
    const a=[];
    for(let i=0;i<length;i++){
      const d=descriptors[String(i)];
      if(!d || !d.enumerable || !Object.hasOwn(d,'value'))deny('E_RECORD_SAFETY',path+'['+i+']');
      a.push(data(d.value,path+'['+i+']',ancestors));
    }
    ancestors.delete(v);return a;
  }
  const result=Object.create(null);
  for(const k of Object.keys(v).sort(cmp)) {
    if(['__proto__','constructor','prototype'].includes(k))deny('E_RECORD_SAFETY',path);
    const d=descriptors[k];if(!d?.enumerable||!Object.hasOwn(d,'value'))deny('E_RECORD_SAFETY',path+'.'+k);
    result[k]=data(d.value,path+'.'+k,ancestors);
  }
  if(Reflect.ownKeys(descriptors).length!==Object.keys(v).length)deny('E_RECORD_SAFETY',path);
  ancestors.delete(v);return result;
}
export const canonicalJson=v=>JSON.stringify(data(v));
export const digest=v=>hashBytes(Buffer.from(canonicalJson(v),'utf8'));
const vnum=v=>typeof v==='string'&&/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(v);
const ident=v=>typeof v==='string'&&/^[a-zA-Z][a-zA-Z0-9._/-]*$/.test(v)&&!/(^|[./-])(latest|current|default|active|x)([./-]|$)/i.test(v);
function requireObject(v,code){if(!obj(v))deny(code);data(v);return v;}
function keys(v,allowed,code){requireObject(v,code);for(const k of Object.keys(v))if(!allowed.includes(k))deny(code,k);}
function unique(a,key,code){const s=new Set();for(const v of a){const k=key(v);if(s.has(k))deny(code,k);s.add(k);}return a;}
function arr(a,code){if(!Array.isArray(a))deny(code);data(a);return a;}
function ref(r,field='capabilityId'){
  keys(r,[field,'version'], 'E_EXACT_REF');
  if(!ident(r[field])||!vnum(r.version))deny('E_EXACT_REF');
  return r[field]+'@'+r.version;
}
// Identifiers permit '/' but forbid '%'; escaping '/' in each tuple member is injective.
// Slash-free existing IDs retain their historical human-readable graph key spelling.
// This is successor candidate Graph identity only; v0.7 identity is not changed.
const q=(p,c)=>p.replaceAll('/','%2F')+'/'+c.replaceAll('/','%2F');
function capability(c){
  keys(c,['capabilityId','version','operations'],'E_CAPABILITY');
  const id=ref({capabilityId:c.capabilityId,version:c.version});
  unique(arr(c.operations,'E_CAPABILITY'),x=>x,'E_DUPLICATE_OPERATION');
  if(!c.operations.length || c.operations.some(x=>!ident(x)))deny('E_CAPABILITY');
  return id;
}
export const STANDARD_KINDS=['std.schema','std.rule','std.decision','std.workflow','std.operation'];
export const understoodStandard=Object.fromEntries(STANDARD_KINDS.map(x=>[x+'@1.0.0',[]]));
export function validateComponent(c,understood=understoodStandard){
  keys(c,['schemaVersion','componentId','packageId','kindRef','semanticBody','requiredSemanticContracts',
    'requiresCapabilities','providesCapabilities','relations','operations','nonMaterialExtensions'],'E_COMPONENT_FIELD');
  if(c.schemaVersion!=='ucb/1'||!ident(c.componentId)||!ident(c.packageId))deny('E_COMPONENT');
  const kind=ref(c.kindRef,'kindId');
  if(!Object.hasOwn(understood,kind))deny('E_UNKNOWN_KIND',kind);
  arr(c.requiredSemanticContracts,'E_SEMANTIC_CONTRACT');
  unique(c.requiredSemanticContracts,x=>ref(x,'contractId'),'E_DUPLICATE_SEMANTIC');
  for(const r of c.requiredSemanticContracts)if(!understood[kind].includes(ref(r,'contractId')))deny('E_UNKNOWN_SEMANTIC_CONTRACT');
  if(!Object.hasOwn(c,'semanticBody'))deny('E_SEMANTIC_BODY');
  data(c.semanticBody);if(Object.hasOwn(c,'nonMaterialExtensions'))data(c.nonMaterialExtensions);
  for(const field of ['requiresCapabilities','providesCapabilities']){
    unique(arr(c[field],'E_CAPABILITY'),x=>capability(x),'E_DUPLICATE_CAPABILITY');
  }
  unique(arr(c.operations,'E_OPERATION'),x=>x.operationId,'E_DUPLICATE_OPERATION');
  for(const op of c.operations){
    keys(op,['operationId','inputSchema','outputSchema','failures','effect','callers','exposure'],'E_OPERATION');
    if(!ident(op.operationId)||!['none','idempotent','non-idempotent'].includes(op.effect))deny('E_EFFECT_CLASS');
    for(const field of ['inputSchema','outputSchema']){requireObject(op[field],'E_OPERATION_SCHEMA');}
    unique(arr(op.failures,'E_FAILURES'),x=>x,'E_FAILURES');
    if(op.failures.some(x=>!ident(x)))deny('E_FAILURES');
    if(!Array.isArray(op.callers)||!op.callers.length||op.callers.some(x=>!ident(x)))deny('E_CALLER_CONTRACT');
    if(!['host','component','internal'].includes(op.exposure))deny('E_EXPOSURE');
  }
  for(const provided of c.providesCapabilities){
    if(provided.operations.some(id=>!c.operations.some(op=>op.operationId===id)))deny('E_UNDECLARED_OPERATION');
  }
  arr(c.relations,'E_RELATION');
  unique(c.relations,r=>{
    keys(r,['relationKind','target'],'E_RELATION');
    if(!ident(r.relationKind))deny('E_RELATION');
    keys(r.target,['packageId','componentId','digest'],'E_RELATION');
    if(!ident(r.target.packageId)||!ident(r.target.componentId)||!/^sha256:[0-9a-f]{64}$/.test(r.target.digest))deny('E_RELATION');
    return r.relationKind+'|'+q(r.target.packageId,r.target.componentId);
  },'E_DUPLICATE_RELATION');
  return c;
}
export function componentDigest(c,understood=understoodStandard){
  validateComponent(c,understood);
  const {componentId,packageId,relations,nonMaterialExtensions,...material}=c;
  const normalized={...material,requiredSemanticContracts:[...c.requiredSemanticContracts].sort((a,b)=>cmp(ref(a,'contractId'),ref(b,'contractId'))),
    requiresCapabilities:[...c.requiresCapabilities].sort((a,b)=>cmp(capability(a),capability(b))),
    providesCapabilities:[...c.providesCapabilities].sort((a,b)=>cmp(capability(a),capability(b))),
    operations:[...c.operations].sort((a,b)=>cmp(a.operationId,b.operationId))};
  return 'sha256:'+digest({domain:'dh.ucb.component-semantic.candidate/1',material:normalized});
}
export function packageDigest(m,artifactBytes){
  const {integrity,...rest}=m;
  const digests=m.implementations.map(x=>{
    const bytes=artifactBytes[x.path];if(typeof bytes!=='string')deny('E_ARTIFACT_MISSING',x.path);
    return {path:x.path,sha256:hashBytes(Buffer.from(bytes,'utf8'))};
  }).sort((a,b)=>cmp(a.path,b.path));
  return 'sha256:'+digest({domain:'dh.package.candidate/1',manifest:rest,artifacts:digests});
}
export function verifyPackage(m,artifactBytes,understood=understoodStandard,hostAbi='dh.node22/1'){
  keys(m,['formatVersion','packageId','packageVersion','targetAbi','hostRequirements','dependencies',
    'imports','exports','components','implementations','integrity'],'E_PACKAGE_FIELD');
  if(m.formatVersion!=='dhpkg/0.8-candidate-1')deny('E_FORMAT_VERSION');
  if(!ident(m.packageId)||!vnum(m.packageVersion))deny('E_PACKAGE_IDENTITY');
  if(m.targetAbi!==hostAbi)deny('E_TARGET_ABI');
  arr(m.hostRequirements,'E_HOST_REQUIREMENT');
  if(m.hostRequirements.some(x=>!ident(x)))deny('E_HOST_REQUIREMENT');
  unique(arr(m.dependencies,'E_DEPENDENCY'),x=>{
    keys(x,['packageId','version','digest'],'E_DEPENDENCY');
    if(!ident(x.packageId)||!vnum(x.version)||!/^sha256:[0-9a-f]{64}$/.test(x.digest))deny('E_DEPENDENCY');
    return x.packageId;
  },'E_DUPLICATE_DEPENDENCY');
  unique(arr(m.components,'E_COMPONENT'),c=>c.componentId,'E_DUPLICATE_COMPONENT');
  for(const c of m.components){
    if(c.packageId!==m.packageId)deny('E_PACKAGE_COMPONENT');
    validateComponent(c,understood);
  }
  unique(arr(m.exports,'E_EXPORT'),x=>x,'E_DUPLICATE_EXPORT');
  for(const id of m.exports)if(!m.components.some(c=>c.componentId===id))deny('E_ILLEGAL_EXPORT');
  unique(arr(m.imports,'E_IMPORT'),x=>q(x.fromPackage,x.componentId),'E_DUPLICATE_IMPORT');
  for(const x of m.imports){
    keys(x,['fromPackage','componentId','digest'],'E_IMPORT');
    if(!m.dependencies.some(d=>d.packageId===x.fromPackage) || !ident(x.componentId)||!/^sha256:[0-9a-f]{64}$/.test(x.digest))deny('E_ILLEGAL_IMPORT');
  }
  unique(arr(m.implementations,'E_IMPLEMENTATION'),x=>x.path,'E_DUPLICATE_ARTIFACT');
  for(const i of m.implementations){
    keys(i,['implementationId','path','sha256','componentId'],'E_IMPLEMENTATION');
    if(!ident(i.implementationId)||!ident(i.componentId)||!/^modules\/[a-zA-Z0-9._/-]+\.mjs$/.test(i.path)||i.path.includes('..'))
      deny('E_IMPLEMENTATION');
    if(!m.components.some(c=>c.componentId===i.componentId))deny('E_IMPLEMENTATION');
    const bytes=artifactBytes[i.path];
    if(typeof bytes!=='string')deny('E_ARTIFACT_MISSING',i.path);
    if(i.sha256!=='sha256:'+hashBytes(Buffer.from(bytes,'utf8')))deny('E_IMPLEMENTATION_DIGEST');
  }
  if(!/^sha256:[0-9a-f]{64}$/.test(m.integrity)||packageDigest(m,artifactBytes)!==m.integrity)deny('E_PACKAGE_INTEGRITY');
  return Object.freeze({packageId:m.packageId,version:m.packageVersion,digest:m.integrity});
}
export function verifyDefinitionGraph(entries,selections={},understood=understoodStandard){
  // entries are already verified immutable package snapshots. This is a test contract, not a runtime graph authority.
  const pkgs=new Map(),defs=new Map(),providers=new Map();
  for(const e of entries){verifyPackage(e.manifest,e.artifacts,understood);if(pkgs.has(e.manifest.packageId))deny('E_DUPLICATE_PACKAGE');pkgs.set(e.manifest.packageId,e);}
  for(const e of entries)for(const d of e.manifest.dependencies){
    const target=pkgs.get(d.packageId)?.manifest;
    if(!target)deny('E_MISSING_DEPENDENCY');
    if(target.packageVersion!==d.version||target.integrity!==d.digest)deny('E_DEPENDENCY_PIN');
  }
  const visiting=new Set(),visited=new Set();
  function walk(p){if(visiting.has(p))deny('E_PACKAGE_CYCLE');if(visited.has(p))return;visiting.add(p);for(const d of pkgs.get(p).manifest.dependencies)walk(d.packageId);visiting.delete(p);visited.add(p);}
  for(const p of pkgs.keys())walk(p);
  for(const e of entries)for(const c of e.manifest.components){
    const id=q(c.packageId,c.componentId);
    if(defs.has(id))deny('E_DUPLICATE_GRAPH_ID',id);
    defs.set(id,c);
    for(const cap of c.providesCapabilities){const k=capability(cap);if(!providers.has(k))providers.set(k,[]);providers.get(k).push(id);}
  }
  const bindings=[],edges=[];
  for(const e of entries)for(const c of e.manifest.components){
    const id=q(c.packageId,c.componentId);
    for(const r of c.relations){
      const target=q(r.target.packageId,r.target.componentId), t=defs.get(target);
      if(!t || componentDigest(t,understood)!==r.target.digest)deny('E_RELATION_TARGET');
      if(c.packageId!==r.target.packageId)checkExportImport(e,pkgs.get(r.target.packageId),r.target);
      edges.push({from:id,to:target,kind:r.relationKind});
    }
    for(const req of c.requiresCapabilities){
      const k=capability(req),choices=providers.get(k)||[];
      if(!choices.length)deny('E_MISSING_PROVIDER',k);
      const selector=selections[id+'|'+k];
      if(choices.length>1&&!selector)deny('E_AMBIGUOUS_PROVIDER',k);
      const selected=selector||choices[0];
      if(!choices.includes(selected))deny('E_PROVIDER_SELECTION',k);
      const p=defs.get(selected);
      if(p.packageId!==c.packageId)checkExportImport(e,pkgs.get(p.packageId),{packageId:p.packageId,componentId:p.componentId,digest:componentDigest(p,understood)});
      if(req.operations.some(op=>!p.providesCapabilities.find(x=>capability(x)===k).operations.includes(op)))deny('E_CAPABILITY_OPERATION');
      bindings.push({consumer:id,capability:k,provider:selected});
    }
  }
  // Dependency edges must be DAG; non-dependency relationships may be cyclic by explicit kind contract.
  const adj=new Map([...defs.keys()].map(x=>[x,[]]));
  for(const x of bindings)adj.get(x.consumer).push(x.provider);
  for(const x of edges.filter(x=>x.kind==='depends-on'))adj.get(x.from).push(x.to);
  const busy=new Set(),done=new Set();
  function visit(id){if(busy.has(id))deny('E_GRAPH_CYCLE');if(done.has(id))return;busy.add(id);for(const to of adj.get(id))visit(to);busy.delete(id);done.add(id);}
  for(const id of defs.keys())visit(id);
  const material={domain:'dh.ucb.graph.candidate/1',
    components:[...defs].map(([id,c])=>({id,digest:componentDigest(c,understood)})).sort((a,b)=>cmp(a.id,b.id)),
    edges:edges.sort((a,b)=>cmp(canonicalJson(a),canonicalJson(b))),
    bindings:bindings.sort((a,b)=>cmp(canonicalJson(a),canonicalJson(b)))};
  return Object.freeze({digest:'sha256:'+digest(material),bindings:bindings.map(x=>Object.freeze(x))});
}
function checkExportImport(from,to,r){
  if(!to||!to.manifest.exports.includes(r.componentId))deny('E_UNEXPORTED_REFERENCE');
  const expected=from.manifest.imports.find(x=>x.fromPackage===r.packageId&&x.componentId===r.componentId);
  if(!expected||expected.digest!==r.digest)deny('E_UNDECLARED_IMPORT');
}
