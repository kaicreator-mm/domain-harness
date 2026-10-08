import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {canonicalJson,digest,hashBytes,SpecError,STANDARD_KINDS,understoodStandard,
 validateComponent,componentDigest,packageDigest,verifyPackage,verifyDefinitionGraph} from '../candidate-validator.mjs';
import {validatePayload,validateFailure,validateCaller,requireAuthority} from '../abi-validator.mjs';
const expect=code=>e=>e instanceof SpecError&&e.code===code;
const json=v=>structuredClone(v);
const K=id=>({kindId:'std.'+id,version:'1.0.0'});
const R=(id,ops)=>({capabilityId:id,version:'1.0.0',operations:ops});
const OP=(id='compute',effect='none')=>({
 operationId:id,inputSchema:{type:'object',properties:{value:{type:'number'}},required:['value'],additionalProperties:false},
 outputSchema:{type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false},
 failures:['DENIED'],effect,callers:['app'],exposure:'component'
});
const C=(pkg,id,kind,params={})=>({
 schemaVersion:'ucb/1',packageId:pkg,componentId:id,kindRef:K(kind),
 semanticBody:{kind},requiredSemanticContracts:[],requiresCapabilities:[],
 providesCapabilities:[],relations:[],operations:[],...params
});
function mint(id,components,exports,dependencies=[],imports=[],modules={}){
 const implementations=Object.entries(modules).map(([componentId,source])=>({
  implementationId:id+'.'+componentId,componentId,path:'modules/'+componentId+'.mjs',
  sha256:'sha256:'+hashBytes(Buffer.from(source,'utf8'))}));
 const artifacts=Object.fromEntries(Object.entries(modules).map(([id,source])=>['modules/'+id+'.mjs',source]));
 const manifest={formatVersion:'dhpkg/0.8-candidate-1',packageId:id,packageVersion:'1.0.0',
  targetAbi:'dh.node22/1',hostRequirements:['node22'],dependencies,imports,exports,components,implementations,integrity:''};
 manifest.integrity=packageDigest(manifest,artifacts);
 return {manifest,artifacts};
}
function remint(e){
 for(const x of e.manifest.implementations)x.sha256='sha256:'+hashBytes(Buffer.from(e.artifacts[x.path],'utf8'));
 e.manifest.integrity=packageDigest(e.manifest,e.artifacts);return e;
}
function baseline(){
 const schema=C('sdk','schema','schema',{semanticBody:{type:'number'}});
 const rule=C('sdk','rule','rule',{semanticBody:{threshold:7},
  operations:[OP()],providesCapabilities:[R('math.check',['compute'])]});
 const sdk=mint('sdk',[schema,rule],['schema','rule'],[],[],{rule:'export const threshold=7;'});
 const flow=C('app','flow','workflow',{semanticBody:{route:'controlled'},
  requiresCapabilities:[R('math.check',['compute'])],
  relations:[{relationKind:'depends-on',target:{packageId:'sdk',componentId:'schema',digest:componentDigest(schema)}}]});
 const dependencies=[{packageId:'sdk',version:'1.0.0',digest:sdk.manifest.integrity}];
 const imports=['schema','rule'].map(componentId=>({
  fromPackage:'sdk',componentId,digest:componentDigest(componentId==='schema'?schema:rule)}));
 const app=mint('app',[flow],['flow'],dependencies,imports);
 return {sdk,app};
}
const base=()=>{const x=baseline();return verifyDefinitionGraph([x.sdk,x.app]);};
const bad=(f,code)=>assert.throws(f,expect(code));
const good=f=>assert.doesNotThrow(f);
const golden=JSON.parse(readFileSync(new URL('../fixtures/golden-canonical.json',import.meta.url),'utf8'));

test('S-PKG-001 valid manifest and missing required identity rejection',()=>{
 const {sdk}=baseline();good(()=>verifyPackage(sdk.manifest,sdk.artifacts));
 const n=json(sdk.manifest);delete n.packageId;bad(()=>verifyPackage(n,sdk.artifacts),'E_PACKAGE_IDENTITY');
});
test('S-PKG-002 exact package version and format version rejection',()=>{
 const {sdk}=baseline();good(()=>verifyPackage(sdk.manifest,sdk.artifacts));
 const n=json(sdk.manifest);n.formatVersion='unknown/9';bad(()=>verifyPackage(n,sdk.artifacts),'E_FORMAT_VERSION');
 const x=json(sdk.manifest);x.packageVersion='^1';bad(()=>verifyPackage(x,sdk.artifacts),'E_PACKAGE_IDENTITY');
});
test('S-PKG-003 stable canonical JSON golden hash, dangerous records rejected',()=>{
 assert.equal(canonicalJson(golden.canonicalInput),golden.expectedCanonical);
 assert.equal(digest(golden.canonicalInput),golden.expectedSHA256);
 assert.equal(digest({a:1,b:2}),digest({b:2,a:1}));
 bad(()=>canonicalJson({a:undefined}),'E_NONCANONICAL_JSON');
 const hostile=Object.defineProperty({},'a',{enumerable:true,get(){throw Error('trap')}});
 bad(()=>canonicalJson(hostile),'E_RECORD_SAFETY');
});
test('S-PKG-004 implementation byte integrity, mutated bytes refusal',()=>{
 const {sdk}=baseline();good(()=>verifyPackage(sdk.manifest,sdk.artifacts));
 sdk.artifacts['modules/rule.mjs']='export const threshold=3;';
 bad(()=>verifyPackage(sdk.manifest,sdk.artifacts),'E_IMPLEMENTATION_DIGEST');
});
test('S-PKG-005 package digest binds component semantics and declarations',()=>{
 const {sdk}=baseline();good(()=>verifyPackage(sdk.manifest,sdk.artifacts));
 sdk.manifest.components[1].semanticBody.threshold=3;
 bad(()=>verifyPackage(sdk.manifest,sdk.artifacts),'E_PACKAGE_INTEGRITY');
});
test('S-PKG-006 fake integrity and missing artifact refusal',()=>{
 const {sdk}=baseline();
 sdk.manifest.integrity='sha256:'+'f'.repeat(64);
 bad(()=>verifyPackage(sdk.manifest,sdk.artifacts),'E_PACKAGE_INTEGRITY');
 const x=baseline().sdk;delete x.artifacts['modules/rule.mjs'];
 bad(()=>verifyPackage(x.manifest,x.artifacts),'E_ARTIFACT_MISSING');
});
test('S-PKG-007 declared export and duplicates fail closed',()=>{
 const {sdk}=baseline();good(()=>verifyPackage(sdk.manifest,sdk.artifacts));
 sdk.manifest.exports.push('unknown');bad(()=>verifyPackage(sdk.manifest,sdk.artifacts),'E_ILLEGAL_EXPORT');
 const x=baseline().sdk;x.manifest.exports.push('schema');
 bad(()=>verifyPackage(x.manifest,x.artifacts),'E_DUPLICATE_EXPORT');
});
test('S-PKG-008 undeclared dependency imports rejected',()=>{
 const {app}=baseline();good(()=>verifyPackage(app.manifest,app.artifacts));
 app.manifest.imports.push({fromPackage:'foreign',componentId:'x',digest:'sha256:'+'a'.repeat(64)});
 bad(()=>verifyPackage(app.manifest,app.artifacts),'E_ILLEGAL_IMPORT');
});
test('S-PKG-009 dependency missing and wrong digest refusal',()=>{
 const {sdk,app}=baseline();good(()=>verifyDefinitionGraph([sdk,app]));
 bad(()=>verifyDefinitionGraph([app]),'E_MISSING_DEPENDENCY');
 const y=baseline();y.app.manifest.dependencies[0].digest='sha256:'+'b'.repeat(64);remint(y.app);
 bad(()=>verifyDefinitionGraph([y.sdk,y.app]),'E_DEPENDENCY_PIN');
});
test('S-PKG-010 duplicate dependencies and duplicate package declarations refused',()=>{
 const x=baseline();good(()=>verifyDefinitionGraph([x.sdk,x.app]));
 x.app.manifest.dependencies.push(json(x.app.manifest.dependencies[0]));
 bad(()=>verifyDefinitionGraph([x.sdk,x.app]),'E_DUPLICATE_DEPENDENCY');
 const y=baseline();bad(()=>verifyDefinitionGraph([y.sdk,y.app,y.sdk]),'E_DUPLICATE_PACKAGE');
});
test('S-PKG-011 incompatible target ABI refused',()=>{
 const {sdk}=baseline();good(()=>verifyPackage(sdk.manifest,sdk.artifacts));
 const n=json(sdk.manifest);n.targetAbi='windows-only';
 bad(()=>verifyPackage(n,sdk.artifacts),'E_TARGET_ABI');
});
test('S-COMP-001 five valid standard kinds and unknown kind refusal',()=>{
 for(const kind of STANDARD_KINDS){const c=C('p','sample',kind.slice(4));good(()=>validateComponent(c));}
 bad(()=>validateComponent(C('p','sample','unregistered')),'E_UNKNOWN_KIND');
});
test('S-COMP-002 pure Schema without operations and duplicate operations rejected',()=>{
 const schema=C('p','pure','schema');good(()=>validateComponent(schema));
 const c=C('p','sample','operation',{operations:[OP(),OP()]});
 bad(()=>validateComponent(c),'E_DUPLICATE_OPERATION');
});
test('S-COMP-003 required semantic unknown rejects and matched understood succeeds',()=>{
 const c=C('p','sample','rule',{requiredSemanticContracts:[{contractId:'policy.strict',version:'1.0.0'}]});
 bad(()=>validateComponent(c),'E_UNKNOWN_SEMANTIC_CONTRACT');
 good(()=>validateComponent(c,{...understoodStandard,'std.rule@1.0.0':['policy.strict@1.0.0']}));
});
test('S-COMP-004 incompatible Kind versions and non-exact refs refused',()=>{
 const c=C('p','sample','schema');good(()=>validateComponent(c));
 c.kindRef.version='2.0.0';bad(()=>validateComponent(c),'E_UNKNOWN_KIND');
 c.kindRef.version='latest';bad(()=>validateComponent(c),'E_EXACT_REF');
});
test('S-COMP-005 semantic digest deterministic, material vs non-material extension',()=>{
 const c=C('p','sample','schema',{semanticBody:{z:1,a:2}});
 const original=componentDigest(c);
 c.semanticBody={a:2,z:1};assert.equal(componentDigest(c),original);
 c.nonMaterialExtensions={note:'n'};assert.equal(componentDigest(c),original);
 c.semanticBody.a=99;assert.notEqual(componentDigest(c),original);
});
test('S-COMP-006 semantic digest separated from logical Component ID',()=>{
 const c=C('p','alpha','schema');const d=json(c);d.componentId='beta';
 assert.equal(componentDigest(c),componentDigest(d));
 assert.notEqual(c.componentId,d.componentId);
});
test('S-COMP-007 invalid operation effect and bogus provided operation refused',()=>{
 const c=C('p','sample','operation',{operations:[OP()]});good(()=>validateComponent(c));
 c.operations[0].effect='unbounded';bad(()=>validateComponent(c),'E_EFFECT_CLASS');
 const x=C('p','sample','operation',{operations:[OP()],providesCapabilities:[R('call',['missing'])]});
 bad(()=>validateComponent(x),'E_UNDECLARED_OPERATION');
});
test('S-COMP-008 duplicate required Capability and unknown fields refused',()=>{
 const c=C('p','sample','rule',{requiresCapabilities:[R('math.check',['compute'])]});
 good(()=>validateComponent(c));
 c.requiresCapabilities.push(R('math.check',['compute']));bad(()=>validateComponent(c),'E_DUPLICATE_CAPABILITY');
 const x=C('p','sample','schema');x.hiddenAuthority=true;bad(()=>validateComponent(x),'E_COMPONENT_FIELD');
});
test('S-GRAPH-001 declared cross-Package imports/exports and zero Provider refusal',()=>{
 good(base);
 const x=baseline();x.sdk.manifest.components.find(c=>c.componentId==='rule').providesCapabilities=[];
 remint(x.sdk);x.app.manifest.dependencies[0].digest=x.sdk.manifest.integrity;remint(x.app);
 bad(()=>verifyDefinitionGraph([x.sdk,x.app]),'E_MISSING_PROVIDER');
});
test('S-GRAPH-002 wrong relation digest or missing cross Package import denied',()=>{
 const x=baseline();good(()=>verifyDefinitionGraph([x.sdk,x.app]));
 x.app.manifest.components[0].relations[0].target.digest='sha256:'+'a'.repeat(64);remint(x.app);
 bad(()=>verifyDefinitionGraph([x.sdk,x.app]),'E_RELATION_TARGET');
 const y=baseline();y.app.manifest.imports=y.app.manifest.imports.filter(z=>z.componentId!=='schema');remint(y.app);
 bad(()=>verifyDefinitionGraph([y.sdk,y.app]),'E_UNDECLARED_IMPORT');
});
test('S-GRAPH-003 cross-Package unexported relation denied',()=>{
 const x=baseline();good(()=>verifyDefinitionGraph([x.sdk,x.app]));
 x.sdk.manifest.exports=['rule'];remint(x.sdk);x.app.manifest.dependencies[0].digest=x.sdk.manifest.integrity;remint(x.app);
 bad(()=>verifyDefinitionGraph([x.sdk,x.app]),'E_UNEXPORTED_REFERENCE');
});
test('S-GRAPH-004 stable Graph digest independent of Package traversal order',()=>{
 const x=baseline();const a=verifyDefinitionGraph([x.sdk,x.app]);const b=verifyDefinitionGraph([x.app,x.sdk]);
 assert.equal(a.digest,b.digest);assert.ok(a.bindings.some(z=>z.consumer==='app/flow'&&z.provider==='sdk/rule'));
});
test('S-GRAPH-005 N provider ambiguous unless explicit pinned selection',()=>{
 const x=baseline();const alt=C('app','alt','operation',{operations:[OP()],providesCapabilities:[R('math.check',['compute'])]});
 x.app.manifest.components.push(alt);remint(x.app);
 bad(()=>verifyDefinitionGraph([x.sdk,x.app]),'E_AMBIGUOUS_PROVIDER');
 good(()=>verifyDefinitionGraph([x.sdk,x.app],{'app/flow|math.check@1.0.0':'app/alt'}));
 bad(()=>verifyDefinitionGraph([x.sdk,x.app],{'app/flow|math.check@1.0.0':'app/fake'}),'E_PROVIDER_SELECTION');
});
test('S-GRAPH-006 wrong capability version rejected and Graph dependency cycle denied',()=>{
 const x=baseline();good(()=>verifyDefinitionGraph([x.sdk,x.app]));
 x.app.manifest.components[0].requiresCapabilities[0].version='2.0.0';remint(x.app);
 bad(()=>verifyDefinitionGraph([x.sdk,x.app]),'E_MISSING_PROVIDER');
 const y=baseline();y.app.manifest.components.push(C('app','alt','operation',{operations:[OP()],
  providesCapabilities:[R('app.hop',['compute'])],requiresCapabilities:[R('app.back',['compute'])]}));
 y.app.manifest.components.push(C('app','back','operation',{operations:[OP()],
  providesCapabilities:[R('app.back',['compute'])],requiresCapabilities:[R('app.hop',['compute'])]}));
 remint(y.app);bad(()=>verifyDefinitionGraph([y.sdk,y.app]),'E_GRAPH_CYCLE');
});
test('S-OP-001 three effect classifications with invalid effect rejection',()=>{
 for(const effect of ['none','idempotent','non-idempotent'])good(()=>validateComponent(C('p','sample','operation',{operations:[OP('go',effect)]})));
 bad(()=>validateComponent(C('p','sample','operation',{operations:[OP('go','always')]})),'E_EFFECT_CLASS');
});
test('S-OP-002 typed input and output validation',()=>{
 const op=OP();good(()=>validatePayload(op.inputSchema,{value:4}));
 bad(()=>validatePayload(op.inputSchema,{value:'bad'}),'E_INPUT_SCHEMA');
 good(()=>validatePayload(op.outputSchema,{ok:true},'OUTPUT'));
 bad(()=>validatePayload(op.outputSchema,{ok:'yes'},'OUTPUT'),'E_OUTPUT_SCHEMA');
});
test('S-OP-003 undeclared failures and unauthorized caller/exposure denied',()=>{
 const op=OP();good(()=>validateFailure(op,'DENIED'));bad(()=>validateFailure(op,'UNKNOWN'),'E_UNDECLARED_FAILURE');
 good(()=>validateCaller(op,'app','component'));bad(()=>validateCaller(op,'outsider','component'),'E_CALLER_DENIED');
 bad(()=>validateCaller(op,'app','host'),'E_CALLER_DENIED');
});
test('S-OP-004 effectful calls require trusted host boundary (schema precondition only)',()=>{
 good(()=>requireAuthority(OP('pure','none'),{}));
 bad(()=>requireAuthority(OP('emit','non-idempotent'),{}),'E_ADMISSION_REQUIRED');
 bad(()=>requireAuthority(OP('write','idempotent'),{assemblyDigest:'x'}),'E_ADMISSION_REQUIRED');
});
