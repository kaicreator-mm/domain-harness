// R3-only P1 regression suite. All assertions exercise the successor candidate, NOT v0.7 Runtime.
import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalJson,digest,hashBytes,SpecError,componentDigest,packageDigest,
  verifyPackage,verifyDefinitionGraph} from '../candidate-validator.mjs';

const denied=(code,fn)=>assert.throws(fn,e=>e instanceof SpecError && e.code===code);
const R=(id,ops=['compute'])=>({capabilityId:id,version:'1.0.0',operations:ops});
const OP=()=>({operationId:'compute',inputSchema:{type:'object'},outputSchema:{type:'object'},
  failures:['DENIED'],effect:'none',callers:['app'],exposure:'component'});
const C=(pkg,id,kind='operation',extra={})=>({
  schemaVersion:'ucb/1',packageId:pkg,componentId:id,
  kindRef:{kindId:'std.'+kind,version:'1.0.0'},semanticBody:{kind:'bounded'},
  requiredSemanticContracts:[],requiresCapabilities:[],providesCapabilities:[],
  relations:[],operations:[],...extra
});
function mint(id,components,exports,dependencies=[],imports=[]){
  const artifacts={};
  const manifest={formatVersion:'dhpkg/0.8-candidate-1',packageId:id,packageVersion:'1.0.0',
    targetAbi:'dh.node22/1',hostRequirements:['node22'],dependencies,imports,exports,
    components,implementations:[],integrity:''};
  manifest.integrity=packageDigest(manifest,artifacts);
  return {manifest,artifacts};
}
const rehash=p=>{p.manifest.integrity=packageDigest(p.manifest,p.artifacts);return p;};
function fixtures(shared=false){
  // Old p+'/'+c maps BOTH pairs to 'a/b/c'. Both are legal IDs.
  const a=C('a/b','c','operation',{operations:[OP()],
    providesCapabilities:[R(shared?'cap.shared':'cap.left')]});
  const b=C('a','b/c','operation',{operations:[OP()],
    providesCapabilities:[R(shared?'cap.shared':'cap.right')]});
  const pa=mint('a/b',[a],['c']);
  const pb=mint('a',[b],['b/c']);
  const uses=shared?[R('cap.shared')]:[R('cap.left'),R('cap.right')];
  const refs=[a,b].map(x=>({packageId:x.packageId,componentId:x.componentId,digest:componentDigest(x)}));
  const consumer=C('consumer','both','workflow',{
    requiresCapabilities:uses,
    relations:refs.map(target=>({relationKind:'depends-on',target}))
  });
  const deps=[pa,pb].map(p=>({packageId:p.manifest.packageId,version:'1.0.0',digest:p.manifest.integrity}));
  const imports=refs.map(x=>({fromPackage:x.packageId,componentId:x.componentId,digest:x.digest}));
  const pc=mint('consumer',[consumer],['both'],deps,imports);
  return {pa,pb,pc,all:[pa,pb,pc],a,b,consumer};
}
test('R3-GRAPH-01 distinct slash-bearing tuple nodes both survive providers and imported edges',()=>{
  const x=fixtures(),g=verifyDefinitionGraph(x.all);
  assert.equal(g.bindings.length,2);
  assert.deepEqual(new Set(g.bindings.map(b=>b.provider)),new Set(['a%2Fb/c','a/b%2Fc']));
  assert.ok(g.bindings.every(b=>b.consumer==='consumer/both'));
  assert.notEqual('a%2Fb/c','a/b%2Fc');
});
test('R3-GRAPH-02 package/iteration permutations keep graph digest and exact bindings',()=>{
  const x=fixtures();
  const a=verifyDefinitionGraph(x.all),b=verifyDefinitionGraph([x.pc,x.pb,x.pa]);
  assert.equal(a.digest,b.digest);
  assert.deepEqual(a.bindings,b.bindings);
  x.pc.manifest.components[0].relations.reverse();
  x.pc.manifest.components[0].requiresCapabilities.reverse();
  rehash(x.pc);
  assert.equal(verifyDefinitionGraph([x.pb,x.pc,x.pa]).digest,a.digest);
});
test('R3-GRAPH-03 cross-package unauthorized import and true duplicate reject, never overwrite',()=>{
  const x=fixtures();
  x.pc.manifest.imports=x.pc.manifest.imports.filter(r=>r.fromPackage!=='a/b');
  rehash(x.pc);
  denied('E_UNDECLARED_IMPORT',()=>verifyDefinitionGraph(x.all));
  const y=fixtures();
  y.pa.manifest.components.push(structuredClone(y.a));
  rehash(y.pa);
  denied('E_DUPLICATE_COMPONENT',()=>verifyDefinitionGraph(y.all));
  const z=fixtures();
  denied('E_DUPLICATE_PACKAGE',()=>verifyDefinitionGraph([...z.all,z.pa]));
});
test('R3-GRAPH-04 ambiguous providers choose either exact tuple, not collision alias',()=>{
  const x=fixtures(true),key='consumer/both|cap.shared@1.0.0';
  denied('E_AMBIGUOUS_PROVIDER',()=>verifyDefinitionGraph(x.all));
  const left=verifyDefinitionGraph(x.all,{[key]:'a%2Fb/c'});
  const right=verifyDefinitionGraph(x.all,{[key]:'a/b%2Fc'});
  assert.equal(left.bindings.length,1);
  assert.equal(left.bindings[0].provider,'a%2Fb/c');
  assert.equal(right.bindings[0].provider,'a/b%2Fc');
  assert.notEqual(left.digest,right.digest);
  denied('E_PROVIDER_SELECTION',()=>verifyDefinitionGraph(x.all,{[key]:'a/b/c'}));
});
test('R3-ARRAY-01 index accessor rejects before getter invocation',()=>{
  let calls=0;
  const a=[1];
  Object.defineProperty(a,'0',{enumerable:true,configurable:true,get(){calls++;return 1;}});
  denied('E_RECORD_SAFETY',()=>canonicalJson(a));
  assert.equal(calls,0);
});
test('R3-ARRAY-02 non-enumerable array custom key rejects',()=>{
  const a=[1];Object.defineProperty(a,'covert',{value:'x',enumerable:false});
  denied('E_RECORD_SAFETY',()=>canonicalJson(a));
});
test('R3-ARRAY-03 enumerable extra own key and own symbol both reject',()=>{
  const a=[1];a.extra=true;
  denied('E_RECORD_SAFETY',()=>canonicalJson(a));
  const b=[2];b[Symbol('secret')]=3;
  denied('E_RECORD_SAFETY',()=>canonicalJson(b));
});
test('R3-ARRAY-04 sparse array and shifted missing index reject',()=>{
  const a=[];a.length=2;a[1]=9;
  denied('E_RECORD_SAFETY',()=>canonicalJson(a));
  const b=[1,2];delete b[0];
  denied('E_RECORD_SAFETY',()=>canonicalJson(b));
});
test('R3-ARRAY-05 native own length semantics admit dense and frozen arrays',()=>{
  const a=[1,{nested:[2,null]}];
  const d=Object.getOwnPropertyDescriptor(a,'length');
  assert.equal(d.enumerable,false);assert.equal(d.configurable,false);
  assert.equal(canonicalJson(a),'[1,{"nested":[2,null]}]');
  assert.equal(canonicalJson(Object.freeze([1,2])),'[1,2]');
});
test('R3-ARRAY-06 abnormal array prototype rejects without reading element getter',()=>{
  let calls=0;
  const a=[1];Object.defineProperty(a,'0',{enumerable:true,get(){calls++;return 1;}});
  Object.setPrototypeOf(a,{});
  denied('E_RECORD_SAFETY',()=>canonicalJson(a));
  assert.equal(calls,0);
});
test('R3-ARRAY-07 nested array getter rejected before materialization',()=>{
  let calls=0;
  const inside=[1];Object.defineProperty(inside,'0',{enumerable:true,get(){calls++;return 1;}});
  denied('E_RECORD_SAFETY',()=>canonicalJson({list:[[1],inside]}));
  assert.equal(calls,0);
});
test('R3-ARRAY-08 mutable alias cannot preserve old digest or attested package pin',()=>{
  const list=[{value:1}],alias=list[0];
  const prior=digest(list);alias.value=2;
  assert.notEqual(digest(list),prior);
  const x=fixtures();
  const before=x.pc.manifest.integrity;
  x.pc.manifest.components[0].semanticBody={items:list};
  denied('E_PACKAGE_INTEGRITY',()=>verifyPackage(x.pc.manifest,x.pc.artifacts));
  assert.equal(x.pc.manifest.integrity,before);
  rehash(x.pc);
  assert.doesNotThrow(()=>verifyPackage(x.pc.manifest,x.pc.artifacts));
});
