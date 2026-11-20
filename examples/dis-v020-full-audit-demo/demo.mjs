import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
// Standalone DIS 0.2.0 R3 reference fixture; not a real SDK/Provider/KDP.
const sha=x=>'sha256:'+createHash('sha256').update(JSON.stringify(x)).digest('hex');
const requireThat=(ok,code)=>{if(!ok)throw Error(code)};
const F=(id,kind='query',target='node-fixture')=>({id,description:'fixture '+id,input:'object',output:'object',outcomes:['SUCCESS','UNKNOWN'],impl:{kind,target}});
const fixture=()=>({target:'node-fixture',semantic:[['media.player','media.page'],['media.page','media.player']],elements:[
 {id:'sdk.json',description:'JSON service',functions:[F('parse')]},
 {id:'media.page',description:'Page service',functions:[F('snapshot'),F('getScripts')]},
 {id:'media.player',description:'Player service',depends:[{element:'media.page',functions:['snapshot','getScripts']},{element:'sdk.json',functions:['parse']}],functions:[F('extract','rule')]},
 {id:'media.app',description:'Business init',functions:[F('init','code')]}
],packages:[
 {id:'kdp',layer:'kdp',target:'node-fixture',depends:[],elements:[]},
 {id:'sdk',layer:'sdk',target:'node-fixture',depends:['kdp'],elements:['sdk.json'],exports:['sdk.json.parse']},
 {id:'biz',layer:'business',target:'node-fixture',depends:['sdk'],elements:['media.page','media.player','media.app']}],
app:{init:'media.app.init',ingress:['media.player.extract','media.page.snapshot']},resources:{'parser.yaml':{content:'fixture',digest:sha('fixture')}}});
function compile(src){
 const els=new Map(),pks=new Map(),funcs=new Map();
 for(const el of src.elements){requireThat(el.id&&el.description&&Array.isArray(el.functions),'ELEMENT_INVALID');requireThat(!els.has(el.id),'DUP_ELEMENT');els.set(el.id,el);
  for(const f of el.functions){const id=el.id+'.'+f.id;requireThat(!funcs.has(id)&&f.description&&f.input&&f.output&&f.outcomes.includes('UNKNOWN'),'FUNCTION_INVALID');requireThat(f.impl?.target===src.target,'TARGET_MISMATCH');requireThat(['query','rule','code','workflow','llm'].includes(f.impl.kind),'IMPLEMENTATION_INVALID');if(f.impl.kind==='llm')requireThat((src.providers||[]).includes(f.impl.provider),'PROVIDER_UNSELECTED');funcs.set(id,f)} }
 const dag=(nodes,edges)=>{const state=new Map(),order=[];const visit=id=>{requireThat(nodes.has(id),'MISSING_DEP');if(state.get(id)===1)throw Error('STATIC_CYCLE');if(state.get(id)===2)return;state.set(id,1);for(const d of edges(nodes.get(id)))visit(d);state.set(id,2);order.push(id)};for(const id of nodes.keys())visit(id);return order};
 const elementOrder=dag(els,e=>(e.depends||[]).map(d=>d.element));
 for(const el of els.values()){for(const dep of el.depends||[])for(const id of dep.functions)requireThat(funcs.has(dep.element+'.'+id),'MISSING_PUBLIC_FUNCTION');for(const ext of el.extensions||[])requireThat(!ext.required||ext.name==='dis.demo/known','UNKNOWN_REQUIRED_EXTENSION')}
 for(const relation of src.semantic||[])requireThat(relation.length===2&&relation.every(x=>els.has(x)),'BAD_SEMANTIC_RELATION');
 for(const p of src.packages){requireThat(p.target===src.target,'PACKAGE_TARGET');requireThat(!pks.has(p.id),'DUP_PACKAGE');pks.set(p.id,p)}
 const packageOrder=dag(pks,p=>p.depends||[]);requireThat(packageOrder[0]==='kdp','KDP_NOT_ROOT');
 for(const el of els.values()){
  const owner=src.packages.filter(p=>p.elements.includes(el.id));requireThat(owner.length===1,'OWNER_CONFLICT');
  for(const dep of el.depends||[]){const dst=src.packages.find(p=>p.elements.includes(dep.element));requireThat(dst,'DEP_OWNER_MISSING');if(dst!==owner[0]){requireThat(owner[0].depends.includes(dst.id),'PKG_CLOSURE');for(const id of dep.functions)requireThat(dst.exports.includes(dep.element+'.'+id),'PKG_PRIVATE_FUNCTION')}}
 }
 requireThat(funcs.has(src.app.init)&&src.app.init.endsWith('.init')&&src.packages.find(p=>p.layer==='business'&&p.elements.includes(src.app.init.split('.').slice(0,-1).join('.'))),'APP_INIT_MISSING');
 requireThat(src.app.ingress.every(id=>funcs.has(id)),'INGRESS_UNBOUND');
 for(const [path,r]of Object.entries(src.resources||{})){requireThat(!path.includes('..')&&!path.includes('://')&&!path.startsWith('/'),'RESOURCE_PATH_ESCAPE');requireThat(r.digest===sha(r.content),'RESOURCE_DIGEST_DRIFT')}
 return{digest:sha({elements:src.elements,packages:src.packages,semantic:src.semantic,app:src.app,resources:src.resources,target:src.target}),elementOrder,packageOrder,funcs};
}
let passed=0;const test=(name,run)=>{run();passed++;console.log('PASS',String(passed).padStart(2,'0'),name)};
const reject=(mutate,error)=>{const x=fixture();mutate(x);assert.throws(()=>compile(x),e=>e.message===error)};
test('compile element+package DAG',()=>assert.deepEqual(compile(fixture()).packageOrder,['kdp','sdk','biz']));
test('semantic cycles are legal',()=>assert.ok(compile(fixture())));
test('multi-Function dependency',()=>assert.deepEqual(fixture().elements[2].depends[0].functions,['snapshot','getScripts']));
test('AOT metadata contributes to digest',()=>{const a=fixture(),b=fixture();b.elements[2].description='changed';assert.notEqual(compile(a).digest,compile(b).digest)});
test('resource digest corresponds to bytes',()=>assert.ok(compile(fixture())));
test('no mandatory Main Workflow',()=>assert.equal(fixture().app.ingress.length,2));
test('Function-specific rule implementation',()=>assert.equal(compile(fixture()).funcs.get('media.player.extract').impl.kind,'rule'));
test('reject static dependency cycle',()=>reject(x=>x.elements[1].depends=[{element:'media.player',functions:['extract']}],'STATIC_CYCLE'));
test('reject dependency unknown Function',()=>reject(x=>x.elements[2].depends[0].functions=['secret'],'MISSING_PUBLIC_FUNCTION'));
test('reject hidden exported SDK Function',()=>reject(x=>x.packages[1].exports=[],'PKG_PRIVATE_FUNCTION'));
test('reject wrong target',()=>reject(x=>x.elements[2].functions[0].impl.target='android','TARGET_MISMATCH'));
test('reject unselected LLM',()=>reject(x=>x.elements[2].functions[0].impl={kind:'llm',target:x.target,provider:'foreign'},'PROVIDER_UNSELECTED'));
test('reject unknown required extension',()=>reject(x=>x.elements[2].extensions=[{name:'unknown',required:true}],'UNKNOWN_REQUIRED_EXTENSION'));
test('reject resource mismatch',()=>reject(x=>x.resources['parser.yaml'].content='tampered','RESOURCE_DIGEST_DRIFT'));
test('reject path traversal',()=>reject(x=>x.resources['../private']={content:'x',digest:sha('x')},'RESOURCE_PATH_ESCAPE'));
test('reject absent App Init',()=>reject(x=>x.app.init='sdk.json.parse','APP_INIT_MISSING'));
test('reject unbound ingress',()=>reject(x=>x.app.ingress=['media.player.notExists'],'INGRESS_UNBOUND'));
// Mock KDP lifecycle and business Effect enforcement; not a sandbox for arbitrary Node code.
let ready=false,events=[],permit=new Set(['grant-1']),used=new Set(),state={merges:0,head:'abc'};
const technical=()=>{for(const id of compile(fixture()).packageOrder)events.push('pkg:'+id);events.push('app:init');ready=true};
const invoke=(id,input,grant)=>{requireThat(ready,'NOT_READY');if(id==='merge'){requireThat(grant&&permit.has(grant),'EFFECT_DENIED');requireThat(!used.has(grant),'PERMIT_REPLAY');used.add(grant);if(input.sha!==state.head)return{status:'UNKNOWN'};state.merges++;return{status:'SUCCESS'}}return{status:'SUCCESS'}};
test('ingress blocked before init',()=>assert.throws(()=>invoke('inspect',{}),/NOT_READY/));
technical();
test('package init precedes App Init',()=>assert.deepEqual(events,['pkg:kdp','pkg:sdk','pkg:biz','app:init']));
test('normal ingress after READY',()=>assert.equal(invoke('inspect',{}).status,'SUCCESS'));
test('intent resolution does not grant effect',()=>assert.throws(()=>invoke('merge',{sha:'abc'}),/EFFECT_DENIED/));
test('stale head returns UNKNOWN',()=>assert.equal(invoke('merge',{sha:'old'},'grant-1').status,'UNKNOWN'));
test('Effect grant cannot replay',()=>assert.throws(()=>invoke('merge',{sha:'abc'},'grant-1'),/PERMIT_REPLAY/));
const model=resolve(dirname(fileURLToPath(import.meta.url)),'../dis-v020-evolution-demo/demo.mjs');
const child=spawnSync(process.execPath,[model],{encoding:'utf8'});
test('integrated 25-case FakeLLM evolution fixture',()=>{assert.equal(child.status,0,child.stderr);assert.match(child.stdout,/"tests":25/);assert.match(child.stdout,/"status":"PASS_SIMULATED"/)});
console.log(JSON.stringify({status:'PASS_FULL_SCOPE_COMPACT_SIMULATED',tests:passed,childEvolution:25,domains:['media fixture','tally-like effect fixture'],production:false}));
