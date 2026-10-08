import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {establishGenesisHost} from '../host/bootstrap.mjs';
import {TRUST_ROOTS} from '../host/trust-roots.mjs';
import {hashBytes,packageDigest,componentDigest,verifyPackage,
  verifyDefinitionGraph,understoodStandard} from '../../v08-gatea-b1-955-r2/reference956/candidate-validator.mjs';
const packages=fileURLToPath(new URL('../packages/',import.meta.url));
const sha=s=>'sha256:'+hashBytes(Buffer.from(s,'utf8'));
const isError=c=>e=>e?.code===c;
async function clonePackages(fn){
 const dir=await mkdtemp(join(tmpdir(),'v08-genesis-d1-'));
 await cp(packages,dir,{recursive:true});
 try{return await fn(dir)}finally{await rm(dir,{recursive:true,force:true})}
}
async function rawEntries(root=packages){
 const entries=[];
 for(const pin of Object.values(TRUST_ROOTS)){
   const path=join(root,pin.directory);
   const manifest=JSON.parse(await readFile(join(path,'manifest.json'),'utf8'));
   const artifacts={};
   for(const impl of manifest.implementations)
     artifacts[impl.path]=await readFile(join(path,impl.path),'utf8');
   entries.push({manifest,artifacts});
 }
 return entries;
}
const repin=entry=>{entry.manifest.integrity=packageDigest(entry.manifest,entry.artifacts);return entry};
test('G01 physical Kernel + SDK + Business are real manifests and exact pinned bytes',async()=>{
 const entries=await rawEntries();
 for(const entry of entries){
   assert.equal(entry.manifest.integrity,TRUST_ROOTS[entry.manifest.packageId].packageDigest);
   assert.equal(verifyPackage(entry.manifest,entry.artifacts).digest,entry.manifest.integrity);
   for(const impl of entry.manifest.implementations)
     assert.equal(sha(entry.artifacts[impl.path]),impl.sha256);
 }
 assert.equal(entries.length,3);
});
test('G02 hand-seeded linked and sealed actual business Rule high/low',async()=>{
 const host=await establishGenesisHost();
 assert.equal((await host.invoke({packageId:'genesis.business.smoke',componentId:'smoke-run',
   operationId:'run',input:{score:88}})).accepted,true);
 assert.equal((await host.invoke({packageId:'genesis.business.smoke',componentId:'smoke-run',
   operationId:'run',input:{score:1}})).accepted,false);
 assert.match(host.assembly.digest,/^sha256:[0-9a-f]{64}$/);
 assert.ok(host.assembly.bindings.some(b=>b.consumer==='genesis.business.smoke/smoke-run'&&
   b.provider==='genesis.sdk/sdk-rule'));
});
test('G03 positive decision/workflow/pure Operation and no-operation Schema',async()=>{
 const host=await establishGenesisHost();
 assert.equal(await host.invoke({packageId:'genesis.sdk',componentId:'sdk-decision',
   operationId:'select',input:{accepted:false}}),'review');
 assert.equal(await host.invoke({packageId:'genesis.sdk',componentId:'sdk-workflow',
   operationId:'advance',input:{current:'intake'}}),'scored');
 assert.deepEqual(await host.invoke({packageId:'genesis.sdk',componentId:'sdk-operation',
   operationId:'receipt',input:{id:'a'}}),{id:'a',status:'OBSERVED_NO_EFFECT'});
 await assert.rejects(host.invoke({packageId:'genesis.business.smoke',
   componentId:'smoke-schema',operationId:'evaluate',input:{}}),isError('E_OPERATION_NOT_DECLARED'));
});
test('G04 deterministic assembly/digests and immutable selection',async()=>{
 const a=await establishGenesisHost(),b=await establishGenesisHost();
 assert.equal(a.assembly.digest,b.assembly.digest);
 assert.deepEqual(a.selected,b.selected);
 assert.ok(Object.isFrozen(a.assembly));
 assert.throws(()=>a.rebind(),isError('E_SEALED'));
});
test('G05 mutated actual module byte is refused by Host before dispatch',async()=>clonePackages(async root=>{
 await writeFile(join(root,'sdk/modules/rule.mjs'),
   (await readFile(join(root,'sdk/modules/rule.mjs'),'utf8'))+'\n// hostile');
 await assert.rejects(establishGenesisHost({root}),isError('E_MODULE_BYTES'));
}));
test('G06 forged manifest/integrity cannot create its own Host pin',async()=>clonePackages(async root=>{
 const path=join(root,'sdk/manifest.json'),m=JSON.parse(await readFile(path,'utf8'));
 m.components[1].semanticBody.threshold=0;
 await writeFile(path,JSON.stringify(m)+'\n');
 await assert.rejects(establishGenesisHost({root}),e=>['E_HOST_MANIFEST_PIN','E_MANIFEST_NONCANONICAL'].includes(e?.code));
}));
test('G07 wrong-but-existing Handler request rejects rather than silently choose another',async()=>{
 const host=await establishGenesisHost(),before=host.stats().dispatchCount;
 await assert.rejects(host.invoke({packageId:'genesis.sdk',componentId:'sdk-rule',
   operationId:'select',input:{score:99}}),isError('E_OPERATION_NOT_DECLARED'));
 assert.equal(host.stats().dispatchCount,before);
});
test('G08 wrong Component owner in real manifest rejected at Host trust pin',async()=>clonePackages(async root=>{
 const p=join(root,'sdk/manifest.json'),m=JSON.parse(await readFile(p,'utf8'));
 m.implementations[0].componentId='sdk-decision';
 await writeFile(p,JSON.stringify(m)+'\n');
 await assert.rejects(establishGenesisHost({root}),e=>['E_MANIFEST_NONCANONICAL','E_HOST_MANIFEST_PIN'].includes(e?.code));
}));
test('G09 unknown mandatory Kind refused by producer-neutral candidate validator',async()=>{
 const v=await rawEntries(),sdk=v.find(x=>x.manifest.packageId==='genesis.sdk');
 sdk.manifest.components[1].kindRef.kindId='unknown.mandatory.kind';
 repin(sdk);
 assert.throws(()=>verifyPackage(sdk.manifest,sdk.artifacts),isError('E_UNKNOWN_KIND'));
});
test('G10 unknown mandatory Semantic refused before any effect',async()=>{
 const v=await rawEntries(),sdk=v.find(x=>x.manifest.packageId==='genesis.sdk');
 sdk.manifest.components[1].requiredSemanticContracts.push({contractId:'sc.missing',version:'1.0.0'});
 repin(sdk);
 assert.throws(()=>verifyPackage(sdk.manifest,sdk.artifacts),isError('E_UNKNOWN_SEMANTIC_CONTRACT'));
});
test('G11 absent Provider in actual Package graph refuses',async()=>{
 const v=await rawEntries(),sdk=v.find(x=>x.manifest.packageId==='genesis.sdk');
 sdk.manifest.components.find(c=>c.componentId==='sdk-rule').providesCapabilities=[];
 repin(sdk);
 const biz=v.find(x=>x.manifest.packageId==='genesis.business.smoke');
 // Rebind the real physical relation/import digest to the *mutated* Rule identity;
 // otherwise E_RELATION_TARGET would mask the intended missing-Provider gate.
 const rule=sdk.manifest.components.find(c=>c.componentId==='sdk-rule');
 const ruleDigest=componentDigest(rule);
 biz.manifest.dependencies[0].digest=sdk.manifest.integrity;
 biz.manifest.imports[0].digest=ruleDigest;
 biz.manifest.components.find(c=>c.componentId==='smoke-run').relations[0].target.digest=ruleDigest;
 repin(biz);
 assert.throws(()=>verifyDefinitionGraph(v),isError('E_MISSING_PROVIDER'));
});
test('G12 duplicate Provider on actual SDK candidate refuses ambiguity',async()=>{
 const v=await rawEntries(),sdk=v.find(x=>x.manifest.packageId==='genesis.sdk');
 const other=structuredClone(sdk.manifest.components.find(c=>c.componentId==='sdk-rule'));
 other.componentId='sdk-rule-copy';
 sdk.manifest.components.push(other);repin(sdk);
 const biz=v.find(x=>x.manifest.packageId==='genesis.business.smoke');
 biz.manifest.dependencies[0].digest=sdk.manifest.integrity;repin(biz);
 assert.throws(()=>verifyDefinitionGraph(v),isError('E_AMBIGUOUS_PROVIDER'));
});
test('G13 undeclared cross-Package import refuses graph binding',async()=>{
 const v=await rawEntries(),biz=v.find(x=>x.manifest.packageId==='genesis.business.smoke');
 biz.manifest.imports=[];repin(biz);
 assert.throws(()=>verifyDefinitionGraph(v),isError('E_UNDECLARED_IMPORT'));
});
test('G14 post-Seal module mutation denies before subsequent dispatch',async()=>clonePackages(async root=>{
 const host=await establishGenesisHost({root}),before=host.stats().dispatchCount;
 const file=join(root,'sdk/modules/rule.mjs');
 await writeFile(file,(await readFile(file,'utf8'))+'\n// changed-after-seal');
 await assert.rejects(host.invoke({packageId:'genesis.sdk',componentId:'sdk-rule',
   operationId:'evaluate',input:{score:90}}),isError('E_SEALED_MODULE_CHANGED'));
 assert.equal(host.stats().dispatchCount,before);
}));
test('G15 post-Seal manifest mutation denies before dispatch',async()=>clonePackages(async root=>{
 const host=await establishGenesisHost({root}),before=host.stats().dispatchCount;
 const file=join(root,'sdk/manifest.json');
 await writeFile(file,(await readFile(file,'utf8'))+' ');
 await assert.rejects(host.invoke({packageId:'genesis.sdk',componentId:'sdk-rule',
   operationId:'evaluate',input:{score:90}}),isError('E_SEALED_MANIFEST_CHANGED'));
 assert.equal(host.stats().dispatchCount,before);
}));
test('G16 caller cannot self-certify or inject authority at Host or invoke',async()=>{
 await assert.rejects(establishGenesisHost({pins:{'genesis.kernel':{packageDigest:'sha256:0'}}}),
   isError('E_UNTRUSTED_HOST_OVERRIDE'));
 const host=await establishGenesisHost(),before=host.stats().dispatchCount;
 await assert.rejects(host.invoke({packageId:'genesis.sdk',componentId:'sdk-rule',
   operationId:'evaluate',input:{score:99},effectAuthority:{invoke(){throw Error('forged')}}}),
   isError('E_UNTRUSTED_INVOKE_AUTHORITY'));
 assert.equal(host.stats().dispatchCount,before);
});
test('G17 untrusted input mutation has no effect on sealed Assembly',async()=>{
 const host=await establishGenesisHost(),input={score:70};
 const pending=host.invoke({packageId:'genesis.sdk',componentId:'sdk-rule',
   operationId:'evaluate',input});
 input.score=-100; // racing mutation must not change already-snapshotted input
 const result=await pending;
 assert.equal(result,true);assert.equal(host.assembly.packages.length,3);
});
test('G18 unknown selected package/Component/operation fails closed',async()=>{
 const host=await establishGenesisHost(),before=host.stats().dispatchCount;
 await assert.rejects(host.invoke({packageId:'attacker',componentId:'sdk-rule',
   operationId:'evaluate',input:{score:100}}),isError('E_OPERATION_NOT_DECLARED'));
 assert.equal(host.stats().dispatchCount,before);
});
