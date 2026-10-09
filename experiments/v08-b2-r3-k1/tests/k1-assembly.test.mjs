// V08 B2 R3 K1 (#983) executable K3 matrix — pre-Freeze isolated research only.
// One byte-exact D1 Genesis Kernel/SDK + TWO real Business Kinds in ONE sealed
// Assembly, generic trusted Host dispatch, effectful routes deferred to the
// ORIGINAL v0.7 Central Admission. Research gates never self-approve.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {establishK1Host,buildKindRegistry,verifySelectedK1Identity,readTrustedEntries}
  from '../host/bootstrap.mjs';
import {joinK1EffectfulToV07} from '../host/native-join.mjs';
import {TRUST_ROOTS,D1_GENESIS_ROOT_DIGESTS,D1_KERNEL_LINK_MODULE_SHA}
  from '../host/trust-roots.mjs';
import {hashBytes,packageDigest,componentDigest,verifyPackage,verifyDefinitionGraph,canonicalJson}
  from '../../v08-gatea-b1-955-r2/reference956/candidate-validator.mjs';
import {decideKindCompatibility} from '../../../packages/domain-harness/dist/contracts/kind-compatibility.js';
import {admitComponent} from '../../../packages/domain-harness/dist/contracts/component-admission.js';
// Only an unactivated occurrence/actual original durable journal is reused.
import { fixture as nativeFixture } from
  '../../../packages/domain-harness/tests/effectful-invocation/effectful-invocation.test.ts';

const EXPERIMENT_ROOT=fileURLToPath(new URL('../',import.meta.url));
const sha=s=>'sha256:'+hashBytes(Buffer.from(s,'utf8'));
const isError=c=>e=>e?.code===c;
const CHARGE_SELECTOR={packageId:'k1.business.charge',componentId:'charge-op',operationId:'charge'};
async function clonePackages(fn){
  const dir=await mkdtemp(join(tmpdir(),'v08-b2-r3-k1-'));
  await cp(join(EXPERIMENT_ROOT,'genesis-exact'),join(dir,'genesis-exact'),{recursive:true});
  await cp(join(EXPERIMENT_ROOT,'business'),join(dir,'business'),{recursive:true});
  try{return await fn(dir)}finally{await rm(dir,{recursive:true,force:true})}
}
// Unvalidated raw reader for re-attested adversarial graph variants.
async function rawEntries(root){
  const entries=[];
  for(const [id,pin] of Object.entries(TRUST_ROOTS)){
    const dir=join(root,pin.directory);
    const manifest=JSON.parse(await readFile(join(dir,'manifest.json'),'utf8'));
    const artifacts={};
    for(const impl of manifest.implementations)
      artifacts[impl.path]=await readFile(join(dir,impl.path),'utf8');
    entries.push({id,manifest,artifacts,dir});
  }
  return entries;
}
const repin=e=>{e.manifest.integrity=packageDigest(e.manifest,e.artifacts);return e};
async function writeEntry(e){
  await writeFile(join(e.dir,'manifest.json'),canonicalJson(e.manifest)+'\n');
}
async function linkGraph(entries){
  const sdk=entries.find(x=>x.manifest.packageId==='genesis.sdk');
  const {registry}=buildKindRegistry(sdk.manifest);
  return verifyDefinitionGraph(
    entries.map(({manifest,artifacts})=>({manifest,artifacts})),{},registry);
}

test('K3-01 two different real Business Kind operations through ONE sealed D1 Kernel/SDK Assembly',async()=>{
  const host=await establishK1Host();
  // Pure std.rule business policy (self-contained).
  assert.equal(await host.invoke({packageId:'k1.business.claim',componentId:'claim-policy',
    operationId:'evaluate',input:{claimAmount:120}}),true);
  assert.equal(await host.invoke({packageId:'k1.business.claim',componentId:'claim-policy',
    operationId:'evaluate',input:{claimAmount:900}}),false);
  // Pure std.operation business underwriting consuming the D1 SDK rule capability.
  assert.deepEqual(await host.invoke({packageId:'k1.business.claim',componentId:'claim-underwrite',
    operationId:'underwrite',input:{claimAmount:20}}),{claim:20,underwriting:'adjuster-review'});
  assert.deepEqual(await host.invoke({packageId:'k1.business.claim',componentId:'claim-underwrite',
    operationId:'underwrite',input:{claimAmount:80}}),{claim:80,underwriting:'auto-accept'});
  // Other (SDK) business profiles of the SAME assembly remain available.
  assert.equal(await host.invoke({packageId:'genesis.sdk',componentId:'sdk-decision',
    operationId:'select',input:{accepted:false}}),'review');
  const kinds=new Set(host.selected.filter(x=>x.packageId==='k1.business.claim')
    .map(x=>x.kindRef.kindId));
  assert.deepEqual([...kinds].sort(),['std.operation','std.rule']);
  assert.ok(host.assembly.bindings.some(b=>
    b.consumer==='k1.business.claim/claim-underwrite'&&
    b.capability==='rule.score@1.0.0'&&b.provider==='genesis.sdk/sdk-rule'));
  // Effectful business Kind: same Assembly identity, original v0.7 authority.
  const occurrence=await nativeFixture({skipActivation:true});
  const joined=await joinK1EffectfulToV07({host,selector:CHARGE_SELECTOR,occurrenceFixture:occurrence});
  assert.equal(joined.physicalAssembly.digest,host.assembly.digest);
  const result=await joined.invoke();
  assert.equal(result.outcome.status,'admitted');
  assert.equal(result.invocation.implementation.implementationDigest,
    'sha256:'+joined.moduleSha256);
  assert.equal(joined.getDispatchCount(),1);
  assert.equal(joined.journal.getRecords().length,1);
  assert.equal(joined.journal.getRecords()[0].status,'completed');
  // Same source + occurrence: original Journal never dispatches twice.
  const replay=await joined.invoke();
  assert.equal(replay.outcome.status,'admitted');
  assert.equal(joined.getDispatchCount(),1);
  assert.equal(joined.journal.getRecords().length,1);
});

test('K3-02 exact D1 root matching: vendored bytes recompute to the pinned Genesis digests',async()=>{
  for(const [id,pin] of Object.entries(TRUST_ROOTS)){
    const dir=join(EXPERIMENT_ROOT,pin.directory);
    const manifest=JSON.parse(await readFile(join(dir,'manifest.json'),'utf8'));
    const artifacts={};
    for(const impl of manifest.implementations)
      artifacts[impl.path]=await readFile(join(dir,impl.path),'utf8');
    assert.equal(packageDigest(manifest,artifacts),pin.packageDigest,id);
    assert.equal(manifest.integrity,pin.packageDigest,id);
    for(const impl of manifest.implementations)
      assert.equal(sha(artifacts[impl.path]),impl.sha256,id+':'+impl.path);
  }
  assert.equal(TRUST_ROOTS['genesis.kernel'].packageDigest,D1_GENESIS_ROOT_DIGESTS.kernel);
  assert.equal(TRUST_ROOTS['genesis.sdk'].packageDigest,D1_GENESIS_ROOT_DIGESTS.sdk);
  assert.equal(D1_KERNEL_LINK_MODULE_SHA,
    'sha256:966317ea94834ac40f4433a96f5c5173edc9d1ff8ef8b53eff1556eb2954405b');
  const host=await establishK1Host();
  assert.deepEqual(host.assembly.packages,[
    {id:'genesis.kernel',digest:D1_GENESIS_ROOT_DIGESTS.kernel},
    {id:'genesis.sdk',digest:D1_GENESIS_ROOT_DIGESTS.sdk},
    {id:'k1.business.claim',digest:TRUST_ROOTS['k1.business.claim'].packageDigest},
    {id:'k1.business.charge',digest:TRUST_ROOTS['k1.business.charge'].packageDigest}]);
  assert.match(host.assembly.digest,/^sha256:[0-9a-f]{64}$/);
  const second=await establishK1Host();
  assert.equal(host.assembly.digest,second.assembly.digest);
  assert.deepEqual(host.selected,second.selected);
});

test('K3-03 wrong-existing Handler+owner refuses under the still-valid reattested graph',async()=>{
  const host=await establishK1Host();
  const before=host.stats().dispatchCount;
  // 'evaluate' exists on sdk-rule but is requested under a wrong existing owner.
  await assert.rejects(host.invoke({packageId:'genesis.sdk',componentId:'sdk-decision',
    operationId:'evaluate',input:{score:99}}),isError('E_OPERATION_NOT_DECLARED'));
  assert.equal(host.stats().dispatchCount,before);
  await clonePackages(async root=>{
    const entries=await rawEntries(root);
    const claim=entries.find(x=>x.manifest.packageId==='k1.business.claim');
    // Re-attested (self-consistent digest) but wrong Component owner binding.
    claim.manifest.implementations.find(i=>i.implementationId==='k1.business.claim.policy.v1')
      .componentId='claim-underwrite';
    repin(claim);
    assert.equal(verifyPackage(claim.manifest,claim.artifacts).digest,claim.manifest.integrity);
    await assert.rejects(verifySelectedK1Identity(claim),isError('E_SELECTED_COMPONENT_OWNER'));
    // Wrong-but-existing physical callable: module without the declared export.
    const charge=entries.find(x=>x.manifest.packageId==='k1.business.charge');
    charge.artifacts['modules/charge.mjs']=charge.artifacts['modules/charge.mjs']
      .replace('export async function charge','export async function charged');
    charge.manifest.implementations[0].sha256=sha(charge.artifacts['modules/charge.mjs']);
    repin(charge);
    await assert.rejects(verifySelectedK1Identity(charge),isError('E_SELECTED_HANDLER_EXPORT'));
  });
});

test('K3-04 unauthorized re-sign of a Business Package is refused by Host trust roots',async()=>{
  await clonePackages(async root=>{
    const entries=await rawEntries(root);
    const claim=entries.find(x=>x.manifest.packageId==='k1.business.claim');
    claim.artifacts['modules/policy.mjs']+='\n// hostile re-signed payload';
    claim.manifest.implementations.find(i=>i.path==='modules/policy.mjs').sha256=
      sha(claim.artifacts['modules/policy.mjs']);
    repin(claim); // attacker recomputes the self-declared digest: still refused
    await writeEntry(claim);
    await assert.rejects(establishK1Host({root}),isError('E_HOST_MANIFEST_PIN'));
  });
});

test('K3-05 missing and ambiguous capability providers refuse in the real graph',async()=>{
  await clonePackages(async root=>{
    const entries=await rawEntries(root);
    const claim=entries.find(x=>x.manifest.packageId==='k1.business.claim');
    // Missing provider: required capability version no package provides.
    claim.manifest.components.find(c=>c.componentId==='claim-underwrite')
      .requiresCapabilities[0].version='2.0.0';
    repin(claim);
    await assert.rejects(linkGraph(entries),isError('E_MISSING_PROVIDER'));
    // Ambiguous provider (fresh re-read): second provider of rule.score@1.0.0.
    const fresh=await rawEntries(root);
    const claim2=fresh.find(x=>x.manifest.packageId==='k1.business.claim');
    claim2.manifest.components.find(c=>c.componentId==='claim-policy')
      .providesCapabilities.push({capabilityId:'rule.score',operations:['evaluate'],version:'1.0.0'});
    repin(claim2);
    await assert.rejects(linkGraph(fresh),isError('E_AMBIGUOUS_PROVIDER'));
  });
});

test('K3-06 unknown Kind and unknown Kind version refuse at the exact-kind gates',async()=>{
  const entries=await rawEntries(EXPERIMENT_ROOT);
  const sdk=entries.find(x=>x.manifest.packageId==='genesis.sdk');
  const kindSet=buildKindRegistry(sdk.manifest).kindSet.map(x=>x.kind);
  assert.throws(()=>decideKindCompatibility({kindId:'std.griffin',version:'1.0.0'},kindSet),
    isError('KIND_NOT_SUPPORTED'));
  assert.throws(()=>decideKindCompatibility({kindId:'std.rule',version:'9.0.0'},kindSet),
    isError('KIND_VERSION_NOT_SUPPORTED'));
  // Accepted v0.7 admission refuses an unknown mandatory capability (D1 G21 seam).
  const claim=entries.find(x=>x.manifest.packageId==='k1.business.claim');
  const underwrite=claim.manifest.components.find(c=>c.componentId==='claim-underwrite');
  assert.throws(()=>admitComponent({family:'semantic',componentId:underwrite.componentId,
    kind:underwrite.kindRef,semanticBody:underwrite.semanticBody,
    requiredSemanticContracts:underwrite.requiredSemanticContracts,
    requiredCapabilities:[{capabilityId:'capability.uninstalled',version:'1.0.0'}]},[
    {kind:{kindId:'std.operation',version:'1.0.0'},understoodSemanticContracts:[],
     understoodCapabilities:[{capabilityId:'rule.score',version:'1.0.0'}],
     validateComponent(){}}]),isError('UNKNOWN_CAPABILITY'));
});

test('K3-07 unapproved cross-Package imports refuse at package and graph gates',async()=>{
  await clonePackages(async root=>{
    // (a) import of a package that is not a declared dependency.
    const entries=await rawEntries(root);
    const claim=entries.find(x=>x.manifest.packageId==='k1.business.claim');
    const kernel=entries.find(x=>x.manifest.packageId==='genesis.kernel');
    claim.manifest.imports.push({componentId:'kernel-link',
      digest:componentDigest(kernel.manifest.components[0]),fromPackage:'genesis.kernel'});
    repin(claim);
    assert.throws(()=>verifyPackage(claim.manifest,claim.artifacts),isError('E_ILLEGAL_IMPORT'));
    // (b) declared dependency but undeclared/mismatched import digest (fresh re-read).
    const fresh=await rawEntries(root);
    const claim2=fresh.find(x=>x.manifest.packageId==='k1.business.claim');
    claim2.manifest.imports[0].digest='sha256:'+'0'.repeat(64);
    repin(claim2);
    await assert.rejects(linkGraph(fresh),isError('E_UNDECLARED_IMPORT'));
  });
});

test('K3-08 post-Seal tamper of ONLY D1 Kernel bytes denies BOTH pure and effectful business before any dispatch/journal',async()=>{
  await clonePackages(async root=>{
    const host=await establishK1Host({root});
    const occurrence=await nativeFixture({skipActivation:true});
    const joined=await joinK1EffectfulToV07({host,selector:CHARGE_SELECTOR,occurrenceFixture:occurrence});
    await writeFile(join(root,'genesis-exact','kernel','modules','link.mjs'),
      (await readFile(join(root,'genesis-exact','kernel','modules','link.mjs'),'utf8'))+'\n// kernel tamper');
    // Unaffected pure business operation still refused.
    await assert.rejects(host.invoke({packageId:'k1.business.claim',componentId:'claim-policy',
      operationId:'evaluate',input:{claimAmount:10}}),isError('E_SEALED_MODULE_CHANGED'));
    // Effectful native route refused before T004C dispatch and Journal.
    await assert.rejects(()=>joined.invoke(),isError('E_SEALED_MODULE_CHANGED'));
    assert.equal(host.stats().dispatchCount,0);
    assert.equal(joined.getDispatchCount(),0);
    assert.equal(joined.journal.getRecords().length,0);
  });
});

test('K3-09 post-Seal tamper of ONLY D1 SDK bytes denies before any dispatch/journal',async()=>{
  await clonePackages(async root=>{
    const host=await establishK1Host({root});
    const occurrence=await nativeFixture({skipActivation:true});
    const joined=await joinK1EffectfulToV07({host,selector:CHARGE_SELECTOR,occurrenceFixture:occurrence});
    await writeFile(join(root,'genesis-exact','sdk','modules','rule.mjs'),
      (await readFile(join(root,'genesis-exact','sdk','modules','rule.mjs'),'utf8'))+'\n// sdk tamper');
    await assert.rejects(host.invoke({packageId:'k1.business.claim',componentId:'claim-policy',
      operationId:'evaluate',input:{claimAmount:10}}),isError('E_SEALED_MODULE_CHANGED'));
    await assert.rejects(()=>joined.invoke(),isError('E_SEALED_MODULE_CHANGED'));
    assert.equal(host.stats().dispatchCount,0);
    assert.equal(joined.getDispatchCount(),0);
    assert.equal(joined.journal.getRecords().length,0);
  });
});

test('K3-10 unknown operation refuses closed-world with zero dispatch',async()=>{
  const host=await establishK1Host();
  const before=host.stats().dispatchCount;
  await assert.rejects(host.invoke({packageId:'k1.business.charge',componentId:'charge-op',
    operationId:'refund',input:{claimId:'c1'}}),isError('E_OPERATION_NOT_DECLARED'));
  await assert.rejects(host.invoke({packageId:'k1.business.claim',componentId:'claim-policy',
    operationId:'charge',input:{claimAmount:1}}),isError('E_OPERATION_NOT_DECLARED'));
  await assert.rejects(host.invoke({packageId:'genesis.kernel',componentId:'kernel-link',
    operationId:'charge',input:{}}),isError('E_OPERATION_NOT_DECLARED'));
  assert.equal(host.stats().dispatchCount,before);
});

test('K3-11 forged caller kernel/provider/host pins never dispatch',async()=>{
  // (a) caller cannot extend Host authority at construction.
  await assert.rejects(establishK1Host({extraAuthority:{}}),isError('E_UNTRUSTED_HOST_OVERRIDE'));
  await clonePackages(async root=>{
    // (b) forged self-declared package digest cannot create its own Host pin.
    const entries=await rawEntries(root);
    const claim=entries.find(x=>x.manifest.packageId==='k1.business.claim');
    claim.manifest.components.find(c=>c.componentId==='claim-policy')
      .semanticBody.maxAutoApprove=9999;
    repin(claim);
    await writeEntry(claim);
    await assert.rejects(establishK1Host({root}),isError('E_HOST_MANIFEST_PIN'));
  });
  const host=await establishK1Host();
  const before=host.stats().dispatchCount;
  // (c) forged caller invoke authority.
  await assert.rejects(host.invoke({packageId:'k1.business.claim',componentId:'claim-policy',
    operationId:'evaluate',input:{claimAmount:1},kernelPin:'forged'}),
    isError('E_UNTRUSTED_INVOKE_AUTHORITY'));
  // (d) forged host/seal with drifted module identity cannot enter the native join.
  const occurrence=await nativeFixture({skipActivation:true});
  const real=host.sealOperation(CHARGE_SELECTOR).nativeSelection();
  const forgedSeal={nativeSelection:()=>({...real,moduleSha256:'f'.repeat(64)}),
    requirePhysicalCurrentness:async()=>true};
  await assert.rejects(joinK1EffectfulToV07({host:{sealOperation:()=>forgedSeal},
    selector:CHARGE_SELECTOR,occurrenceFixture:occurrence}),isError('E_JOIN_IDENTITY'));
  await assert.rejects(joinK1EffectfulToV07({host:{},selector:CHARGE_SELECTOR,
    occurrenceFixture:occurrence}),isError('E_JOIN_TRUSTED_HOST'));
  assert.equal(host.stats().dispatchCount,before);
});

test('K3-12 malformed and prototype-polluting own keys refuse typed',async()=>{
  const host=await establishK1Host();
  const before=host.stats().dispatchCount;
  // Own '__proto__' key inside the invoke input (descriptor-safe snapshot gate).
  const poisoned=JSON.parse('{"__proto__":{"polluted":true},"claimAmount":10}');
  await assert.rejects(host.invoke({packageId:'k1.business.claim',componentId:'claim-policy',
    operationId:'evaluate',input:poisoned}),isError('E_RECORD_SAFETY'));
  assert.equal(Object.prototype.polluted,undefined);
  // Own '__proto__' key inside a package manifest.
  await clonePackages(async root=>{
    const path=join(root,'business','claim','manifest.json');
    const text=await readFile(path,'utf8');
    await writeFile(path,text.replace('{','{"__proto__":{},'));
    await assert.rejects(establishK1Host({root}),isError('E_RECORD_SAFETY'));
  });
  assert.equal(host.stats().dispatchCount,before);
});

test('K3-13 effectful business route cannot bypass the ORIGINAL v0.7 Central Admission',async()=>{
  const host=await establishK1Host();
  // (a) Host pure dispatch is not an effect authority.
  await assert.rejects(host.invoke({packageId:'k1.business.charge',componentId:'charge-op',
    operationId:'charge',input:{claimId:'c1'}}),isError('E_EFFECT_ADMISSION_REQUIRED'));
  assert.equal(host.stats().dispatchCount,0);
  const occurrence=await nativeFixture({skipActivation:true});
  const joined=await joinK1EffectfulToV07({host,selector:CHARGE_SELECTOR,occurrenceFixture:occurrence});
  // (b) authority-bearing Host ports are not caller-substitutable.
  for(const forged of [{dispatch:{async dispatch(){return 'forged';}}},
    {admissionPorts:{}},{activator:{}},{sha256:{digestUtf8:async()=> '0'.repeat(64)}},
    {effectType:'effect:other'},{effectAuthority:{invoke(){throw Error('forged');}}},
    {effectTools:{}}]){
    await assert.rejects(()=>joined.invoke(forged),isError('E_HOST_PORT_IMMUTABLE'));
  }
  // (c) unminted lookalike T003C binding cannot dispatch.
  const lookalike={evidence:{...joined.binding.evidence},
    successorAssembly:joined.binding.successorAssembly,
    implementationHandle:joined.binding.implementationHandle};
  await assert.rejects(()=>joined.invoke({binding:lookalike}),
    isError('UNMINTED_TOOL_IMPLEMENTATION_BINDING'));
  // (d) moved requested operation and foreign occurrence refuse typed.
  const moved={...joined.admitted,operationId:'op.foreign'};
  await assert.rejects(()=>joined.invoke({request:moved}),
    e=>{assert.ok(typeof e?.code==='string'&&e.code.length>0);return true;});
  const foreign={...occurrence.admissionRequest,workflowInstanceId:'foreign-occurrence'};
  await assert.rejects(()=>joined.invoke({admissionRequest:foreign}),
    e=>{assert.ok(typeof e?.code==='string'&&e.code.length>0);return true;});
  assert.equal(joined.getDispatchCount(),0);
  assert.equal(joined.journal.getRecords().length,0);
  // (e) rebind is sealed; the positive admitted path stays the ONLY effect route.
  assert.throws(()=>joined.rebind(),isError('E_NATIVE_REBIND_FORBIDDEN'));
  const result=await joined.invoke();
  assert.equal(result.outcome.status,'admitted');
  assert.equal(joined.getDispatchCount(),1);
  assert.equal(joined.journal.getRecords().length,1);
});

test('ARCH-01 accepted Kernel path is business-free with NO second Kernel or derived dispatcher',async()=>{
  // The physical D1 kernel module: pure link only, no business semantics,
  // no admission/journal/dispatch decisions.
  const linkSource=await readFile(join(EXPERIMENT_ROOT,'genesis-exact','kernel','modules','link.mjs'),'utf8');
  for(const token of ['business.workflow','business.action','workflow.definition'])
    assert.equal(linkSource.includes(token),false,'kernel link must not contain '+token);
  assert.equal(/\b(journal|admission)\b/.test(linkSource),false);
  assert.equal(linkSource.includes('dispatch'),false);
  // Host glue: business-free too. The bootstrap's own refusal guard list is the
  // ONLY occurrence of the tokens (strip it before scanning).
  const bootstrapSource=await readFile(join(EXPERIMENT_ROOT,'host','bootstrap.mjs'),'utf8');
  assert.match(bootstrapSource,/FORBIDDEN_KERNEL_BUSINESS_TOKENS/);
  const guarded=bootstrapSource.replace(/const FORBIDDEN_KERNEL_BUSINESS_TOKENS[\s\S]*?\]\);/,'');
  const glueSources=[guarded,
    await readFile(join(EXPERIMENT_ROOT,'host','trust-roots.mjs'),'utf8'),
    await readFile(join(EXPERIMENT_ROOT,'host','native-join.mjs'),'utf8')];
  for(const src of glueSources)
    for(const token of ['business.workflow','business.action','workflow.definition'])
      assert.equal(src.includes(token),false,'host glue must not contain '+token);
  // No derived B2 dispatcher and no #940 business-special-cased kernel module
  // is imported anywhere on the accepted path.
  for(const src of glueSources){
    assert.equal(src.includes('neutral-kernel'),false);
    assert.equal(src.includes('reference940'),false);
  }
  // Exactly one Kernel Package and it is the D1 Genesis Kernel.
  const host=await establishK1Host();
  assert.equal(host.assembly.packages.filter(p=>p.id==='genesis.kernel').length,1);
  assert.equal(host.assembly.packages.length,4);
  const linkIdentity=host.selected.find(x=>x.packageId==='genesis.kernel');
  assert.equal(linkIdentity.moduleSha256,D1_KERNEL_LINK_MODULE_SHA);
  assert.equal(linkIdentity.operationId,'link');
});

test('ARCH-02 deterministic Assembly, immutable selection, concurrent business profiles',async()=>{
  const a=await establishK1Host(),b=await establishK1Host();
  assert.equal(a.assembly.digest,b.assembly.digest);
  assert.ok(Object.isFrozen(a.assembly));
  assert.throws(()=>a.rebind(),isError('E_SEALED'));
  await assert.rejects(readTrustedEntries(join(EXPERIMENT_ROOT,'nonexistent-root')),
    isError('E_MANIFEST_MISSING'));
  // All business/SDK profiles usable concurrently from the same sealed host.
  assert.equal(await a.invoke({packageId:'k1.business.claim',componentId:'claim-policy',
    operationId:'evaluate',input:{claimAmount:250}}),true);
  assert.deepEqual(await a.invoke({packageId:'k1.business.claim',componentId:'claim-underwrite',
    operationId:'underwrite',input:{claimAmount:10}}),{claim:10,underwriting:'adjuster-review'});
  assert.deepEqual(await a.invoke({packageId:'k1.business.claim',componentId:'claim-underwrite',
    operationId:'underwrite',input:{claimAmount:999}}),{claim:999,underwriting:'auto-accept'});
  assert.equal(await a.invoke({packageId:'genesis.sdk',componentId:'sdk-decision',
    operationId:'select',input:{accepted:true}}),'proceed');
  assert.equal(await a.invoke({packageId:'genesis.sdk',componentId:'sdk-operation',
    operationId:'receipt',input:{id:'x'}}).then(r=>r.status),'OBSERVED_NO_EFFECT');
});
